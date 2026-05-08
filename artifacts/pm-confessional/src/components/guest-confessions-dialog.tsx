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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-background border-border p-0 rounded-sm shadow-xl">
        <div className="sticky top-0 bg-background/95 backdrop-blur-md z-10 p-8 border-b border-border shadow-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <div className="text-[10px] uppercase tracking-widest text-foreground font-bold">Research Profile</div>
            </div>
            <DialogTitle className="font-serif text-4xl text-foreground font-medium">
              {guestName}
            </DialogTitle>
            <DialogDescription className="text-xs font-sans uppercase tracking-widest text-muted-foreground mt-4 font-semibold">
              {data ? `${data.total} ${data.total === 1 ? "Record" : "Records"} Found` : "Querying database..."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8 bg-muted/20">
          <div className="grid gap-8 md:grid-cols-2">
            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-96 w-full rounded-sm bg-card border border-border" />
              ))
            ) : data?.regrets.length === 0 ? (
              <p className="text-muted-foreground col-span-full text-center py-16 font-sans text-sm">
                No records found.
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
