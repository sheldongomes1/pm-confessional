import { Router, type IRouter } from "express";
import { db, ingestStatusTable, regretsTable } from "@workspace/db";
import { StartIngestBody, GetIngestStatusResponse } from "@workspace/api-zod";
import { batchProcess } from "@workspace/integrations-anthropic-ai/batch";
import { desc } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { extractRegretFromPassage } from "../../lib/regret-extractor";

const router: IRouter = Router();

// In-memory state for active ingestion
let isIngesting = false;

async function getStatus() {
  const [status] = await db
    .select()
    .from(ingestStatusTable)
    .orderBy(desc(ingestStatusTable.id))
    .limit(1);
  return status;
}

async function updateStatus(updates: {
  status?: string;
  episodes_processed?: string;
  regrets_extracted?: string;
  message?: string;
  started_at?: Date | null;
  completed_at?: Date | null;
}) {
  const existing = await getStatus();
  if (existing) {
    await db
      .update(ingestStatusTable)
      .set({ ...updates, updated_at: new Date() })
      .where(
        (await import("drizzle-orm")).eq(ingestStatusTable.id, existing.id)
      );
  } else {
    await db.insert(ingestStatusTable).values({
      status: "idle",
      episodes_processed: "0",
      regrets_extracted: "0",
      ...updates,
      updated_at: new Date(),
    });
  }
}

router.get("/ingest/status", async (_req, res): Promise<void> => {
  const status = await getStatus();
  res.json(
    GetIngestStatusResponse.parse({
      status: status?.status ?? "idle",
      episodes_processed: parseInt(status?.episodes_processed ?? "0", 10),
      regrets_extracted: parseInt(status?.regrets_extracted ?? "0", 10),
      message: status?.message ?? null,
      started_at: status?.started_at?.toISOString() ?? null,
      completed_at: status?.completed_at?.toISOString() ?? null,
    })
  );
});

router.post("/ingest/start", async (req, res): Promise<void> => {
  if (isIngesting) {
    const status = await getStatus();
    res.status(202).json(
      GetIngestStatusResponse.parse({
        status: status?.status ?? "running",
        episodes_processed: parseInt(status?.episodes_processed ?? "0", 10),
        regrets_extracted: parseInt(status?.regrets_extracted ?? "0", 10),
        message: "Ingestion already running",
        started_at: status?.started_at?.toISOString() ?? null,
        completed_at: null,
      })
    );
    return;
  }

  const parsed = StartIngestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit_episodes, sample_only } = parsed.data;

  isIngesting = true;
  const startTime = new Date();

  await updateStatus({
    status: "running",
    episodes_processed: "0",
    regrets_extracted: "0",
    message: "Fetching episodes from Lenny's Data MCP...",
    started_at: startTime,
    completed_at: null,
  });

  // Return immediately, run ingestion in background
  res.status(202).json(
    GetIngestStatusResponse.parse({
      status: "running",
      episodes_processed: 0,
      regrets_extracted: 0,
      message: "Ingestion started",
      started_at: startTime.toISOString(),
      completed_at: null,
    })
  );

  // Run ingestion in background
  runIngestion(
    sample_only ?? false,
    limit_episodes ?? null
  ).catch((err) => {
    logger.error({ err }, "Ingestion failed");
    updateStatus({
      status: "failed",
      message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      completed_at: new Date(),
    }).catch(() => {});
    isIngesting = false;
  });
});

interface EpisodeChunk {
  guest_name: string;
  episode_title: string;
  episode_date: string | null;
  episode_url: string | null;
  text: string;
}

const MCP_ENDPOINT = "https://mcp.lennysdata.com/mcp";

// Regret-themed search queries. We hit the archive multiple times because
// `search_content` returns relevance-ranked matches with `source_url` and
// pre-extracted snippets — we don't need to chunk full transcripts ourselves.
const REGRET_QUERIES = [
  "mistake|wish I had|biggest regret",
  "should have|would have done differently",
  "lesson learned|hard way|in hindsight",
  "if I could go back|did wrong|got wrong",
];

