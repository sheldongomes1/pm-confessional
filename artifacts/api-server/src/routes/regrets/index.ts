import { Router, type IRouter } from "express";
import { eq, sql, desc, and, asc } from "drizzle-orm";
import { db, regretsTable } from "@workspace/db";
import {
  ListRegretsQueryParams,
  SearchRegretsBody,
  GetRegretParams,
  ListRegretsResponse,
  SearchRegretsResponse,
  GetCategoriesResponse,
  GetStatsResponse,
  GetRegretResponse,
  GetLeaderboardResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeRegret(r: typeof regretsTable.$inferSelect, relevance_score: number | null = null) {
  return {
    ...r,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    relevance_score,
  };
}

router.get("/regrets", async (req, res): Promise<void> => {
  const parsed = ListRegretsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { topic_tag, stage, guest_name, limit, offset } = parsed.data;

  const conditions = [];
  if (topic_tag) conditions.push(eq(regretsTable.topic_tag, topic_tag));
  if (stage) conditions.push(eq(regretsTable.stage, stage));
  if (guest_name) conditions.push(eq(regretsTable.guest_name, guest_name));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [regrets, countResult] = await Promise.all([
    db
      .select()
      .from(regretsTable)
      .where(whereClause)
      .orderBy(desc(regretsTable.created_at))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(regretsTable)
      .where(whereClause),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  res.json(
    ListRegretsResponse.parse({
      regrets: regrets.map((r) => serializeRegret(r)),
      total,
    })
  );
});

router.post("/regrets/search", async (req, res): Promise<void> => {
  const parsed = SearchRegretsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { query, limit } = parsed.data;

  // We do keyword-based search since we store embeddings as JSON text
  const lowerQuery = query.toLowerCase();
  const keywords = lowerQuery
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  let regrets;

  if (keywords.length === 0) {
    regrets = await db
      .select()
      .from(regretsTable)
      .orderBy(desc(regretsTable.created_at))
      .limit(limit ?? 8);
  } else {
    // Build a full-text-style search using ilike
    const searchConditions = keywords.map(
      (kw) =>
        sql`(
          ${regretsTable.regret_statement} ilike ${"%" + kw + "%"}
          or ${regretsTable.source_quote} ilike ${"%" + kw + "%"}
          or ${regretsTable.guest_name} ilike ${"%" + kw + "%"}
          or ${regretsTable.topic_tag} ilike ${"%" + kw + "%"}
          or ${regretsTable.company} ilike ${"%" + kw + "%"}
        )`
    );

    const combinedCondition = sql`(${searchConditions.reduce(
      (acc, cond) => sql`${acc} or ${cond}`
    )})`;

    regrets = await db
      .select()
      .from(regretsTable)
      .where(combinedCondition)
      .limit(limit ?? 8);
  }

  // Score based on keyword matches in regret_statement
  const scored = regrets.map((r) => {
    let score = 0;
    const text =
      `${r.regret_statement} ${r.source_quote} ${r.topic_tag}`.toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    const relevance_score = keywords.length > 0 ? score / keywords.length : 0.5;
    return serializeRegret(r, relevance_score);
  });

  scored.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

  res.json(
    SearchRegretsResponse.parse({
      regrets: scored,
      query,
    })
  );
});

router.get("/regrets/categories", async (_req, res): Promise<void> => {
  const [byTopic, byStage] = await Promise.all([
    db
      .select({
        label: regretsTable.topic_tag,
        count: sql<number>`count(*)`,
      })
      .from(regretsTable)
      .groupBy(regretsTable.topic_tag)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        label: regretsTable.stage,
        count: sql<number>`count(*)`,
      })
      .from(regretsTable)
      .groupBy(regretsTable.stage)
      .orderBy(desc(sql`count(*)`)),
  ]);

  res.json(
    GetCategoriesResponse.parse({
      by_topic: byTopic.map((r) => ({
        label: r.label,
        count: Number(r.count),
      })),
      by_stage: byStage.map((r) => ({
        label: r.label,
        count: Number(r.count),
      })),
    })
  );
});

router.get("/regrets/stats", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      total_regrets: sql<number>`count(*)`,
      total_guests: sql<number>`count(distinct ${regretsTable.guest_name})`,
      total_episodes: sql<number>`count(distinct ${regretsTable.episode_title})`,
    })
    .from(regretsTable);

  res.json(
    GetStatsResponse.parse({
      total_regrets: Number(totals?.total_regrets ?? 0),
      total_guests: Number(totals?.total_guests ?? 0),
      total_episodes: Number(totals?.total_episodes ?? 0),
    })
  );
});

router.get("/regrets/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRegretParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [regret] = await db
    .select()
    .from(regretsTable)
    .where(eq(regretsTable.id, params.data.id));

  if (!regret) {
    res.status(404).json({ error: "Regret not found" });
    return;
  }

  res.json(GetRegretResponse.parse(serializeRegret(regret)));
});

router.get("/leaderboard", async (_req, res): Promise<void> => {
  const entries = await db
    .select({
      guest_name: regretsTable.guest_name,
      regret_count: sql<number>`count(*)`,
      episode_count: sql<number>`count(distinct ${regretsTable.episode_title})`,
    })
    .from(regretsTable)
    .groupBy(regretsTable.guest_name)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  // Fetch top topics per guest
  const leaderboard = await Promise.all(
    entries.map(async (entry) => {
      const topics = await db
        .select({
          topic: regretsTable.topic_tag,
          cnt: sql<number>`count(*)`,
        })
        .from(regretsTable)
        .where(eq(regretsTable.guest_name, entry.guest_name))
        .groupBy(regretsTable.topic_tag)
        .orderBy(desc(sql`count(*)`))
        .limit(3);

      return {
        guest_name: entry.guest_name,
        regret_count: Number(entry.regret_count),
        episode_count: Number(entry.episode_count),
        top_topics: topics.map((t) => t.topic),
      };
    })
  );

  res.json(GetLeaderboardResponse.parse({ entries: leaderboard }));
});

export default router;
