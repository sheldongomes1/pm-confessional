import { useState } from "react";
import { Link } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import {
  useSearchRegrets,
  useListRegrets,
  useGetCategories,
  useGetLeaderboard,
  getGetCategoriesQueryKey,
  getGetLeaderboardQueryKey,
  getListRegretsQueryKey,
} from "@workspace/api-client-react";
import { RegretCard } from "@/components/regret-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Search,
  Loader2,
  SlidersHorizontal,
  ChevronDown,
  Check,
  ChevronsUpDown,
  X,
} from "lucide-react";

export function Home() {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>();
  const [selectedStage, setSelectedStage] = useState<string | undefined>();
  // Default to one prolific guest so a fresh visit shows a curated subset
  // (~25 confessions) instead of the full ~1.8k archive — much easier to skim.
  const [selectedGuest, setSelectedGuest] = useState<string | undefined>(
    "Shreyas Doshi"
  );
  const [selectedYear, setSelectedYear] = useState<string | undefined>();
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);

  const searchMutation = useSearchRegrets();

  const { data: categories } = useGetCategories({
    query: { queryKey: getGetCategoriesQueryKey() },
  });
  const { data: leaderboard } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() },
  });

  const guests = (leaderboard?.entries ?? [])
    .map((e) => ({ name: e.guest_name, count: e.regret_count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasActiveFilters = Boolean(
    selectedTopic || selectedStage || selectedGuest || selectedYear
  );

  const listParams = {
    topic_tag: selectedTopic,
    stage: selectedStage,
    guest_name: selectedGuest,
    year: selectedYear ? parseInt(selectedYear, 10) : undefined,
    limit: 50,
  };
  const { data: listData, isLoading: isLoadingList } = useListRegrets(
    listParams,
    {
      // Keep previous results visible during refetch so the count never flashes "0"
      query: {
        queryKey: getListRegretsQueryKey(listParams),
        placeholderData: keepPreviousData,
      },
    }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchMutation.mutate({ data: { query: query.trim(), limit: 12 } });
  };

  const isSearching = searchMutation.isPending;
  const searchResults = searchMutation.data?.regrets;
  const searchMatchCount = searchMutation.data?.match_count ?? 0;
  const searchIsFallback = searchMutation.data?.is_fallback ?? false;
  // Use the query that came back with the response, not the live input —
  // otherwise editing the input after submitting desyncs the header label.
  const submittedQuery = searchMutation.data?.query ?? "";
  const hasSearched = searchMutation.isSuccess;

  const regretsToShow = hasSearched ? searchResults : listData?.regrets;
  const showEmptyState =
    (!isLoadingList && (listData?.regrets.length ?? 0) === 0 && !hasSearched) ||
    (hasSearched && (searchResults?.length ?? 0) === 0);

  const clearFilters = () => {
    setSelectedTopic(undefined);
    setSelectedStage(undefined);
    setSelectedGuest(undefined);
    setSelectedYear(undefined);
  };

  const activeFilterChips: { label: string; onRemove: () => void }[] = [];
  if (selectedTopic) {
    activeFilterChips.push({
      label: selectedTopic,
      onRemove: () => setSelectedTopic(undefined),
    });
  }
  if (selectedStage) {
    activeFilterChips.push({
      label: `${selectedStage} stage`,
      onRemove: () => setSelectedStage(undefined),
    });
  }
  if (selectedGuest) {
    activeFilterChips.push({
      label: selectedGuest,
      onRemove: () => setSelectedGuest(undefined),
    });
  }
  if (selectedYear) {
    activeFilterChips.push({
      label: selectedYear,
      onRemove: () => setSelectedYear(undefined),
    });
  }

  return (
    <div className="w-full flex-1 flex flex-col bg-background">
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 border-b border-border">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-5xl md:text-7xl font-serif text-foreground leading-[1.1] tracking-tight font-normal mb-8">
            What decision are you facing right now?
          </h1>

          <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto mt-16 mb-10 group">
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

          {!hasSearched && !hasActiveFilters && (
            <p className="text-lg md:text-xl font-serif text-muted-foreground leading-relaxed max-w-2xl mx-auto italic opacity-80">
              Read the locked diary of product leadership. Raw, unpolished admissions from the operators who made the call—and regretted it.
            </p>
          )}

          {/* Refine — collapsible filter panel */}
          <Collapsible
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            className="mt-12 max-w-4xl mx-auto"
          >
            <div className="flex items-center justify-center gap-6">
              <CollapsibleTrigger asChild>
                <button
                  className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground hover:text-foreground transition-colors group"
                  data-testid="button-toggle-filters"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{filtersOpen ? "Hide filters" : "Refine"}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-[11px] uppercase tracking-[0.3em] text-primary hover:text-foreground transition-colors"
                  data-testid="button-clear-filters"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Active filter chips — visible even when collapsed */}
            {activeFilterChips.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={chip.onRemove}
                    className="inline-flex items-center gap-2 px-3 py-1 border border-primary/40 text-primary hover:border-primary text-xs uppercase tracking-widest font-bold transition-colors"
                    data-testid={`chip-${chip.label}`}
                  >
                    {chip.label}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}

            <CollapsibleContent className="mt-8">
              <div className="border border-border bg-card/40 p-8 grid grid-cols-1 md:grid-cols-4 gap-10 text-left">
                {/* Topics */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4 pb-3 border-b border-border">
                    Topic
                  </h3>
                  <div className="space-y-2">
                    {categories?.by_topic.map((cat) => {
                      const active = selectedTopic === cat.label;
                      return (
                        <button
                          key={cat.label}
                          onClick={() =>
                            setSelectedTopic(active ? undefined : cat.label)
                          }
                          className={`w-full flex items-center justify-between text-left transition-colors ${
                            active
                              ? "text-primary font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          data-testid={`filter-topic-${cat.label}`}
                        >
                          <span className="text-sm font-serif italic capitalize">
                            {cat.label}
                          </span>
                          <span
                            className={`text-[10px] font-mono ${active ? "text-primary" : "text-border"}`}
                          >
                            {cat.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stage */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4 pb-3 border-b border-border">
                    Stage
                  </h3>
                  <div className="space-y-2">
                    {categories?.by_stage.map((cat) => {
                      const active = selectedStage === cat.label;
                      return (
                        <button
                          key={cat.label}
                          onClick={() =>
                            setSelectedStage(active ? undefined : cat.label)
                          }
                          className={`w-full flex items-center justify-between text-left transition-colors ${
                            active
                              ? "text-primary font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          data-testid={`filter-stage-${cat.label}`}
                        >
                          <span className="text-sm font-serif italic capitalize">
                            {cat.label}
                          </span>
                          <span
                            className={`text-[10px] font-mono ${active ? "text-primary" : "text-border"}`}
                          >
                            {cat.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Year */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4 pb-3 border-b border-border">
                    Year
                  </h3>
                  <div className="space-y-2">
                    {(categories?.by_year ?? []).length === 0 ? (
                      <p className="text-xs italic text-muted-foreground/70 font-serif">
                        No dated entries
                      </p>
                    ) : (
                      categories?.by_year.map((cat) => {
                        const active = selectedYear === cat.label;
                        return (
                          <button
                            key={cat.label}
                            onClick={() =>
                              setSelectedYear(active ? undefined : cat.label)
                            }
                            className={`w-full flex items-center justify-between text-left transition-colors ${
                              active
                                ? "text-primary font-bold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            data-testid={`filter-year-${cat.label}`}
                          >
                            <span className="text-sm font-serif italic font-mono">
                              {cat.label}
                            </span>
                            <span
                              className={`text-[10px] font-mono ${active ? "text-primary" : "text-border"}`}
                            >
                              {cat.count}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Guest */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4 pb-3 border-b border-border">
                    Guest
                  </h3>
                  <Popover open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className="w-full flex items-center justify-between gap-2 py-2 border-b border-border/60 hover:border-foreground transition-colors text-left group"
                        data-testid="filter-guest-trigger"
                      >
                        <span
                          className={`text-sm font-serif italic truncate ${
                            selectedGuest
                              ? "text-primary font-bold not-italic"
                              : "text-muted-foreground"
                          }`}
                        >
                          {selectedGuest ?? "Any guest"}
                        </span>
                        {selectedGuest ? (
                          <X
                            className="w-3.5 h-3.5 text-muted-foreground hover:text-primary flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGuest(undefined);
                            }}
                          />
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5 text-border group-hover:text-muted-foreground flex-shrink-0" />
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-0 rounded-none border-border bg-card"
                      align="start"
                      sideOffset={4}
                    >
                      <Command className="bg-transparent">
                        <CommandInput
                          placeholder="Search guests..."
                          className="border-b border-border h-10 text-sm"
                        />
                        <CommandList className="max-h-72">
                          <CommandEmpty className="py-6 text-center text-xs text-muted-foreground italic font-serif">
                            No one by that name.
                          </CommandEmpty>
                          <CommandGroup>
                            {guests.map((guest) => {
                              const isSelected = selectedGuest === guest.name;
                              return (
                                <CommandItem
                                  key={guest.name}
                                  value={guest.name}
                                  onSelect={(value) => {
                                    setSelectedGuest(isSelected ? undefined : value);
                                    setGuestPickerOpen(false);
                                  }}
                                  className="rounded-none px-3 py-2 cursor-pointer aria-selected:bg-secondary aria-selected:text-foreground flex items-center justify-between gap-2"
                                  data-testid={`filter-guest-option-${guest.name}`}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <Check
                                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                                        isSelected ? "opacity-100 text-primary" : "opacity-0"
                                      }`}
                                    />
                                    <span className="text-sm font-serif truncate">
                                      {guest.name}
                                    </span>
                                  </span>
                                  <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                                    {guest.count}
                                  </span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </section>

      {/* Results / Featured Section */}
      <section className="py-20 px-6 flex-1 bg-background">
        <div className="container mx-auto max-w-7xl">
          {hasSearched ? (
            <div className="mb-12 flex items-end justify-between border-b border-border pb-4 gap-6 flex-wrap">
              <div>
                <h2 className="text-sm font-sans uppercase tracking-widest text-muted-foreground mb-2">
                  {searchIsFallback
                    ? "No exact match — closest by topic"
                    : "Search Results"}
                </h2>
                <p
                  className="text-3xl font-serif font-normal text-foreground"
                  data-testid="text-search-query"
                >
                  "{submittedQuery}"
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className="text-xs uppercase tracking-widest text-muted-foreground font-bold"
                  data-testid="text-search-match-count"
                >
                  {searchIsFallback
                    ? `${searchResults?.length ?? 0} closest`
                    : `${searchMatchCount} ${searchMatchCount === 1 ? "match" : "matches"}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => searchMutation.reset()}
                  className="text-xs uppercase tracking-wider rounded-none"
                >
                  Clear Search
                </Button>
              </div>
            </div>
          ) : hasActiveFilters ? (
            <div className="mb-12 flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-sm font-sans uppercase tracking-widest text-muted-foreground">
                Filtered Archive
              </h2>
              {/* Only render the count once data is loaded — avoids "0 entries" flash */}
              {listData && (
                <span
                  className="text-xs uppercase tracking-widest text-muted-foreground font-bold"
                  data-testid="text-filtered-count"
                >
                  {listData.total} {listData.total === 1 ? "entry" : "entries"}
                </span>
              )}
            </div>
          ) : !showEmptyState ? (
            <div className="mb-12 flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-xs font-sans uppercase tracking-widest font-bold text-muted-foreground">
                The Archive
              </h2>
              {listData && (
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                  {listData.total} {listData.total === 1 ? "confession" : "confessions"}
                </span>
              )}
            </div>
          ) : null}

          {isSearching || (isLoadingList && !hasSearched && !listData) ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-[400px] border border-border bg-card p-8 flex flex-col gap-6 animate-pulse"
                >
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
                  : hasActiveFilters
                    ? "Try removing some filters to search deeper."
                    : "The confessional is currently empty."}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={clearFilters}
                  className="text-xs uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border-b border-primary pb-1"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {regretsToShow?.map((regret) => (
                <RegretCard key={regret.id} regret={regret} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
