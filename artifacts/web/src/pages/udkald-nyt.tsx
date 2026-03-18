import React, { useState, useCallback, useMemo } from "react";
import Map, { Source, Layer, Popup, NavigationControl } from "react-map-gl/mapbox";
import type { MapLayerMouseEvent, FillLayer, LineLayer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Siren, Info, Send, Map as MapIcon, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/hooks/use-toast";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const COLOR_DEF = [
  { id: "grå",    label: "Ingen",           hex: "#94a3b8", activates: "Ingen kørsel" },
  { id: "orange", label: "Kun VIP",         hex: "#f97316", activates: "VIP" },
  { id: "blå",    label: "HØJ + VIP",       hex: "#3b82f6", activates: "VIP, Høj" },
  { id: "rød",    label: "LAV + HØJ + VIP", hex: "#ef4444", activates: "VIP, Høj, Lav" },
  { id: "grøn",   label: "Alle pladser",    hex: "#22c55e", activates: "VIP, Høj, Lav, Basis" },
] as const;

type ColorId = typeof COLOR_DEF[number]["id"];

function colorHex(c: string) {
  return COLOR_DEF.find(d => d.id === c)?.hex ?? "#94a3b8";
}

interface AreaWithGeo {
  id: string;
  name: string;
  description?: string | null;
  geometry: GeoJSON.Feature<GeoJSON.Polygon> | null;
}

function computeCentroid(coords: number[][]): [number, number] {
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lng, lat];
}

interface AreaPopup {
  areaId: string;
  areaName: string;
  lng: number;
  lat: number;
}

