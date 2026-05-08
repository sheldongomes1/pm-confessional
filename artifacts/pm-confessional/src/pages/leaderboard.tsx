import { useState } from "react";
import {
  useGetLeaderboard,
  useGetStats,
  getGetLeaderboardQueryKey,
  getGetStatsQueryKey,
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
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);

  const maxTopTopic = stats?.top_topics[0]?.count ?? 0;
  const totalStageDist =
    stats?.stage_distribution.reduce((sum, s) => sum + s.count, 0) ?? 0;

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
            <StatTile value={stats.total_regrets} label="Confessions" />
            <StatTile value={stats.total_guests} label="Operators" />
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

      {/* Two-column: Top Topics + Year Spotlight */}
      {!isLoadingStats && stats && stats.top_topics.length > 0 && (
        <section className="mb-16 grid grid-cols-1 lg:grid-cols-5 gap-px bg-border border border-border">
          {/* Top 3 Topics */}
          <div className="lg:col-span-3 bg-background p-10">
            <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-8 pb-4 border-b border-border">
              The Three Big Regrets
            </h2>
            <div className="space-y-8">
              {stats.top_topics.map((topic, index) => {
                const pct =
                  maxTopTopic > 0 ? (topic.count / maxTopTopic) * 100 : 0;
                return (
                  <div
                    key={topic.label}
                    data-testid={`top-topic-${topic.label}`}
                  >
                    <div className="flex items-baseline justify-between mb-3">
                      <div className="flex items-baseline gap-4">
                        <span className="font-mono text-xs text-muted-foreground/60">
                          {(index + 1).toString().padStart(2, "0")}
                        </span>
                        <span className="font-serif text-3xl text-foreground capitalize">
                          {topic.label}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <CountUp
                          value={topic.count}
                          className="font-serif text-3xl text-primary"
                        />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                          entries
                        </span>
                      </div>
                    </div>
                    <div className="h-px bg-border/40 relative overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary transition-all duration-700 h-[2px] -mt-px"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panel: Year spotlight + rarest topic */}
          <div className="lg:col-span-2 bg-background p-10 flex flex-col gap-12">
            {stats.most_candid_year && (
              <div data-testid="stat-most-candid-year">
                <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4 pb-3 border-b border-border">
                  Most Candid Year
                </h3>
                <p className="font-serif text-6xl text-foreground leading-none">
                  {stats.most_candid_year.year}
                </p>
                <p className="text-sm font-serif italic text-muted-foreground mt-3">
                  <CountUp value={stats.most_candid_year.count} />{" "}
                  confessions surfaced
                </p>
              </div>
            )}

            {stats.rarest_topic && (
              <div data-testid="stat-rarest-topic">
                <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4 pb-3 border-b border-border">
                  The Quietest Wound
                </h3>
                <p className="font-serif text-3xl text-foreground capitalize">
                  {stats.rarest_topic.label}
                </p>
                <p className="text-sm font-serif italic text-muted-foreground mt-3">
                  Only {stats.rarest_topic.count}{" "}
                  {stats.rarest_topic.count === 1 ? "operator dared" : "operators dared"}{" "}
                  to admit it.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Year-by-year ledger */}
      {!isLoadingStats && stats && stats.top_topic_by_year.length > 0 && (
        <section className="mb-20">
          <div className="flex items-center gap-4 mb-8">
            <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
              The Annual Ledger — #1 Regret Per Year
            </h2>
            <span className="flex-1 h-px bg-border" />
          </div>
          <div className="border border-border divide-y divide-border/50">
            {stats.top_topic_by_year.map((entry) => (
              <div
                key={entry.year}
                className="px-8 py-6 flex items-center justify-between gap-6"
                data-testid={`year-row-${entry.year}`}
              >
                <span className="font-mono text-2xl text-muted-foreground/70">
                  {entry.year}
                </span>
                <div className="flex-1 mx-6 h-px bg-border/40 hidden md:block" />
                <div className="flex items-baseline gap-4">
                  <span className="font-serif text-3xl text-foreground capitalize">
                    {entry.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
                    {entry.count} {entry.count === 1 ? "entry" : "entries"}
                  </span>
                </div>
              </div>
            ))}
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
                Run the data ingestion pipeline to uncover the truth.
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
