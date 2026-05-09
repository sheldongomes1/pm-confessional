import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import { Home } from "@/pages/home";
import { Leaderboard } from "@/pages/leaderboard";
import { RegretDetail } from "@/pages/regret";
import { usePageviews } from "@/lib/analytics";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  usePageviews();
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse">{() => <Redirect to="/" />}</Route>
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/regret/:id" component={RegretDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
