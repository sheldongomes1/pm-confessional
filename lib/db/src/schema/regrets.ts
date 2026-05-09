import { pgTable, text, serial, integer, timestamp, real, vector, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const episodesTable = pgTable("episodes", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull().unique(),
  title: text("title").notNull(),
  guest_name: text("guest_name").notNull(),
  episode_date: text("episode_date"),
  episode_url: text("episode_url"),
  description: text("description"),
  tags: text("tags"),
  word_count: integer("word_count"),
  regrets_extracted: integer("regrets_extracted").notNull().default(0),
  scanned_at: timestamp("scanned_at"),
  // Cached transcript markdown from MCP `read_content`. Stored so we can
  // re-extract regrets locally (with prompt iterations) without paying the
  // ~3hr MCP refetch cost. Populated by ingestion Phase 4 the first time an
  // episode is scanned. ~30 MB total across the 298-episode archive.
  markdown: text("markdown"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertEpisodeSchema = createInsertSchema(episodesTable).omit({ id: true, created_at: true });
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Episode = typeof episodesTable.$inferSelect;

export const regretsTable = pgTable("regrets", {
  id: serial("id").primaryKey(),
  guest_name: text("guest_name").notNull(),
  episode_title: text("episode_title").notNull(),
  episode_date: text("episode_date"),
  company: text("company"),
  stage: text("stage").notNull().default("general"),
  topic_tag: text("topic_tag").notNull().default("other"),
  regret_statement: text("regret_statement").notNull(),
  source_quote: text("source_quote").notNull(),
  // Verbatim 5-30 word span the extractor identifies as the strongest evidence
  // for the headline. Strictly more reliable than the windowed source_quote
  // because the extractor sees the full ~800-word chunk before choosing it.
  headline_evidence: text("headline_evidence"),
  episode_url: text("episode_url"),
  episode_id: integer("episode_id").references(() => episodesTable.id),
  // 768-dim Gemini text-embedding-004 vector. Backfilled by
  // `scripts/src/embed-regrets.ts`. Used for cosine-similarity retrieval
  // before Gemini Flash reranking in /api/regrets/search.
  embedding: vector("embedding", { dimensions: 768 }),
  // Set by the audit script (`scripts/src/audit-regrets-deep.ts`) to the verdict
  // string for any non-PERSONAL_CONFESSION row (HEADLINE_MISMATCH, AMBIGUOUS,
  // GENERAL_ADVICE, THIRD_PARTY, LENNY_NOT_GUEST). NULL means the regret passed
  // audit (or was never audited). All public-facing queries filter to
  // `audit_verdict IS NULL` so flagged rows are hidden from the UI but
  // preserved in the DB for later review.
  audit_verdict: text("audit_verdict"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  embeddingIdx: index("regrets_embedding_hnsw_idx").using(
    "hnsw",
    table.embedding.op("vector_cosine_ops"),
  ),
}));

export const insertRegretSchema = createInsertSchema(regretsTable).omit({ id: true, created_at: true });
export type InsertRegret = z.infer<typeof insertRegretSchema>;
export type Regret = typeof regretsTable.$inferSelect;

export const ingestStatusTable = pgTable("ingest_status", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("idle"),
  episodes_processed: text("episodes_processed").notNull().default("0"),
  regrets_extracted: text("regrets_extracted").notNull().default("0"),
  message: text("message"),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type IngestStatus = typeof ingestStatusTable.$inferSelect;
