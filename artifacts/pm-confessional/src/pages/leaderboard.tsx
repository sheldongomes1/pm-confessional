import { useState } from "react";
import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GuestConfessionsDialog } from "@/components/guest-confessions-dialog";

export function Leaderboard() {
  const { data, isLoading } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() }
  });
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);

  return (
    <div className="container mx-auto px-6 py-16 max-w-4xl bg-background">
      <div className="mb-12 border-b border-border pb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 bg-primary rounded-full"></span>
          <p className="text-[10px] uppercase tracking-widest text-foreground font-bold">Index</p>
        </div>
        <h1 className="text-4xl font-serif text-foreground font-medium tracking-tight">
          Contributor Leaderboard
        </h1>
        <p className="text-sm font-sans text-muted-foreground mt-4 max-w-2xl font-medium">
          A ranking of operators by volume of insights contributed to the database.
        </p>
      </div>

      <div className="bg-card border border-border shadow-sm rounded-sm">
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-4 border-b border-border bg-muted/30 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          <div className="w-8 text-center">Rank</div>
          <div>Contributor Profile</div>
          <div className="text-right">Records</div>
        </div>

        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-6 border-b border-border last:border-0 flex items-center justify-between">
              <div className="space-y-3 flex-1">
                <Skeleton className="h-5 w-40 bg-secondary" />
                <Skeleton className="h-3 w-32 bg-secondary" />
              </div>
              <Skeleton className="h-8 w-12 bg-secondary" />
            </div>
          ))
        ) : data?.entries.length === 0 ? (
          <div className="text-center py-16 px-6">
            <h3 className="text-base font-serif font-medium text-foreground mb-2">No contributors found</h3>
            <p className="text-muted-foreground text-sm font-sans">Run the ingestion pipeline to populate data.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {data?.entries.map((entry, index) => {
              return (
                <div 
                  key={entry.guest_name} 
                  onClick={() => setSelectedGuest(entry.guest_name)}
                  className="grid grid-cols-[auto_1fr_auto] gap-4 p-6 items-center transition-colors cursor-pointer hover:bg-secondary/50 group"
                  data-testid={`leaderboard-row-${index}`}
                >
                  <div className="w-8 text-center font-mono text-sm font-bold text-muted-foreground group-hover:text-primary transition-colors">
                    {(index + 1).toString().padStart(2, '0')}
                  </div>
                  
                  <div>
                    <h3 className="font-serif text-xl text-foreground font-medium group-hover:text-primary transition-colors">
                      {entry.guest_name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                      <span className="bg-muted px-2 py-0.5 rounded-sm">
                        {entry.episode_count} {entry.episode_count === 1 ? 'EP' : 'EPS'}
                      </span>
                      <span className="truncate max-w-[200px] md:max-w-md">
                        {entry.top_topics.join(', ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-2xl font-bold text-foreground">
                      {entry.regret_count}
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
