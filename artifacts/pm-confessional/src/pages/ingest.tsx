import { useGetStats, useGetIngestStatus, useStartIngest, getGetStatsQueryKey, getGetIngestStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
          title: "Ingestion started",
          description: "The pipeline is now processing episodes.",
        });
        queryClient.invalidateQueries({ queryKey: getGetIngestStatusQueryKey() });
      },
      onError: (err) => {
        toast({
          title: "Failed to start",
          description: "There was an error triggering the pipeline.",
          variant: "destructive"
        });
      }
    });
  };

  const isRunning = status?.status === 'running';

  return (
    <div className="container mx-auto px-6 py-20 max-w-5xl">
      <div className="mb-20 text-center">
        <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold mb-6">Data Operations</p>
        <h1 className="text-5xl font-serif font-normal text-foreground tracking-tight">
          Pipeline Management
        </h1>
        <p className="text-xl font-serif italic text-muted-foreground mt-6 max-w-2xl mx-auto">
          Extract, index, and surface hard-won truths from the archive.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
        <div className="border border-border p-8 text-center bg-card">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-6">Total Confessions</div>
          <div className="text-6xl font-serif text-foreground font-normal">
            {isStatsLoading ? <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /> : stats?.total_regrets || 0}
          </div>
        </div>
        <div className="border border-border p-8 text-center bg-card">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-6">Unique Guests</div>
          <div className="text-6xl font-serif text-foreground font-normal">
            {isStatsLoading ? <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /> : stats?.total_guests || 0}
          </div>
        </div>
        <div className="border border-border p-8 text-center bg-card">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-6">Episodes Processed</div>
          <div className="text-6xl font-serif text-foreground font-normal">
            {isStatsLoading ? <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /> : stats?.total_episodes || 0}
          </div>
        </div>
      </div>

      {/* Pipeline Status */}
      <div className="border border-border bg-card">
        <div className="p-8 border-b border-border flex items-center justify-between bg-secondary/50">
          <h2 className="text-2xl font-serif font-normal">Extraction Status</h2>
          <span className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1 border ${
            status?.status === 'running' ? 'border-blue-900/50 text-blue-400 bg-blue-950/20' :
            status?.status === 'completed' ? 'border-primary/30 text-primary bg-primary/10' :
            status?.status === 'failed' ? 'border-destructive/30 text-destructive bg-destructive/10' :
            'border-border text-muted-foreground'
          }`}>
            {status?.status || 'Idle'}
          </span>
        </div>
        
        <div className="p-12 space-y-12">
          {isRunning && (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <span className="font-serif italic text-xl text-muted-foreground">Reading transcripts...</span>
                <span className="font-mono text-xs text-blue-400 animate-pulse uppercase tracking-wider">Processing</span>
              </div>
              <Progress value={status.episodes_processed ? 100 : undefined} className="h-1 rounded-none bg-border [&>div]:bg-blue-500" />
              
              <div className="grid grid-cols-2 gap-8 pt-8">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3">Episodes Indexed</p>
                  <p className="text-4xl font-serif text-foreground">{status.episodes_processed}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3">Truths Extracted</p>
                  <p className="text-4xl font-serif text-primary">{status.regrets_extracted}</p>
                </div>
              </div>
            </div>
          )}

          {!isRunning && status?.status === 'failed' && (
            <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
              <h3 className="text-lg font-serif text-destructive mb-2">Ingestion Failed</h3>
              <p className="font-mono text-xs text-destructive/80">
                {status.message || 'System error during transcript processing.'}
              </p>
            </div>
          )}

          {!isRunning && status?.status === 'completed' && (
            <div className="border border-primary/20 bg-primary/5 p-8 text-center">
              <h3 className="text-2xl font-serif text-primary mb-4 font-normal">Extraction Complete</h3>
              <p className="font-sans text-sm text-foreground/80 max-w-md mx-auto leading-relaxed">
                Successfully processed {status.episodes_processed} episodes and indexed {status.regrets_extracted} actionable lessons.
              </p>
              {status.completed_at && (
                <p className="mt-6 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Concluded at {new Date(status.completed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {!isRunning && status?.status === 'idle' && (
            <div className="text-center py-8">
              <p className="font-serif italic text-xl text-muted-foreground">
                Pipeline is idle. Ready to extract lessons from the podcast archives.
              </p>
            </div>
          )}

          <div className="pt-12 border-t border-border flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              onClick={() => handleStart(true)} 
              disabled={isRunning || startMutation.isPending}
              variant="outline"
              className="rounded-none border-border hover:border-primary hover:text-primary px-8 py-6 h-auto text-xs uppercase tracking-widest font-bold"
              data-testid="button-start-sample"
            >
              {startMutation.isPending && !isRunning ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : null}
              Run Sample (10 Episodes)
            </Button>
            <Button 
              onClick={() => handleStart(false)} 
              disabled={isRunning || startMutation.isPending}
              className="rounded-none bg-foreground text-background hover:bg-primary px-8 py-6 h-auto text-xs uppercase tracking-widest font-bold transition-colors"
              data-testid="button-start-full"
            >
              {startMutation.isPending && !isRunning ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : null}
              Initiate Full Extraction
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
