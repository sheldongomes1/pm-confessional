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
    <div className="container mx-auto px-4 py-8 md:py-12 flex-1 flex flex-col md:flex-row gap-8">
      {/* Sidebar Filters */}
      <aside className="w-full md:w-64 flex-shrink-0 space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl font-bold tracking-tight text-foreground">Topics</h2>
            {(selectedTopic || selectedStage) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground">
                Clear all
              </Button>
            )}
          </div>
          
          <ScrollArea className="h-[300px] md:h-auto pr-4">
            <div className="space-y-1.5">
              {isLoadingCats ? (
                Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)
              ) : (
                categories?.by_topic.map((cat) => (
                  <button
                    key={cat.label}
                    onClick={() => setSelectedTopic(selectedTopic === cat.label ? undefined : cat.label)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left ${
                      selectedTopic === cat.label 
                        ? "bg-primary/20 text-primary font-medium" 
                        : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`filter-topic-${cat.label}`}
                  >
                    <span className="capitalize">{cat.label}</span>
                    <Badge variant="secondary" className={`ml-2 text-[10px] px-1.5 py-0 min-w-[20px] justify-center ${selectedTopic === cat.label ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                      {cat.count}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <Separator className="hidden md:block bg-border/50" />

        <div>
          <h2 className="font-serif text-xl font-bold tracking-tight text-foreground mb-4">Company Stage</h2>
          <div className="space-y-1.5">
            {isLoadingCats ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)
            ) : (
              categories?.by_stage.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setSelectedStage(selectedStage === cat.label ? undefined : cat.label)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    selectedStage === cat.label 
                      ? "bg-primary/20 text-primary font-medium" 
                      : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`filter-stage-${cat.label}`}
                >
                  <span className="capitalize">{cat.label}</span>
                  <Badge variant="secondary" className={`ml-2 text-[10px] px-1.5 py-0 min-w-[20px] justify-center ${selectedStage === cat.label ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                    {cat.count}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-serif font-bold text-foreground">
            The Archive
          </h1>
          <span className="text-muted-foreground text-sm font-mono">
            {regretsData?.total || 0} Results
          </span>
        </div>

        {isLoadingRegrets ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[300px] rounded-xl border border-border/50 bg-card/20 p-6 flex flex-col gap-4 animate-pulse">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        ) : regretsData?.regrets.length === 0 ? (
          <div className="text-center py-20 px-4 border border-dashed border-border/50 rounded-xl bg-card/20">
            <h3 className="text-xl font-serif font-bold mb-2">No confessions match these filters</h3>
            <p className="text-muted-foreground mb-6">Try removing some filters to see more results.</p>
            <Button onClick={clearFilters} variant="outline" data-testid="button-clear-filters">
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
            {regretsData?.regrets.map((regret) => (
              <RegretCard key={regret.id} regret={regret} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
