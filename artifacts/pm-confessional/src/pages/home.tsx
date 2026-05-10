import { useState } from "react";
import * as React from "react";
import { Link, useLocation } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import {
  useSearchRegrets,
  useListRegrets,
  useGetCategories,
  useGetLeaderboard,
  useStartCoachingSession,
  getGetCategoriesQueryKey,
  getGetLeaderboardQueryKey,
  getListRegretsQueryKey,
} from "@workspace/api-client-react";
import { RegretCard } from "@/components/regret-card";
import { track } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Sparkles } from "lucide-react";

// Tile order matches the canonical topic_tag enum from the OpenAPI spec.
const TOPIC_TILES: Array<{ key: string; label: string }> = [
  { key: "hiring", label: "Hiring" },
  { key: "pricing", label: "Pricing" },
  { key: "product", label: "Product" },
  { key: "growth", label: "Growth" },
  { key: "culture", label: "Culture" },
  { key: "fundraising", label: "Fundraising" },
  { key: "timing", label: "Timing" },
  { key: "customers", label: "Customers" },
];
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

// Live counter for the search status caption — ticks every 100ms while
// a search is in flight so the user can see the system is alive.
function useElapsedMs(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  React.useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const start = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, 100);
    return () => window.clearInterval(id);
  }, [active]);
  return elapsed;
}

