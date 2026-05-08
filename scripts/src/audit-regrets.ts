import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const SAMPLE_SIZE = Number(process.env.AUDIT_SAMPLE_SIZE ?? 20);

interface Row {
  id: string;
  guest_name: string;
  regret_statement: string;
  source_quote: string;
}

const PROMPT = (r: Row) => `You are a strict editorial fact-checker for "The PM Confessional" — a project that collects PERSONAL CONFESSIONS of mistakes from podcast guests. Audit whether this entry is the speaker confessing their OWN mistake (or a hard-won lesson they take responsibility for) — vs generic advice or third-party observations.

Speaker: ${r.guest_name}
Distilled headline: "${r.regret_statement}"
Source quote: "${r.source_quote.slice(0, 800)}"

Verdict:
- PERSONAL_CONFESSION: speaker admits THEIR OWN mistake/regret or a lesson THEY personally learned the hard way ("I shipped too early...", "we hired wrong and I regret it...").
- GENERAL_ADVICE: generic guidance/theory/observations about what people do — speaker doesn't own it themselves.
- THIRD_PARTY: lesson is about someone else ("I've seen founders...", a portfolio company, a colleague).
- HEADLINE_MISMATCH: headline doesn't faithfully reflect the quote.
- AMBIGUOUS: genuinely unclear.

Respond with ONLY: {"verdict": "PERSONAL_CONFESSION|GENERAL_ADVICE|THIRD_PARTY|HEADLINE_MISMATCH|AMBIGUOUS", "reason": "one short sentence"}`;

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const { rows } = await pg.query<Row>(
    `SELECT id::text AS id, guest_name, regret_statement, source_quote
     FROM regrets
     WHERE source_quote IS NOT NULL AND length(source_quote) > 80
     ORDER BY RANDOM() LIMIT $1`,
    [SAMPLE_SIZE]
  );
  await pg.end();
  console.log(`Sampled ${rows.length} regrets. Auditing in batches of 5...`);

  const client = new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  });

  type AuditResult = Row & { verdict: string; reason: string };
  const results: AuditResult[] = [];

  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const out = await Promise.all(
      batch.map(async (r): Promise<AuditResult> => {
        try {
          const m = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 200,
            messages: [{ role: "user", content: PROMPT(r) }],
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
  console.log(`=== VERDICT TALLY (n=${results.length}) ===`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${k.padEnd(22)} ${String(v).padStart(2)}/${results.length}  (${Math.round(
        (100 * v) / results.length
      )}%)`
    );
  }

  for (const v of ["GENERAL_ADVICE", "THIRD_PARTY", "HEADLINE_MISMATCH", "AMBIGUOUS"]) {
    const ex = results.filter((r) => r.verdict === v).slice(0, 4);
    if (!ex.length) continue;
    console.log(`\n--- ${v} examples ---`);
    for (const r of ex) {
      console.log(`  [#${r.id} ${r.guest_name}] "${r.regret_statement}"`);
      console.log(`    why flagged: ${r.reason}`);
      console.log(`    quote: "${r.source_quote.slice(0, 200).replace(/\s+/g, " ")}..."`);
    }
  }
  console.log("\n--- 3 sample PERSONAL_CONFESSIONs (sanity) ---");
  for (const r of results.filter((r) => r.verdict === "PERSONAL_CONFESSION").slice(0, 3)) {
    console.log(`  [${r.guest_name}] "${r.regret_statement}"`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