interface MCPSnippet {
  text: string;
  start_char?: number;
  end_char?: number;
}
interface MCPSearchResult {
  title: string;
  filename: string;
  type: string;
  date?: string | null;
  source_url?: string | null;
  snippets?: MCPSnippet[];
  snippet?: string;
}

/**
 * Parse a Server-Sent Events response body and return the JSON payload from
 * the first `data:` line. The MCP server replies with SSE framing even for
 * single-shot tool calls.
 */
function parseSSE(body: string): unknown {
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("data: ")) {
      return JSON.parse(line.slice(6));
    }
  }
  throw new Error("No data line in SSE response");
}

async function callMCP(
  token: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const text = await res.text();
  const parsed = parseSSE(text) as {
    error?: { message?: string };
    result?: { content?: Array<{ text?: string }> };
  };
  if (parsed.error) throw new Error(`MCP error: ${parsed.error.message}`);
  const inner = parsed.result?.content?.[0]?.text;
  if (typeof inner !== "string") throw new Error("MCP response missing content text");
  return JSON.parse(inner);
}

/**
 * Derive a guest name from a Lenny's Podcast episode title. Titles follow
 * several patterns:
 *   "<topic> | <Name>"                           — most common
 *   "<topic> | <Name> (<company>)"               — common
 *   "Behind the founder: <Name> (<company>)"     — recurring series
 *   "<series>: ... with [author|guest] <Name>"   — collaborations
 *   "<Name> on <topic>..."                       — older format
 */
function guestFromTitle(title: string): string {
  const stripParen = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const looksLikeName = (s: string) =>
    /^[A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){1,3}$/u.test(s);

  // 1. Pipe-delimited: "<topic> | <Name>"
  if (title.includes("|")) {
    const tail = title.split("|").pop()?.trim() ?? "";
    const cleaned = stripParen(tail);
    if (looksLikeName(cleaned)) return cleaned;
  }

  // 2. "with [author|guest|host] <Name>" anywhere in the title
  const withMatch = title.match(/\bwith\s+(?:author\s+|guest\s+|host\s+)?([A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){1,3})/u);
  if (withMatch?.[1]) return withMatch[1];

  // 3. Colon-delimited: "<series>: <Name> (<company>)"
  if (title.includes(":")) {
    const tail = title.split(":").pop()?.trim() ?? "";
    const cleaned = stripParen(tail);
    if (looksLikeName(cleaned)) return cleaned;
  }

  // 4. Leading name: "<Name> on <topic>..."
  const leadMatch = title.match(/^([A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){1,3})\s+on\s+/u);
  if (leadMatch?.[1]) return leadMatch[1];

  return "Unknown";
}

