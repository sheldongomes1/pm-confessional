import { useState } from "react";
import { useGetCategories, useListRegrets, getGetCategoriesQueryKey } from "@workspace/api-client-react";
import { RegretCard } from "@/components/regret-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function Browse() {
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>();
  const [selectedStage, setSelectedStage] = useState<string | undefined>();

  const { data: categories, isLoading: isLoadingCats } = useGetCategories({
    query: { queryKey: getGetCategoriesQueryKey() }
  });

  const { data: regretsData, isLoading: isLoadingRegrets } = useListRegrets({
    topic_tag: selectedTopic,
    stage: selectedStage,
    limit: 50
  });

  const clearFilters = () => {
    setSelectedTopic(undefined);
    setSelectedStage(undefined);
  };

  return (
    <div className="container mx-auto px-6 py-16 flex-1 flex flex-col md:flex-row gap-12 max-w-7xl">
      {/* Sidebar Filters */}
      <aside className="w-full md:w-64 flex-shrink-0 space-y-12 border-r border-border/50 pr-8">
        <div>
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
            <h2 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Topics</h2>
            {(selectedTopic || selectedStage) && (
              <button onClick={clearFilters} className="text-[10px] uppercase tracking-widest text-primary hover:text-foreground transition-colors">
                Clear All
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {isLoadingCats ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded-none bg-secondary" />)
            ) : (
              categories?.by_topic.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setSelectedTopic(selectedTopic === cat.label ? undefined : cat.label)}
                  className={`w-full flex items-center justify-between group transition-colors text-left ${
                    selectedTopic === cat.label 
                      ? "text-primary font-bold" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`filter-topic-${cat.label}`}
                >
                  <span className="text-sm font-serif italic tracking-wide capitalize">{cat.label}</span>
                  <span className={`text-[10px] font-mono ${selectedTopic === cat.label ? "text-primary" : "text-border group-hover:text-muted-foreground"}`}>
                    {cat.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-8 pb-4 border-b border-border">Company Stage</h2>
          <div className="space-y-3">
            {isLoadingCats ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded-none bg-secondary" />)
            ) : (
              categories?.by_stage.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setSelectedStage(selectedStage === cat.label ? undefined : cat.label)}
                  className={`w-full flex items-center justify-between group transition-colors text-left ${
                    selectedStage === cat.label 
                      ? "text-primary font-bold" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`filter-stage-${cat.label}`}
                >
                  <span className="text-sm font-serif italic tracking-wide capitalize">{cat.label}</span>
                  <span className={`text-[10px] font-mono ${selectedStage === cat.label ? "text-primary" : "text-border group-hover:text-muted-foreground"}`}>
                    {cat.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 pb-16">
        <div className="mb-12 flex items-end justify-between border-b border-border pb-6">
          <h1 className="text-5xl md:text-6xl font-serif font-normal text-foreground leading-none">
            Archive
          </h1>
          <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
            {regretsData?.total || 0} Entries
          </span>
        </div>

        {isLoadingRegrets ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[400px] border border-border bg-card p-8 flex flex-col gap-6 animate-pulse">
                <Skeleton className="h-4 w-24 rounded-none bg-secondary" />
                <Skeleton className="h-10 w-3/4 rounded-none bg-secondary" />
                <Skeleton className="h-8 w-full rounded-none bg-secondary" />
                <Skeleton className="h-24 w-full rounded-none bg-secondary mt-auto" />
              </div>
            ))}
          </div>
        ) : regretsData?.regrets.length === 0 ? (
          <div className="text-center py-32 px-6 border border-border bg-card">
            <h3 className="text-2xl font-serif font-normal mb-4 text-foreground">No confessions match these filters</h3>
            <p className="text-muted-foreground font-serif italic text-lg mb-8">Try removing some constraints to search deeper.</p>
            <Button onClick={clearFilters} variant="outline" className="rounded-none text-xs uppercase tracking-widest border-border hover:border-primary hover:text-primary" data-testid="button-clear-filters">
              Clear All Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {regretsData?.regrets.map((regret) => (
              <RegretCard key={regret.id} regret={regret} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
