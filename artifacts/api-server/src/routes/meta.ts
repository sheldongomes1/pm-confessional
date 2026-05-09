import { Router, type IRouter } from "express";
import { sql, isNotNull } from "drizzle-orm";
import { db, regretsTable, episodesTable, coachingSessionsTable } from "@workspace/db";
import {
  GetMethodologyResponse,
  GetPublicInsightsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Methodology stats derived live from the DB. Numbers like extractor v1/v2
 * precision are pinned constants documented in replit.md (we don't re-run the
 * audit on every page load).
 */
router.get("/methodology", async (_req, res): Promise<void> => {
  const [counts] = await db
    .select({
      total_audited: sql<number>`count(*) filter (where ${regretsTable.audit_verdict} is not null) + count(*) filter (where ${regretsTable.audit_verdict} is null)`,
      total_visible: sql<number>`count(*) filter (where ${regretsTable.audit_verdict} is null)`,
      total_flagged: sql<number>`count(*) filter (where ${regretsTable.audit_verdict} is not null)`,
      verbatim_present: sql<number>`count(*) filter (where ${regretsTable.audit_verdict} is null and ${regretsTable.headline_evidence} is not null)`,
    })
    .from(regretsTable);

  const flaggedRows = await db
    .select({
      label: regretsTable.audit_verdict,
      count: sql<number>`count(*)`,
    })
    .from(regretsTable)
    .where(isNotNull(regretsTable.audit_verdict))
    .groupBy(regretsTable.audit_verdict);

  const [episodeRow] = await db
    .select({
      count: sql<number>`count(*) filter (where ${episodesTable.scanned_at} is not null)`,
    })
    .from(episodesTable);

  const total_visible = Number(counts?.total_visible ?? 0);
  const verbatim = Number(counts?.verbatim_present ?? 0);
  const verified_pct = total_visible > 0 ? verbatim / total_visible : 0;

  res.json(
    GetMethodologyResponse.parse({
      total_audited: Number(counts?.total_audited ?? 0),
      total_visible,
      total_flagged: Number(counts?.total_flagged ?? 0),
      flagged_breakdown: flaggedRows.map((r) => ({
        label: r.label ?? "unknown",
        count: Number(r.count),
      })),
      verified_verbatim_pct: Number(verified_pct.toFixed(4)),
      extractor_v1_precision: 0.33,
      extractor_v2_precision: 0.9,
      episodes_scanned: Number(episodeRow?.count ?? 0),
    }),
  );
});

/**
 * Public usage stats. We try PostHog Query API when both `POSTHOG_PROJECT_ID`
 * and `POSTHOG_PERSONAL_API_KEY` are set; otherwise we degrade to local-only
 * stats (still useful — coaching session count comes from our own DB).
 */
router.get("/insights/public", async (req, res): Promise<void> => {
  const [coachRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(coachingSessionsTable);
  const coaching_sessions_total = Number(coachRow?.count ?? 0);

  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const host = process.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!projectId || !apiKey) {
    res.json(
      GetPublicInsightsResponse.parse({
        searches_this_week: null,
        top_decision_today: null,
        coaching_sessions_total,
        source: "local",
      }),
    );
    return;
  }

  try {
    const apiHost = host.replace("//us.i.", "//us.").replace("//eu.i.", "//eu.");
    const r = await fetch(`${apiHost}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: `select count() from events where event = 'search_submitted' and timestamp > now() - interval 7 day`,
        },
      }),
    });
    if (!r.ok) throw new Error(`PostHog HTTP ${r.status}`);
    const data = (await r.json()) as { results?: Array<Array<number>> };
    const searches = data.results?.[0]?.[0] ?? null;
    res.json(
      GetPublicInsightsResponse.parse({
        searches_this_week: searches != null ? Number(searches) : null,
        top_decision_today: null,
        coaching_sessions_total,
        source: "posthog",
      }),
    );
  } catch (err) {
    req.log.warn({ err }, "PostHog insights query failed; returning local stats");
    res.json(
      GetPublicInsightsResponse.parse({
        searches_this_week: null,
        top_decision_today: null,
        coaching_sessions_total,
        source: "unavailable",
      }),
    );
  }
});

export default router;