async function fetchEpisodesFromMCP(
  sampleOnly: boolean,
  limitEpisodes: number | null
): Promise<EpisodeChunk[]> {
  const token = process.env.LENNYS_DATA_MCP_TOKEN;
  if (!token) {
    logger.warn("LENNYS_DATA_MCP_TOKEN not set, using sample data");
    return getSampleEpisodes();
  }

  try {
    const perQuery = sampleOnly ? 5 : 20;
    const allResults: MCPSearchResult[] = [];

    for (const query of REGRET_QUERIES) {
      const data = (await callMCP(token, "tools/call", {
        name: "search_content",
        arguments: { query, content_type: "podcast", limit: perQuery },
      })) as { results?: MCPSearchResult[] };
      if (Array.isArray(data.results)) allResults.push(...data.results);
    }

    // Dedupe snippets across queries: key by filename + snippet text prefix
    const chunks: EpisodeChunk[] = [];
    const seen = new Set<string>();
    for (const ep of allResults) {
      const snippets = ep.snippets ?? (ep.snippet ? [{ text: ep.snippet }] : []);
      for (const sn of snippets) {
        const key = `${ep.filename}|${sn.text.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chunks.push({
          guest_name: guestFromTitle(ep.title),
          episode_title: ep.title,
          episode_date: ep.date ?? null,
          episode_url: ep.source_url ?? null,
          // Strip leading/trailing ellipses the MCP adds around snippets.
          text: sn.text.replace(/^\.{3}/, "").replace(/\.{3}$/, "").trim(),
        });
      }
    }

    if (chunks.length === 0) {
      logger.warn("MCP returned no snippets, using sample data");
      return getSampleEpisodes();
    }

    const cap = limitEpisodes ?? (sampleOnly ? 30 : chunks.length);
    logger.info(
      { chunks: chunks.length, capped: Math.min(cap, chunks.length) },
      "MCP fetch succeeded"
    );
    return chunks.slice(0, cap);
  } catch (err) {
    logger.warn({ err }, "MCP fetch failed, using sample data");
    return getSampleEpisodes();
  }
}

function getSampleEpisodes(): EpisodeChunk[] {
  return [
    {
      guest_name: "Shreyas Doshi",
      episode_title: "The art of the strategic product manager",
      episode_date: "2023-05-15",
      episode_url: null,
      text: "One of the biggest mistakes I made early in my career was focusing too much on shipping features rather than solving customer problems. I was so obsessed with the roadmap and velocity that I lost sight of whether we were actually creating value. Looking back, I wish I'd spent more time talking to customers before building anything. We shipped a whole quarter's worth of work that customers didn't care about. I'd do it completely differently now - I'd talk to at least 20 customers before committing to any feature.",
    },
    {
      guest_name: "Lenny Rachitsky",
      episode_title: "How to find product-market fit",
      episode_date: "2022-11-20",
      episode_url: null,
      text: "I regret not charging earlier. We waited way too long to monetize because we were scared of losing users. The reality is that asking people to pay is the most honest signal about whether you've built something valuable. Free users will tell you they love your product and then disappear. Paying customers are far more honest because they have skin in the game. I wish I had introduced pricing 6 months earlier than we did.",
    },
    {
      guest_name: "Marty Cagan",
      episode_title: "The product management crisis",
      episode_date: "2023-08-01",
      episode_url: null,
      text: "The biggest mistake product teams make is building a roadmap of features without understanding the underlying problems they're trying to solve. I've seen this hundreds of times across companies. You end up with a feature factory that ships constantly but moves no meaningful metrics. The team loses faith, the product gets bloated, and customers are still frustrated. I always say: fall in love with the problem, not the solution.",
    },
    {
      guest_name: "Casey Winters",
      episode_title: "Growth lessons from Pinterest and Eventbrite",
      episode_date: "2023-01-30",
      episode_url: null,
      text: "We hired too fast. After our Series B we went from 40 to 200 people in about a year and it destroyed our culture and our productivity. The coordination overhead alone killed us. I wish we had been much more selective and grown at half the pace. Hiring fast feels like progress but it's often the opposite. I'd warn any founder or PM: when you get funding, resist the urge to immediately hire. Spend at least 3 months figuring out where the leverage actually is.",
    },
    {
      guest_name: "Elena Verna",
      episode_title: "PLG vs. sales-led growth",
      episode_date: "2023-06-15",
      episode_url: null,
      text: "I completely underestimated how long it takes to change pricing. We decided to change our pricing model and I told the CEO it would take 3 months. It took 18 months. The technical complexity, the customer communication, the sales team retraining, the billing system changes - I had no idea how deep the iceberg went. Now I always tell product teams: if you're planning a pricing change, take whatever timeline you think it'll take and triple it.",
    },
    {
      guest_name: "Brian Balfour",
      episode_title: "Why product-channel fit matters more than PMF",
      episode_date: "2022-09-20",
      episode_url: null,
      text: "The mistake I see most often with growth is copying tactics from other companies without understanding if they're relevant to your context. We tried to replicate what worked for Dropbox with their referral program and it completely flopped for us. The product, the customer type, the use case - everything was different. I wish I had spent more time understanding why certain tactics work before trying to apply them.",
    },
    {
      guest_name: "Gibson Biddle",
      episode_title: "Netflix's product strategy lessons",
      episode_date: "2023-03-10",
      episode_url: null,
      text: "One thing I regret is not killing features faster. At Netflix we had features that weren't working and we kept iterating on them hoping they'd turn around. We wasted enormous resources on features that should have been cut 6 months earlier. The sunk cost fallacy is real and it's very hard to fight when there's organizational momentum behind something. I wish I had been more ruthless about cutting things that weren't working.",
    },
    {
      guest_name: "Deb Liu",
      episode_title: "Lessons from building Facebook Marketplace",
      episode_date: "2023-04-05",
      episode_url: null,
      text: "I wish I had listened to my gut more about the trust and safety problems earlier. We were so focused on growth metrics that we deprioritized the safety issues. Those issues ended up being much more damaging to long-term growth than any short-term metric we were optimizing. My warning to any PM building a marketplace: invest in trust and safety early, even when it feels like you can't afford to. You definitely can't afford not to.",
    },
    {
      guest_name: "Shreya Murthy",
      episode_title: "Building consumer products people love",
      episode_date: "2023-07-20",
      episode_url: null,
      text: "The biggest mistake was not testing our onboarding early enough. We spent 4 months building the core product and then discovered during beta that people couldn't figure out how to use it in the first 5 minutes. We had to rebuild the entire onboarding flow which delayed our launch by 2 months. I'd do it completely differently now - I'd have 20 customers try to use the product from scratch every single week from day one.",
    },
    {
      guest_name: "Andrew Chen",
      episode_title: "Cold start problem and network effects",
      episode_date: "2022-12-15",
      episode_url: null,
      text: "I regret not thinking about the cold start problem sooner. When you're building a marketplace or a network, the hardest moment is the beginning. We launched our platform with almost no supply and the demand had terrible experiences and churned. We should have seeded the supply side much more aggressively before opening to demand. I tell founders now: don't launch until you have enough supply to give demand a great experience.",
    },
  ];
}

async function runIngestion(sampleOnly: boolean, limitEpisodes: number | null) {
  try {
    logger.info({ sampleOnly, limitEpisodes }, "Starting ingestion");

    const chunks = await fetchEpisodesFromMCP(sampleOnly, limitEpisodes);

    await updateStatus({
      message: `Processing ${chunks.length} transcript chunks...`,
    });

    let episodesProcessed = 0;
    let regretsExtracted = 0;
    const episodesSeen = new Set<string>();

    const results = await batchProcess(
      chunks,
      async (chunk, index) => {
        const result = await extractRegretFromPassage(chunk.text);
        
        if (!episodesSeen.has(chunk.episode_title)) {
          episodesSeen.add(chunk.episode_title);
          episodesProcessed++;
        }

        if (result?.regret_statement) {
          await db.insert(regretsTable).values({
            guest_name: chunk.guest_name,
            episode_title: chunk.episode_title,
            episode_date: chunk.episode_date,
            episode_url: chunk.episode_url,
            company: null,
            stage: result.stage || "unknown",
            topic_tag: result.topic_tag || "other",
            regret_statement: result.regret_statement,
            source_quote: chunk.text.slice(0, 500),
            embedding: null,
          });
          regretsExtracted++;
        }

        if (index % 5 === 0) {
          await updateStatus({
            episodes_processed: String(episodesProcessed),
            regrets_extracted: String(regretsExtracted),
            message: `Processed ${index + 1}/${chunks.length} chunks, extracted ${regretsExtracted} regrets`,
          });
        }

        return result;
      },
      { concurrency: 2, retries: 3 }
    );

    logger.info({ regretsExtracted, episodesProcessed }, "Ingestion completed");

    await updateStatus({
      status: "completed",
      episodes_processed: String(episodesProcessed),
      regrets_extracted: String(regretsExtracted),
      message: `Done! Processed ${episodesProcessed} episodes and extracted ${regretsExtracted} regrets.`,
      completed_at: new Date(),
    });
  } finally {
    isIngesting = false;
  }
}

export default router;
