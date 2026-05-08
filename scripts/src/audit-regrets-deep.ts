import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";
import { writeFileSync } from "node:fs";

const SAMPLE_SIZE = Number(process.env.AUDIT_SAMPLE_SIZE ?? 12);
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY ?? 8);
const MCP_ENDPOINT = "https://mcp.lennysdata.com/mcp";
const REPORT_PATH = process.env.AUDIT_REPORT_PATH ?? "audit-report.json";

interface Row {
  id: string;
  guest_name: string;
  regret_statement: string;
  source_quote: string;
  headline_evidence: string | null;
  filename: string;
  episode_id: number;
}

function parseSSE(body: string): unknown {
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("data: ")) return JSON.parse(line.slice(6));
  }
  throw new Error("No SSE data line");
}

async function fetchEpisodeMarkdown(token: string, filename: string): Promise<string> {
  const res = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "read_content", arguments: { filename } },
    }),
  });
  const text = await res.text();
  const parsed = parseSSE(text) as { result?: { content?: Array<{ text?: string }> } };
  return parsed.result?.content?.[0]?.text ?? "";
}

/** Locate the source_quote inside the markdown and grab ±1500 chars around it. */
function widenContext(markdown: string, snippet: string): string {
  const probe = snippet.slice(0, 60).replace(/\s+/g, " ").trim();
  const normalized = markdown.replace(/\s+/g, " ");
  const idx = normalized.indexOf(probe);
  if (idx === -1) {
    // fallback: try the middle of the snippet
    const mid = snippet.slice(Math.floor(snippet.length / 3), Math.floor(snippet.length / 3) + 60).trim();
    const idx2 = normalized.indexOf(mid);
    if (idx2 === -1) return snippet;
    return normalized.slice(Math.max(0, idx2 - 1500), idx2 + 1500);
  }
  return normalized.slice(Math.max(0, idx - 200), idx + 2400);
}

const PROMPT = (r: Row, fullPassage: string) => `You are a strict editorial fact-checker for "The PM Confessional" — a project that collects PERSONAL CONFESSIONS of mistakes from podcast guests. Audit whether this entry is the speaker confessing their OWN mistake (or a hard-won lesson they take responsibility for) — vs generic advice or third-party observations.

Speaker: ${r.guest_name}
Distilled headline: "${r.regret_statement}"

Full transcript context (a wider window from the actual episode, ~3000 chars):
"""
${fullPassage.slice(0, 3500)}
"""

Verdict:
- PERSONAL_CONFESSION: speaker (${r.guest_name}) admits THEIR OWN mistake/regret or a lesson THEY personally learned the hard way.
- GENERAL_ADVICE: generic guidance/theory — speaker doesn't own the mistake themselves.
- THIRD_PARTY: lesson is about someone else (a colleague, a portfolio company, "I've seen founders...").
- HEADLINE_MISMATCH: the wider passage does NOT contain anything supporting the headline (likely hallucination).
- LENNY_NOT_GUEST: the relevant content is from Lenny Rachitsky (the host), not the guest.
- AMBIGUOUS: genuinely unclear.

Be charitable: if anywhere in the passage there's text that could fairly support the headline as the guest's own reflection, prefer PERSONAL_CONFESSION over MISMATCH.

Respond with ONLY: {"verdict": "PERSONAL_CONFESSION|GENERAL_ADVICE|THIRD_PARTY|HEADLINE_MISMATCH|LENNY_NOT_GUEST|AMBIGUOUS", "reason": "one short sentence pointing at evidence (or its absence) in the passage"}`;

