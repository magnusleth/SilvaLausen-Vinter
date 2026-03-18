import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Pencil,
  MapPin,
  Hexagon,
  ToggleRight,
  ToggleLeft,
  Hash,
  Building2,
  Phone,
  Tag,
  Layers,
  Calendar,
  Star,
} from "lucide-react";
import { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

const NIVEAU_LABELS: Record<string, { label: string; color: string }> = {
  vip: { label: "VIP", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  hoj: { label: "HØJ", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  lav: { label: "LAV", color: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  basis: { label: "BASIS", color: "text-zinc-400 bg-zinc-600/10 border-zinc-600/30" },
};

type Site = {
  id: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  level: string;
  dayRule: string;
  active: boolean;
  excelStatus: string | null;
  notes: string | null;
  codeKey: string | null;
  iceControl: string | null;
  app: string | null;
  bigCustomer: string | null;
  kunde: string | null;
  vaKunde: string | null;
  smapsId: string | null;
  areaId: string | null;
  areaName: string;
  geometryCount: number;
  markers: { lat: number; lng: number; label: string | null }[];
};

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-muted-foreground/50">—</span>}
      </span>
    </div>
  );
}

function MiniMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: mapboxgl.Map | null = null;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [lng, lat],
        zoom: 15,
        interactive: false,
        failIfMajorPerformanceCaveat: false,
      });

      new mapboxgl.Marker({ color: "#1F49FF" })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ closeButton: false }).setText(name))
        .addTo(map);
    } catch {
      // WebGL not available
    }

    return () => { try { map?.remove(); } catch { /* noop */ } };
  }, [lat, lng, name]);

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />;
}

export default function PladsVisPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: site, isLoading, error } = useQuery<Site>({
    queryKey: ["site", id],
    queryFn: () => fetch(`${API}/sites/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (active: boolean) =>
      fetch(`${API}/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      }).then((r) => r.json()),
    onSuccess: (_, active) => {
      qc.invalidateQueries({ queryKey: ["site", id] });
      qc.invalidateQueries({ queryKey: ["sites-admin"] });
      toast({ title: active ? "Plads aktiveret" : "Plads deaktiveret" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Indlæser plads…
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p>Plads ikke fundet</p>
        <Button variant="outline" onClick={() => setLocation("/pladser")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Tilbage
        </Button>
      </div>
    );
  }

  const marker = site.markers?.[0];
  const niveau = NIVEAU_LABELS[site.level] ?? { label: site.level.toUpperCase(), color: "text-muted-foreground bg-muted" };

  const STATUS_DOT: Record<string, string> = {
    Aktiv:   "bg-green-400",
    NyAktiv: "bg-teal-400",
    Inaktiv: "bg-zinc-500",
    Tilbud:  "bg-yellow-400",
    Udgår:   "bg-red-500",
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {/* Topbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/pladser")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Pladser
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-bold truncate max-w-md">{site.name}</h1>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${niveau.color}`}>
            {niveau.label}
          </span>
          {site.excelStatus && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-muted border border-border/60">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[site.excelStatus] ?? "bg-zinc-500"}`} />
              {site.excelStatus}
            </span>
          )}
          {!site.active && !["Aktiv","NyAktiv"].includes(site.excelStatus ?? "") && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/30">
              Ikke i drift
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleActiveMutation.mutate(!site.active)}
            className="gap-1.5"
          >
            {site.active
              ? <><ToggleRight className="w-4 h-4 text-green-400" /> Deaktivér</>
              : <><ToggleLeft className="w-4 h-4 text-muted-foreground" /> Aktivér</>}
          </Button>
          <Button size="sm" onClick={() => setLocation(`/pladser/${id}/rediger`)}>
            <Pencil className="w-4 h-4 mr-1.5" /> Rediger
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: data */}
        <div className="lg:col-span-2 space-y-5">
          {/* Stamdata */}
          <section className="bg-card border rounded-2xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" /> Stamdata
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Pladsnavn" value={site.name} />
              <InfoRow label="Adresse" value={site.address} />
              <InfoRow label="Postnr" value={site.postalCode} />
              <InfoRow label="By" value={site.city} />
              <InfoRow label="Vejrområde" value={site.areaName} />
              <InfoRow label="Dage" value={site.dayRule === "hverdage" ? "Kun hverdage" : "Alle dage"} />
            </div>
          </section>

          {/* Kunde */}
          <section className="bg-card border rounded-2xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" /> Kunde
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Kundenavn" value={site.kunde} />
              <InfoRow label="VA-Nr (Kunde)" value={site.vaKunde} mono />
              <InfoRow label="Storkunde" value={site.bigCustomer} />
            </div>
          </section>

          {/* Drift & Udkald */}
          <section className="bg-card border rounded-2xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Star className="w-3.5 h-3.5" /> Drift & Udkald
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Niveau" value={niveau.label} />
              <InfoRow label="KodeNøgle" value={site.codeKey} mono />
              <InfoRow label="Strømiddel" value={site.iceControl} />
              <InfoRow label="App" value={site.app} />
              <InfoRow label="ScribbelNr" value={site.smapsId} mono />
            </div>
          </section>

          {/* Geometri & Markør status */}
          <section className="bg-card border rounded-2xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> Geodata
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Markør</span>
                {marker ? (
                  <span className="flex items-center gap-1.5 text-sm text-green-400">
                    <MapPin className="w-4 h-4" />
                    {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground/50">Ingen markør</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Geometrier</span>
                <span className={`flex items-center gap-1.5 text-sm ${site.geometryCount > 0 ? "text-blue-400" : "text-muted-foreground/50"}`}>
                  <Hexagon className="w-4 h-4" />
                  {site.geometryCount > 0 ? `${site.geometryCount} polygon${site.geometryCount !== 1 ? "er" : ""}` : "Ingen"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
                <span className={`text-sm font-medium ${site.active ? "text-green-400" : "text-muted-foreground/50"}`}>
                  {site.active ? "Aktiv" : "Inaktiv"}
                </span>
              </div>
            </div>
          </section>

          {/* Bemærkninger */}
          {site.notes && (
            <section className="bg-card border rounded-2xl p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Bemærkninger</h2>
              <p className="text-sm text-foreground whitespace-pre-wrap">{site.notes}</p>
            </section>
          )}
        </div>

        {/* Right column: mini map */}
        <div className="space-y-4">
          <div className="bg-card border rounded-2xl overflow-hidden" style={{ height: 280 }}>
            {marker ? (
              <MiniMap lat={marker.lat} lng={marker.lng} name={site.name} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <MapPin className="w-8 h-8 opacity-20" />
                <p className="text-sm">Ingen markør sat</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setLocation(`/pladser/${id}/rediger`)}
                >
                  Tilføj via rediger
                </Button>
              </div>
            )}
          </div>

          {/* Quick facts */}
          <div className="bg-card border rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Oversigt</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Scribbel nr.</span>
                <span className="font-mono text-foreground">{site.smapsId ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">KodeNøgle</span>
                <span className="font-mono text-foreground">{site.codeKey ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VA-nr</span>
                <span className="font-mono text-foreground">{site.vaKunde ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Strømiddel</span>
                <span className="text-foreground">{site.iceControl ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">App</span>
                <span className="text-foreground">{site.app ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
