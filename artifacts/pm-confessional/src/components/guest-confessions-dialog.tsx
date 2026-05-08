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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-background border-border/60">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl text-foreground">
            {guestName}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {data ? `${data.total} ${data.total === 1 ? "confession" : "confessions"} on the record` : "Loading confessions..."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-lg" />
            ))
          ) : data?.regrets.length === 0 ? (
            <p className="text-muted-foreground col-span-full text-center py-8">
              No confessions found.
            </p>
          ) : (
            data?.regrets.map((regret) => (
              <RegretCard key={regret.id} regret={regret} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
