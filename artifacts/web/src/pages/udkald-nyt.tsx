import React, { useState, useCallback, useMemo } from "react";
import Map, { Source, Layer, Popup, NavigationControl } from "react-map-gl/mapbox";
import type { MapLayerMouseEvent, FillLayer, LineLayer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Link, useLocation } from "wouter";
import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Siren, Info, Send, Map as MapIcon, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import { useCreateCallout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const COLOR_DEF = [
  { id: "grå",    label: "Ingen",          hex: "#94a3b8", activates: "Ingen kørsel" },
  { id: "orange", label: "Kun VIP",        hex: "#f97316", activates: "VIP" },
  { id: "blå",    label: "HØJ + VIP",      hex: "#3b82f6", activates: "VIP, Høj" },
  { id: "rød",    label: "LAV + HØJ + VIP",hex: "#ef4444", activates: "VIP, Høj, Lav" },
  { id: "grøn",   label: "Alle pladser",   hex: "#22c55e", activates: "VIP, Høj, Lav, Basis" },
] as const;

type ColorId = typeof COLOR_DEF[number]["id"];

function colorHex(colorId: string): string {
  return COLOR_DEF.find(c => c.id === colorId)?.hex ?? "#94a3b8";
}

// Approximate GeoJSON polygons for the 4 seeded areas (keyed by area DB id)
// These match the real DB area IDs from the seed data.
const AREA_POLYGONS: Record<string, GeoJSON.Feature<GeoJSON.Polygon>> = {
  // Vesterbro Nord
  "d0c84526-6f71-4213-ab0f-e42ead89fde7": {
    type: "Feature",
    properties: { id: "d0c84526-6f71-4213-ab0f-e42ead89fde7", name: "Vesterbro Nord" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [12.5281, 55.6735], [12.5462, 55.6752], [12.5601, 55.6718],
        [12.5558, 55.6665], [12.5390, 55.6638], [12.5245, 55.6672],
        [12.5281, 55.6735]
      ]]
    }
  },
  // Nørrebro Syd
  "3b05554b-d30b-416e-a8c2-c36b45c1bdc4": {
    type: "Feature",
    properties: { id: "3b05554b-d30b-416e-a8c2-c36b45c1bdc4", name: "Nørrebro Syd" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [12.5378, 55.6895], [12.5590, 55.6932], [12.5668, 55.6880],
        [12.5530, 55.6822], [12.5340, 55.6810], [12.5280, 55.6855],
        [12.5378, 55.6895]
      ]]
    }
  },
  // Amager Øst
  "a705b8c4-3d46-4bb5-8862-5619621a456f": {
    type: "Feature",
    properties: { id: "a705b8c4-3d46-4bb5-8862-5619621a456f", name: "Amager Øst" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [12.5820, 55.6640], [12.6060, 55.6658], [12.6148, 55.6590],
        [12.6020, 55.6528], [12.5780, 55.6510], [12.5690, 55.6565],
        [12.5820, 55.6640]
      ]]
    }
  },
  // Frederiksberg Center
  "162ea39f-9144-441f-ad56-143ba776cb0e": {
    type: "Feature",
    properties: { id: "162ea39f-9144-441f-ad56-143ba776cb0e", name: "Frederiksberg Center" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [12.5012, 55.6758], [12.5220, 55.6810], [12.5385, 55.6778],
        [12.5310, 55.6700], [12.5098, 55.6680], [12.4985, 55.6718],
        [12.5012, 55.6758]
      ]]
    }
  },
};

// Fallback mock polygon for areas from mock-data (no DB id)
const MOCK_POLYGONS: Record<string, GeoJSON.Feature<GeoJSON.Polygon>> = {
  a1: {
    type: "Feature",
    properties: { id: "a1", name: "Vesterbro" },
    geometry: { type: "Polygon", coordinates: [[[12.528, 55.674], [12.546, 55.675], [12.560, 55.672], [12.556, 55.666], [12.539, 55.664], [12.524, 55.667], [12.528, 55.674]]] }
  },
  a2: {
    type: "Feature",
    properties: { id: "a2", name: "Nørrebro" },
    geometry: { type: "Polygon", coordinates: [[[12.538, 55.690], [12.559, 55.693], [12.567, 55.688], [12.553, 55.682], [12.534, 55.681], [12.528, 55.686], [12.538, 55.690]]] }
  },
  a3: {
    type: "Feature",
    properties: { id: "a3", name: "Amager" },
    geometry: { type: "Polygon", coordinates: [[[12.582, 55.664], [12.606, 55.666], [12.615, 55.659], [12.602, 55.653], [12.578, 55.651], [12.569, 55.657], [12.582, 55.664]]] }
  },
  a4: {
    type: "Feature",
    properties: { id: "a4", name: "Frederiksberg" },
    geometry: { type: "Polygon", coordinates: [[[12.501, 55.676], [12.522, 55.681], [12.539, 55.678], [12.531, 55.670], [12.510, 55.668], [12.499, 55.672], [12.501, 55.676]]] }
  },
};

