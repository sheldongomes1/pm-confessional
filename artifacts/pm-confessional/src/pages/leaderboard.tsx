import { useState } from "react";
import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GuestConfessionsDialog } from "@/components/guest-confessions-dialog";

export function Leaderboard() {
  const { data, isLoading } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() }
  });
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);

  return (
    <div className="container mx-auto px-6 py-20 max-w-4xl">
      <div className="text-center mb-20 space-y-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">The Hall of Fame</p>
        <h1 className="text-5xl md:text-7xl font-serif text-foreground font-normal tracking-tight">
          Most Honest Operators
        </h1>
        <p className="text-xl font-serif italic text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          The product leaders who were most willing to drop the polish, open their journals, and share the scars that built their intuition.
        </p>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-8 border border-border bg-card animate-pulse flex items-center justify-between">
              <div className="space-y-4 flex-1">
                <Skeleton className="h-8 w-48 rounded-none bg-secondary" />
                <Skeleton className="h-4 w-32 rounded-none bg-secondary" />
              </div>
              <Skeleton className="h-12 w-16 rounded-none bg-secondary" />
            </div>
          ))
        ) : data?.entries.length === 0 ? (
          <div className="text-center py-24 px-6 border border-border bg-card">
            <h3 className="text-2xl font-serif font-normal mb-4">The record is clean</h3>
            <p className="text-muted-foreground font-serif italic">Run the data ingestion pipeline to uncover the truth.</p>
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
                    <span className={`font-mono text-sm ${isFirst ? 'text-primary font-bold' : 'text-muted-foreground/50'}`}>
                      {(index + 1).toString().padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className={`font-serif tracking-tight group-hover:text-primary transition-colors ${isFirst ? 'text-4xl text-foreground font-normal' : 'text-3xl text-foreground/90 font-normal'}`}>
                        {entry.guest_name}
                      </h3>
                      <div className="flex items-center gap-4 mt-3 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                        <span>
                          {entry.episode_count} {entry.episode_count === 1 ? 'EPISODE' : 'EPISODES'}
                        </span>
                        <span className="text-border">|</span>
                        <span className="truncate max-w-[200px] md:max-w-md">
                          {entry.top_topics.join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right ml-4">
                    <div className={`font-serif leading-none ${isFirst ? 'text-6xl text-primary font-normal' : 'text-4xl text-muted-foreground font-normal'}`}>
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

      <GuestConfessionsDialog
        guestName={selectedGuest}
        open={!!selectedGuest}
        onOpenChange={(open) => !open && setSelectedGuest(null)}
      />
    </div>
  );
}
