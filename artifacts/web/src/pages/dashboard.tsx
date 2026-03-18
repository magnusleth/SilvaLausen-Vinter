import React from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Map, Siren, CheckCircle2, ArrowRight, Truck } from "lucide-react";
import { useAppData } from "@/hooks/use-app-data";
import { format } from "date-fns";
import { da } from "date-fns/locale";

export default function Dashboard() {
  const { callouts, sites, people, isLoading } = useAppData();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const activeCallouts = callouts.filter(c => c.status === "aktiv");
  const draftCallouts = callouts.filter(c => c.status === "kladde");
  const activeDrivers = people.filter(p => p.role === "chauffør" && p.active);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Goddag, Disponent</h1>
          <p className="text-muted-foreground mt-1">Her er dit overblik for vintertjenesten i dag.</p>
        </div>
        <Link href="/udkald/nyt" className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover-elevate active-elevate-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2">
          <Siren className="w-4 h-4 mr-2" />
          Opret Nyt Udkald
        </Link>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-card to-card hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Aktive Udkald</p>
                <p className="text-4xl font-display font-bold text-foreground">{activeCallouts.length}</p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-xl">
                <Siren className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Aktive Pladser</p>
                <p className="text-4xl font-display font-bold text-foreground">{sites.length}</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 text-blue-600 rounded-xl">
                <Map className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Kladdede Udkald</p>
                <p className="text-4xl font-display font-bold text-foreground">{draftCallouts.length}</p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-900/20 text-orange-600 rounded-xl">
                <Siren className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Chauffører på Vagt</p>
                <p className="text-4xl font-display font-bold text-foreground">{activeDrivers.length}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/20 text-green-600 rounded-xl">
                <Truck className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-display font-bold">Nylige Udkald</h2>
          <div className="space-y-4">
            {callouts.length === 0 ? (
              <Card className="border-dashed shadow-none bg-transparent">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Ingen udkald fundet.</p>
                </CardContent>
              </Card>
            ) : (
              callouts.map((co) => (
                <Card key={co.id} className="hover:border-primary/50 transition-colors group">
                  <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{co.title}</h3>
                        <Badge variant={co.status === "aktiv" ? "destructive" : co.status === "kladde" ? "secondary" : "default"}>
                          {co.status.charAt(0).toUpperCase() + co.status.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {co.createdAt && format(new Date(co.createdAt), "d. MMMM yyyy 'kl.' HH:mm", { locale: da })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="hidden sm:flex">Rediger</Button>
                      <Link href="/kort" className="inline-flex items-center justify-center rounded-lg text-sm font-medium hover-elevate transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3">
                        Se på kort <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-display font-bold">Hurtige Handlinger</h2>
          <Card>
            <CardContent className="p-2 flex flex-col space-y-1">
              <Link href="/kort" className="flex items-center px-4 py-3 hover:bg-muted rounded-xl transition-colors text-sm font-medium">
                <Map className="w-5 h-5 mr-3 text-blue-500" />
                Gå til Live Kort
              </Link>
              <Link href="/udkald/nyt" className="flex items-center px-4 py-3 hover:bg-muted rounded-xl transition-colors text-sm font-medium">
                <Siren className="w-5 h-5 mr-3 text-red-500" />
                Opret Nyt Udkald
              </Link>
              <Link href="/dashboard" className="flex items-center px-4 py-3 hover:bg-muted rounded-xl transition-colors text-sm font-medium text-muted-foreground opacity-60 pointer-events-none">
                <CheckCircle2 className="w-5 h-5 mr-3 text-green-500" />
                Afslut Vagthold (kommer snart)
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
