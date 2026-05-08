import { useState } from "react";
import {
  useGetCategories,
  useListRegrets,
  useGetLeaderboard,
  getGetCategoriesQueryKey,
  getGetLeaderboardQueryKey,
} from "@workspace/api-client-react";
import { RegretCard } from "@/components/regret-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";

export function Browse() {
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>();
  const [selectedStage, setSelectedStage] = useState<string | undefined>();
  const [selectedGuest, setSelectedGuest] = useState<string | undefined>();
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);

  const { data: categories, isLoading: isLoadingCats } = useGetCategories({
    query: { queryKey: getGetCategoriesQueryKey() }
  });

  const { data: leaderboard } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() }
  });

  const guests = (leaderboard?.entries ?? [])
    .map((e) => ({ name: e.guest_name, count: e.regret_count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: regretsData, isLoading: isLoadingRegrets } = useListRegrets({
    topic_tag: selectedTopic,
    stage: selectedStage,
    guest_name: selectedGuest,
    limit: 50
  });

  const clearFilters = () => {
    setSelectedTopic(undefined);
    setSelectedStage(undefined);
    setSelectedGuest(undefined);
  };

  return (
    <div className="container mx-auto px-6 py-16 flex-1 flex flex-col md:flex-row gap-12 max-w-7xl">
      {/* Sidebar Filters */}
      <aside className="w-full md:w-64 flex-shrink-0 space-y-12 border-r border-border/50 pr-8">
        <div>
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
            <h2 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Topics</h2>
            {(selectedTopic || selectedStage || selectedGuest) && (
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
          <h2 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-6 pb-4 border-b border-border">Guest</h2>
          <Popover open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
            <PopoverTrigger asChild>
              <button
                className="w-full flex items-center justify-between gap-2 py-2 border-b border-border/60 hover:border-foreground transition-colors text-left group"
                data-testid="filter-guest-trigger"
              >
                <span
                  className={`text-sm font-serif italic tracking-wide truncate ${
                    selectedGuest ? "text-primary font-bold not-italic" : "text-muted-foreground"
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
              className="w-64 p-0 rounded-none border-border bg-card"
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
                            <span className="text-sm font-serif truncate">{guest.name}</span>
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
