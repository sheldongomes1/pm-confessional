import { pgTable, text, serial, integer, timestamp, real, vector } from "drizzle-orm/pg-core";
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
  stage: text("stage").notNull().default("unknown"),
  topic_tag: text("topic_tag").notNull().default("other"),
  regret_statement: text("regret_statement").notNull(),
  source_quote: text("source_quote").notNull(),
  episode_url: text("episode_url"),
  episode_id: integer("episode_id").references(() => episodesTable.id),
  embedding: text("embedding"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

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