export function Home() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>();
  const [selectedStage, setSelectedStage] = useState<string | undefined>();
  const [selectedGuest, setSelectedGuest] = useState<string | undefined>();
  const [selectedYear, setSelectedYear] = useState<string | undefined>();
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  // Low-confidence searches require explicit opt-in to see the loose
  // matches. Reset on every new search so each query starts hidden.
  const [showLooseAnyway, setShowLooseAnyway] = useState(false);

  const searchMutation = useSearchRegrets();
  const startCoachMutation = useStartCoachingSession();

  // Build a lookup so the tiles can show live counts.
  const topicCountMap = new Map<string, number>();

  const { data: categories } = useGetCategories({
    query: { queryKey: getGetCategoriesQueryKey() },
  });
  const { data: leaderboard } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() },
  });

  for (const c of categories?.by_topic ?? []) {
    topicCountMap.set(c.label, c.count);
  }

  const guests = (leaderboard?.entries ?? [])
    .map((e) => ({ name: e.guest_name, count: e.regret_count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleTileClick = (topicKey: string) => {
    const next = selectedTopic === topicKey ? undefined : topicKey;
    track("topic_tile_clicked", {
      topic: topicKey,
      action: next ? "applied" : "removed",
    });
    setSelectedTopic(next);
    if (next) {
      // Reset any in-flight search so the filtered list takes over.
      searchMutation.reset();
      setTimeout(() => {
        document
          .getElementById("results-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  const handleStartCoach = () => {
    const ids = (searchMutation.data?.regrets ?? [])
      .slice(0, 5)
      .map((r) => r.id);
    const decision = searchMutation.data?.query?.trim();
    const confidence = searchMutation.data?.retrieval_confidence ?? "high";
    if (!decision || ids.length === 0 || startCoachMutation.isPending) return;
    track("coach_started", {
      decision_length: decision.length,
      regret_count: ids.length,
      retrieval_confidence: confidence,
    });
    startCoachMutation.mutate(
      {
        data: { decision, regret_ids: ids, retrieval_confidence: confidence },
      },
      {
        onSuccess: (resp) => {
          navigate(`/coach/${resp.session.id}`);
        },
      },
    );
  };

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

  // Shared search executor — both the search form and the low-conf
  // suggestion buttons funnel through here so telemetry, state reset,
  // and mutation calls stay in one place. `source` is just a tag on the
  // search_submitted event so PostHog can split organic vs suggestion
  // funnel traffic.
  const runSearch = (rawQuery: string, source: "form" | "low_conf_suggestion") => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    track("search_submitted", {
      query: trimmed,
      query_length: trimmed.length,
      query_word_count: trimmed.split(/\s+/).length,
      had_active_filters: hasActiveFilters,
      active_topic: selectedTopic ?? null,
      active_stage: selectedStage ?? null,
      active_guest: selectedGuest ?? null,
      active_year: selectedYear ?? null,
      source,
    });
    setShowLooseAnyway(false);
    const t0 = performance.now();
    searchMutation.mutate(
      { data: { query: trimmed, limit: 12 } },
      {
        onSuccess: (resp) => {
          const totalMs = Math.round(performance.now() - t0);
          track("search_completed", {
            query: trimmed,
            match_count: resp.match_count ?? 0,
            result_count: resp.regrets?.length ?? 0,
            is_fallback: resp.is_fallback ?? false,
            zero_results: (resp.regrets?.length ?? 0) === 0,
            // Tier-policy telemetry — used to validate the 3-tier rerank
            // distribution + p50/p95 latency by tier on real traffic.
            rerank_model: resp.rerank_model ?? "unknown",
            top1_cosine: resp.top1_cosine ?? null,
            low_confidence: resp.low_confidence ?? false,
            retrieval_mode: resp.retrieval_mode ?? "unknown",
            total_ms: totalMs,
            source,
          });
        },
        onError: (err) => {
          track("search_failed", {
            query: trimmed,
            error: err instanceof Error ? err.message : "unknown",
            source,
          });
        },
      },
    );
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query, "form");
  };

  const isSearching = searchMutation.isPending;
  const elapsedMs = useElapsedMs(isSearching);
  const searchResults = searchMutation.data?.regrets;
  const searchMatchCount = searchMutation.data?.match_count ?? 0;
  const searchIsFallback = searchMutation.data?.is_fallback ?? false;
  // Use the query that came back with the response, not the live input —
  // otherwise editing the input after submitting desyncs the header label.
  const submittedQuery = searchMutation.data?.query ?? "";
  const hasSearched = searchMutation.isSuccess;
  const searchConfidence =
    searchMutation.data?.retrieval_confidence ?? "high";
  // Trust gate: if the system isn't confident the archive answers this
  // question, hide the cards and force an explicit opt-in. Two CTAs on a
  // "no match" page (results + Ask the room) is confusing, so we also
  // hide the Ask-the-room panel until the user opts in.
  const lowConfidenceHidden =
    hasSearched && searchConfidence === "low" && !showLooseAnyway;
  const showAskTheRoomCta =
    hasSearched && (searchResults?.length ?? 0) > 0 && !lowConfidenceHidden;
  // Hardcoded suggestions surfaced in the low-confidence empty state.
  // Pulled from the three highest-volume topics (product, culture,
  // hiring) so the user gets strong matches if they pivot.
  const LOW_CONF_SUGGESTIONS = [
    "should I hire fast or slow",
    "should I raise prices",
    "should I sunset a feature",
  ];

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    track("low_conf_suggestion_clicked", { suggestion });
    runSearch(suggestion, "low_conf_suggestion");
  };

  const handleShowLooseAnyway = () => {
    track("loose_results_shown", {
      query: submittedQuery,
      top1_cosine: searchMutation.data?.top1_cosine ?? null,
      n_results_shown: searchResults?.length ?? 0,
    });
    setShowLooseAnyway(true);
  };

  const regretsToShow = hasSearched ? searchResults : listData?.regrets;
  const showEmptyState =
    (!isLoadingList && (listData?.regrets.length ?? 0) === 0 && !hasSearched) ||
    (hasSearched && (searchResults?.length ?? 0) === 0);

  const clearFilters = () => {
    track("filters_cleared", {
      had_topic: !!selectedTopic,
      had_stage: !!selectedStage,
      had_guest: !!selectedGuest,
      had_year: !!selectedYear,
    });
    setSelectedTopic(undefined);
    setSelectedStage(undefined);
    setSelectedGuest(undefined);
    setSelectedYear(undefined);
  };

  const recordFilter = (
    dimension: "topic" | "stage" | "year" | "guest",
    value: string | undefined,
    previous: string | undefined,
  ) => {
    track("filter_changed", {
      dimension,
      value: value ?? null,
      previous: previous ?? null,
      action: value ? (previous ? "switched" : "applied") : "removed",
    });
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
              className="absolute inset-y-2 right-2 px-6 rounded font-sans uppercase tracking-wider text-xs font-bold text-foreground hover:text-primary hover:bg-transparent disabled:opacity-40"
              disabled={isSearching}
              data-testid="button-search"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search Archive"}
            </Button>
          </form>

          {!hasSearched && !hasActiveFilters && !isSearching && (
            <p className="text-lg md:text-xl font-serif text-muted-foreground leading-relaxed max-w-2xl mx-auto italic opacity-80">
              Read the locked diary of product leadership. Raw, unpolished admissions from the operators who made the call—and regretted it.
            </p>
          )}

          {/* Topic tiles — quick category filters with live counts */}
          <div className="mt-14 max-w-4xl mx-auto">
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-5">
              Or browse by what burned them
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TOPIC_TILES.map((tile) => {
                const count = topicCountMap.get(tile.key) ?? 0;
                const active = selectedTopic === tile.key;
                return (
                  <button
                    key={tile.key}
                    onClick={() => handleTileClick(tile.key)}
                    disabled={count === 0}
                    data-testid={`tile-${tile.key}`}
                    className={`group border p-4 text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card/40 hover:border-primary/60 hover:bg-card text-foreground"
                    }`}
                  >
                    <p className="font-serif text-lg leading-snug">
                      {tile.label}
                    </p>
                    <p
                      className={`text-[10px] uppercase tracking-widest font-mono mt-1 ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {count} confessions
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

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
                          onClick={() => {
                            const next = active ? undefined : cat.label;
                            recordFilter("topic", next, selectedTopic);
                            setSelectedTopic(next);
                          }}
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
                          onClick={() => {
                            const next = active ? undefined : cat.label;
                            recordFilter("stage", next, selectedStage);
                            setSelectedStage(next);
                          }}
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
                            onClick={() => {
                              const next = active ? undefined : cat.label;
                              recordFilter("year", next, selectedYear);
                              setSelectedYear(next);
                            }}
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
                                    const next = isSelected ? undefined : value;
                                    recordFilter("guest", next, selectedGuest);
                                    setSelectedGuest(next);
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
      <section id="results-section" className="py-20 px-6 flex-1 bg-background">
        <div className="container mx-auto max-w-7xl">
          {/* Ask the room CTA — only after a successful search with results.
              Copy + button label adapt to retrieval_confidence so we don't
              promise grounded coaching on out-of-scope queries. */}
          {showAskTheRoomCta && (() => {
            const confidence =
              searchMutation.data?.retrieval_confidence ?? "high";
            const buttonLabel =
              confidence === "low" ? "Ask anyway" : "Ask the room";
            const subcopy =
              confidence === "low"
                ? "The archive doesn't have a strong match for this question. The coach will explain the scope instead of advising."
                : confidence === "medium"
                  ? "Match is loose — the coach will flag if it can't ground advice."
                  : `A Gemini-grounded coach reads the top ${Math.min(5, searchResults?.length ?? 0)} confessions and helps you think it through. Citations only — no invented advice.`;
            const headlineCopy =
              confidence === "low"
                ? "No strong match — see why."
                : "Ask the room about this decision.";
            return (
              <div className="mb-10 border border-primary/40 bg-primary/5 p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary mb-2 inline-flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> New
                  </p>
                  <p className="font-serif text-xl md:text-2xl text-foreground leading-snug">
                    {headlineCopy}
                  </p>
                  <p className="text-sm text-muted-foreground italic font-serif mt-1">
                    {subcopy}
                  </p>
                </div>
                <Button
                  onClick={handleStartCoach}
                  disabled={startCoachMutation.isPending}
                  className="rounded-none text-xs uppercase tracking-widest font-bold whitespace-nowrap"
                  data-testid="button-ask-the-room"
                >
                  {startCoachMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {buttonLabel}
                    </>
                  )}
                </Button>
              </div>
            );
          })()}
          {hasSearched && !lowConfidenceHidden ? (
            <div className="mb-12 flex items-end justify-between border-b border-border pb-4 gap-6 flex-wrap">
              <div>
                <h2 className="text-sm font-sans uppercase tracking-widest text-muted-foreground mb-2">
                  {showLooseAnyway
                    ? `${searchResults?.length ?? 0} loose matches — none directly answer your question`
                    : searchConfidence === "medium"
                      ? "Search Results"
                      : searchIsFallback
                        ? "No exact match — closest by topic"
                        : "Search Results"}
                </h2>
                <p
                  className="text-3xl font-serif font-normal text-foreground"
                  data-testid="text-search-query"
                >
                  "{submittedQuery}"
                </p>
                {searchConfidence === "medium" && !showLooseAnyway && (
                  <p className="text-sm font-serif italic text-muted-foreground mt-2">
                    Loose match — the closest confessions, not direct
                    answers.
                  </p>
                )}
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

          {lowConfidenceHidden ? (
            <div
              className="max-w-2xl mx-auto border border-border bg-card p-8 md:p-12"
              data-testid="empty-state-low-confidence"
            >
              <h2 className="text-xs font-sans uppercase tracking-[0.3em] font-bold text-muted-foreground mb-6">
                No match in the archive
              </h2>
              <p
                className="text-3xl md:text-4xl font-serif font-normal text-foreground mb-8 leading-tight"
                data-testid="text-search-query"
              >
                "{submittedQuery}"
              </p>
              <p className="font-serif text-base md:text-lg text-foreground leading-relaxed mb-8">
                No confession in the archive directly answers this. The
                PM Confessional covers product, hiring, pricing, growth,
                culture, fundraising, timing, and customer regrets from
                PM podcast guests.
              </p>
              <div className="mb-10">
                <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4">
                  Try one of:
                </p>
                <ul className="space-y-2">
                  {LOW_CONF_SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className="font-serif italic text-base md:text-lg text-primary hover:text-foreground transition-colors text-left border-b border-transparent hover:border-primary"
                        data-testid={`button-suggestion-${s.replace(/\s+/g, "-")}`}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-border pt-8">
                <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4">
                  Or:
                </p>
                <Button
                  variant="outline"
                  onClick={handleShowLooseAnyway}
                  className="rounded-none text-xs uppercase tracking-widest font-bold"
                  data-testid="button-show-loose-matches"
                >
                  Show closest matches anyway ({searchResults?.length ?? 0})
                </Button>
              </div>
            </div>
          ) : isSearching || (isLoadingList && !hasSearched && !listData) ? (
            <div
              className="grid grid-cols-1 lg:grid-cols-2 gap-8"
              data-testid="search-skeletons"
            >
              {[1, 2, 3, 4, 5].map((i) => (
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