export default function NytUdkaldPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [areaColors, setAreaColors] = useState<Record<string, ColorId>>({});
  const [popup, setPopup] = useState<AreaPopup | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const { data: areas = [], isLoading } = useQuery<AreaWithGeo[]>({
    queryKey: ["areas-with-geometry"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/areas-with-geometry`);
      if (!res.ok) throw new Error("Kunne ikke hente områder");
      return res.json();
    },
  });

  // Preview: compute which sites are included based on current area→color assignments
  const activeAssignments = useMemo(
    () =>
      Object.entries(areaColors)
        .filter(([, color]) => color !== "grå")
        .map(([areaId, color]) => ({ areaId, color })),
    [areaColors]
  );

  const { data: preview } = useQuery<{
    totalSites: number;
    byArea: Record<string, { count: number; sites: { name: string; level: string; address?: string | null }[] }>;
  }>({
    queryKey: ["callout-preview", activeAssignments],
    queryFn: async () => {
      if (activeAssignments.length === 0) return { totalSites: 0, byArea: {} };
      const res = await fetch(`${BASE}/api/sites/callout-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: activeAssignments }),
      });
      if (!res.ok) throw new Error("Preview fejl");
      return res.json();
    },
    enabled: activeAssignments.length > 0,
  });

  const handleSelectColor = (areaId: string, color: ColorId) => {
    setAreaColors(prev => ({ ...prev, [areaId]: color }));
    setPopup(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Mangler titel", description: "Angiv en titel for udkaldet.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const areaStatuses = Object.entries(areaColors)
        .filter(([, color]) => color !== "grå")
        .map(([areaId, color]) => ({ areaId, color }));

      const res = await fetch(`${BASE}/api/callouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), notes: notes.trim() || null, areaStatuses }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Serverfejl");
      }

      const callout = await res.json();
      toast({ title: "Udkald oprettet", description: "Udkaldet er gemt som kladde." });
      setLocation(`/udkald/${callout.id}`);
    } catch (e: unknown) {
      toast({
        title: "Fejl",
        description: e instanceof Error ? e.message : "Kunne ikke oprette udkald.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Build GeoJSON FeatureCollection for the map
  const geojson = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];
    for (const area of areas) {
      if (!area.geometry) continue;
      const colorId = areaColors[area.id] ?? "grå";
      features.push({
        type: "Feature",
        properties: {
          id: area.id,
          name: area.name,
          color: colorHex(colorId),
          selected: colorId !== "grå",
        },
        geometry: area.geometry.geometry,
      });
    }
    return { type: "FeatureCollection", features };
  }, [areas, areaColors]);

  const fillLayer: FillLayer = {
    id: "areas-fill",
    type: "fill",
    source: "areas",
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["case", ["get", "selected"], 0.45, 0.15],
    },
  };

  const outlineLayer: LineLayer = {
    id: "areas-outline",
    type: "line",
    source: "areas",
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["case", ["get", "selected"], 2.5, 1],
      "line-opacity": ["case", ["get", "selected"], 1, 0.4],
    },
  };

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature?.properties) return;
      const areaId = feature.properties.id as string;
      const areaName = feature.properties.name as string;
      setPopup({ areaId, areaName, lng: e.lngLat.lng, lat: e.lngLat.lat });
    },
    []
  );

  const openPopupForArea = (area: AreaWithGeo) => {
    if (!area.geometry) return;
    const coords = area.geometry.geometry.coordinates[0];
    const [lng, lat] = computeCentroid(coords);
    setPopup({ areaId: area.id, areaName: area.name, lng, lat });
  };

  const activeCount = Object.values(areaColors).filter(c => c !== "grå").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Topbar */}
      <div className="bg-card border-b border-border px-5 py-3 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/dashboard")}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 shrink-0">
            <Siren className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold leading-tight">Opret Nyt Udkald</h1>
            <p className="text-xs text-muted-foreground">
              Klik på et område på kortet for at tildele farve
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-xs px-2.5 py-1">
              {activeCount} {activeCount === 1 ? "område" : "områder"} aktiveret
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard")}>
            Annuller
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? "Gemmer..." : "Gem Kladde"}
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Body: Left panel + Map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className="w-72 shrink-0 bg-card border-r border-border flex flex-col overflow-y-auto z-10">
          <div className="p-4 space-y-4 flex-1">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Titel <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="F.eks. Snestorm Nat..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Instrukser / Noter
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Skriv instruks til chaufførerne..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[90px] resize-none"
              />
            </div>

            {/* Area list */}
            {areas.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Områder ({areas.length})
                </label>
                <div className="space-y-0.5">
                  {areas.map(area => {
                    const colorId = areaColors[area.id] ?? "grå";
                    const colorDef = COLOR_DEF.find(c => c.id === colorId);
                    const isActive = colorId !== "grå";
                    return (
                      <button
                        key={area.id}
                        onClick={() => openPopupForArea(area)}
                        className={clsx(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                          isActive
                            ? "bg-muted/80 font-medium"
                            : "text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-white/20 shadow-sm"
                          style={{ backgroundColor: colorDef?.hex ?? "#94a3b8" }}
                        />
                        <span className="truncate flex-1 text-xs">{area.name}</span>
                        {isActive && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Preview section — shown when any area is activated */}
          {activeAssignments.length > 0 && (
            <div className="space-y-1.5 border-t border-border px-4 pt-4 pb-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Pladser i udkald
                </label>
                {preview && (
                  <Badge variant="secondary" className="text-xs">
                    {preview.totalSites} i alt
                  </Badge>
                )}
              </div>

              {!preview ? (
                <p className="text-xs text-muted-foreground italic">Beregner...</p>
              ) : preview.totalSites === 0 ? (
                <p className="text-xs text-muted-foreground italic">Ingen aktive pladser i valgte områder.</p>
              ) : (
                <div className="space-y-2">
                  {/* Per-area counts */}
                  {activeAssignments.map(({ areaId, color }) => {
                    const areaData = preview.byArea[areaId];
                    const areaName = areas.find(a => a.id === areaId)?.name ?? areaId;
                    if (!areaData) return null;
                    return (
                      <div key={areaId} className="bg-muted/40 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorHex(color) }} />
                            <span className="text-xs font-medium truncate">{areaName}</span>
                          </div>
                          <span className="text-xs font-bold text-foreground ml-2">{areaData.count}</span>
                        </div>
                        {/* First few site names */}
                        {areaData.sites.slice(0, previewExpanded ? 10 : 3).map((site, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground pl-4 truncate leading-relaxed">
                            {site.name}
                          </p>
                        ))}
                        {!previewExpanded && areaData.count > 3 && (
                          <p className="text-[10px] text-muted-foreground pl-4 italic">
                            + {areaData.count - 3} flere...
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Expand/collapse */}
                  <button
                    onClick={() => setPreviewExpanded(!previewExpanded)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {previewExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {previewExpanded ? "Vis færre" : "Vis alle pladser"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Color legend */}
          <div className="p-4 border-t border-border bg-slate-900 dark:bg-slate-950 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Farveforklaring
              </span>
            </div>
            <div className="space-y-2">
              {COLOR_DEF.map(c => (
                <div key={c.id} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: c.hex }}
                  />
                  <div>
                    <span className="text-slate-200 font-medium">{c.label}</span>
                    <span className="text-slate-500 ml-1.5">{c.activates}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {!MAPBOX_TOKEN ? (
            <MapFallback
              areas={areas}
              areaColors={areaColors}
              onSelectColor={handleSelectColor}
            />
          ) : (
            <Map
              initialViewState={{ longitude: 9.5, latitude: 56.3, zoom: 7 }}
              mapStyle="mapbox://styles/mapbox/light-v11"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={["areas-fill"]}
              onClick={handleMapClick}
              cursor="pointer"
            >
              <NavigationControl position="bottom-right" />

              <Source id="areas" type="geojson" data={geojson}>
                <Layer {...fillLayer} />
                <Layer {...outlineLayer} />
              </Source>

              {/* Area name labels as Popups */}
              {areas.map(area => {
                if (!area.geometry) return null;
                const coords = area.geometry.geometry.coordinates[0];
                const [lng, lat] = computeCentroid(coords);
                const colorId = areaColors[area.id] ?? "grå";
                const isActive = colorId !== "grå";
                return (
                  <Popup
                    key={area.id + "-label"}
                    longitude={lng}
                    latitude={lat}
                    closeButton={false}
                    closeOnClick={false}
                    anchor="center"
                    offset={0}
                  >
                    <div
                      className={clsx(
                        "px-2 py-0.5 rounded text-xs font-semibold pointer-events-none select-none whitespace-nowrap shadow",
                        isActive ? "text-white" : "text-slate-600 bg-white/80"
                      )}
                      style={isActive ? { backgroundColor: colorHex(colorId) } : {}}
                    >
                      {area.name}
                    </div>
                  </Popup>
                );
              })}

              {/* Color-picker popup */}
              {popup && (
                <Popup
                  longitude={popup.lng}
                  latitude={popup.lat}
                  anchor="bottom"
                  closeButton
                  onClose={() => setPopup(null)}
                  offset={12}
                  maxWidth="260px"
                >
                  <div className="p-2 min-w-[220px]">
                    <p className="font-bold text-sm mb-3 pr-5">{popup.areaName}</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {COLOR_DEF.map(color => {
                        const isSel = (areaColors[popup.areaId] ?? "grå") === color.id;
                        return (
                          <button
                            key={color.id}
                            onClick={() => handleSelectColor(popup.areaId, color.id)}
                            title={color.label}
                            className={clsx(
                              "flex flex-col items-center gap-1 p-1.5 rounded-lg text-xs transition-all",
                              isSel
                                ? "ring-2 ring-offset-1 ring-primary bg-muted scale-110"
                                : "hover:bg-muted"
                            )}
                          >
                            <span
                              className="w-6 h-6 rounded-full shadow-sm border border-white/30"
                              style={{ backgroundColor: color.hex }}
                            />
                            <span className="text-[9px] text-muted-foreground leading-none capitalize">
                              {color.id}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Popup>
              )}
            </Map>
          )}
        </div>
      </div>
    </div>
  );
}

function MapFallback({
  areas,
  areaColors,
  onSelectColor,
}: {
  areas: AreaWithGeo[];
  areaColors: Record<string, ColorId>;
  onSelectColor: (areaId: string, color: ColorId) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="w-full h-full flex flex-col items-center justify-start bg-slate-100 dark:bg-slate-900 relative overflow-auto p-6">
      <div className="relative z-10 max-w-lg w-full mx-auto space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <MapIcon className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground font-medium">
            Tilføj <code className="bg-muted px-1 rounded text-xs">VITE_MAPBOX_TOKEN</code> for live
            kort. Du kan stadig vælge farver nedenfor:
          </p>
        </div>

        {areas.map(area => {
          const colorId = areaColors[area.id] ?? "grå";
          const colorDef = COLOR_DEF.find(c => c.id === colorId);
          const isOpen = open === area.id;

          return (
            <div key={area.id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : area.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full border border-white/20 shadow shrink-0"
                    style={{ backgroundColor: colorDef?.hex ?? "#94a3b8" }}
                  />
                  <div className="text-left">
                    <p className="font-semibold text-sm">{area.name}</p>
                    <p className="text-xs text-muted-foreground">{colorDef?.label}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 flex gap-2 border-t border-border pt-3 bg-muted/20">
                  {COLOR_DEF.map(color => {
                    const isSel = colorId === color.id;
                    return (
                      <button
                        key={color.id}
                        onClick={() => {
                          onSelectColor(area.id, color.id);
                          setOpen(null);
                        }}
                        title={color.label}
                        className={clsx(
                          "flex flex-col items-center gap-1 p-2 rounded-xl transition-all flex-1",
                          isSel
                            ? "bg-background shadow ring-2 ring-primary scale-105"
                            : "hover:bg-background/60"
                        )}
                      >
                        <span
                          className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span className="text-[9px] text-muted-foreground capitalize">{color.id}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
