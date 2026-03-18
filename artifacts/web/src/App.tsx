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
import LivePage from "@/pages/live";
import PladserPage from "@/pages/pladser";
import PladsVisPage from "@/pages/plads-vis";
import PladsRedigerPage from "@/pages/plads-rediger";
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
    <Switch>
      {/* Live driver view — no admin layout, full screen */}
      <Route path="/live/:calloutId" component={LivePage} />

      {/* All admin routes wrapped in AppLayout */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={RedirectToDashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/kort" component={KortPage} />
            <Route path="/udkald/nyt" component={NytUdkaldPage} />
            <Route path="/udkald/:id" component={UdkaldVisPage} />
            <Route path="/kunder" component={KunderPage} />
            <Route path="/chaufforer" component={ChauffororPage} />
            <Route path="/pladser/:id/rediger" component={PladsRedigerPage} />
            <Route path="/pladser/:id" component={PladsVisPage} />
            <Route path="/pladser" component={PladserPage} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
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
