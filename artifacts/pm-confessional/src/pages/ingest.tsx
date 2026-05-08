import { useGetStats, useGetIngestStatus, useStartIngest, getGetStatsQueryKey, getGetIngestStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Database, Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function Ingest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: isStatsLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() }
  });

  const { data: status, isLoading: isStatusLoading } = useGetIngestStatus({
    query: { 
      queryKey: getGetIngestStatusQueryKey(),
      refetchInterval: (query) => query.state.data?.status === 'running' ? 3000 : false
    }
  });

  const startMutation = useStartIngest();

  const handleStart = (sampleOnly: boolean) => {
    startMutation.mutate({ data: { sample_only: sampleOnly, limit_episodes: sampleOnly ? 10 : null } }, {
      onSuccess: () => {
        toast({
          title: "Process Initiated",
          description: "Data extraction pipeline is running.",
        });
        queryClient.invalidateQueries({ queryKey: getGetIngestStatusQueryKey() });
      },
      onError: (err) => {
        toast({
          title: "Operation Failed",
          description: "Unable to start the extraction pipeline.",
          variant: "destructive"
        });
      }
    });
  };

  const isRunning = status?.status === 'running';

  return (
    <div className="container mx-auto px-6 py-16 max-w-5xl bg-background">
      <div className="mb-12 border-b border-border pb-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-primary" />
          <p className="text-[10px] uppercase tracking-widest text-foreground font-bold">Data Operations</p>
        </div>
        <h1 className="text-4xl font-serif font-medium text-foreground tracking-tight">
          Pipeline Management
        </h1>
        <p className="text-sm font-sans font-medium text-muted-foreground mt-4 max-w-2xl">
          System dashboard for transcript extraction and semantic indexing.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="border border-border p-6 bg-card rounded-sm shadow-sm flex flex-col justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Indexed Records</div>
          <div className="text-4xl font-mono text-foreground font-bold">
            {isStatsLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : stats?.total_regrets || 0}
          </div>
        </div>
        <div className="border border-border p-6 bg-card rounded-sm shadow-sm flex flex-col justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Unique Sources</div>
          <div className="text-4xl font-mono text-foreground font-bold">
            {isStatsLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : stats?.total_guests || 0}
          </div>
        </div>
        <div className="border border-border p-6 bg-card rounded-sm shadow-sm flex flex-col justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Processed Files</div>
          <div className="text-4xl font-mono text-foreground font-bold">
            {isStatsLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : stats?.total_episodes || 0}
          </div>
        </div>
      </div>

      {/* Pipeline Status */}
      <div className="border border-border bg-card rounded-sm shadow-sm">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
          <h2 className="text-sm font-sans font-bold text-foreground uppercase tracking-wider">System Status</h2>
          <div className="flex items-center gap-2">
            {status?.status === 'running' && <Activity className="w-3.5 h-3.5 text-blue-600 animate-pulse" />}
            {status?.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
            {status?.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
            <span className={`text-[10px] uppercase tracking-widest font-bold ${
              status?.status === 'running' ? 'text-blue-600' :
              status?.status === 'completed' ? 'text-primary' :
              status?.status === 'failed' ? 'text-destructive' :
              'text-muted-foreground'
            }`}>
              {status?.status || 'Idle'}
            </span>
          </div>
        </div>
        
        <div className="p-8">
          {isRunning && (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <span className="font-sans text-sm text-foreground font-medium">Extracting data...</span>
                <span className="font-mono text-[10px] text-blue-600 uppercase tracking-widest font-bold">Processing</span>
              </div>
              <Progress value={status.episodes_processed ? 100 : undefined} className="h-1.5 rounded-none bg-secondary [&>div]:bg-blue-600" />
              
              <div className="grid grid-cols-2 gap-8 pt-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Files Read</p>
                  <p className="text-2xl font-mono text-foreground font-bold">{status.episodes_processed}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Data Points</p>
                  <p className="text-2xl font-mono text-primary font-bold">{status.regrets_extracted}</p>
                </div>
              </div>
            </div>
          )}

          {!isRunning && status?.status === 'failed' && (
            <div className="border border-destructive/20 bg-destructive/5 p-6 rounded-sm">
              <h3 className="text-sm font-sans font-bold text-destructive uppercase tracking-wider mb-2">Error Encountered</h3>
              <p className="font-mono text-xs text-destructive/80">
                {status.message || 'System fault during extraction process.'}
              </p>
            </div>
          )}

          {!isRunning && status?.status === 'completed' && (
            <div className="border border-primary/20 bg-primary/5 p-6 rounded-sm">
              <h3 className="text-sm font-sans font-bold text-primary uppercase tracking-wider mb-2">Operation Complete</h3>
              <p className="font-sans text-sm text-foreground/80">
                Processed {status.episodes_processed} files and indexed {status.regrets_extracted} records.
              </p>
              {status.completed_at && (
                <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Logged at {new Date(status.completed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {!isRunning && status?.status === 'idle' && (
            <div className="py-6">
              <p className="font-sans text-sm text-muted-foreground font-medium">
                System is idle and ready for task allocation.
              </p>
            </div>
          )}

          <div className="pt-8 mt-8 border-t border-border flex flex-col sm:flex-row gap-4">
            <Button 
              onClick={() => handleStart(true)} 
              disabled={isRunning || startMutation.isPending}
              variant="outline"
              className="rounded-sm border-border bg-card text-foreground hover:bg-secondary hover:text-foreground text-[10px] uppercase tracking-widest font-bold shadow-sm"
              data-testid="button-start-sample"
            >
              {startMutation.isPending && !isRunning ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
              Test Run (10 Files)
            </Button>
            <Button 
              onClick={() => handleStart(false)} 
              disabled={isRunning || startMutation.isPending}
              className="rounded-sm bg-foreground text-background hover:bg-primary text-[10px] uppercase tracking-widest font-bold transition-colors shadow-sm"
              data-testid="button-start-full"
            >
              {startMutation.isPending && !isRunning ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
              Execute Full Run
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
