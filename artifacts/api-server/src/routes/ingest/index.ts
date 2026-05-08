import { Router, type IRouter } from "express";
import { db, ingestStatusTable, regretsTable, episodesTable } from "@workspace/db";
import { StartIngestBody, GetIngestStatusResponse } from "@workspace/api-zod";
import { batchProcess } from "@workspace/integrations-anthropic-ai/batch";
import { desc, eq, isNull, sql } from "drizzle-orm";
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

router.post("/ingest/reextract", async (_req, res): Promise<void> => {
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

  isIngesting = true;
  const startTime = new Date();
  await updateStatus({
    status: "running",
    episodes_processed: "0",
    regrets_extracted: "0",
    message: "Re-extracting regrets from cached transcripts...",
    started_at: startTime,
    completed_at: null,
  });

  res.status(202).json(
    GetIngestStatusResponse.parse({
      status: "running",
      episodes_processed: 0,
      regrets_extracted: 0,
      message: "Re-extraction started",
      started_at: startTime.toISOString(),
      completed_at: null,
    })
  );

  runReextract().catch((err) => {
    logger.error({ err }, "Re-extraction failed");
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
  // Most tools (search_content, list_content) return JSON-encoded text. read_content
  // returns raw markdown. Try JSON first; fall back to the raw string.
  try {
    return JSON.parse(inner);
  } catch {
    return inner;
  }
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

interface MCPListResult {
  total: number;
  offset: number;
  limit: number;
  results: Array<{
    title: string;
    filename: string;
    tags?: string[];
    word_count?: number;
    date?: string | null;
    description?: string;
    guest?: string;
    type: string;
  }>;
}

/**
 * Prefer the MCP-provided guest field (most reliable) over the parsed-from-title
 * fallback. `guestFromTitle` always returns a string ("Unknown" if no pattern
 * matches), so a naive `parsed || mcp` would never reach the MCP value.
 */
function resolveGuest(title: string, mcpGuest: string | undefined): string {
  if (mcpGuest && mcpGuest.trim() && mcpGuest.trim().toLowerCase() !== "unknown") {
    return mcpGuest.trim();
  }
  return guestFromTitle(title);
}

/** Paginate list_content to fetch every podcast in the archive. */
async function listAllPodcasts(token: string): Promise<MCPListResult["results"]> {
  const all: MCPListResult["results"] = [];
  const PAGE = 100;
  let offset = 0;
  while (true) {
    const data = (await callMCP(token, "tools/call", {
      name: "list_content",
      arguments: { content_type: "podcast", limit: PAGE, offset },
    })) as MCPListResult;
    all.push(...data.results);
    if (all.length >= data.total || data.results.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/**
 * Run several broad regret-themed searches and build a {filename → source_url}
 * map. URL is missing from list_content/read_content; only search_content
 * surfaces it. We accept partial coverage — episodes without a hit get null URL.
 */
async function harvestSourceUrls(token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const query of REGRET_QUERIES) {
    try {
      const data = (await callMCP(token, "tools/call", {
        name: "search_content",
        arguments: { query, content_type: "podcast", limit: 100 },
      })) as { results?: MCPSearchResult[] };
      for (const r of data.results ?? []) {
        if (r.source_url && !map.has(r.filename)) {
          map.set(r.filename, r.source_url);
        }
      }
    } catch (err) {
      logger.warn({ err, query }, "URL harvest search failed");
    }
  }
  return map;
}

/** Read the full markdown for a single episode. */
async function readEpisodeMarkdown(token: string, filename: string): Promise<string> {
  const data = await callMCP(token, "tools/call", {
    name: "read_content",
    arguments: { filename },
  });
  return typeof data === "string" ? data : "";
}

/**
 * Strip YAML frontmatter from the markdown (title/date/etc are already on the
 * episode row) and split the body into roughly 800-word passages with a small
 * overlap so a regret straddling a boundary still gets caught.
 */
function chunkMarkdown(md: string): string[] {
  const body = md.replace(/^---\n[\s\S]*?\n---\n+/, "");
  const words = body.split(/\s+/).filter(Boolean);
  const SIZE = 800;
  const OVERLAP = 80;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += SIZE - OVERLAP) {
    const chunk = words.slice(i, i + SIZE).join(" ");
    if (chunk.length < 200) continue;
    chunks.push(chunk);
  }
  return chunks;
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

/**
 * Extract regrets from a transcript and insert them. Replaces any existing
 * regrets for the episode first so the operation is idempotent. Returns the
 * count of new regrets inserted.
 */
async function extractAndSaveFromMarkdown(
  episode: typeof episodesTable.$inferSelect,
  md: string
): Promise<number> {
  await db.delete(regretsTable).where(eq(regretsTable.episode_id, episode.id));
  const chunks = chunkMarkdown(md);
  let count = 0;
  await batchProcess(
    chunks,
    async (chunk) => {
      const result = await extractRegretFromPassage(chunk);
      if (result?.regret_statement) {
        await db.insert(regretsTable).values({
          guest_name: episode.guest_name,
          episode_title: episode.title,
          episode_date: episode.episode_date,
          episode_url: episode.episode_url,
          episode_id: episode.id,
          company: null,
          stage: result.stage || "general",
          topic_tag: result.topic_tag || "other",
          regret_statement: result.regret_statement,
          source_quote: chunk.slice(0, 500),
          headline_evidence: result.headline_evidence ?? null,
          embedding: null,
        });
        count++;
      }
      return result;
    },
    { concurrency: 5, retries: 3 }
  );
  return count;
}

/**
 * Re-extract regrets from cached transcript markdown. For any episode that
 * doesn't have markdown cached yet (legacy rows scanned before this column
 * existed), fetch it from MCP first and cache it. This lets us iterate on
 * the extractor prompt without re-paying the full MCP fetch cost on
 * subsequent runs.
 */
async function runReextract() {
  try {
    const token = process.env.LENNYS_DATA_MCP_TOKEN;
    if (!token) throw new Error("LENNYS_DATA_MCP_TOKEN is not set");

    const allEpisodes = await db.select().from(episodesTable);
    const cachedCount = allEpisodes.filter((e) => e.markdown).length;
    logger.info(
      { total: allEpisodes.length, cached: cachedCount },
      "Starting re-extraction"
    );

    let episodesProcessed = 0;
    let regretsExtracted = 0;
    const startedAt = Date.now();

    for (const episode of allEpisodes) {
      try {
        let md = episode.markdown;
        if (!md) {
          md = await readEpisodeMarkdown(token, episode.filename);
          await db
            .update(episodesTable)
            .set({ markdown: md })
            .where(eq(episodesTable.id, episode.id));
        }

        const perEpisodeRegrets = await extractAndSaveFromMarkdown(
          { ...episode, markdown: md },
          md
        );

        await db
          .update(episodesTable)
          .set({ scanned_at: new Date(), regrets_extracted: perEpisodeRegrets })
          .where(eq(episodesTable.id, episode.id));

        regretsExtracted += perEpisodeRegrets;
        episodesProcessed++;

        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const rate = episodesProcessed / Math.max(elapsed, 1);
        const etaMin =
          rate > 0
            ? Math.round(
                (allEpisodes.length - episodesProcessed) / rate / 60
              )
            : 0;
        await updateStatus({
          episodes_processed: String(episodesProcessed),
          regrets_extracted: String(regretsExtracted),
          message: `Re-extracted ${episodesProcessed}/${allEpisodes.length} episodes · ${regretsExtracted} regrets · ~${etaMin}min remaining`,
        });
      } catch (err) {
        logger.warn(
          { err, filename: episode.filename },
          "Re-extraction failed for episode, skipping"
        );
      }
    }

    await updateStatus({
      status: "completed",
      episodes_processed: String(episodesProcessed),
      regrets_extracted: String(regretsExtracted),
      message: `Done! Re-extracted ${episodesProcessed} episodes and produced ${regretsExtracted} regrets.`,
      completed_at: new Date(),
    });
  } finally {
    isIngesting = false;
  }
}

async function runIngestion(sampleOnly: boolean, limitEpisodes: number | null) {
  try {
    logger.info({ sampleOnly, limitEpisodes }, "Starting full-scan ingestion");

    const token = process.env.LENNYS_DATA_MCP_TOKEN;
    if (!token) {
      throw new Error("LENNYS_DATA_MCP_TOKEN is not set");
    }

    // Phase 1: enumerate every podcast in the archive
    await updateStatus({ message: "Listing all podcasts in the archive..." });
    const podcasts = await listAllPodcasts(token);
    logger.info({ total: podcasts.length }, "Listed podcasts from MCP");

    // Phase 2: harvest source URLs from regret-themed searches
    await updateStatus({ message: `Found ${podcasts.length} episodes. Harvesting source URLs...` });
    const urlMap = await harvestSourceUrls(token);
    logger.info({ urls: urlMap.size }, "URL harvest done");

    // Phase 3: upsert every episode into the episodes table (idempotent on filename)
    await updateStatus({ message: `Saving ${podcasts.length} episodes to the database...` });
    for (const ep of podcasts) {
      await db
        .insert(episodesTable)
        .values({
          filename: ep.filename,
          title: ep.title,
          guest_name: resolveGuest(ep.title, ep.guest),
          episode_date: ep.date ?? null,
          episode_url: urlMap.get(ep.filename) ?? null,
          description: ep.description ?? null,
          tags: ep.tags ? JSON.stringify(ep.tags) : null,
          word_count: ep.word_count ?? null,
        })
        .onConflictDoUpdate({
          target: episodesTable.filename,
          set: {
            title: ep.title,
            guest_name: resolveGuest(ep.title, ep.guest),
            episode_date: ep.date ?? null,
            // Only overwrite URL if we have a new one — preserve existing
            episode_url: sql`COALESCE(${urlMap.get(ep.filename) ?? null}, ${episodesTable.episode_url})`,
            description: ep.description ?? null,
            tags: ep.tags ? JSON.stringify(ep.tags) : null,
            word_count: ep.word_count ?? null,
          },
        });
    }

    // Phase 4: scan unscanned episodes for regrets
    const toScan = await db
      .select()
      .from(episodesTable)
      .where(isNull(episodesTable.scanned_at));

    const cap = limitEpisodes ?? toScan.length;
    const scanList = toScan.slice(0, cap);
    logger.info({ toScan: scanList.length, total: podcasts.length }, "Beginning extraction phase");

    let episodesProcessed = 0;
    let regretsExtracted = 0;
    const startedAt = Date.now();

    for (const episode of scanList) {
      try {
        // Idempotency: clear any partial regrets from a previous interrupted
        // run of this same episode before reinserting. scanned_at is only set
        // on full success, so an unscanned episode with rows here means a
        // prior attempt crashed mid-way.
        await db.delete(regretsTable).where(eq(regretsTable.episode_id, episode.id));

        const md = await readEpisodeMarkdown(token, episode.filename);
        // Cache the transcript so future re-extractions can run offline
        // without re-paying the ~3hr MCP fetch cost.
        await db
          .update(episodesTable)
          .set({ markdown: md })
          .where(eq(episodesTable.id, episode.id));

        const perEpisodeRegrets = await extractAndSaveFromMarkdown(episode, md);

        await db
          .update(episodesTable)
          .set({ scanned_at: new Date(), regrets_extracted: perEpisodeRegrets })
          .where(eq(episodesTable.id, episode.id));

        regretsExtracted += perEpisodeRegrets;
        episodesProcessed++;

        // Update status every episode (cheap; gives the UI live progress)
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const rate = episodesProcessed / Math.max(elapsed, 1);
        const etaMin = rate > 0 ? Math.round((scanList.length - episodesProcessed) / rate / 60) : 0;
        await updateStatus({
          episodes_processed: String(episodesProcessed),
          regrets_extracted: String(regretsExtracted),
          message: `Scanned ${episodesProcessed}/${scanList.length} episodes · ${regretsExtracted} regrets · ~${etaMin}min remaining`,
        });
      } catch (err) {
        logger.warn({ err, filename: episode.filename }, "Episode scan failed, skipping");
      }
    }

    logger.info({ regretsExtracted, episodesProcessed }, "Ingestion completed");

    await updateStatus({
      status: "completed",
      episodes_processed: String(episodesProcessed),
      regrets_extracted: String(regretsExtracted),
      message: `Done! Scanned ${episodesProcessed} episodes and extracted ${regretsExtracted} regrets.`,
      completed_at: new Date(),
    });
  } finally {
    isIngesting = false;
  }
}

export default router;
