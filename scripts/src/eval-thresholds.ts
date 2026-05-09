/**
 * Offline threshold tuning eval.
 *
 * For each of the 10 verification queries, runs the search pipeline at three
 * candidate HIGH_CONFIDENCE_THRESHOLD settings (0.65, 0.70, 0.80) and prints
 * the top-1 regret_statement produced at each. Touches only the DB and the
 * Gemini API — does NOT hit the running API server, does NOT change any
 * deployed env var.
 *
 * Bonus: for three flagged queries, also prints the top-3 at threshold 0.80
 * with both cosine similarity and rerank score so we can see whether the
 * rerank actually surfaces a more relevant confession or just reshuffles
 * the same wrong-topic results.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run eval-thresholds
 */

import { sql, isNull, and } from "drizzle-orm";
import { db, regretsTable, pool } from "@workspace/db";
import {
  embedText,
  toVectorLiteral,
  gemini,
  FLASH_LITE_MODEL,
  FLASH_MODEL,
} from "@workspace/integrations-gemini-direct";

const QUERIES = [
  "should I hire a senior PM or two juniors",
  "should I raise prices or stay low to grow",
  "did anyone regret expanding internationally too soon",
  "what about pivoting from B2C to B2B",
  "should I outsource my engineering team",
  "when did founders regret hiring a COO",
  "should I sunset a feature with loyal users",
  "should I fire an underperforming senior",
  "should I take VC money or stay bootstrapped",
  "should I rewrite the codebase or keep patching",
];

const THRESHOLDS = [0.65, 0.7, 0.8];
const LOW_CONFIDENCE = 0.45;
const FLAGGED_INDEXES = [0, 1, 3]; // queries #1, #2, #4 (0-indexed)

type Row = typeof regretsTable.$inferSelect;
type Candidate = { regret: Row; cosine: number };

async function topCandidates(query: string): Promise<Candidate[]> {
  const vec = await embedText(query, "RETRIEVAL_QUERY");
  const literal = toVectorLiteral(vec);
  const rows = await db
    .select({
      regret: regretsTable,
      distance: sql<number>`(${regretsTable.embedding} <=> ${literal}::vector)`,
    })
    .from(regretsTable)
    .where(
      and(
        isNull(regretsTable.audit_verdict),
        sql`${regretsTable.embedding} is not null`,
      ),
    )
    .orderBy(sql`${regretsTable.embedding} <=> ${literal}::vector`)
    .limit(20);
  return rows.map((r) => ({
    regret: r.regret,
    cosine: Math.max(0, 1 - Number(r.distance)),
  }));
}

async function rerank(
  query: string,
  candidates: Candidate[],
  model: string,
): Promise<Map<number, number> | null> {
  const items = candidates
    .map(
      (c) =>
        `[${c.regret.id}] topic=${c.regret.topic_tag} | regret: ${c.regret.regret_statement} | quote: ${c.regret.source_quote.slice(0, 200)}`,
    )
    .join("\n");

  const systemPrompt = `You are a semantic search ranker for "The PM Confessional", a database of product manager regrets. Your ONLY job is to score each candidate's relevance to the user's situation.

Scoring scale (0-10):
- 10 = directly addresses the same decision
- 7-9 = closely related decision in the same domain
- 4-6 = tangentially related, same broad area
- 1-3 = barely related
- 0 = unrelated

Match on the SUBSTANCE of the decision, not surface keywords.

Respond with ONLY a JSON object: {"rankings": [{"id": <number>, "score": <0-10>}, ...]}. Include every candidate ID exactly once.`;

  const userPrompt = `<user_query>\n${query}\n</user_query>\n\n<candidates>\n${items}\n</candidates>\n\nScore each candidate.`;

  const resp = await gemini.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      temperature: 0,
    },
  });
  const text = resp.text;
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]) as {
    rankings?: { id: number; score: number }[];
  };
  if (!Array.isArray(parsed.rankings)) return null;
  const map = new Map<number, number>();
  for (const r of parsed.rankings) {
    if (typeof r.id === "number" && typeof r.score === "number") {
      map.set(r.id, Math.max(0, Math.min(10, r.score)));
    }
  }
  return map;
}

function trimStmt(s: string, n = 90): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