function getPolygon(id: string): GeoJSON.Feature<GeoJSON.Polygon> | undefined {
  return AREA_POLYGONS[id] ?? MOCK_POLYGONS[id];
}

interface AreaPopup {
  areaId: string;
  areaName: string;
  lng: number;
  lat: number;
}

export default function NytUdkaldPage() {
  const [, setLocation] = useLocation();
  const { areas, isLoading } = useAppData();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [areaColors, setAreaColors] = useState<Record<string, string>>({});
  const [popup, setPopup] = useState<AreaPopup | null>(null);

  const createMutation = useCreateCallout({
    mutation: {
      onSuccess: () => {
        toast({ title: "Udkald oprettet", description: "Udkaldet er gemt som kladde." });
        setLocation("/dashboard");
      },
      onError: () => {
        toast({ title: "Fejl", description: "Kunne ikke oprette udkald.", variant: "destructive" });
      }
    }
  });

  const handleSelectColor = (areaId: string, color: string) => {
    setAreaColors(prev => ({ ...prev, [areaId]: color }));
    setPopup(null);
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Mangler titel", description: "Angiv en titel for udkaldet.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ data: { title, notes: notes || null } });
  };

  // Build GeoJSON FeatureCollection from areas + state-driven colors
  const geojson = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];
    for (const area of areas) {
      const poly = getPolygon(area.id);
      if (!poly) continue;
      features.push({
        ...poly,
        properties: {
          ...(poly.properties ?? {}),
          color: colorHex(areaColors[area.id] ?? "grå"),
          selected: (areaColors[area.id] ?? "grå") !== "grå",
        }
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
      "fill-opacity": ["case", ["get", "selected"], 0.45, 0.18],
    }
  };

  const outlineLayer: LineLayer = {
    id: "areas-outline",
    type: "line",
    source: "areas",
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["case", ["get", "selected"], 2.5, 1.5],
      "line-opacity": ["case", ["get", "selected"], 1, 0.5],
    }
  };

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature || !feature.properties) return;
    const areaId = feature.properties.id as string;
    const areaName = feature.properties.name as string;
    setPopup({ areaId, areaName, lng: e.lngLat.lng, lat: e.lngLat.lat });
  }, []);

  const activeAreasCount = Object.values(areaColors).filter(c => c !== "grå").length;

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
          <Link href="/dashboard" className="p-2 hover:bg-muted rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 shrink-0">
            <Siren className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold leading-tight">Opret Nyt Udkald</h1>
            <p className="text-xs text-muted-foreground">Klik på et område på kortet for at tildele farve</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeAreasCount > 0 && (
            <Badge variant="secondary" className="text-xs px-2.5 py-1">
              {activeAreasCount} {activeAreasCount === 1 ? "område" : "områder"} aktiveret
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard")}>
            Annuller
          </Button>
          <Button size="sm" onClick={handleSave} disabled={createMutation.isPending} className="gap-1.5">
            {createMutation.isPending ? "Gemmer..." : "Gem Kladde"}
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

            {/* Area summary */}
            {areas.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Valgte Områder
                </label>
                <div className="space-y-1">
                  {areas.map(area => {
                    const colorId = areaColors[area.id] ?? "grå";
                    const colorDef = COLOR_DEF.find(c => c.id === colorId);
                    const isActive = colorId !== "grå";
                    return (
                      <button
                        key={area.id}
                        onClick={() => {
                          const poly = getPolygon(area.id);
                          if (poly) {
                            const coords = poly.geometry.coordinates[0];
                            const midIdx = Math.floor(coords.length / 2);
                            setPopup({
                              areaId: area.id,
                              areaName: area.name,
                              lng: coords[midIdx][0],
                              lat: coords[midIdx][1],
                            });
                          }
                        }}
                        className={clsx(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                          isActive ? "bg-muted/80 font-medium" : "text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-white/20 shadow-sm"
                          style={{ backgroundColor: colorDef?.hex ?? "#94a3b8" }}
                        />
                        <span className="truncate flex-1">{area.name}</span>
                        {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Color legend */}
          <div className="p-4 border-t border-border bg-slate-900 dark:bg-slate-950">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Farveforklaring</span>
            </div>
            <div className="space-y-2">
              {COLOR_DEF.map(c => (
                <div key={c.id} className="flex items-center gap-2.5 text-xs">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
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
            <MapPlaceholder areas={areas} areaColors={areaColors} onSelectColor={handleSelectColor} />
          ) : (
            <Map
              initialViewState={{ longitude: 12.5400, latitude: 55.6761, zoom: 11.5 }}
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

              {/* Area labels */}
              {areas.map(area => {
                const poly = getPolygon(area.id);
                if (!poly) return null;
                const coords = poly.geometry.coordinates[0];
                const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
                const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;
                const colorId = areaColors[area.id] ?? "grå";
                const isActive = colorId !== "grå";
                return (
                  <Popup
                    key={area.id + "-label"}
                    longitude={cx}
                    latitude={cy}
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
                  closeButton={true}
                  onClose={() => setPopup(null)}
                  offset={12}
                  maxWidth="260px"
                >
                  <div className="p-2 min-w-[220px]">
                    <p className="font-bold text-sm mb-3 pr-5">{popup.areaName}</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {COLOR_DEF.map(color => {
                        const isSelected = (areaColors[popup.areaId] ?? "grå") === color.id;
                        return (
                          <button
                            key={color.id}
                            onClick={() => handleSelectColor(popup.areaId, color.id)}
                            title={color.label}
                            className={clsx(
                              "flex flex-col items-center gap-1 p-1.5 rounded-lg text-xs transition-all",
                              isSelected ? "ring-2 ring-offset-1 ring-primary bg-muted scale-110" : "hover:bg-muted"
                            )}
                          >
                            <span
                              className="w-6 h-6 rounded-full shadow-sm border border-white/30"
                              style={{ backgroundColor: color.hex }}
                            />
                            <span className="text-[9px] text-muted-foreground leading-none capitalize">{color.id}</span>
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

// Fallback when no MAPBOX_TOKEN — still functional with visual polygon grid
function MapPlaceholder({
  areas,
  areaColors,
  onSelectColor,
}: {
  areas: Array<{ id: string; name: string; description?: string | null }>;
  areaColors: Record<string, string>;
  onSelectColor: (areaId: string, color: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 relative overflow-hidden">
      {/* Faded map background */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center opacity-10 grayscale pointer-events-none" />

      <div className="relative z-10 max-w-lg w-full mx-auto px-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <MapIcon className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground font-medium">
            Tilføj <code className="bg-muted px-1 rounded text-xs">VITE_MAPBOX_TOKEN</code> for live kort.
            Du kan stadig vælge farver nedenfor:
          </p>
        </div>

        {areas.map(area => {
          const colorId = areaColors[area.id] ?? "grå";
          const colorDef = COLOR_DEF.find(c => c.id === colorId);
          const isOpen = open === area.id;

          return (
            <div
              key={area.id}
              className="bg-card border border-border rounded-xl shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setOpen(isOpen ? null : area.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full border border-white/20 shadow"
                    style={{ backgroundColor: colorDef?.hex ?? "#94a3b8" }}
                  />
                  <div className="text-left">
                    <p className="font-semibold text-sm">{area.name}</p>
                    <p className="text-xs text-muted-foreground">{colorDef?.label}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">Klik for at ændre →</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 flex gap-2 border-t border-border pt-3 bg-muted/20">
                  {COLOR_DEF.map(color => {
                    const isSel = colorId === color.id;
                    return (
                      <button
                        key={color.id}
                        onClick={() => { onSelectColor(area.id, color.id); setOpen(null); }}
                        title={color.label}
                        className={clsx(
                          "flex flex-col items-center gap-1 p-2 rounded-xl transition-all flex-1",
                          isSel ? "bg-background shadow ring-2 ring-primary scale-105" : "hover:bg-background/60"
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
