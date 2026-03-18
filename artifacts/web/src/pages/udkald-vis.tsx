import React, { useMemo, useState } from "react";
import Map, { Source, Layer, Popup, NavigationControl } from "react-map-gl/mapbox";
import type { FillLayer, LineLayer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Siren,
  MapPin,
  Calendar,
  ArrowLeft,
  Copy,
  CheckCheck,
  Info,
  Map as MapIcon,
  ChevronDown,
  ChevronUp,
  Users,
  AlertTriangle,
  Truck,
} from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";
import { da } from "date-fns/locale";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
console.log("[VinterDrift/udkald-vis] VITE_MAPBOX_TOKEN present:", !!MAPBOX_TOKEN, MAPBOX_TOKEN?.slice(0, 8));
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const COLOR_DEF = [
  { id: "grå",    label: "Ingen",           hex: "#94a3b8", activates: "Ingen kørsel" },
  { id: "orange", label: "Kun VIP",         hex: "#f97316", activates: "VIP" },
  { id: "blå",    label: "HØJ + VIP",       hex: "#3b82f6", activates: "VIP, Høj" },
  { id: "rød",    label: "LAV + HØJ + VIP", hex: "#ef4444", activates: "VIP, Høj, Lav" },
  { id: "grøn",   label: "Alle pladser",    hex: "#22c55e", activates: "VIP, Høj, Lav, Basis" },
] as const;

const LEVEL_LABEL: Record<string, string> = { vip: "VIP", hoj: "HØJ", lav: "LAV", basis: "BASIS" };
const LEVEL_HEX: Record<string, string> = {
  vip: "#f97316", hoj: "#3b82f6", lav: "#ef4444", basis: "#22c55e",
};

function colorHex(c: string) {
  return COLOR_DEF.find(d => d.id === c)?.hex ?? "#94a3b8";
}
function colorLabel(c: string) {
  return COLOR_DEF.find(d => d.id === c)?.label ?? c;
}

interface SiteSnap {
  name: string;
  level: string;
  address?: string | null;
}

interface CalloutArea {
  id: string;
  name: string;
  color: string;
  geometry: GeoJSON.Feature<GeoJSON.Polygon> | null;
  siteCount: number;
  sites: SiteSnap[];
}

interface CalloutMapData {
  id: string;
  title: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  startedAt?: string | null;
  areas: CalloutArea[];
  totalSites: number;
}

function computeCentroid(coords: number[][]): [number, number] {
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lng, lat];
}

const STATUS_LABELS: Record<string, string> = {
  kladde: "Kladde",
  aktiv: "Aktiv",
  afsluttet: "Afsluttet",
  annulleret: "Annulleret",
};

const STATUS_COLORS: Record<string, string> = {
  kladde: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  aktiv: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  afsluttet: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  annulleret: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function AreaSiteList({ area }: { area: CalloutArea }) {
  const [expanded, setExpanded] = useState(false);
  if (area.siteCount === 0) return null;
  const shown = expanded ? area.sites : area.sites.slice(0, 4);

  return (
    <div className="mt-1.5 pl-5 space-y-0.5">
      {shown.map((site, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px]">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: LEVEL_HEX[site.level] ?? "#94a3b8" }}
          />
          <span className="text-muted-foreground truncate">{site.name}</span>
          <span className="text-muted-foreground/50 text-[9px] ml-auto shrink-0">
            {LEVEL_LABEL[site.level] ?? site.level}
          </span>
        </div>
      ))}
      {area.sites.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1"
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3" /> Vis færre</>
            : <><ChevronDown className="w-3 h-3" /> + {area.sites.length - 4} flere</>}
        </button>
      )}
    </div>
  );
}

