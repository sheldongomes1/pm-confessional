import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per Decision Coach conversation. `regret_ids` pins the 5 source
 * confessions the agent is grounded on; `messages` is the full chat history
 * including the model's tool-use traces and citations.
 */
export const coachingSessionsTable = pgTable("coaching_sessions", {
  id: serial("id").primaryKey(),
  user_decision: text("user_decision").notNull(),
  regret_ids: jsonb("regret_ids").$type<number[]>().notNull(),
  // "high" | "medium" | "low" — captured at coach start from the
  // upstream search response. Drives a scope-check branch in the coach
  // system prompt so we don't improvise advice when retrieval is weak
  // (e.g. "should I run the NYC marathon" → no relevant confessions).
  retrieval_confidence: text("retrieval_confidence")
    .$type<"high" | "medium" | "low">(),
  messages: jsonb("messages")
    .$type<Array<{ role: "user" | "model"; content: string }>>()
    .notNull()
    .default([]),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCoachingSessionSchema = createInsertSchema(coachingSessionsTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertCoachingSession = z.infer<typeof insertCoachingSessionSchema>;
export type CoachingSession = typeof coachingSessionsTable.$inferSelect;
