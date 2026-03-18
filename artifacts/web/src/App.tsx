import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

// Components
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import Dashboard from "@/pages/dashboard";
import KortPage from "@/pages/kort";
import NytUdkaldPage from "@/pages/udkald-nyt";
import UdkaldVisPage from "@/pages/udkald-vis";
import KunderPage from "@/pages/kunder";
import ChauffororPage from "@/pages/chaufforer";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function RedirectToDashboard() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboard");
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={RedirectToDashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/kort" component={KortPage} />
        <Route path="/udkald/nyt" component={NytUdkaldPage} />
        <Route path="/udkald/:id" component={UdkaldVisPage} />
        <Route path="/kunder" component={KunderPage} />
        <Route path="/chaufforer" component={ChauffororPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
