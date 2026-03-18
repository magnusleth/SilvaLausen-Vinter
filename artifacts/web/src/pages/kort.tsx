import React, { useState, useMemo } from "react";
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/mapbox";
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAppData } from "@/hooks/use-app-data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Filter, MapPin, Map as MapIcon, X, CheckCircle2 } from "lucide-react";
import { MOCK_SITE_COORDS } from "@/lib/mock-data";
import { clsx } from "clsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Map logical levels to tailwind color variables for the badges/UI
const LEVEL_COLORS: Record<string, string> = {
  vip: "bg-orange-500 text-white border-orange-600",
  hoj: "bg-blue-500 text-white border-blue-600",
  lav: "bg-red-500 text-white border-red-600",
  basis: "bg-green-500 text-white border-green-600",
};

export default function KortPage() {
  const { areas, sites, isLoading } = useAppData();
  
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [popupInfo, setPopupInfo] = useState<any | null>(null);

  // Filter sites
  const filteredSites = useMemo(() => {
    return sites.filter(site => {
      if (selectedLevel && site.level !== selectedLevel) return false;
      if (selectedArea && site.areaId !== selectedArea) return false;
      return true;
    });
  }, [sites, selectedLevel, selectedArea]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-muted/20">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const renderMapOrPlaceholder = () => {
    if (!MAPBOX_TOKEN) {
      return (
        <div className="flex-1 h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 border-l border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center opacity-10 grayscale"></div>
          <div className="z-10 flex flex-col items-center max-w-md text-center p-8 bg-background/80 backdrop-blur-md rounded-2xl shadow-xl border border-border">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">
              <MapIcon className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-2">Kort Ikke Tilgængeligt</h2>
            <p className="text-muted-foreground mb-6">
              For at se det rigtige kort, skal du tilføje <code className="bg-muted px-1.5 py-0.5 rounded text-sm">VITE_MAPBOX_TOKEN</code> i dine environment variables.
            </p>
            <div className="w-full space-y-3 text-left">
              <h4 className="font-semibold text-sm">Data der ville blive vist her:</h4>
              <div className="text-sm bg-card p-4 rounded-xl border shadow-sm">
                <p><strong>Områder:</strong> {areas.length}</p>
                <p><strong>Filtrerede pladser:</strong> {filteredSites.length}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 h-full relative">
        <Map
          initialViewState={{
            longitude: 12.5683,
            latitude: 55.6761,
            zoom: 12
          }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl position="bottom-right" />
          
          {/* Sites Markers */}
          {filteredSites.map(site => {
            const coords = MOCK_SITE_COORDS[site.id];
            if (!coords) return null;
            
            return (
              <Marker 
                key={site.id} 
                longitude={coords.lng} 
                latitude={coords.lat}
                onClick={e => {
                  e.originalEvent.stopPropagation();
                  setPopupInfo({ ...site, coords });
                }}
              >
                <div className={clsx(
                  "w-6 h-6 rounded-full border-2 shadow-md cursor-pointer transform transition-transform hover:scale-110",
                  LEVEL_COLORS[site.level] || "bg-gray-500 border-gray-600"
                )}>
                  {/* Inner dot */}
                  <div className="absolute inset-0 m-auto w-1.5 h-1.5 bg-white rounded-full opacity-70"></div>
                </div>
              </Marker>
            );
          })}

          {/* Popup */}
          {popupInfo && (
            <Popup
              anchor="bottom"
              longitude={popupInfo.coords.lng}
              latitude={popupInfo.coords.lat}
              onClose={() => setPopupInfo(null)}
              closeButton={true}
              closeOnClick={false}
              offset={15}
            >
              <div className="p-1 min-w-[200px]">
                <h3 className="font-bold text-base mb-1 pr-4">{popupInfo.name}</h3>
                <p className="text-muted-foreground text-xs mb-3">{popupInfo.address || "Ingen adresse angivet"}</p>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {popupInfo.level}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {popupInfo.dayRule.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            </Popup>
          )}
        </Map>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-background animate-in fade-in duration-300">
      {/* Left Filter Panel */}
      <div className="w-80 border-r border-border bg-card flex flex-col h-full z-10 shadow-xl overflow-hidden shrink-0">
        <div className="p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 mb-1">
            <Filter className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-display font-bold">Kortfiltre</h2>
          </div>
          <p className="text-sm text-muted-foreground">Filtrer de synlige elementer på kortet.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          {/* Level Filter */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Niveau</h3>
            <div className="space-y-2">
              {['vip', 'hoj', 'lav', 'basis'].map((level) => (
                <button
                  key={level}
                  onClick={() => setSelectedLevel(selectedLevel === level ? null : level)}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all duration-200",
                    selectedLevel === level 
                      ? "border-primary bg-primary/5 shadow-sm" 
                      : "border-transparent bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={clsx("w-3 h-3 rounded-full", LEVEL_COLORS[level]?.split(' ')[0])} />
                    <span className="font-medium capitalize">{level}</span>
                  </div>
                  {selectedLevel === level && <CheckCircle2 className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* Area Filter */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Områder</h3>
            <div className="space-y-2">
              <button
                 onClick={() => setSelectedArea(null)}
                 className={clsx(
                   "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                   selectedArea === null ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-foreground"
                 )}
              >
                Vis alle områder
              </button>
              {areas.map((area) => (
                <button
                  key={area.id}
                  onClick={() => setSelectedArea(area.id)}
                  className={clsx(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate",
                    selectedArea === area.id ? "bg-primary text-primary-foreground font-medium shadow-sm" : "hover:bg-muted text-foreground"
                  )}
                >
                  {area.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Footer info */}
        <div className="p-4 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          Viser {filteredSites.length} ud af {sites.length} pladser
        </div>
      </div>

      {/* Map Area */}
      {renderMapOrPlaceholder()}
    </div>
  );
}
