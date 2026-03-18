import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, MapPin, Phone, Mail, ChevronRight, Search } from "lucide-react";
import { useAppData } from "@/hooks/use-app-data";
import { clsx } from "clsx";

export default function KunderPage() {
  const { customers, areas, isLoading } = useAppData();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.cvr && c.cvr.includes(search))
  );

  const selected = selectedId ? customers.find(c => c.id === selectedId) : null;
  const selectedAreas = selected ? areas.filter(a => a.customerId === selected.id) : [];

  return (
    <div className="flex h-full animate-in fade-in duration-300">
      {/* List panel */}
      <div className="w-96 border-r border-border bg-card flex flex-col h-full shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Kunder</h1>
            <Badge variant="secondary" className="ml-auto">{customers.length}</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Søg på navn eller CVR..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Ingen kunder fundet
            </div>
          )}
          {filtered.map(customer => {
            const areaCount = areas.filter(a => a.customerId === customer.id).length;
            const isSelected = selectedId === customer.id;
            return (
              <button
                key={customer.id}
                onClick={() => setSelectedId(isSelected ? null : customer.id)}
                className={clsx(
                  "w-full text-left px-5 py-4 transition-colors hover:bg-muted/50 flex items-center justify-between gap-3",
                  isSelected && "bg-primary/5 border-l-2 border-primary"
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{customer.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    CVR: {customer.cvr || "—"} · {areaCount} {areaCount === 1 ? "område" : "områder"}
                  </p>
                </div>
                <ChevronRight className={clsx("w-4 h-4 text-muted-foreground shrink-0 transition-transform", isSelected && "rotate-90 text-primary")} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-8">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Briefcase className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-lg font-medium">Vælg en kunde</p>
            <p className="text-sm mt-1">Klik på en kunde i listen for at se detaljer</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-3xl font-display font-bold text-foreground">{selected.name}</h2>
              <p className="text-muted-foreground mt-1">CVR: {selected.cvr || "Ikke angivet"}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Adresse</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm">{selected.address || "Ikke angivet"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Kontaktperson</p>
                  <p className="text-sm font-medium">{selected.contactPerson || "Ikke angivet"}</p>
                  {selected.contactEmail && (
                    <div className="flex items-center gap-2 mt-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{selected.contactEmail}</p>
                    </div>
                  )}
                  {selected.contactPhone && (
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{selected.contactPhone}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-display font-semibold mb-3">
                Tilknyttede Områder
                <Badge variant="secondary" className="ml-2">{selectedAreas.length}</Badge>
              </h3>
              {selectedAreas.length === 0 ? (
                <Card>
                  <CardContent className="p-5 text-center text-muted-foreground text-sm">
                    Ingen områder tilknyttet denne kunde
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {selectedAreas.map(area => (
                    <Card key={area.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{area.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{area.description || "Ingen beskrivelse"}</p>
                        </div>
                        <Badge variant={area.active ? "default" : "secondary"}>
                          {area.active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