async function main() {
  const token = process.env.LENNYS_DATA_MCP_TOKEN;
  if (!token) throw new Error("LENNYS_DATA_MCP_TOKEN is not set");

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const { rows } = await pg.query<Row>(
    `SELECT r.id::text AS id, r.guest_name, r.regret_statement, r.source_quote, r.headline_evidence, e.filename, e.id AS episode_id
     FROM regrets r JOIN episodes e ON e.id = r.episode_id
     WHERE r.source_quote IS NOT NULL AND length(r.source_quote) > 80
     ORDER BY RANDOM() LIMIT $1`,
    [SAMPLE_SIZE]
  );
  console.log(`Sampled ${rows.length} regrets. Loading episode contexts...`);

  // Pull cached markdown from the DB first — saves a re-fetch from MCP.
  const filenames = Array.from(new Set(rows.map((r) => r.filename)));
  const cache = new Map<string, string>();
  if (filenames.length) {
    const { rows: cachedMd } = await pg.query<{ filename: string; markdown: string | null }>(
      `SELECT filename, markdown FROM episodes WHERE filename = ANY($1::text[])`,
      [filenames]
    );
    for (const row of cachedMd) {
      if (row.markdown) cache.set(row.filename, row.markdown);
    }
  }
  console.log(
    `  ${cache.size}/${filenames.length} episodes available from DB cache.`
  );

  // Backfill the rest from MCP, in parallel (small concurrency to be polite).
  const missing = filenames.filter((f) => !cache.has(f));
  if (missing.length) {
    console.log(`  Fetching ${missing.length} from MCP...`);
    const FETCH_CONC = 4;
    for (let i = 0; i < missing.length; i += FETCH_CONC) {
      const batch = missing.slice(i, i + FETCH_CONC);
      await Promise.all(
        batch.map(async (filename) => {
          try {
            const md = await fetchEpisodeMarkdown(token, filename);
            cache.set(filename, md);
            // Write back to the DB cache so future audits/re-extractions reuse it.
            await pg.query(
              `UPDATE episodes SET markdown = $1 WHERE filename = $2 AND markdown IS NULL`,
              [md, filename]
            );
            process.stdout.write("·");
          } catch {
            cache.set(filename, "");
            process.stdout.write("x");
          }
        })
      );
    }
    console.log("\n");
  }
  await pg.end();

  const client = new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  });

  type AuditResult = Row & { verdict: string; reason: string };
  const results: AuditResult[] = [];

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const out = await Promise.all(
      batch.map(async (r): Promise<AuditResult> => {
        try {
          const md = cache.get(r.filename) ?? "";
          // Probe with headline_evidence first — it's a verbatim span the
          // extractor copied from the markdown, so it's guaranteed findable.
          // Fall back to source_quote (legacy / truncated chunk start) only if
          // there's no evidence span.
          const probeSnippet =
            r.headline_evidence && r.headline_evidence.length > 20
              ? r.headline_evidence
              : r.source_quote;
          const widened = md ? widenContext(md, probeSnippet) : probeSnippet;
          const m = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 220,
            messages: [{ role: "user", content: PROMPT(r, widened) }],
          });
          const block = m.content[0];
          const txt = block.type === "text" ? block.text : "";
          const match = txt.match(/\{[\s\S]*\}/);
          const j = match ? (JSON.parse(match[0]) as { verdict?: string; reason?: string }) : {};
          return { ...r, verdict: j.verdict ?? "PARSE_FAIL", reason: j.reason ?? "" };
        } catch (e) {
          return { ...r, verdict: "ERROR", reason: String(e).slice(0, 100) };
        }
      })
    );
    results.push(...out);
    process.stdout.write(`${results.length}/${rows.length} `);
  }
  console.log("\n");

  const counts: Record<string, number> = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  console.log(`=== DEEP VERDICT TALLY (n=${results.length}, full episode context) ===`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${k.padEnd(22)} ${String(v).padStart(2)}/${results.length}  (${Math.round(
        (100 * v) / results.length
      )}%)`
    );
  }

  for (const v of ["HEADLINE_MISMATCH", "GENERAL_ADVICE", "THIRD_PARTY", "LENNY_NOT_GUEST", "AMBIGUOUS"]) {
    const ex = results.filter((r) => r.verdict === v).slice(0, 3);
    if (!ex.length) continue;
    console.log(`\n--- ${v} ---`);
    for (const r of ex) {
      console.log(`  [#${r.id} ${r.guest_name}] "${r.regret_statement}"`);
      console.log(`    why: ${r.reason}`);
    }
  }
  console.log(`\n--- 4 PERSONAL_CONFESSION samples ---`);
  for (const r of results.filter((r) => r.verdict === "PERSONAL_CONFESSION").slice(0, 4)) {
    console.log(`  [${r.guest_name}] "${r.regret_statement}"`);
    console.log(`    why: ${r.reason}`);
  }

  // Write the full per-row report so flagged entries can be inspected later
  // and (optionally) deleted from the DB.
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        sample_size: results.length,
        counts,
        results: results.map((r) => ({
          regret_id: r.id,
          episode_id: r.episode_id,
          filename: r.filename,
          guest_name: r.guest_name,
          headline: r.regret_statement,
          headline_evidence: r.headline_evidence,
          verdict: r.verdict,
          reason: r.reason,
        })),
      },
      null,
      2
    )
  );
  console.log(`\nFull per-row report written to ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
