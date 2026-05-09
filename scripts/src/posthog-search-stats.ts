/**
 * Pull recent `search_completed` events from PostHog and report the
 * 3-tier rerank distribution + p50/p95 latency by tier.
 *
 * Requires:
 *   POSTHOG_PERSONAL_API_KEY  — phx_… key with `query:read` scope
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run posthog-search-stats [limit]
 */

const PROJECT_ID = "415646";
const HOST = "https://us.posthog.com";
const LIMIT = Number(process.argv[2] ?? "200");

type Row = [string, string | null, number | null, number | null, boolean | null];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

async function main() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) {
    console.error("POSTHOG_PERSONAL_API_KEY is not set");
    process.exit(1);
  }

  const hogql = `
    SELECT
      timestamp,
      properties.rerank_model AS rerank_model,
      toFloat(properties.total_ms) AS total_ms,
      toFloat(properties.top1_cosine) AS top1_cosine,
      properties.low_confidence AS low_confidence
    FROM events
    WHERE event = 'search_completed'
      AND properties.environment = 'production'
      AND properties.rerank_model IS NOT NULL
      AND timestamp > now() - INTERVAL 30 DAY
    ORDER BY timestamp DESC
    LIMIT ${LIMIT}
  `;

  const res = await fetch(
    `${HOST}/api/projects/${PROJECT_ID}/query/`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
    },
  );

  if (!res.ok) {
    console.error(`PostHog API ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const json = (await res.json()) as { results?: Row[] };
  const rows = json.results ?? [];
  if (rows.length === 0) {
    console.log("No search_completed events found in production yet.");
    console.log("(Try opening the live site and running ~10 searches first.)");
    return;
  }

  console.log(`\nPulled ${rows.length} search_completed events (last 30d, production).\n`);

  // Group by rerank_model.
  const byTier = new Map<string, number[]>();
  const cosines: number[] = [];
  let lowConfCount = 0;
  for (const [, model, totalMs, top1, lowConf] of rows) {
    const tier = model ?? "unknown";
    if (typeof totalMs === "number") {
      if (!byTier.has(tier)) byTier.set(tier, []);
      byTier.get(tier)!.push(totalMs);
    }
    if (typeof top1 === "number") cosines.push(top1);
    if (lowConf === true) lowConfCount++;
  }

  const total = rows.length;
  const tierOrder = ["none", "flash-lite", "flash", "unknown"];
  const tiers = [...byTier.keys()].sort(
    (a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b),
  );

  console.log("## Tier distribution + latency\n");
  console.log("| tier | count | share | p50 ms | p95 ms | max ms |");
  console.log("|---|---|---|---|---|---|");
  for (const tier of tiers) {
    const lat = byTier.get(tier)!.slice().sort((a, b) => a - b);
    const share = ((lat.length / total) * 100).toFixed(1);
    console.log(
      `| ${tier} | ${lat.length} | ${share}% | ${Math.round(percentile(lat, 50))} | ${Math.round(percentile(lat, 95))} | ${Math.round(lat[lat.length - 1] ?? 0)} |`,
    );
  }

  // Overall.
  const all = rows
    .map((r) => r[2])
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b);
  console.log(
    `| **all** | ${all.length} | 100% | ${Math.round(percentile(all, 50))} | ${Math.round(percentile(all, 95))} | ${Math.round(all[all.length - 1] ?? 0)} |`,
  );

  // Cosine distribution buckets.
  const buckets = [
    { label: "< 0.45 (low conf, → flash)", min: -Infinity, max: 0.45 },
    { label: "0.45 – 0.65 (→ flash-lite)", min: 0.45, max: 0.65 },
    { label: "0.65 – 0.70 (was cosine, now flash-lite)", min: 0.65, max: 0.7 },
    { label: "≥ 0.70 (cosine-only)", min: 0.7, max: Infinity },
  ];
  console.log("\n## top1_cosine distribution\n");
  console.log("| bucket | count | share |");
  console.log("|---|---|---|");
  for (const b of buckets) {
    const c = cosines.filter((x) => x >= b.min && x < b.max).length;
    console.log(
      `| ${b.label} | ${c} | ${cosines.length ? ((c / cosines.length) * 100).toFixed(1) + "%" : "—"} |`,
    );
  }

  console.log(`\nLow-confidence flagged: ${lowConfCount} / ${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