async function main() {
  // Embed + pull top-20 once per query, then evaluate every threshold against
  // the same candidate set so the only varying input is the rerank decision.
  console.log("Fetching candidates + reranking for each query…\n");

  type EvalRow = {
    query: string;
    top1Cosine: number;
    perThreshold: { threshold: number; topStmt: string; reranked: boolean }[];
    flashLiteScores?: Map<number, number>;
    flashScores?: Map<number, number>;
    candidates: Candidate[];
  };
  const results: EvalRow[] = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    process.stdout.write(`  [${i + 1}/${QUERIES.length}] ${query} … `);
    const candidates = await topCandidates(query);
    const top1Cosine = candidates[0]?.cosine ?? 0;

    // Rerank once with Flash Lite — used for all thresholds where top1 < T
    // but top1 >= LOW_CONFIDENCE (true for every realistic query here).
    let flashLite: Map<number, number> | null = null;
    let flash: Map<number, number> | null = null;
    if (top1Cosine < Math.max(...THRESHOLDS)) {
      flashLite = await rerank(query, candidates, FLASH_LITE_MODEL);
    }
    if (top1Cosine < LOW_CONFIDENCE) {
      flash = await rerank(query, candidates, FLASH_MODEL);
    }
    // For the 3 flagged queries we always need full Flash + Flash Lite scores
    // at the 0.80 step for the bonus output.
    if (FLAGGED_INDEXES.includes(i) && !flashLite) {
      flashLite = await rerank(query, candidates, FLASH_LITE_MODEL);
    }

    const perThreshold = THRESHOLDS.map((threshold) => {
      if (top1Cosine >= threshold) {
        return {
          threshold,
          topStmt: candidates[0].regret.regret_statement,
          reranked: false,
        };
      }
      // top1 < threshold → rerank
      const isLow = top1Cosine < LOW_CONFIDENCE;
      const scores = isLow ? flash : flashLite;
      if (!scores || scores.size === 0) {
        return {
          threshold,
          topStmt: candidates[0].regret.regret_statement,
          reranked: true,
        };
      }
      const sorted = [...candidates].sort((a, b) => {
        const sa = scores.get(a.regret.id) ?? 0;
        const sb = scores.get(b.regret.id) ?? 0;
        return sb - sa || b.cosine - a.cosine;
      });
      return {
        threshold,
        topStmt: sorted[0].regret.regret_statement,
        reranked: true,
      };
    });

    results.push({
      query,
      top1Cosine,
      perThreshold,
      flashLiteScores: flashLite ?? undefined,
      flashScores: flash ?? undefined,
      candidates,
    });
    console.log(`top1=${top1Cosine.toFixed(2)}`);
  }

  // ─── Step 1 + 2: quality matrix table ──────────────────────────────────
  console.log("\n## Quality matrix\n");
  console.log(
    "| # | query | top1_cos | A: 0.65 (top-1) | B: 0.70 (top-1) | C: 0.80 (top-1) |",
  );
  console.log(
    "|---|---|---|---|---|---|",
  );
  results.forEach((r, i) => {
    const cells = r.perThreshold.map(
      (t) => `${t.reranked ? "🔁 " : ""}${trimStmt(t.topStmt)}`,
    );
    console.log(
      `| ${i + 1} | ${trimStmt(r.query, 50)} | ${r.top1Cosine.toFixed(2)} | ${cells[0]} | ${cells[1]} | ${cells[2]} |`,
    );
  });
  console.log("\n_🔁 = rerank fired at this threshold. No symbol = cosine-only._");

  // ─── Step 3: bonus — top-3 at 0.80 for queries #1, #2, #4 ─────────────
  console.log("\n## Bonus: top-3 at threshold 0.80 for flagged queries\n");
  for (const idx of FLAGGED_INDEXES) {
    const r = results[idx];
    const scores = r.flashLiteScores ?? new Map<number, number>();
    const ranked = [...r.candidates].sort((a, b) => {
      const sa = scores.get(a.regret.id) ?? 0;
      const sb = scores.get(b.regret.id) ?? 0;
      return sb - sa || b.cosine - a.cosine;
    });

    console.log(`### Query #${idx + 1}: "${r.query}"`);
    console.log(
      `_top-1 cosine = ${r.top1Cosine.toFixed(2)} → at threshold 0.80, rerank fires (Flash Lite)_\n`,
    );
    console.log("| rank | id | cosine | rerank | topic | regret_statement |");
    console.log("|---|---|---|---|---|---|");
    ranked.slice(0, 3).forEach((c, rank) => {
      const rerankScore = scores.get(c.regret.id) ?? 0;
      console.log(
        `| ${rank + 1} | #${c.regret.id} | ${c.cosine.toFixed(3)} | ${rerankScore.toFixed(1)}/10 | ${c.regret.topic_tag} | ${trimStmt(c.regret.regret_statement, 100)} |`,
      );
    });

    // For comparison: pre-rerank top-3 (pure cosine order) — so we can see
    // whether rerank actually changed the lineup or just reshuffled it.
    const cosineTop3 = r.candidates.slice(0, 3).map((c) => c.regret.id);
    const rerankTop3 = ranked.slice(0, 3).map((c) => c.regret.id);
    const same =
      cosineTop3.length === rerankTop3.length &&
      cosineTop3.every((id, i) => id === rerankTop3[i]);
    console.log(
      same
        ? "\n→ Rerank kept the same top-3 in the same order.\n"
        : `\n→ Rerank changed the lineup. Cosine top-3 was [${cosineTop3.map((x) => "#" + x).join(", ")}], rerank top-3 is [${rerankTop3.map((x) => "#" + x).join(", ")}].\n`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
