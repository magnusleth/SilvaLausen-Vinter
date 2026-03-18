import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Siren, Map as MapIcon, Info, Send } from "lucide-react";
import { clsx } from "clsx";
import { useCreateCallout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Color logic definition
const COLOR_DEF = [
  { id: "grå", label: "Ingen", colorClass: "bg-slate-400", activates: "Ingen kørsel" },
  { id: "orange", label: "Kun VIP", colorClass: "bg-orange-500", activates: "VIP" },
  { id: "blå", label: "HØJ + VIP", colorClass: "bg-blue-500", activates: "VIP, Høj" },
  { id: "rød", label: "LAV + HØJ + VIP", colorClass: "bg-red-500", activates: "VIP, Høj, Lav" },
  { id: "grøn", label: "Alle pladser", colorClass: "bg-green-500", activates: "VIP, Høj, Lav, Basis" },
] as const;

export default function NytUdkaldPage() {
  const [, setLocation] = useLocation();
  const { areas, isLoading } = useAppData();
  const { toast } = useToast();
  
  // State for the form
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [areaColors, setAreaColors] = useState<Record<string, string>>({});
  
  const createMutation = useCreateCallout({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Udkald oprettet",
          description: "Udkaldet er blevet gemt som kladde.",
        });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({
          title: "Fejl",
          description: "Kunne ikke oprette udkald.",
          variant: "destructive"
        });
      }
    }
  });

  const handleSelectColor = (areaId: string, color: string) => {
    setAreaColors(prev => ({ ...prev, [areaId]: color }));
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast({
        title: "Mangler titel",
        description: "Angiv venligst en titel for udkaldet.",
        variant: "destructive"
      });
      return;
    }
    
    // In a real flow, we'd create the callout, then set the area statuses via the other hook.
    // For this UI skeleton, we just trigger the create callout mutation.
    createMutation.mutate({
      data: {
        title,
        notes: notes || null
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const activeAreasCount = Object.values(areaColors).filter(c => c !== "grå").length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 hover:bg-muted rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
              <Siren className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold">Opret Nyt Udkald</h1>
              <p className="text-sm text-muted-foreground">Definér områder og farvekoder</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            Annuller
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={createMutation.isPending}
            className="gap-2"
          >
            {createMutation.isPending ? "Gemmer..." : "Gem Kladde"}
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Left Column: Form & Legend */}
          <div className="xl:col-span-1 space-y-6">
            <Card className="shadow-md">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Titel på udkald <span className="text-destructive">*</span></label>
                  <input 
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="F.eks. Snestorm Nat, Præventiv Saltning..."
                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Disponent Noter</label>
                  <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Instrukser der sendes med udkaldet..."
                    className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[120px] resize-y transition-shadow"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 text-slate-50 border-slate-800 shadow-lg">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-slate-200">
                  <Info className="w-5 h-5" />
                  <h3 className="font-semibold">Farveforklaring</h3>
                </div>
                <div className="space-y-3">
                  {COLOR_DEF.map(color => (
                    <div key={color.id} className="flex items-center gap-3 text-sm">
                      <div className={clsx("w-5 h-5 rounded-full shrink-0 shadow-sm border border-white/10", color.colorClass)}></div>
                      <div className="flex-1">
                        <p className="font-medium">{color.label}</p>
                        <p className="text-slate-400 text-xs">{color.activates}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Area Selector */}
          <div className="xl:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold">Vælg Farve pr. Område</h2>
              <Badge variant="secondary" className="px-3 py-1">
                {activeAreasCount} / {areas.length} områder valgt
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {areas.map(area => {
                const selectedColor = areaColors[area.id] || "grå";
                
                return (
                  <Card 
                    key={area.id} 
                    className={clsx(
                      "transition-all duration-300 border-2 overflow-hidden",
                      selectedColor !== "grå" ? "border-primary/50 shadow-md ring-1 ring-primary/20" : "border-transparent"
                    )}
                  >
                    <CardContent className="p-0">
                      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <MapIcon className="w-5 h-5 text-muted-foreground" />
                            <h3 className="font-bold text-lg">{area.name}</h3>
                          </div>
                          {area.description && (
                            <p className="text-sm text-muted-foreground pl-7">{area.description}</p>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2 shrink-0 bg-muted/30 p-1.5 rounded-2xl border border-border/50">
                          {COLOR_DEF.map(color => {
                            const isSelected = selectedColor === color.id;
                            return (
                              <button
                                key={color.id}
                                onClick={() => handleSelectColor(area.id, color.id)}
                                className={clsx(
                                  "px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 relative",
                                  isSelected 
                                    ? "bg-background shadow-sm text-foreground scale-105 z-10 border border-border" 
                                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground border border-transparent"
                                )}
                              >
                                <div className={clsx(
                                  "w-3.5 h-3.5 rounded-full transition-transform", 
                                  color.colorClass,
                                  isSelected ? "scale-110 shadow-sm" : ""
                                )}></div>
                                <span className={clsx("capitalize", isSelected ? "opacity-100" : "opacity-80")}>{color.id}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
