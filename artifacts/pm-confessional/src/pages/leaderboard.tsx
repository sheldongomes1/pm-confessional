import { useState } from "react";
import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Star } from "lucide-react";
import { GuestConfessionsDialog } from "@/components/guest-confessions-dialog";

export function Leaderboard() {
  const { data, isLoading } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() }
  });
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="text-center mb-12 space-y-4">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">
          Most Honest Operators
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          The product leaders who were most willing to drop the polish, open their journals, and share the scars that built their intuition.
        </p>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-6 bg-card/50 border-border/50 animate-pulse flex items-center gap-6">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-10 w-24" />
            </Card>
          ))
        ) : data?.entries.length === 0 ? (
          <div className="text-center py-20 px-4 border border-dashed border-border/50 rounded-xl bg-card/20">
            <h3 className="text-xl font-serif font-bold mb-2">The hall of fame is empty</h3>
            <p className="text-muted-foreground">Run the data ingestion pipeline to populate the leaderboard.</p>
          </div>
        ) : (
          data?.entries.map((entry, index) => {
            const isFirst = index === 0;
            const isTop3 = index < 3;
            
            return (
              <Card 
                key={entry.guest_name} 
                onClick={() => setSelectedGuest(entry.guest_name)}
                className={`p-6 border-border/50 transition-all cursor-pointer ${
                  isFirst 
                    ? "bg-gradient-to-r from-primary/10 to-card border-primary/30 shadow-[0_0_30px_-15px_hsl(var(--primary))] hover:border-primary/50" 
                    : "bg-card/50 hover:bg-card/80 hover:border-primary/30"
                }`}
                data-testid={`leaderboard-row-${index}`}
              >
                <div className="flex items-center gap-4 md:gap-8 flex-wrap md:flex-nowrap">
                  {/* Rank */}
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-secondary font-serif font-bold text-xl relative">
                    {isFirst ? (
                      <Trophy className="w-6 h-6 text-yellow-500" />
                    ) : index === 1 ? (
                      <Medal className="w-6 h-6 text-gray-400" />
                    ) : index === 2 ? (
                      <Medal className="w-6 h-6 text-amber-700" />
                    ) : (
                      <span className="text-muted-foreground">#{index + 1}</span>
                    )}
                    {isFirst && (
                      <Star className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-[200px]">
                    <h3 className={`font-serif font-bold ${isFirst ? 'text-2xl text-foreground' : 'text-xl text-foreground/90'}`}>
                      {entry.guest_name}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">
                        {entry.episode_count} {entry.episode_count === 1 ? 'Episode' : 'Episodes'}
                      </span>
                      <span className="text-muted-foreground/30">•</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {entry.top_topics.map(topic => (
                          <Badge key={topic} variant="secondary" className="text-xs bg-secondary/50 capitalize font-normal">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex-shrink-0 text-center md:text-right w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border/50">
                    <div className="inline-flex flex-col items-center md:items-end">
                      <span className={`font-bold font-serif leading-none ${isFirst ? 'text-4xl text-primary' : 'text-3xl text-foreground'}`}>
                        {entry.regret_count}
                      </span>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-1">
                        Confessions
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
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