export default function UdkaldVisPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CalloutMapData>({
    queryKey: ["callout-map", params.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/callouts/${params.id}/map`);
      if (!res.ok) throw new Error("Udkald ikke fundet");
      return res.json();
    },
    enabled: !!params.id,
  });

  const { data: siteGeo } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ["callout-geometries", params.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/callouts/${params.id}/geometries`);
      if (!res.ok) throw new Error("Fejl");
      return res.json();
    },
    enabled: !!params.id,
  });

  const geojson = useMemo((): GeoJSON.FeatureCollection => {
    if (!data) return { type: "FeatureCollection", features: [] };
    const features: GeoJSON.Feature[] = [];
    for (const area of data.areas) {
      if (!area.geometry) continue;
      features.push({
        type: "Feature",
        properties: { id: area.id, name: area.name, color: colorHex(area.color) },
        geometry: area.geometry.geometry,
      });
    }
    return { type: "FeatureCollection", features };
  }, [data]);

  const fillLayer: FillLayer = {
    id: "areas-fill",
    type: "fill",
    source: "areas",
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 },
  };

  const outlineLayer: LineLayer = {
    id: "areas-outline",
    type: "line",
    source: "areas",
    paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.95 },
  };

  const siteGeoFillLayer: FillLayer = {
    id: "site-geo-fill",
    type: "fill",
    source: "site-geo",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": ["coalesce", ["get", "color"], "#888888"], "fill-opacity": 0.4 },
  };

  const siteGeoOutlineLayer: LineLayer = {
    id: "site-geo-outline",
    type: "line",
    source: "site-geo",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "line-color": ["coalesce", ["get", "color"], "#888888"], "line-width": 1.5, "line-opacity": 0.9 },
  };

  const siteGeoLineLayer: LineLayer = {
    id: "site-geo-lines",
    type: "line",
    source: "site-geo",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": ["coalesce", ["get", "color"], "#888888"], "line-width": 2.5, "line-opacity": 0.85 },
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">Udkald ikke fundet</p>
          <p className="text-sm text-muted-foreground">
            Udkaldet eksisterer ikke eller er blevet slettet.
          </p>
          <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard")}>
            Til Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const activeAreas = data.areas.filter(a => a.color !== "grå");
  const inactiveAreas = data.areas.filter(a => a.color === "grå");
  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const statusClass = STATUS_COLORS[data.status] ?? "bg-muted text-muted-foreground";
  const totalSites = data.totalSites ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3 flex items-start justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setLocation("/dashboard")}
            className="p-2 hover:bg-muted rounded-full transition-colors mt-0.5 shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
            <Siren className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-display font-bold leading-tight truncate">
                {data.title}
              </h1>
              <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full", statusClass)}>
                {statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(data.createdAt), "d. MMM yyyy HH:mm", { locale: da })}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {activeAreas.length} {activeAreas.length === 1 ? "område" : "områder"}
              </span>
              {totalSites > 0 && (
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <Users className="w-3 h-3" />
                  {totalSites} pladser
                </span>
              )}
            </div>
            {data.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic max-w-xl">{data.notes}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="gap-1.5"
          >
            {copied ? (
              <><CheckCheck className="w-3.5 h-3.5 text-green-600" /> Kopieret!</>
            ) : (
              <><Copy className="w-3.5 h-3.5" /> Kopier link</>
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
              const liveUrl = window.location.origin + base + `/live/${data.id}`;
              window.open(liveUrl, "_blank", "noopener");
            }}
          >
            <Truck className="w-3.5 h-3.5" />
            Chaufførvisning
          </Button>
        </div>
      </div>

      {/* Body: Sidebar + Map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="w-72 shrink-0 bg-card border-r border-border flex flex-col overflow-hidden z-10">
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">

              {/* Site totals summary */}
              {totalSites > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                    Pladser i udkald
                  </p>
                  {activeAreas.length > 0 && (
                    <div className="space-y-0.5">
                      {activeAreas.map(a =>
                        a.siteCount > 0 ? (
                          <div key={a.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorHex(a.color) }} />
                              <span className="text-muted-foreground truncate max-w-[140px]">{a.name}</span>
                            </div>
                            <span className="font-semibold text-foreground">{a.siteCount}</span>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                  {/* I alt */}
                  <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-primary/20">
                    <span className="font-bold text-primary">I alt</span>
                    <span className="font-bold text-primary text-base">{totalSites}</span>
                  </div>
                </div>
              )}

              {/* Active areas with site lists */}
              {activeAreas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Aktive Områder
                  </p>
                  <div className="space-y-2">
                    {activeAreas.map(area => (
                      <div key={area.id} className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-white/20 shadow-sm"
                            style={{ backgroundColor: colorHex(area.color) }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">{area.name}</p>
                            <p className="text-[10px] text-muted-foreground">{colorLabel(area.color)}</p>
                          </div>
                          {area.siteCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {area.siteCount}
                            </Badge>
                          )}
                        </div>
                        <AreaSiteList area={area} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive areas */}
              {inactiveAreas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Inaktive Områder
                  </p>
                  <div className="space-y-0.5">
                    {inactiveAreas.map(area => (
                      <div key={area.id} className="flex items-center gap-2 px-2 py-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-300 dark:bg-slate-600" />
                        <p className="text-xs text-muted-foreground truncate">{area.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeAreas.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Ingen områder aktiveret.</p>
              )}
            </div>
          </div>

          {/* Color legend */}
          <div className="p-4 border-t border-border bg-slate-900 dark:bg-slate-950 shrink-0">
            <div className="flex items-center gap-2 mb-2.5">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">
                Farveforklaring
              </span>
            </div>
            <div className="space-y-1.5">
              {COLOR_DEF.filter(c => c.id !== "grå").map(c => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                  <span className="text-slate-300 font-medium text-[11px]">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Map — main view */}
        <div className="flex-1 relative">
          {!MAPBOX_TOKEN ? (
            <NoMapFallback data={data} />
          ) : mapError ? (
            <WebGLError message={mapError} />
          ) : (
            <Map
              initialViewState={{ longitude: 9.5, latitude: 56.3, zoom: 7 }}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: "100%", height: "100%" }}
              onError={e => { console.error("[VinterDrift/udkald-vis] Map error:", e.error); setMapError(e.error?.message ?? "Kortfejl"); }}
            >
              <NavigationControl position="bottom-right" />

              {/* Site geometries with color-coded types */}
              {siteGeo && (
                <Source id="site-geo" type="geojson" data={siteGeo}>
                  <Layer {...siteGeoFillLayer} />
                  <Layer {...siteGeoOutlineLayer} />
                  <Layer {...siteGeoLineLayer} />
                </Source>
              )}

              <Source id="areas" type="geojson" data={geojson}>
                <Layer {...fillLayer} />
                <Layer {...outlineLayer} />
              </Source>

              {/* Area name labels */}
              {data.areas.map(area => {
                if (!area.geometry) return null;
                const coords = area.geometry.geometry.coordinates[0];
                const [lng, lat] = computeCentroid(coords);
                const isActive = area.color !== "grå";
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
                        isActive ? "text-white" : "text-slate-500 bg-white/70 opacity-60"
                      )}
                      style={isActive ? { backgroundColor: colorHex(area.color) } : {}}
                    >
                      {area.name}
                      {isActive && area.siteCount > 0 && (
                        <span className="ml-1.5 opacity-80 text-[10px]">({area.siteCount})</span>
                      )}
                    </div>
                  </Popup>
                );
              })}
            </Map>
          )}
        </div>
      </div>
    </div>
  );
}

function WebGLError({ message }: { message: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">
      <div className="text-center p-8 max-w-sm bg-background/90 backdrop-blur rounded-2xl shadow-xl border border-orange-200 dark:border-orange-800">
        <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
        <h3 className="font-bold text-base mb-1">WebGL ikke tilgængeligt</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Kortvisningen kræver WebGL-understøttelse. Prøv en anden browser.
        </p>
        <code className="text-xs text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded block">
          {message}
        </code>
      </div>
    </div>
  );
}

function NoMapFallback({ data }: { data: CalloutMapData }) {
  const activeAreas = data.areas.filter(a => a.color !== "grå");
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">
      <div className="text-center space-y-4 p-8 max-w-sm">
        <MapIcon className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Tilføj <code className="bg-muted px-1 rounded text-xs">VITE_MAPBOX_TOKEN</code> for at se kortet.
        </p>
        {data.totalSites > 0 && (
          <div className="bg-card rounded-xl border p-4 text-left space-y-2 min-w-[220px]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Inkluderede pladser
            </p>
            <div className="space-y-1.5">
              {activeAreas.map(area => (
                <div key={area.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorHex(area.color) }} />
                    <span>{area.name}</span>
                  </div>
                  <span className="font-semibold">{area.siteCount}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-bold">I alt</span>
              <span className="text-lg font-bold">{data.totalSites}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
