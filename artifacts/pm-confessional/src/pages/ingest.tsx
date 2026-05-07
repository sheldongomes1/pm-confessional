import { useGetStats, useGetIngestStatus, useStartIngest, getGetStatsQueryKey, getGetIngestStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { Database, AlertCircle, CheckCircle2, Loader2, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

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
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="mb-10">
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
          <Database className="w-8 h-8 text-primary" />
          Data Operations
        </h1>
        <p className="text-muted-foreground mt-2">Manage the podcast transcript ingestion and extraction pipeline.</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Confessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-serif font-bold text-foreground">
              {isStatsLoading ? <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /> : stats?.total_regrets || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Unique Guests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-serif font-bold text-foreground">
              {isStatsLoading ? <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /> : stats?.total_guests || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Episodes Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-serif font-bold text-foreground">
              {isStatsLoading ? <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /> : stats?.total_episodes || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Status */}
      <Card className="border-primary/20 bg-card/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-serif">Pipeline Status</CardTitle>
            <Badge variant="outline" className={`capitalize ${
              status?.status === 'running' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' :
              status?.status === 'completed' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
              status?.status === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
              'bg-secondary text-muted-foreground'
            }`}>
              {status?.status || 'Unknown'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          
          {isRunning && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Extracting regrets...</span>
                <span className="font-mono text-primary animate-pulse">Running</span>
              </div>
              <Progress value={status.episodes_processed ? 100 : undefined} className="h-2" />
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Episodes Processed</p>
                  <p className="text-2xl font-mono text-foreground">{status.episodes_processed}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Regrets Extracted</p>
                  <p className="text-2xl font-mono text-primary">{status.regrets_extracted}</p>
                </div>
              </div>
            </div>
          )}

          {!isRunning && status?.status === 'failed' && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Ingestion Failed</AlertTitle>
              <AlertDescription className="font-mono text-xs mt-2">
                {status.message || 'An unknown error occurred during processing.'}
              </AlertDescription>
            </Alert>
          )}

          {!isRunning && status?.status === 'completed' && (
            <Alert className="bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Ingestion Completed Successfully</AlertTitle>
              <AlertDescription className="mt-1">
                Processed {status.episodes_processed} episodes and extracted {status.regrets_extracted} confessions.
                {status.completed_at && <span className="block mt-2 text-xs opacity-70">Finished at {new Date(status.completed_at).toLocaleString()}</span>}
              </AlertDescription>
            </Alert>
          )}

          <div className="pt-6 border-t border-border/50 flex flex-col sm:flex-row gap-4">
            <Button 
              onClick={() => handleStart(true)} 
              disabled={isRunning || startMutation.isPending}
              variant="outline"
              className="flex-1 border-primary/30 hover:bg-primary/10 hover:text-primary"
              data-testid="button-start-sample"
            >
              {startMutation.isPending && !isRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Start Sample Run (10 episodes)
            </Button>
            <Button 
              onClick={() => handleStart(false)} 
              disabled={isRunning || startMutation.isPending}
              className="flex-1"
              data-testid="button-start-full"
            >
              {startMutation.isPending && !isRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
              Start Full Ingestion
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
