import { useState } from "react";
import { Link } from "wouter";
import { useSearchRegrets, useListRegrets } from "@workspace/api-client-react";
import { RegretCard } from "@/components/regret-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function Home() {
  const [query, setQuery] = useState("");
  const searchMutation = useSearchRegrets();
  
  const { data: featuredData, isLoading: isLoadingFeatured } = useListRegrets({ limit: 6 });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchMutation.mutate({ data: { query: query.trim(), limit: 12 } });
  };

  const isSearching = searchMutation.isPending;
  const searchResults = searchMutation.data?.regrets;
  const hasSearched = searchMutation.isSuccess;

  const regretsToShow = hasSearched ? searchResults : featuredData?.regrets;
  const showEmptyState = (!isLoadingFeatured && featuredData?.regrets.length === 0 && !hasSearched) || (hasSearched && searchResults?.length === 0);

  return (
    <div className="w-full flex-1 flex flex-col bg-background">
      {/* Hero Section */}
      <section className="pt-24 pb-20 px-6 border-b border-border bg-card">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center gap-2 mb-6">
            <span className="w-2 h-2 bg-primary rounded-full"></span>
            <p className="text-[10px] uppercase tracking-widest text-foreground font-bold">Research Database</p>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-foreground leading-tight tracking-tight font-medium mb-6">
            Search the operational history of product leadership.
          </h1>
          
          <form onSubmit={handleSearch} className="relative max-w-2xl mt-12 mb-8 group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
              <Search className="w-4 h-4" />
            </div>
            <Input
              type="text"
              placeholder="Query: e.g., scaling engineering, pricing changes..."
              className="w-full h-12 pl-12 pr-32 text-sm bg-background border border-border focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary rounded-sm shadow-sm transition-all font-sans font-medium"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="input-search"
            />
            <Button 
              type="submit" 
              size="sm"
              className="absolute inset-y-1.5 right-1.5 px-4 h-9 rounded-sm font-sans uppercase tracking-wider text-[10px] font-bold bg-foreground text-background hover:bg-primary hover:text-primary-foreground shadow-sm"
              disabled={isSearching || !query.trim()}
              data-testid="button-search"
            >
              {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : "Search"}
            </Button>
          </form>

          {!hasSearched && (
            <p className="text-sm font-sans text-muted-foreground leading-relaxed max-w-2xl font-medium">
              Access unstructured interviews and post-mortems from top operators, indexed by semantic relevance.
            </p>
          )}
        </div>
      </section>

      {/* Results / Featured Section */}
      <section className="py-16 px-6 flex-1 bg-background">
        <div className="container mx-auto max-w-6xl">
          {hasSearched && (
            <div className="mb-12 flex items-end justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-[10px] font-sans uppercase tracking-widest font-bold text-muted-foreground mb-1">Query Results</h2>
                <p className="text-xl font-serif font-medium text-foreground">"{query}"</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => searchMutation.reset()} className="text-[10px] uppercase tracking-wider rounded-sm font-bold border-border shadow-sm">
                Clear Query
              </Button>
            </div>
          )}

          {!hasSearched && !showEmptyState && (
            <div className="mb-10">
              <h2 className="text-[10px] font-sans uppercase tracking-widest font-bold text-foreground border-b-2 border-primary pb-2 inline-block">
                Recent Records
              </h2>
              <div className="w-full h-px bg-border -mt-px"></div>
            </div>
          )}

          {isSearching || (isLoadingFeatured && !hasSearched) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[350px] border border-border bg-card p-8 flex flex-col gap-6">
                  <div className="flex gap-4">
                    <Skeleton className="h-3 w-16 bg-secondary" />
                    <Skeleton className="h-3 w-20 bg-secondary" />
                  </div>
                  <Skeleton className="h-6 w-3/4 bg-secondary" />
                  <Skeleton className="h-20 w-full bg-secondary" />
                  <Skeleton className="h-10 w-full bg-secondary mt-auto" />
                </div>
              ))}
            </div>
          ) : showEmptyState ? (
            <div className="text-center py-24 px-6 max-w-xl mx-auto border border-border bg-card shadow-sm rounded-sm">
              <Search className="w-6 h-6 mx-auto mb-6 text-muted-foreground" />
              <h3 className="text-xl font-serif font-medium mb-3 text-foreground">No records found</h3>
              <p className="text-muted-foreground font-sans text-sm mb-8">
                {hasSearched 
                  ? "We haven't indexed data for this specific query."
                  : "The database is currently empty."}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {hasSearched ? (
                  <Link href="/browse" className="text-[11px] uppercase tracking-widest font-bold text-background bg-foreground hover:bg-primary px-6 py-2.5 rounded-sm shadow-sm transition-colors" data-testid="link-browse-empty">
                    View All Records
                  </Link>
                ) : (
                  <Link href="/ingest" className="text-[11px] uppercase tracking-widest font-bold text-background bg-foreground hover:bg-primary px-6 py-2.5 rounded-sm shadow-sm transition-colors" data-testid="link-ingest-empty">
                    Run Data Pipeline
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regretsToShow?.map((regret) => (
                <RegretCard key={regret.id} regret={regret} />
              ))}
            </div>
          )}

          {!hasSearched && regretsToShow && regretsToShow.length > 0 && (
            <div className="mt-16 text-center">
              <Link href="/browse" className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-foreground bg-card hover:bg-secondary transition-colors group border border-border px-6 py-3 rounded-sm shadow-sm" data-testid="link-browse-more">
                View Complete Archive
                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
