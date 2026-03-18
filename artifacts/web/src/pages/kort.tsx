import React, { useState, useMemo, useCallback } from "react";
import Map, { Source, Layer, Marker, NavigationControl, Popup } from "react-map-gl/mapbox";
import type { MapLayerMouseEvent, FillLayer, LineLayer, CircleLayer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery } from "@tanstack/react-query";
import { Filter, MapPin, Map as MapIcon, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
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

interface SiteMarker {
  id: string;
  name: string;
  address?: string | null;
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

export default function KortPage() {
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [popupInfo, setPopupInfo] = useState<SiteMarker | null>(null);
  const [showGeo, setShowGeo] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [geoExpanded, setGeoExpanded] = useState(false);

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

  // Filter sites client-side for multi-level selection
  const filteredSites = useMemo(() => {
    if (selectedLevels.size === 0 || selectedLevels.size === 4) return sites;
    return sites.filter(s => selectedLevels.has(s.level));
  }, [sites, selectedLevels]);

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

  const areaFillLayer: FillLayer = {
    id: "areas-fill",
    type: "fill",
    source: "areas",
    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.05 },
  };
  const areaOutlineLayer: LineLayer = {
    id: "areas-outline",
    type: "line",
    source: "areas",
    paint: { "line-color": "#3b82f6", "line-width": 1.5, "line-opacity": 0.5 },
  };

  // Site geometry layers
  const geoLineLayer: LineLayer = {
    id: "site-geo-lines",
    type: "line",
    source: "site-geo",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": [
        "match", ["get", "level"],
        "vip", "#f97316",
        "hoj", "#3b82f6",
        "lav", "#ef4444",
        "#22c55e"
      ],
      "line-width": 2.5,
      "line-opacity": 0.75,
    },
  };
  const geoFillLayer: FillLayer = {
    id: "site-geo-fill",
    type: "fill",
    source: "site-geo",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": [
        "match", ["get", "level"],
        "vip", "#f97316",
        "hoj", "#3b82f6",
        "lav", "#ef4444",
        "#22c55e"
      ],
      "fill-opacity": 0.3,
    },
  };

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

      {/* Map */}
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
        ) : (
          <Map
            initialViewState={{ longitude: 9.5, latitude: 56.3, zoom: 7 }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: "100%", height: "100%" }}
          >
            <NavigationControl position="bottom-right" />

            {/* Area polygons */}
            {showAreas && (
              <Source id="areas" type="geojson" data={areasGeoJson}>
                <Layer {...areaFillLayer} />
                <Layer {...areaOutlineLayer} />
              </Source>
            )}

            {/* Site geometries */}
            {showGeo && siteGeo && (
              <Source id="site-geo" type="geojson" data={siteGeo}>
                <Layer {...geoFillLayer} />
                <Layer {...geoLineLayer} />
              </Source>
            )}

            {/* Site markers */}
            {filteredSites.map(site => (
              <Marker
                key={site.id}
                longitude={site.lng}
                latitude={site.lat}
                onClick={e => {
                  e.originalEvent.stopPropagation();
                  setPopupInfo(site);
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-125 transition-transform"
                  style={{ backgroundColor: LEVEL_HEX[site.level] ?? "#94a3b8" }}
                />
              </Marker>
            ))}

            {/* Popup */}
            {popupInfo && (
              <Popup
                anchor="bottom"
                longitude={popupInfo.lng}
                latitude={popupInfo.lat}
                onClose={() => setPopupInfo(null)}
                closeButton
                closeOnClick={false}
                offset={12}
                maxWidth="260px"
              >
                <div className="p-1.5 min-w-[200px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: LEVEL_HEX[popupInfo.level] }}
                    />
                    <span className="font-bold text-sm">{LEVEL_LABEL[popupInfo.level]}</span>
                  </div>
                  <h3 className="font-semibold text-sm leading-tight mb-1">{popupInfo.name}</h3>
                  {popupInfo.address && (
                    <p className="text-xs text-muted-foreground mb-1.5">{popupInfo.address}</p>
                  )}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted">
                      {popupInfo.dayRule === "altid" ? "Alle dage" : "Kun hverdage"}
                    </span>
                    <span className={clsx(
                      "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                      popupInfo.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {popupInfo.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        )}
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
