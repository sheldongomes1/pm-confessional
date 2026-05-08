import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const SAMPLE_SIZE = Number(process.env.AUDIT_SAMPLE_SIZE ?? 12);
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY ?? 8);
const MCP_ENDPOINT = "https://mcp.lennysdata.com/mcp";
const REPORT_PATH = process.env.AUDIT_REPORT_PATH ?? "audit-report.json";
// Set to "1" to skip backfilling missing transcript markdown from MCP. Useful
// when MCP is slow/flaky. The audit will fall back to the source_quote chunk
// (~500 chars) for any episode whose markdown isn't already in the DB cache,
// which still gives the judge enough text to verify the headline matches the
// passage — just less surrounding context.
const SKIP_MCP_BACKFILL = process.env.AUDIT_SKIP_MCP_BACKFILL === "1";

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
  // Hard timeout — MCP occasionally hangs and we don't want one bad request
  // stalling the entire audit.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
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
      signal: controller.signal,
    });
    const text = await res.text();
    const parsed = parseSSE(text) as { result?: { content?: Array<{ text?: string }> } };
    return parsed.result?.content?.[0]?.text ?? "";
  } finally {
    clearTimeout(timeout);
  }
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
  // Token is only required if we'll actually call MCP. Defer the check until
  // after we know whether backfill is needed.
  const token = process.env.LENNYS_DATA_MCP_TOKEN ?? "";

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  // Stable ordering (by id) so resumed runs across multiple sessions cover the
  // same population. ORDER BY RANDOM() would change the sample on each restart.
  const { rows } = await pg.query<Row>(
    `SELECT r.id::text AS id, r.guest_name, r.regret_statement, r.source_quote, r.headline_evidence, e.filename, e.id AS episode_id
     FROM regrets r JOIN episodes e ON e.id = r.episode_id
     WHERE r.source_quote IS NOT NULL AND length(r.source_quote) > 80
     ORDER BY r.id LIMIT $1`,
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

  const missingFilenames = filenames.filter((f) => !cache.has(f));
  if (SKIP_MCP_BACKFILL || missingFilenames.length === 0) {
    if (SKIP_MCP_BACKFILL) {
      console.log("  Skipping MCP backfill (AUDIT_SKIP_MCP_BACKFILL=1).");
    } else {
      console.log("  All episode markdown already cached; no MCP fetches needed.");
    }
    await pg.end();
  } else {
    if (!token) throw new Error("LENNYS_DATA_MCP_TOKEN is not set (required for MCP backfill; set AUDIT_SKIP_MCP_BACKFILL=1 to skip)");
  // Backfill the rest from MCP. Pure read phase first — defer DB writebacks
  // until after every fetch completes, because the single pg.Client doesn't
  // safely support concurrent queries (it triggers a deprecation warning and
  // can interleave results unpredictably).
  const missing = filenames.filter((f) => !cache.has(f));
  if (missing.length) {
    console.log(`  Fetching ${missing.length} from MCP...`);
    const FETCH_CONC = 4;
    const newlyFetched: Array<{ filename: string; md: string }> = [];
    for (let i = 0; i < missing.length; i += FETCH_CONC) {
      const batch = missing.slice(i, i + FETCH_CONC);
      await Promise.all(
        batch.map(async (filename) => {
          try {
            const md = await fetchEpisodeMarkdown(token, filename);
            cache.set(filename, md);
            if (md) newlyFetched.push({ filename, md });
            process.stdout.write("·");
          } catch {
            cache.set(filename, "");
            process.stdout.write("x");
          }
        })
      );
    }
    console.log("\n");

    // Now write back sequentially.
    if (newlyFetched.length) {
      console.log(`  Caching ${newlyFetched.length} markdowns into the DB...`);
      for (const { filename, md } of newlyFetched) {
        await pg.query(
          `UPDATE episodes SET markdown = $1 WHERE filename = $2 AND markdown IS NULL`,
          [md, filename]
        );
      }
    }
  }
  await pg.end();
  }

  const client = new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    // Hard cap per request so one hung call can't stall the whole batch.
    timeout: 60_000,
    maxRetries: 2,
  });

  type AuditResult = Row & { verdict: string; reason: string };
  const results: AuditResult[] = [];

  // Resume support: if a prior partial report exists, load its already-judged
  // regret_ids and skip them. Lets the audit be run in short foreground chunks
  // when the sandbox kills detached processes.
  const alreadyDone = new Set<string>();
  if (existsSync(REPORT_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as {
        results?: Array<{ regret_id?: string; verdict?: string; reason?: string }>;
      };
      for (const p of prev.results ?? []) {
        if (p.regret_id && p.verdict && p.verdict !== "ERROR" && p.verdict !== "PARSE_FAIL") {
          alreadyDone.add(p.regret_id);
          // Find matching row to seed results so the final report is complete.
          const row = rows.find((r) => r.id === p.regret_id);
          if (row) results.push({ ...row, verdict: p.verdict, reason: p.reason ?? "" });
        }
      }
      console.log(`  Resume: ${alreadyDone.size} already-judged regrets loaded from ${REPORT_PATH}.`);
    } catch (e) {
      console.log(`  Could not parse existing report (${String(e).slice(0, 80)}); starting fresh.`);
    }
  }
  const todo = rows.filter((r) => !alreadyDone.has(r.id));
  console.log(`  ${todo.length} regrets to judge this run.`);

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
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
    console.log(`progress: ${results.length}/${rows.length}`);
    // Persist partial results after every batch so we never lose work if the
    // process is killed.
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          sample_size: results.length,
          partial: results.length < rows.length,
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
