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
      <section className="pt-32 pb-24 px-6 border-b border-border">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-5xl md:text-7xl font-serif text-foreground leading-[1.1] tracking-tight font-normal mb-8">
            What decision are you facing right now?
          </h1>
          
          <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto mt-16 mb-12 group">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
              <Search className="w-5 h-5" />
            </div>
            <Input
              type="text"
              placeholder="e.g. should I hire fast? should I change pricing?"
              className="w-full h-16 pl-14 pr-32 text-lg bg-transparent border-t-0 border-l-0 border-r-0 border-b-2 border-border focus-visible:border-primary focus-visible:ring-0 rounded-none shadow-none transition-all placeholder:text-muted-foreground/50 font-serif italic"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="input-search"
            />
            <Button 
              type="submit" 
              variant="ghost"
              className="absolute inset-y-2 right-2 px-6 rounded font-sans uppercase tracking-wider text-xs font-bold text-foreground hover:text-primary hover:bg-transparent"
              disabled={isSearching || !query.trim()}
              data-testid="button-search"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search Archive"}
            </Button>
          </form>

          {!hasSearched && (
            <p className="text-lg md:text-xl font-serif text-muted-foreground leading-relaxed max-w-2xl mx-auto italic opacity-80">
              Read the locked diary of product leadership. Raw, unpolished admissions from the operators who made the call—and regretted it.
            </p>
          )}
        </div>
      </section>

      {/* Results / Featured Section */}
      <section className="py-24 px-6 flex-1 bg-background">
        <div className="container mx-auto max-w-7xl">
          {hasSearched && (
            <div className="mb-16 flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-sm font-sans uppercase tracking-widest text-muted-foreground mb-2">Search Results</h2>
                <p className="text-3xl font-serif font-normal text-foreground">"{query}"</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => searchMutation.reset()} className="text-xs uppercase tracking-wider rounded-none">
                Clear Search
              </Button>
            </div>
          )}

          {!hasSearched && !showEmptyState && (
            <div className="mb-16 text-center">
              <h2 className="text-xs font-sans uppercase tracking-widest text-muted-foreground border-b border-border pb-4 inline-block">
                Selected Entries
              </h2>
            </div>
          )}

          {isSearching || (isLoadingFeatured && !hasSearched) ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-[400px] border border-border bg-card p-8 flex flex-col gap-6 animate-pulse">
                  <div className="flex gap-4">
                    <Skeleton className="h-4 w-20 rounded-none" />
                    <Skeleton className="h-4 w-24 rounded-none" />
                  </div>
                  <Skeleton className="h-10 w-3/4 rounded-none" />
                  <Skeleton className="h-8 w-full rounded-none" />
                  <Skeleton className="h-24 w-full rounded-none mt-auto" />
                </div>
              ))}
            </div>
          ) : showEmptyState ? (
            <div className="text-center py-32 px-6 max-w-xl mx-auto border border-border">
              <Search className="w-8 h-8 mx-auto mb-8 text-muted-foreground opacity-50" />
              <h3 className="text-3xl font-serif font-normal mb-4">No confessions found</h3>
              <p className="text-muted-foreground font-serif italic text-lg mb-10">
                {hasSearched 
                  ? "We haven't indexed a lesson for this specific situation yet."
                  : "The confessional is currently empty."}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                {hasSearched ? (
                  <Link href="/browse" className="text-xs uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border-b border-primary pb-1" data-testid="link-browse-empty">
                    Browse Archive
                  </Link>
                ) : (
                  <Link href="/ingest" className="text-xs uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border-b border-primary pb-1" data-testid="link-ingest-empty">
                    Run Ingestion Pipeline
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {regretsToShow?.map((regret) => (
                <RegretCard key={regret.id} regret={regret} />
              ))}
            </div>
          )}

          {!hasSearched && regretsToShow && regretsToShow.length > 0 && (
            <div className="mt-20 text-center">
              <Link href="/browse" className="inline-flex items-center gap-3 text-xs uppercase tracking-widest font-bold text-foreground hover:text-primary transition-colors group border border-border px-8 py-4 hover:border-primary" data-testid="link-browse-more">
                Enter The Archive
                <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
