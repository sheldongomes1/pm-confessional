/**
 * Backfill text-embedding vectors for every visible regret.
 *
 * Reads `regret_statement || "\n\n" || source_quote` for each row where
 * `embedding IS NULL`, calls Gemini gemini-embedding-001 (RETRIEVAL_DOCUMENT
 * task type), and writes the 768-dim vector back via raw SQL (pgvector
 * literal).
 *
 * Idempotent: re-running picks up only nulls.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run embed-regrets
 */

import { sql, isNull } from "drizzle-orm";
import { db, regretsTable, pool } from "@workspace/db";
import {
  embedText,
  toVectorLiteral,
  batchProcess,
} from "@workspace/integrations-gemini-direct";

async function main() {
  const rows = await db
    .select({
      id: regretsTable.id,
      regret_statement: regretsTable.regret_statement,
      source_quote: regretsTable.source_quote,
    })
    .from(regretsTable)
    .where(isNull(regretsTable.embedding));

  console.log(`[embed-regrets] ${rows.length} rows need embeddings`);

  if (rows.length === 0) {
    await pool.end();
    return;
  }

  let processed = 0;
  await batchProcess(
    rows,
    async (row) => {
      const text = `${row.regret_statement}\n\n${row.source_quote}`.slice(0, 8000);
      const vec = await embedText(text, "RETRIEVAL_DOCUMENT");
      await db.execute(
        sql`UPDATE regrets SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${row.id}`,
      );
      processed++;
      if (processed % 25 === 0 || processed === rows.length) {
        console.log(`[embed-regrets] ${processed}/${rows.length}`);
      }
      return row.id;
    },
    { concurrency: 4, retries: 6, minTimeout: 2000, maxTimeout: 60000 },
  );

  const [{ count, with_embedding }] = (await db.execute(
    sql`SELECT count(*)::int AS count, count(embedding)::int AS with_embedding FROM regrets`,
  )).rows as Array<{ count: number; with_embedding: number }>;
  console.log(`[embed-regrets] DONE — ${with_embedding}/${count} rows have embeddings`);

  await pool.end();
}

main().catch(async (err) => {
  console.error("[embed-regrets] FAILED:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
