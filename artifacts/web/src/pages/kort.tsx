import React, { useState, useMemo, useCallback, useRef } from "react";
import Map, { Source, Layer, NavigationControl, Popup, MapRef } from "react-map-gl/mapbox";
import type { MapLayerMouseEvent, FillLayer, LineLayer, CircleLayer, SymbolLayer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery } from "@tanstack/react-query";
import {
  Filter, Map as MapIcon, CheckCircle2,
  ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { clsx } from "clsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
console.log("[VinterDrift/kort] VITE_MAPBOX_TOKEN present:", !!MAPBOX_TOKEN, MAPBOX_TOKEN?.slice(0, 8));
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const LEVEL_LABEL: Record<string, string> = { vip: "VIP", hoj: "HØJ", lav: "LAV", basis: "BASIS" };
const LEVEL_HEX: Record<string, string> = {
  vip: "#f97316",
  hoj: "#3b82f6",
  lav: "#ef4444",
  basis: "#22c55e",
};

interface SiteMarker {
  id: string;
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  codeKey?: string | null;
  iceControl?: string | null;
  app?: string | null;
  bigCustomer?: string | null;
  level: string;
  dayRule: string;
  active: boolean;
  areaId: string;
  notes?: string | null;
  lat: number;
  lng: number;
  label?: string | null;
}

interface Area {
  id: string;
  name: string;
  geometry: { geometry: { type: string; coordinates: number[][][] } } | null;
}

type PopupState =
  | { type: "site"; site: SiteMarker; lng: number; lat: number }
  | { type: "cluster"; sites: SiteMarker[]; lng: number; lat: number };

interface TooltipState {
  x: number;
  y: number;
  count: number;
  vip: number;
  hoj: number;
  lav: number;
  basis: number;
}

export default function KortPage() {
  const mapRef = useRef<MapRef>(null);
  // Ref so onMouseMove callback is stable (no re-creation on every hover)
  const hoveredFeatureIdRef = useRef<number | string | null>(null);

  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [popupState, setPopupState] = useState<PopupState | null>(null);
  const [showGeo, setShowGeo] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [geoExpanded, setGeoExpanded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [cursor, setCursor] = useState("grab");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const params = new URLSearchParams();
  if (selectedArea) params.set("areaId", selectedArea);
  if (selectedLevels.size === 1) params.set("level", [...selectedLevels][0]);
  if (showInactive) params.set("active", "false");

  const { data: sites = [], isLoading: sitesLoading } = useQuery<SiteMarker[]>({
    queryKey: ["sites-map", selectedArea, [...selectedLevels].sort().join(","), showInactive],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites/map?${params}`);
      if (!res.ok) throw new Error("Fejl ved hentning af pladser");
      return res.json();
    },
  });

  const { data: siteGeo } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ["sites-geometries", selectedArea, [...selectedLevels].sort().join(",")],
    queryFn: async () => {
      const geoParams = new URLSearchParams();
      if (selectedArea) geoParams.set("areaId", selectedArea);
      if (selectedLevels.size === 1) geoParams.set("level", [...selectedLevels][0]);
      const res = await fetch(`${BASE}/api/sites/geometries?${geoParams}`);
      if (!res.ok) throw new Error("Fejl");
      return res.json();
    },
    enabled: showGeo,
  });

  const { data: areasWithGeo = [] } = useQuery<Area[]>({
    queryKey: ["areas-with-geometry"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/areas-with-geometry`);
      if (!res.ok) throw new Error("Fejl");
      return res.json();
    },
    enabled: showAreas,
  });

  const filteredSites = useMemo(() => {
    if (selectedLevels.size === 0 || selectedLevels.size === 4) return sites;
    return sites.filter(s => selectedLevels.has(s.level));
  }, [sites, selectedLevels]);

  // GeoJSON with all site props as feature properties
  const sitesGeoJson = useMemo((): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: filteredSites.map(s => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        address: s.address ?? null,
        level: s.level,
        dayRule: s.dayRule,
        active: s.active,
        areaId: s.areaId,
        lat: s.lat,
        lng: s.lng,
      },
    })),
  }), [filteredSites]);

  // Area polygons GeoJSON
  const areasGeoJson = useMemo((): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: areasWithGeo
      .filter(a => a.geometry)
      .map(a => ({
        type: "Feature" as const,
        properties: { id: a.id, name: a.name },
        geometry: a.geometry!.geometry as GeoJSON.Polygon,
      })),
  }), [areasWithGeo]);

  // ── Layer definitions ───────────────────────────────────────────────────────

  const areaFillLayer: FillLayer = {
    id: "areas-fill",
    type: "fill",
    source: "areas",
    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.08 },
  };
  const areaOutlineLayer: LineLayer = {
    id: "areas-outline",
    type: "line",
    source: "areas",
    paint: { "line-color": "#60a5fa", "line-width": 2, "line-opacity": 0.75 },
  };

  const geoLineLayer: LineLayer = {
    id: "site-geo-lines",
    type: "line",
    source: "site-geo",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#888888"],
      "line-width": 3,
      "line-opacity": 0.9,
    },
  };
  const geoFillLayer: FillLayer = {
    id: "site-geo-fill",
    type: "fill",
    source: "site-geo",
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
    paint: {
      "fill-color": ["coalesce", ["get", "color"], "#888888"],
      "fill-opacity": 0.4,
    },
  };
  const geoOutlineLayer: LineLayer = {
    id: "site-geo-outline",
    type: "line",
    source: "site-geo",
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#888888"],
      "line-width": 2,
      "line-opacity": 0.95,
    },
  };

  // Cluster circles — hover state changes size and color via feature-state
  const clusterCircleLayer: CircleLayer = {
    id: "clusters",
    type: "circle",
    source: "sites",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        // hovered: darker shade
        ["step", ["get", "point_count"], "#475569", 10, "#334155", 30, "#1e293b"],
        // normal
        ["step", ["get", "point_count"], "#64748b", 10, "#475569", 30, "#334155"],
      ],
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        // hovered: 3px larger
        ["step", ["get", "point_count"], 19, 10, 23, 30, 27],
        // normal
        ["step", ["get", "point_count"], 16, 10, 20, 30, 24],
      ],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.9,
    },
  };

  // Cluster count label
  const clusterCountLayer: SymbolLayer = {
    id: "cluster-count",
    type: "symbol",
    source: "sites",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 13,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff" },
  };

  // Individual (unclustered) site markers
  const unclusteredPointLayer: CircleLayer = {
    id: "unclustered-point",
    type: "circle",
    source: "sites",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match", ["get", "level"],
        "vip", "#f97316",
        "hoj", "#3b82f6",
        "lav", "#ef4444",
        "#22c55e",
      ],
      "circle-radius": 8,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.95,
    },
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function clearHoverState(mapInstance: ReturnType<MapRef["getMap"]>) {
    if (hoveredFeatureIdRef.current !== null) {
      mapInstance.setFeatureState(
        { source: "sites", id: hoveredFeatureIdRef.current },
        { hover: false }
      );
      hoveredFeatureIdRef.current = null;
    }
  }

  // ── Click handler ────────────────────────────────────────────────────────────

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    const features = e.features;
    if (!features?.length) {
      setPopupState(null);
      return;
    }

    const feature = features[0];
    const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
    const [lng, lat] = coords;

    if (feature.properties?.cluster) {
      const clusterId = feature.properties.cluster_id as number;
      const mapInstance = mapRef.current?.getMap();
      if (!mapInstance) return;
      const source = mapInstance.getSource("sites") as any;
      if (!source) return;

      // Step 1: find expansion zoom
      source.getClusterExpansionZoom(clusterId, (err: unknown, expansionZoom: number) => {
        if (err) return;

        if (expansionZoom > 17) {
          // Points won't separate → show list popup
          source.getClusterLeaves(clusterId, 100, 0, (err2: unknown, leaves: GeoJSON.Feature[]) => {
            if (err2 || !leaves) return;
            const clusterSites = (leaves as GeoJSON.Feature[])
              .map(f => f.properties as SiteMarker)
              .filter(Boolean)
              .sort((a, b) => {
                const order: Record<string, number> = { vip: 0, hoj: 1, lav: 2, basis: 3 };
                return (order[a.level] ?? 4) - (order[b.level] ?? 4);
              });
            setPopupState({ type: "cluster", sites: clusterSites, lng, lat });
          });
        } else {
          // Step 2: fetch all leaves to compute actual bounding box
          source.getClusterLeaves(clusterId, 500, 0, (err2: unknown, leaves: GeoJSON.Feature[]) => {
            setPopupState(null);
            if (err2 || !leaves?.length) {
              mapInstance.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: 500 });
              return;
            }
            const lngs = (leaves as GeoJSON.Feature[]).map(
              f => ((f.geometry as GeoJSON.Point).coordinates)[0]
            );
            const lats = (leaves as GeoJSON.Feature[]).map(
              f => ((f.geometry as GeoJSON.Point).coordinates)[1]
            );
            const dx = Math.max(...lngs) - Math.min(...lngs);
            const dy = Math.max(...lats) - Math.min(...lats);

            if (dx < 0.0005 && dy < 0.0005) {
              // Points are essentially at the same spot — just zoom there
              mapInstance.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: 400 });
            } else {
              // Fit to the actual geographic bounds of the cluster's leaves
              mapInstance.fitBounds(
                [
                  [Math.min(...lngs), Math.min(...lats)],
                  [Math.max(...lngs), Math.max(...lats)],
                ],
                { padding: 80, maxZoom: expansionZoom, duration: 600 }
              );
            }
          });
        }
      });
    } else {
      // Single unclustered point
      const p = feature.properties as Record<string, unknown>;
      const site: SiteMarker = {
        id: String(p.id ?? ""),
        name: String(p.name ?? ""),
        address: p.address != null ? String(p.address) : null,
        level: String(p.level ?? "basis"),
        dayRule: String(p.dayRule ?? "altid"),
        active: Boolean(p.active),
        areaId: String(p.areaId ?? ""),
        lat: Number(p.lat ?? lat),
        lng: Number(p.lng ?? lng),
      };
      setPopupState({ type: "site", site, lng, lat });
    }
  }, []);

  // ── Mouse move: hover state + tooltip ────────────────────────────────────────

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const mapInstance = mapRef.current?.getMap();
    if (!mapInstance) return;

    const clusterFeature = e.features?.find(f => f.properties?.cluster);

    if (clusterFeature) {
      const featureId = clusterFeature.id as number | string;
      const p = clusterFeature.properties!;

      // Update feature hover state only when it changes
      if (hoveredFeatureIdRef.current !== featureId) {
        clearHoverState(mapInstance);
        mapInstance.setFeatureState({ source: "sites", id: featureId }, { hover: true });
        hoveredFeatureIdRef.current = featureId;
      }

      // Show tooltip — level counts come from clusterProperties (pre-aggregated, zero async)
      setTooltip({
        x: e.point.x,
        y: e.point.y,
        count: p.point_count as number,
        vip: (p.vip_count as number) ?? 0,
        hoj: (p.hoj_count as number) ?? 0,
        lav: (p.lav_count as number) ?? 0,
        basis: (p.basis_count as number) ?? 0,
      });
      setCursor("pointer");
    } else {
      clearHoverState(mapInstance);
      setTooltip(null);
      setCursor(e.features?.length ? "pointer" : "grab");
    }
  }, []); // stable — uses ref, not state

  const handleMapMouseLeave = useCallback(() => {
    const mapInstance = mapRef.current?.getMap();
    if (mapInstance) clearHoverState(mapInstance);
    setTooltip(null);
    setCursor("grab");
  }, []);

  const toggleLevel = (lvl: string) => {
    setSelectedLevels(prev => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl); else next.add(lvl);
      return next;
    });
  };

  const areas = areasWithGeo;

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left Filter Panel */}
      <div className="w-72 border-r border-border bg-card flex flex-col h-full z-10 shadow-lg overflow-hidden shrink-0">
        <div className="p-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 mb-0.5">
            <Filter className="w-4 h-4 text-primary" />
            <h2 className="text-base font-display font-bold">Kortfiltre</h2>
          </div>
          <p className="text-xs text-muted-foreground">Filtrer synlige elementer på kortet.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Level Filter */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Niveau
            </h3>
            <div className="space-y-1.5">
              {(["vip", "hoj", "lav", "basis"] as const).map(level => {
                const isSelected = selectedLevels.has(level);
                return (
                  <button
                    key={level}
                    onClick={() => toggleLevel(level)}
                    className={clsx(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all",
                      isSelected
                        ? "border-primary/40 bg-primary/5 shadow-sm"
                        : "border-transparent bg-muted/40 hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: LEVEL_HEX[level] }}
                      />
                      <span className="font-medium">{LEVEL_LABEL[level]}</span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
            {selectedLevels.size > 0 && (
              <button
                onClick={() => setSelectedLevels(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Nulstil niveau
              </button>
            )}
          </div>

          {/* Area Filter */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Område
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedArea(null)}
                className={clsx(
                  "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors",
                  selectedArea === null
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-muted text-foreground"
                )}
              >
                Alle områder
              </button>
              <div className={clsx("space-y-0.5", areas.length > 8 && !geoExpanded ? "max-h-48 overflow-hidden relative" : "")}>
                {areas.map(area => (
                  <button
                    key={area.id}
                    onClick={() => setSelectedArea(selectedArea === area.id ? null : area.id)}
                    className={clsx(
                      "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors truncate",
                      selectedArea === area.id
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    {area.name}
                  </button>
                ))}
                {areas.length > 8 && !geoExpanded && (
                  <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-card" />
                )}
              </div>
              {areas.length > 8 && (
                <button
                  onClick={() => setGeoExpanded(!geoExpanded)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {geoExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {geoExpanded ? "Vis færre" : `Vis alle ${areas.length}`}
                </button>
              )}
            </div>
          </div>

          {/* Overlay toggles */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kortlag
            </h3>
            <label className="flex items-center gap-2.5 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showAreas}
                onChange={e => setShowAreas(e.target.checked)}
                className="rounded"
              />
              <span>Vis områdegrænser</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showGeo}
                onChange={e => setShowGeo(e.target.checked)}
                className="rounded"
              />
              <span>Vis pladsgeometri</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Viser {filteredSites.length} pladser</span>
            {sitesLoading && <span className="animate-pulse">Indlæser...</span>}
          </div>
          {selectedLevels.size > 0 && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {[...selectedLevels].map(l => (
                <span key={l} className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: LEVEL_HEX[l] + "30", color: LEVEL_HEX[l] }}>
                  {LEVEL_LABEL[l]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 h-full relative">
        {!MAPBOX_TOKEN ? (
          <MapFallback
            siteCount={filteredSites.length}
            areaCount={areasWithGeo.length}
            levelCounts={
              Object.fromEntries(
                ["vip", "hoj", "lav", "basis"].map(l => [l, sites.filter(s => s.level === l).length])
              )
            }
          />
        ) : mapError ? (
          <WebGLError message={mapError} />
        ) : (
          <>
            <Map
              ref={mapRef}
              initialViewState={{ longitude: 9.5, latitude: 56.3, zoom: 7 }}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: "100%", height: "100%" }}
              cursor={cursor}
              interactiveLayerIds={["clusters", "unclustered-point"]}
              onClick={handleMapClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMapMouseLeave}
              onError={e => {
                console.error("[VinterDrift/kort] Map error:", e.error);
                setMapError(e.error?.message ?? "Kortfejl");
              }}
            >
              <NavigationControl position="bottom-right" />

              {/* Area polygons */}
              {showAreas && (
                <Source id="areas" type="geojson" data={areasGeoJson}>
                  <Layer {...areaFillLayer} />
                  <Layer {...areaOutlineLayer} />
                </Source>
              )}

              {/* Site geometries (lines/polygons) with real type colors */}
              {showGeo && siteGeo && (
                <Source id="site-geo" type="geojson" data={siteGeo}>
                  <Layer {...geoFillLayer} />
                  <Layer {...geoOutlineLayer} />
                  <Layer {...geoLineLayer} />
                </Source>
              )}

              {/* Clustered site markers
                  generateId: gives each feature a stable numeric id for setFeatureState
                  clusterProperties: pre-aggregates level counts into each cluster feature
                    → tooltip gets vip/hoj/lav/basis counts with zero async work        */}
              <Source
                id="sites"
                type="geojson"
                data={sitesGeoJson}
                cluster={true}
                clusterMaxZoom={17}
                clusterRadius={40}
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
                <Layer {...unclusteredPointLayer} />
              </Source>

              {/* Popup — single site */}
              {popupState?.type === "site" && (
                <Popup
                  anchor="bottom"
                  longitude={popupState.lng}
                  latitude={popupState.lat}
                  onClose={() => setPopupState(null)}
                  closeButton
                  closeOnClick={false}
                  offset={12}
                  maxWidth="260px"
                >
                  <SitePopup site={popupState.site} />
                </Popup>
              )}

              {/* Popup — overlapping cluster (same coordinates) */}
              {popupState?.type === "cluster" && (
                <Popup
                  anchor="bottom"
                  longitude={popupState.lng}
                  latitude={popupState.lat}
                  onClose={() => setPopupState(null)}
                  closeButton
                  closeOnClick={false}
                  offset={12}
                  maxWidth="280px"
                >
                  <div className="p-2 min-w-[220px]">
                    <div className="mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {popupState.sites.length} pladser · samme placering
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {popupState.sites.map(s => (
                        <div
                          key={s.id}
                          className="flex items-start gap-2 p-1.5 rounded-lg bg-muted/40"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                            style={{ backgroundColor: LEVEL_HEX[s.level] ?? "#94a3b8" }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight truncate">{s.name}</p>
                            <p className="text-[10px] text-muted-foreground">{LEVEL_LABEL[s.level]}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Popup>
              )}
            </Map>

            {/* Hover tooltip — absolutely positioned over the map canvas */}
            {tooltip && (
              <ClusterTooltip
                x={tooltip.x}
                y={tooltip.y}
                count={tooltip.count}
                vip={tooltip.vip}
                hoj={tooltip.hoj}
                lav={tooltip.lav}
                basis={tooltip.basis}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Site popup component (shared) ─────────────────────────────────────────────

function SitePopup({ site }: { site: SiteMarker }) {
  const rows: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Adresse", value: site.address },
    { label: "Postnr / By", value: [site.postalCode, site.city].filter(Boolean).join(" ") || null },
    { label: "Niveau", value: LEVEL_LABEL[site.level] },
    { label: "KodeNøgle", value: site.codeKey },
    { label: "Strømiddel", value: site.iceControl },
    { label: "App", value: site.app },
    { label: "Storkunde", value: site.bigCustomer },
    { label: "Dage", value: site.dayRule === "altid" ? "Alle dage" : "Kun hverdage" },
  ];
  return (
    <div className="p-2 min-w-[210px] max-w-[260px]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: LEVEL_HEX[site.level] }} />
        <h3 className="font-bold text-sm leading-tight">{site.name}</h3>
      </div>
      <div className="space-y-0.5">
        {rows.map(r => r.value ? (
          <div key={r.label} className="flex gap-1 text-xs">
            <span className="text-muted-foreground shrink-0 w-20">{r.label}</span>
            <span className="font-medium text-foreground truncate">{r.value}</span>
          </div>
        ) : null)}
      </div>
    </div>
  );
}

// ── Hover tooltip component ──────────────────────────────────────────────────

function ClusterTooltip({
  x, y, count, vip, hoj, lav, basis,
}: { x: number; y: number; count: number; vip: number; hoj: number; lav: number; basis: number }) {
  const levels = [
    { key: "vip",   label: "VIP",   count: vip,   color: LEVEL_HEX.vip },
    { key: "hoj",   label: "HØJ",   count: hoj,   color: LEVEL_HEX.hoj },
    { key: "lav",   label: "LAV",   count: lav,   color: LEVEL_HEX.lav },
    { key: "basis", label: "BASIS", count: basis, color: LEVEL_HEX.basis },
  ].filter(l => l.count > 0);

  // Position above and to the right of the cursor
  const style: React.CSSProperties = {
    position: "absolute",
    left: x + 14,
    top: y,
    transform: "translateY(-100%) translateY(-8px)",
    pointerEvents: "none",
    zIndex: 50,
  };

  return (
    <div style={style}>
      <div className="bg-background/96 backdrop-blur-sm border border-border rounded-xl shadow-xl px-3 py-2.5 text-sm min-w-[120px]">
        <div className="font-semibold text-foreground mb-1.5 flex items-baseline gap-1">
          <span className="text-base">{count}</span>
          <span className="text-xs text-muted-foreground font-normal">pladser</span>
        </div>
        {levels.length > 0 && (
          <div className="space-y-1">
            {levels.map(l => (
              <div key={l.key} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-xs text-muted-foreground w-10">{l.label}</span>
                <span className="text-xs font-semibold ml-auto">{l.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Error and fallback components ────────────────────────────────────────────

function WebGLError({ message }: { message: string }) {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 border-l border-border">
      <div className="flex flex-col items-center max-w-sm text-center p-8 bg-background/90 backdrop-blur rounded-2xl shadow-xl border border-orange-200 dark:border-orange-800">
        <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-display font-bold mb-2">WebGL ikke tilgængeligt</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Kortvisningen kræver WebGL-understøttelse i browseren.
          Prøv en anden browser eller opdater din grafik-driver.
        </p>
        <code className="text-xs text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded">
          {message}
        </code>
      </div>
    </div>
  );
}

function MapFallback({
  siteCount,
  areaCount,
  levelCounts,
}: {
  siteCount: number;
  areaCount: number;
  levelCounts: Record<string, number>;
}) {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 border-l border-border">
      <div className="z-10 flex flex-col items-center max-w-sm text-center p-8 bg-background/90 backdrop-blur rounded-2xl shadow-xl border border-border">
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">
          <MapIcon className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-display font-bold mb-2">Kort ikke tilgængeligt</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Tilføj <code className="bg-muted px-1 rounded text-xs">VITE_MAPBOX_TOKEN</code> for at se live kort.
        </p>
        <div className="w-full text-left space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data klar til visning:</p>
          <div className="bg-card p-3 rounded-xl border text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Områder</span>
              <span className="font-semibold">{areaCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pladser (filtreret)</span>
              <span className="font-semibold">{siteCount}</span>
            </div>
            {Object.entries(levelCounts).map(([lvl, count]) => (
              <div key={lvl} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LEVEL_HEX[lvl] }} />
                  <span className="text-muted-foreground text-xs">{LEVEL_LABEL[lvl]}</span>
                </div>
                <span className="font-semibold text-xs">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
