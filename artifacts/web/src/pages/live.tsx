import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Map, { Source, Layer, NavigationControl, MapRef } from "react-map-gl/mapbox";
import type { MapLayerMouseEvent, CircleLayer, SymbolLayer, FillLayer, LineLayer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { AlertTriangle, Navigation, X, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const LEVEL_LABEL: Record<string, string> = { vip: "VIP", hoj: "HØJ", lav: "LAV", basis: "BASIS" };
const LEVEL_HEX: Record<string, string> = {
  vip: "#f97316",
  hoj: "#3b82f6",
  lav: "#ef4444",
  basis: "#22c55e",
};

interface LiveSite {
  id: string;
  name: string;
  address?: string | null;
  level: string;
  dayRule: string;
  lat: number;
  lng: number;
  postalCode?: string | null;
  city?: string | null;
  codeKey?: string | null;
  iceControl?: string | null;
  app?: string | null;
  bigCustomer?: string | null;
}

interface LiveCallout {
  id: string;
  title: string;
  notes?: string | null;
  status: string;
  createdAt: string;
  totalSites: number;
  sites: LiveSite[];
}

const LEVELS = ["vip", "hoj", "lav", "basis"] as const;

export default function LivePage() {
  const { calloutId } = useParams<{ calloutId: string }>();
  const mapRef = useRef<MapRef>(null);
  const hoveredFeatureIdRef = useRef<number | string | null>(null);

  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<LiveSite | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [cursor, setCursor] = useState("grab");

  const { data, isLoading, error } = useQuery<LiveCallout>({
    queryKey: ["live-callout", calloutId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/callouts/${calloutId}/live`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Fejl ved hentning af udkald");
      }
      return res.json();
    },
    enabled: !!calloutId,
  });

  const { data: siteGeo } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ["live-geometries", calloutId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/callouts/${calloutId}/geometries`);
      if (!res.ok) throw new Error("Fejl");
      return res.json();
    },
    enabled: !!calloutId,
  });

  // Filtered sites based on active level
  const visibleSites = useMemo(() => {
    if (!data?.sites) return [];
    if (!activeLevel) return data.sites;
    return data.sites.filter(s => s.level === activeLevel);
  }, [data?.sites, activeLevel]);

  // GeoJSON for clustering
  const sitesGeoJson = useMemo((): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: visibleSites.map(s => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        address: s.address ?? null,
        level: s.level,
        dayRule: s.dayRule,
        lat: s.lat,
        lng: s.lng,
      },
    })),
  }), [visibleSites]);

  // Auto-fit map to sites bounds when data loads
  useEffect(() => {
    if (!mapReady || !visibleSites.length || !mapRef.current) return;
    const lngs = visibleSites.map(s => s.lng);
    const lats = visibleSites.map(s => s.lat);
    const dx = Math.max(...lngs) - Math.min(...lngs);
    const dy = Math.max(...lats) - Math.min(...lats);
    if (dx < 0.001 && dy < 0.001) {
      mapRef.current.getMap().easeTo({
        center: [lngs[0], lats[0]],
        zoom: 14,
        duration: 800,
      });
    } else {
      mapRef.current.getMap().fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, maxZoom: 15, duration: 800 }
      );
    }
  }, [mapReady, data?.id]); // only re-fit when callout data arrives

  // ── Layer definitions (mobile-tuned) ────────────────────────────────────────

  const clusterCircleLayer: CircleLayer = {
    id: "live-clusters",
    type: "circle",
    source: "live-sites",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        ["step", ["get", "point_count"], "#475569", 10, "#334155", 30, "#1e293b"],
        ["step", ["get", "point_count"], "#64748b", 10, "#475569", 30, "#334155"],
      ],
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        ["step", ["get", "point_count"], 22, 10, 26, 30, 30],
        ["step", ["get", "point_count"], 19, 10, 23, 30, 27],
      ],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.92,
    },
  };

  const clusterCountLayer: SymbolLayer = {
    id: "live-cluster-count",
    type: "symbol",
    source: "live-sites",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 14,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff" },
  };

  const pointLayer: CircleLayer = {
    id: "live-point",
    type: "circle",
    source: "live-sites",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match", ["get", "level"],
        "vip", "#f97316",
        "hoj", "#3b82f6",
        "lav", "#ef4444",
        "#22c55e",
      ],
      "circle-radius": 11,
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.95,
    },
  };

  const siteGeoFillLayer: FillLayer = {
    id: "live-site-geo-fill",
    type: "fill",
    source: "live-site-geo",
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
    paint: { "fill-color": ["coalesce", ["get", "color"], "#888888"], "fill-opacity": 0.4 },
  };
  const siteGeoOutlineLayer: LineLayer = {
    id: "live-site-geo-outline",
    type: "line",
    source: "live-site-geo",
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
    paint: { "line-color": ["coalesce", ["get", "color"], "#888888"], "line-width": 2, "line-opacity": 0.95 },
  };
  const siteGeoLineLayer: LineLayer = {
    id: "live-site-geo-lines",
    type: "line",
    source: "live-site-geo",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": ["coalesce", ["get", "color"], "#888888"], "line-width": 3, "line-opacity": 0.9 },
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function clearHoverState(mapInstance: ReturnType<MapRef["getMap"]>) {
    if (hoveredFeatureIdRef.current !== null) {
      mapInstance.setFeatureState(
        { source: "live-sites", id: hoveredFeatureIdRef.current },
        { hover: false }
      );
      hoveredFeatureIdRef.current = null;
    }
  }

  // ── Click handler ─────────────────────────────────────────────────────────

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    const features = e.features;
    if (!features?.length) {
      setSelectedSite(null);
      return;
    }
    const feature = features[0];
    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

    if (feature.properties?.cluster) {
      const clusterId = feature.properties.cluster_id as number;
      const mapInstance = mapRef.current?.getMap();
      if (!mapInstance) return;
      const source = mapInstance.getSource("live-sites") as any;
      if (!source) return;

      source.getClusterExpansionZoom(clusterId, (err: unknown, expansionZoom: number) => {
        if (err) return;
        if (expansionZoom > 17) {
          // Same-location cluster — select first site (could show list in future)
          source.getClusterLeaves(clusterId, 20, 0, (err2: unknown, leaves: GeoJSON.Feature[]) => {
            if (err2 || !leaves?.length) return;
            const p = leaves[0].properties as Record<string, unknown>;
            setSelectedSite({
              id: String(p.id ?? ""),
              name: String(p.name ?? ""),
              address: p.address != null ? String(p.address) : null,
              level: String(p.level ?? "basis"),
              dayRule: String(p.dayRule ?? "altid"),
              lat: Number(p.lat ?? lat),
              lng: Number(p.lng ?? lng),
            });
          });
        } else {
          setSelectedSite(null);
          source.getClusterLeaves(clusterId, 500, 0, (err2: unknown, leaves: GeoJSON.Feature[]) => {
            if (err2 || !leaves?.length) {
              mapInstance.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: 400 });
              return;
            }
            const lngs = (leaves as GeoJSON.Feature[]).map(f => ((f.geometry as GeoJSON.Point).coordinates)[0]);
            const lats = (leaves as GeoJSON.Feature[]).map(f => ((f.geometry as GeoJSON.Point).coordinates)[1]);
            const dx = Math.max(...lngs) - Math.min(...lngs);
            const dy = Math.max(...lats) - Math.min(...lats);
            if (dx < 0.0005 && dy < 0.0005) {
              mapInstance.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: 400 });
            } else {
              mapInstance.fitBounds(
                [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                { padding: 80, maxZoom: expansionZoom, duration: 600 }
              );
            }
          });
        }
      });
    } else {
      const p = feature.properties as Record<string, unknown>;
      setSelectedSite({
        id: String(p.id ?? ""),
        name: String(p.name ?? ""),
        address: p.address != null ? String(p.address) : null,
        level: String(p.level ?? "basis"),
        dayRule: String(p.dayRule ?? "altid"),
        lat: Number(p.lat ?? lat),
        lng: Number(p.lng ?? lng),
      });
    }
  }, []);

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const mapInstance = mapRef.current?.getMap();
    if (!mapInstance) return;
    const clusterFeature = e.features?.find(f => f.properties?.cluster);
    if (clusterFeature) {
      const fid = clusterFeature.id as number | string;
      if (hoveredFeatureIdRef.current !== fid) {
        clearHoverState(mapInstance);
        mapInstance.setFeatureState({ source: "live-sites", id: fid }, { hover: true });
        hoveredFeatureIdRef.current = fid;
      }
      setCursor("pointer");
    } else {
      clearHoverState(mapInstance);
      setCursor(e.features?.length ? "pointer" : "grab");
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const mapInstance = mapRef.current?.getMap();
    if (mapInstance) clearHoverState(mapInstance);
    setCursor("grab");
  }, []);

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Indlæser udkald…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="text-center max-w-xs space-y-3">
          <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto" />
          <h2 className="font-bold text-lg">Udkald ikke fundet</h2>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Linket er ugyldigt eller udkaldet findes ikke."}
          </p>
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="text-center max-w-xs space-y-3">
          <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto" />
          <h2 className="font-bold text-lg">Kort ikke tilgængeligt</h2>
          <p className="text-sm text-muted-foreground">WebGL kræves. Prøv en anden browser.</p>
          <code className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded block">{mapError}</code>
        </div>
      </div>
    );
  }

  // Level counts in the data
  const levelCounts = LEVELS.reduce<Record<string, number>>((acc, l) => {
    acc[l] = (data.sites ?? []).filter(s => s.level === l).length;
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* ── Full-screen map ── */}
      {MAPBOX_TOKEN ? (
        <Map
          ref={mapRef}
          initialViewState={{ longitude: 9.5, latitude: 56.3, zoom: 7 }}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
          style={{ width: "100%", height: "100%" }}
          cursor={cursor}
          interactiveLayerIds={["live-clusters", "live-point"]}
          onClick={handleMapClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onLoad={() => setMapReady(true)}
          onError={e => setMapError(e.error?.message ?? "Kortfejl")}
        >
          <NavigationControl position="bottom-right" style={{ marginBottom: "160px" }} />

          {siteGeo && (
            <Source id="live-site-geo" type="geojson" data={siteGeo}>
              <Layer {...siteGeoFillLayer} />
              <Layer {...siteGeoOutlineLayer} />
              <Layer {...siteGeoLineLayer} />
            </Source>
          )}

          <Source
            id="live-sites"
            type="geojson"
            data={sitesGeoJson}
            cluster={true}
            clusterMaxZoom={17}
            clusterRadius={45}
            generateId={true}
            clusterProperties={{
              vip_count:   ["+", ["case", ["==", ["get", "level"], "vip"],   1, 0]],
              hoj_count:   ["+", ["case", ["==", ["get", "level"], "hoj"],   1, 0]],
              lav_count:   ["+", ["case", ["==", ["get", "level"], "lav"],   1, 0]],
              basis_count: ["+", ["case", ["==", ["get", "level"], "basis"], 1, 0]],
            }}
          >
            <Layer {...clusterCircleLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...pointLayer} />
          </Source>
        </Map>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-100">
          <p className="text-muted-foreground text-sm">Mapbox-token mangler</p>
        </div>
      )}

      {/* ── Top info card ── */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-10">
        <div className="mx-4 mt-4 pointer-events-auto">
          <div className="bg-white/96 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 px-4 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="font-display font-bold text-base leading-tight truncate">
                  {data.title}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.totalSites} pladser i udkald
                  {activeLevel && (
                    <span className="ml-1.5 font-medium" style={{ color: LEVEL_HEX[activeLevel] }}>
                      · filtreret: {LEVEL_LABEL[activeLevel]} ({levelCounts[activeLevel] ?? 0})
                    </span>
                  )}
                </p>
              </div>
              <div
                className="flex items-center justify-center rounded-full text-xs font-bold shrink-0 w-8 h-8"
                style={{
                  backgroundColor: (activeLevel ? LEVEL_HEX[activeLevel] : "#64748b") + "20",
                  color: activeLevel ? LEVEL_HEX[activeLevel] : "#64748b",
                }}
              >
                {activeLevel ? levelCounts[activeLevel] ?? 0 : data.totalSites}
              </div>
            </div>

            {data.notes && (
              <>
                <button
                  onClick={() => setNotesExpanded(!notesExpanded)}
                  className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors"
                >
                  {notesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {notesExpanded ? "Skjul noter" : "Vis noter"}
                </button>
                {notesExpanded && (
                  <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed">
                    {data.notes}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Level filter bar (bottom) ── */}
      <div
        className={clsx(
          "absolute left-0 right-0 pointer-events-none z-10 transition-all duration-300",
          selectedSite ? "bottom-[200px]" : "bottom-0"
        )}
      >
        <div className="mx-4 mb-4 pointer-events-auto">
          <div className="bg-white/96 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 px-3 py-2.5">
            <div className="flex gap-2 overflow-x-auto scrollbar-none items-center">
              <button
                onClick={() => setActiveLevel(null)}
                className={clsx(
                  "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all",
                  !activeLevel
                    ? "bg-slate-700 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                Alle ({data.totalSites})
              </button>
              {LEVELS.filter(l => levelCounts[l] > 0).map(level => (
                <button
                  key={level}
                  onClick={() => setActiveLevel(activeLevel === level ? null : level)}
                  className={clsx(
                    "shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all",
                    activeLevel === level
                      ? "text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                  style={activeLevel === level ? { backgroundColor: LEVEL_HEX[level] } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: activeLevel === level ? "#ffffff80" : LEVEL_HEX[level] }}
                  />
                  {LEVEL_LABEL[level]} ({levelCounts[level]})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Site bottom sheet ── */}
      {selectedSite && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
          <div className="bg-white rounded-t-3xl shadow-2xl border-t border-border/40 px-5 pt-4 pb-safe-bottom pb-6">
            {/* Handle bar */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: LEVEL_HEX[selectedSite.level] ?? "#94a3b8" }}
                />
                <div className="min-w-0">
                  <span
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: LEVEL_HEX[selectedSite.level] ?? "#64748b" }}
                  >
                    {LEVEL_LABEL[selectedSite.level] ?? selectedSite.level}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1.5">
                    · {selectedSite.dayRule === "altid" ? "Alle dage" : "Kun hverdage"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedSite(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <h2 className="font-bold text-lg leading-tight mb-0.5">{selectedSite.name}</h2>

            {selectedSite.address && (
              <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
                {[selectedSite.address, [selectedSite.postalCode, selectedSite.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
              </p>
            )}

            {/* Extra fields grid */}
            {(selectedSite.codeKey || selectedSite.iceControl || selectedSite.app || selectedSite.bigCustomer) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
                {selectedSite.codeKey && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">KodeNøgle</p>
                    <p className="text-sm font-medium">{selectedSite.codeKey}</p>
                  </div>
                )}
                {selectedSite.iceControl && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Strømiddel</p>
                    <p className="text-sm font-medium">{selectedSite.iceControl}</p>
                  </div>
                )}
                {selectedSite.app && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">App</p>
                    <p className="text-sm font-medium">{selectedSite.app}</p>
                  </div>
                )}
                {selectedSite.bigCustomer && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Storkunde</p>
                    <p className="text-sm font-medium">{selectedSite.bigCustomer}</p>
                  </div>
                )}
              </div>
            )}

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSite.lat},${selectedSite.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl font-semibold text-sm text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: LEVEL_HEX[selectedSite.level] ?? "#3b82f6" }}
            >
              <Navigation className="w-4 h-4" />
              Naviger hertil
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
