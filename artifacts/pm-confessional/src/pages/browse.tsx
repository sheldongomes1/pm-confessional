import { useState } from "react";
import { useGetCategories, useListRegrets, getGetCategoriesQueryKey } from "@workspace/api-client-react";
import { RegretCard } from "@/components/regret-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
    <div className="container mx-auto px-6 py-12 flex-1 flex flex-col md:flex-row gap-10 max-w-7xl bg-background">
      {/* Sidebar Filters */}
      <aside className="w-full md:w-56 flex-shrink-0 space-y-10">
        <div>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-foreground">Filter by Topic</h2>
            {(selectedTopic || selectedStage) && (
              <button onClick={clearFilters} className="text-[9px] uppercase tracking-widest text-primary hover:text-foreground transition-colors font-bold">
                Clear
              </button>
            )}
          </div>
          
          <div className="space-y-1">
            {isLoadingCats ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded-sm bg-card border border-border" />)
            ) : (
              categories?.by_topic.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setSelectedTopic(selectedTopic === cat.label ? undefined : cat.label)}
                  className={`w-full flex items-center justify-between group transition-colors text-left px-2 py-1.5 rounded-sm ${
                    selectedTopic === cat.label 
                      ? "bg-primary/10 text-primary font-semibold" 
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                  data-testid={`filter-topic-${cat.label}`}
                >
                  <span className="text-sm font-sans capitalize">{cat.label}</span>
                  <span className={`text-[10px] font-mono font-medium ${selectedTopic === cat.label ? "text-primary" : "text-muted-foreground"}`}>
                    {cat.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-foreground mb-4 pb-2 border-b border-border">Company Stage</h2>
          <div className="space-y-1">
            {isLoadingCats ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded-sm bg-card border border-border" />)
            ) : (
              categories?.by_stage.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setSelectedStage(selectedStage === cat.label ? undefined : cat.label)}
                  className={`w-full flex items-center justify-between group transition-colors text-left px-2 py-1.5 rounded-sm ${
                    selectedStage === cat.label 
                      ? "bg-primary/10 text-primary font-semibold" 
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                  data-testid={`filter-stage-${cat.label}`}
                >
                  <span className="text-sm font-sans capitalize">{cat.label}</span>
                  <span className={`text-[10px] font-mono font-medium ${selectedStage === cat.label ? "text-primary" : "text-muted-foreground"}`}>
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
        <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-foreground">
            Archive Database
          </h1>
          <div className="text-[10px] uppercase tracking-widest text-foreground font-bold bg-card border border-border px-3 py-1 rounded-sm shadow-sm">
            {regretsData?.total || 0} Records
          </div>
        </div>

        {isLoadingRegrets ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[350px] border border-border bg-card p-8 flex flex-col gap-6">
                <Skeleton className="h-3 w-20 bg-secondary" />
                <Skeleton className="h-8 w-3/4 bg-secondary" />
                <Skeleton className="h-6 w-full bg-secondary" />
                <Skeleton className="h-20 w-full bg-secondary mt-auto" />
              </div>
            ))}
          </div>
        ) : regretsData?.regrets.length === 0 ? (
          <div className="text-center py-24 px-6 border border-border bg-card shadow-sm rounded-sm">
            <h3 className="text-lg font-serif font-medium mb-2 text-foreground">No records match constraints</h3>
            <p className="text-muted-foreground font-sans text-sm mb-6">Adjust your filters to broaden the search.</p>
            <Button onClick={clearFilters} variant="outline" className="rounded-sm text-[10px] uppercase tracking-widest font-bold border-border shadow-sm" data-testid="button-clear-filters">
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {regretsData?.regrets.map((regret) => (
              <RegretCard key={regret.id} regret={regret} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
