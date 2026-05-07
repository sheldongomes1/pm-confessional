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
    <div className="w-full flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4 border-b border-border/30 bg-gradient-to-b from-background to-secondary/20">
        <div className="container mx-auto max-w-3xl text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-bold font-serif text-foreground leading-tight tracking-tight">
            Pattern recognition takes a decade to build. <span className="text-primary italic">This takes 10 seconds.</span>
          </h1>
          
          <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto mt-12 mb-8 group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
              <Search className="w-5 h-5" />
            </div>
            <Input
              type="text"
              placeholder="What decision are you facing right now?"
              className="w-full h-14 pl-12 pr-24 text-lg bg-card/80 border-primary/20 focus-visible:border-primary focus-visible:ring-primary/30 rounded-xl shadow-lg transition-all"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="input-search"
            />
            <Button 
              type="submit" 
              className="absolute inset-y-1.5 right-1.5 px-6 rounded-lg font-medium"
              disabled={isSearching || !query.trim()}
              data-testid="button-search"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </Button>
          </form>

          {!hasSearched && (
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Senior PMs don't make fewer mistakes because they're smarter. They make fewer mistakes because they've seen the patterns. The PM Confessional gives you access to the hard-won lessons of 300+ operators — extracted from the moments they stopped being polished and started being honest.
            </p>
          )}
        </div>
      </section>

      {/* Results / Featured Section */}
      <section className="py-16 px-4 flex-1">
        <div className="container mx-auto">
          {hasSearched && (
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-2xl font-serif font-bold text-foreground">
                Search Results <span className="text-muted-foreground font-sans text-lg font-normal">for "{query}"</span>
              </h2>
              <Button variant="ghost" size="sm" onClick={() => searchMutation.reset()} className="text-muted-foreground">
                Clear search
              </Button>
            </div>
          )}

          {!hasSearched && !showEmptyState && (
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-bold text-foreground">Featured Confessions</h2>
            </div>
          )}

          {isSearching || (isLoadingFeatured && !hasSearched) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[300px] rounded-xl border border-border/50 bg-card/20 p-6 flex flex-col gap-4 animate-pulse">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <div className="mt-auto flex justify-between items-end">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : showEmptyState ? (
            <div className="text-center py-20 px-4 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6 text-muted-foreground">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-serif font-bold mb-3">No confessions found</h3>
              <p className="text-muted-foreground mb-8">
                {hasSearched 
                  ? "We haven't indexed a lesson for this specific situation yet. Try a broader search term or browse the archive."
                  : "The confessional is currently empty. Run the data ingestion pipeline to populate it with hard-won lessons."}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {hasSearched ? (
                  <Link href="/browse" className="flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors" data-testid="link-browse-empty">
                    Browse all
                  </Link>
                ) : (
                  <Link href="/ingest" className="flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors" data-testid="link-ingest-empty">
                    Go to Ingestion
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
            <div className="mt-12 text-center">
              <Link href="/browse" className="inline-flex items-center gap-2 text-primary font-medium hover:text-primary/80 transition-colors group" data-testid="link-browse-more">
                Browse all confessions
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="py-16 px-4 bg-secondary/30 border-t border-border/30 mt-auto">
        <div className="container mx-auto max-w-3xl text-center">
          <p className="text-muted-foreground font-serif italic text-lg leading-relaxed">
            The PM Confessional solves the experience gap in product leadership. It mines every mistake, warning, and cautionary lesson buried in Lenny's archive and makes them searchable by situation — so the pattern recognition that takes a decade to earn takes 10 seconds to access.
          </p>
        </div>
      </section>
    </div>
  );
}
