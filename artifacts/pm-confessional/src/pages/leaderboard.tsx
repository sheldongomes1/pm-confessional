import { useState } from "react";
import {
  useGetLeaderboard,
  useGetStats,
  useGetCategories,
  getGetLeaderboardQueryKey,
  getGetStatsQueryKey,
  getGetCategoriesQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GuestConfessionsDialog } from "@/components/guest-confessions-dialog";
import { CountUp } from "@/components/count-up";

export function Leaderboard() {
  const { data, isLoading } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() },
  });
  const { data: stats, isLoading: isLoadingStats } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });
  const { data: categories } = useGetCategories({
    query: { queryKey: getGetCategoriesQueryKey() },
  });
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);

  const totalStageDist =
    stats?.stage_distribution.reduce((sum, s) => sum + s.count, 0) ?? 0;

  // Build the per-year confession trend, sorted oldest → newest.
  const yearTrend = (categories?.by_year ?? [])
    .map((y) => ({ year: Number(y.label), count: y.count }))
    .filter((y) => Number.isFinite(y.year))
    .sort((a, b) => a.year - b.year);

  return (
    <div className="container mx-auto px-6 py-20 max-w-5xl">
      <div className="text-center mb-16 space-y-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">
          The Hall of Fame
        </p>
        <h1 className="text-5xl md:text-7xl font-serif text-foreground font-normal tracking-tight">
          Most Honest Operators
        </h1>
        <p className="text-xl font-serif italic text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          The product leaders who were most willing to drop the polish, open
          their journals, and share the scars that built their intuition.
        </p>
      </div>

      {/* Archive Snapshot — headline stats */}
      <section className="mb-16">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
            Archive Snapshot
          </h2>
          <span className="flex-1 h-px bg-border" />
        </div>

        {isLoadingStats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-background p-8">
                <Skeleton className="h-12 w-20 mb-3 rounded-none bg-secondary" />
                <Skeleton className="h-3 w-24 rounded-none bg-secondary" />
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
            <StatTile value={stats.total_regrets} label="Confessions" />
            <StatTile value={stats.total_episodes} label="Episodes" />
            <StatTile
              value={stats.avg_regrets_per_guest}
              label="Avg per guest"
              decimals={
                Number.isInteger(stats.avg_regrets_per_guest) ? 0 : 1
              }
            />
          </div>
        ) : null}
      </section>

      {/* Confessions per year — line chart */}
      {yearTrend.length > 1 && (
        <section className="mb-20">
          <div className="flex items-center gap-4 mb-8">
            <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
              Confessions by Year
            </h2>
            <span className="flex-1 h-px bg-border" />
          </div>
          <div className="border border-border bg-background p-10">
            <YearTrendChart data={yearTrend} />
          </div>
        </section>
      )}

      {/* Stage distribution */}
      {!isLoadingStats && stats && totalStageDist > 0 && (
        <section className="mb-20">
          <div className="flex items-center gap-4 mb-8">
            <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
              Where the Wounds Were Made
            </h2>
            <span className="flex-1 h-px bg-border" />
          </div>
          <div className="border border-border bg-background p-8">
            <div className="flex h-3 mb-6 overflow-hidden">
              {stats.stage_distribution.map((s, i) => {
                const pct = (s.count / totalStageDist) * 100;
                const opacities = [1, 0.7, 0.45, 0.25];
                return (
                  <div
                    key={s.label}
                    className="bg-primary transition-all"
                    style={{
                      width: `${pct}%`,
                      opacity: opacities[i] ?? 0.2,
                    }}
                    title={`${s.label}: ${s.count}`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {stats.stage_distribution.map((s, i) => {
                const pct = Math.round((s.count / totalStageDist) * 100);
                const opacities = [1, 0.7, 0.45, 0.25];
                return (
                  <div
                    key={s.label}
                    data-testid={`stage-dist-${s.label}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-3 h-3 bg-primary"
                        style={{ opacity: opacities[i] ?? 0.2 }}
                      />
                      <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                        {s.label}
                      </span>
                    </div>
                    <p className="font-serif text-2xl text-foreground">
                      {pct}
                      <span className="text-sm text-muted-foreground">%</span>
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                      {s.count} {s.count === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Operator leaderboard */}
      <section>
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
            Operators Ranked
          </h2>
          <span className="flex-1 h-px bg-border" />
        </div>

        <div className="space-y-6">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="p-8 border border-border bg-card animate-pulse flex items-center justify-between"
              >
                <div className="space-y-4 flex-1">
                  <Skeleton className="h-8 w-48 rounded-none bg-secondary" />
                  <Skeleton className="h-4 w-32 rounded-none bg-secondary" />
                </div>
                <Skeleton className="h-12 w-16 rounded-none bg-secondary" />
              </div>
            ))
          ) : data?.entries.length === 0 ? (
            <div className="text-center py-24 px-6 border border-border bg-card">
              <h3 className="text-2xl font-serif font-normal mb-4">
                The record is clean
              </h3>
              <p className="text-muted-foreground font-serif italic">
                No confessions on record yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/50 border-t border-b border-border/50">
              {data?.entries.map((entry, index) => {
                const isFirst = index === 0;
                return (
                  <div
                    key={entry.guest_name}
                    onClick={() => setSelectedGuest(entry.guest_name)}
                    className={`group py-8 px-4 flex items-center justify-between transition-colors cursor-pointer hover:bg-secondary/30 ${
                      isFirst ? "bg-card/50" : ""
                    }`}
                    data-testid={`leaderboard-row-${index}`}
                  >
                    <div className="flex items-center gap-8 flex-1">
                      <span
                        className={`font-mono text-sm ${isFirst ? "text-primary font-bold" : "text-muted-foreground/50"}`}
                      >
                        {(index + 1).toString().padStart(2, "0")}
                      </span>
                      <div>
                        <h3
                          className={`font-serif tracking-tight group-hover:text-primary transition-colors ${isFirst ? "text-4xl text-foreground font-normal" : "text-3xl text-foreground/90 font-normal"}`}
                        >
                          {entry.guest_name}
                        </h3>
                        <div className="flex items-center gap-4 mt-3 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                          <span>
                            {entry.episode_count}{" "}
                            {entry.episode_count === 1 ? "EPISODE" : "EPISODES"}
                          </span>
                          <span className="text-border">|</span>
                          <span className="truncate max-w-[200px] md:max-w-md">
                            {entry.top_topics.join(", ")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <div
                        className={`font-serif leading-none ${isFirst ? "text-6xl text-primary font-normal" : "text-4xl text-muted-foreground font-normal"}`}
                      >
                        {entry.regret_count}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-3 font-bold">
                        Entries
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <GuestConfessionsDialog
        guestName={selectedGuest}
        open={!!selectedGuest}
        onOpenChange={(open) => !open && setSelectedGuest(null)}
      />
    </div>
  );
}

function YearTrendChart({ data }: { data: { year: number; count: number }[] }) {
  // SVG viewBox in abstract units; CSS scales it responsively.
  const W = 800;
  const H = 260;
  const padX = 48;
  const padTop = 24;
  const padBottom = 44;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  // Round the y-axis ceiling up to a tidy round number.
  const yMax = niceCeil(maxCount);

  const x = (i: number) =>
    padX + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / yMax) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(d.count).toFixed(2)}`)
    .join(" ");

  // Fill underneath the line for an editorial, restrained shade.
  const areaPath =
    `M ${x(0).toFixed(2)} ${(padTop + innerH).toFixed(2)} ` +
    data.map((d, i) => `L ${x(i).toFixed(2)} ${y(d.count).toFixed(2)}`).join(" ") +
    ` L ${x(data.length - 1).toFixed(2)} ${(padTop + innerH).toFixed(2)} Z`;

  // 4 horizontal gridlines.
  const gridSteps = 4;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const v = (yMax * (gridSteps - i)) / gridSteps;
    return { y: padTop + (i / gridSteps) * innerH, label: Math.round(v) };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
      data-testid="year-trend-chart"
    >
      {/* Gridlines + y labels */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={padX}
            x2={W - padX}
            y1={g.y}
            y2={g.y}
            className="stroke-border/40"
            strokeWidth={1}
          />
          <text
            x={padX - 10}
            y={g.y + 4}
            textAnchor="end"
            className="fill-muted-foreground/60 font-mono"
            fontSize="10"
          >
            {g.label}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={areaPath} className="fill-primary/10" />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        className="stroke-primary"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Points */}
      {data.map((d, i) => (
        <g key={d.year}>
          <circle
            cx={x(i)}
            cy={y(d.count)}
            r={3}
            className="fill-background stroke-primary"
            strokeWidth={1.5}
          >
            <title>{`${d.year}: ${d.count} confessions`}</title>
          </circle>
          <text
            x={x(i)}
            y={H - 14}
            textAnchor="middle"
            className="fill-muted-foreground/70 font-mono"
            fontSize="11"
          >
            {d.year}
          </text>
        </g>
      ))}
    </svg>
  );
}

function niceCeil(n: number): number {
  if (n <= 10) return Math.ceil(n / 2) * 2;
  if (n <= 50) return Math.ceil(n / 5) * 5;
  if (n <= 100) return Math.ceil(n / 10) * 10;
  if (n <= 500) return Math.ceil(n / 25) * 25;
  return Math.ceil(n / 50) * 50;
}

function StatTile({
  value,
  label,
  decimals = 0,
}: {
  value: number;
  label: string;
  decimals?: number;
}) {
  return (
    <div className="bg-background p-8">
      <CountUp
        value={value}
        decimals={decimals}
        className="font-serif text-5xl text-foreground leading-none mb-3 block"
      />
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
