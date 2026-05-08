import { useListRegrets, getListRegretsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RegretCard } from "@/components/regret-card";

export function GuestConfessionsDialog({
  guestName,
  open,
  onOpenChange,
}: {
  guestName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const params = guestName ? { guest_name: guestName, limit: 50 } : undefined;
  const { data, isLoading } = useListRegrets(params, {
    query: {
      queryKey: getListRegretsQueryKey(params),
      enabled: !!guestName && open,
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-background border-border p-0 rounded-none">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 p-8 border-b border-border">
          <DialogHeader>
            <div className="text-[10px] uppercase tracking-widest text-primary font-bold mb-2">The Archive</div>
            <DialogTitle className="font-serif text-4xl md:text-5xl text-foreground font-normal">
              {guestName}
            </DialogTitle>
            <DialogDescription className="text-sm font-sans uppercase tracking-widest text-muted-foreground mt-4">
              {data ? `${data.total} ${data.total === 1 ? "confession" : "confessions"} on the record` : "Extracting confessions..."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8">
          <div className="grid gap-8 md:grid-cols-2">
            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-96 w-full rounded-none bg-secondary" />
              ))
            ) : data?.regrets.length === 0 ? (
              <p className="text-muted-foreground col-span-full text-center py-16 font-serif italic text-lg">
                No confessions found.
              </p>
            ) : (
              data?.regrets.map((regret) => (
                <RegretCard key={regret.id} regret={regret} />
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
