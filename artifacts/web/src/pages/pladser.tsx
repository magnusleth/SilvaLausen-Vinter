import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MapPin,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Hexagon,
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

type SiteAdmin = {
  id: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  level: string;
  dayRule: string;
  active: boolean;
  excelStatus: string | null;
  codeKey: string | null;
  iceControl: string | null;
  app: string | null;
  bigCustomer: string | null;
  kunde: string | null;
  vaKunde: string | null;
  smapsId: string | null;
  areaId: string | null;
  areaName: string;
  hasMarker: boolean;
  geometryCount: number;
};

type Area = { id: string; name: string };

const NIVEAU_LABELS: Record<string, { label: string; color: string }> = {
  vip: { label: "VIP", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  hoj: { label: "HØJ", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  lav: { label: "LAV", color: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
  basis: { label: "BASIS", color: "bg-zinc-600/20 text-zinc-400 border-zinc-600/40" },
};

// Excel status → display
const STATUS_CFG: Record<string, { label: string; dot: string; row?: string }> = {
  Aktiv:    { label: "Aktiv",    dot: "bg-green-400",   row: "" },
  NyAktiv:  { label: "NyAktiv",  dot: "bg-teal-400",    row: "" },
  Inaktiv:  { label: "Inaktiv",  dot: "bg-muted-foreground", row: "opacity-50" },
  Tilbud:   { label: "Tilbud",   dot: "bg-yellow-400",  row: "opacity-70" },
  Udgår:    { label: "Udgår",    dot: "bg-red-500",     row: "opacity-40" },
  "(blank)": { label: "—",       dot: "bg-zinc-600",    row: "opacity-40" },
};

function getStatusCfg(s: string | null) {
  const key = s || "(blank)";
  return STATUS_CFG[key] ?? { label: key, dot: "bg-zinc-600", row: "" };
}

function StatusBadge({ status }: { status: string | null }) {
  const cfg = getStatusCfg(status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="text-foreground/80">{cfg.label}</span>
    </span>
  );
}

function NiveauBadge({ level }: { level: string }) {
  const cfg = NIVEAU_LABELS[level] ?? { label: level.toUpperCase(), color: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

const DAGE_LABELS: Record<string, string> = { altid: "Alle dage", hverdage: "Hverdage" };

type SortKey = keyof SiteAdmin;
type SortDir = "asc" | "desc";

const STATUS_OPTIONS = ["alle", "Aktiv", "NyAktiv", "Inaktiv", "Tilbud", "Udgår", "blank"];

export default function PladserPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [niveau, setNiveau] = useState("alle");
  const [areaFilter, setAreaFilter] = useState("alle");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: sites = [], isLoading } = useQuery<SiteAdmin[]>({
    queryKey: ["sites-admin"],
    queryFn: () => fetch(`${API}/sites/admin`).then((r) => r.json()),
  });

  const { data: areas = [] } = useQuery<Area[]>({
    queryKey: ["areas"],
    queryFn: () => fetch(`${API}/areas`).then((r) => r.json()),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      fetch(`${API}/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      }).then((r) => r.json()),
    onSuccess: (_, { active }) => {
      qc.invalidateQueries({ queryKey: ["sites-admin"] });
      toast({ title: active ? "Plads aktiveret" : "Plads deaktiveret" });
    },
    onError: () => toast({ title: "Fejl ved opdatering", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let list = [...sites];

    if (statusFilter !== "alle") {
      if (statusFilter === "blank") list = list.filter((s) => !s.excelStatus);
      else list = list.filter((s) => (s.excelStatus ?? "") === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.address ?? "").toLowerCase().includes(q) ||
          (s.city ?? "").toLowerCase().includes(q) ||
          (s.postalCode ?? "").toLowerCase().includes(q) ||
          (s.codeKey ?? "").toLowerCase().includes(q) ||
          (s.kunde ?? "").toLowerCase().includes(q) ||
          (s.vaKunde ?? "").toLowerCase().includes(q)
      );
    }
    if (niveau !== "alle") list = list.filter((s) => s.level === niveau);
    if (areaFilter !== "alle") list = list.filter((s) => s.areaId === areaFilter);

    list.sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv, "da") : bv.localeCompare(av, "da");
    });

    return list;
  }, [sites, search, statusFilter, niveau, areaFilter, sortKey, sortDir]);

  // Summary counts
  const counts = useMemo(() => {
    const aktiv = sites.filter(s => s.excelStatus === "Aktiv").length;
    const nyAktiv = sites.filter(s => s.excelStatus === "NyAktiv").length;
    const udgar = sites.filter(s => s.excelStatus === "Udgår").length;
    const tilbud = sites.filter(s => s.excelStatus === "Tilbud").length;
    const inaktiv = sites.filter(s => s.excelStatus === "Inaktiv").length;
    return { aktiv, nyAktiv, udgar, tilbud, inaktiv };
  }, [sites]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 opacity-20 ml-0.5" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 opacity-80 ml-0.5 text-primary" />
      : <ChevronDown className="w-3 h-3 opacity-80 ml-0.5 text-primary" />;
  }

  const hasFilters = search || statusFilter !== "alle" || niveau !== "alle" || areaFilter !== "alle";

  const th = "px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-foreground select-none";
  const td = "px-3 py-2.5 text-sm align-middle";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Pladser</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Indlæser…" : `${filtered.length} af ${sites.length} pladser`}
              {!isLoading && (
                <span className="ml-2 text-xs text-muted-foreground/60">
                  · {counts.aktiv} Aktiv · {counts.nyAktiv} NyAktiv · {counts.tilbud} Tilbud · {counts.inaktiv} Inaktiv · {counts.udgar} Udgår
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48 max-w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Søg navn, adresse, kunde, kodenøgle…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle statuser</SelectItem>
              <SelectItem value="Aktiv">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Aktiv</span>
              </SelectItem>
              <SelectItem value="NyAktiv">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-400" />NyAktiv</span>
              </SelectItem>
              <SelectItem value="Tilbud">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Tilbud</span>
              </SelectItem>
              <SelectItem value="Inaktiv">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />Inaktiv</span>
              </SelectItem>
              <SelectItem value="Udgår">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Udgår</span>
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={niveau} onValueChange={setNiveau}>
            <SelectTrigger className="h-8 w-32 text-sm">
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle niveauer</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="hoj">HØJ</SelectItem>
              <SelectItem value="lav">LAV</SelectItem>
              <SelectItem value="basis">BASIS</SelectItem>
            </SelectContent>
          </Select>

          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue placeholder="Område" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle områder</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => { setSearch(""); setStatusFilter("alle"); setNiveau("alle"); setAreaFilter("alle"); }}
            >
              <X className="w-3.5 h-3.5 mr-1" /> Nulstil
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm min-w-[1300px]">
          <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b">
            <tr>
              <th className={th} onClick={() => handleSort("excelStatus")}>
                <span className="flex items-center">Status <SortIcon k="excelStatus" /></span>
              </th>
              <th className={th} onClick={() => handleSort("name")}>
                <span className="flex items-center">Pladsnavn <SortIcon k="name" /></span>
              </th>
              <th className={th} onClick={() => handleSort("address")}>
                <span className="flex items-center">Adresse <SortIcon k="address" /></span>
              </th>
              <th className={th} onClick={() => handleSort("postalCode")}>
                <span className="flex items-center">Postnr <SortIcon k="postalCode" /></span>
              </th>
              <th className={th} onClick={() => handleSort("city")}>
                <span className="flex items-center">By <SortIcon k="city" /></span>
              </th>
              <th className={th} onClick={() => handleSort("level")}>
                <span className="flex items-center">Niveau <SortIcon k="level" /></span>
              </th>
              <th className={th} onClick={() => handleSort("dayRule")}>
                <span className="flex items-center">Dage <SortIcon k="dayRule" /></span>
              </th>
              <th className={th} onClick={() => handleSort("kunde")}>
                <span className="flex items-center">Kunde <SortIcon k="kunde" /></span>
              </th>
              <th className={th} onClick={() => handleSort("bigCustomer")}>
                <span className="flex items-center">Storkunde <SortIcon k="bigCustomer" /></span>
              </th>
              <th className={th} onClick={() => handleSort("codeKey")}>
                <span className="flex items-center">KodeNøgle <SortIcon k="codeKey" /></span>
              </th>
              <th className={th} onClick={() => handleSort("iceControl")}>
                <span className="flex items-center">Strømiddel <SortIcon k="iceControl" /></span>
              </th>
              <th className={th} onClick={() => handleSort("app")}>
                <span className="flex items-center">App <SortIcon k="app" /></span>
              </th>
              <th className={th} onClick={() => handleSort("areaName")}>
                <span className="flex items-center">Område <SortIcon k="areaName" /></span>
              </th>
              <th className={th + " text-center"}>Markør</th>
              <th className={th + " text-center"}>Geo</th>
              <th className={th + " text-center"} onClick={() => handleSort("active")}>
                <span className="flex items-center justify-center">Drift <SortIcon k="active" /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={16} className="text-center py-16 text-muted-foreground">
                  Indlæser pladser…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={16} className="text-center py-16 text-muted-foreground">
                  Ingen pladser matcher filtret
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const statusCfg = getStatusCfg(s.excelStatus);
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-border/40 hover:bg-accent/30 transition-colors cursor-pointer ${statusCfg.row ?? ""}`}
                    onClick={() => setLocation(`/pladser/${s.id}`)}
                  >
                    <td className={td}>
                      <StatusBadge status={s.excelStatus} />
                    </td>
                    <td className={td + " font-medium max-w-[200px] truncate"} title={s.name}>
                      {s.name}
                    </td>
                    <td className={td + " text-muted-foreground max-w-[160px] truncate"} title={s.address ?? ""}>
                      {s.address ?? "—"}
                    </td>
                    <td className={td + " text-muted-foreground tabular-nums"}>
                      {s.postalCode ?? "—"}
                    </td>
                    <td className={td + " text-muted-foreground"}>
                      {s.city ?? "—"}
                    </td>
                    <td className={td}>
                      <NiveauBadge level={s.level} />
                    </td>
                    <td className={td + " text-muted-foreground text-xs"}>
                      {DAGE_LABELS[s.dayRule] ?? s.dayRule}
                    </td>
                    <td className={td + " max-w-[140px] truncate text-muted-foreground"} title={s.kunde ?? ""}>
                      {s.kunde ?? "—"}
                    </td>
                    <td className={td + " max-w-[120px] truncate text-muted-foreground"} title={s.bigCustomer ?? ""}>
                      {s.bigCustomer ?? "—"}
                    </td>
                    <td className={td + " font-mono text-xs text-muted-foreground"}>
                      {s.codeKey ?? "—"}
                    </td>
                    <td className={td + " text-xs text-muted-foreground"}>
                      {s.iceControl ?? "—"}
                    </td>
                    <td className={td + " text-xs text-muted-foreground"}>
                      {s.app ?? "—"}
                    </td>
                    <td className={td + " text-muted-foreground text-xs"}>
                      {s.areaName}
                    </td>
                    <td className={td + " text-center"}>
                      {s.hasMarker
                        ? <MapPin className="w-4 h-4 text-green-400 inline" />
                        : <X className="w-4 h-4 text-muted-foreground/30 inline" />}
                    </td>
                    <td className={td + " text-center"}>
                      {s.geometryCount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-400">
                          <Hexagon className="w-3.5 h-3.5" />
                          {s.geometryCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30 text-xs">—</span>
                      )}
                    </td>
                    <td
                      className={td + " text-center"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActiveMutation.mutate({ id: s.id, active: !s.active });
                      }}
                    >
                      {s.active
                        ? <ToggleRight className="w-5 h-5 text-green-400 inline hover:opacity-70" />
                        : <ToggleLeft className="w-5 h-5 text-muted-foreground/40 inline hover:opacity-70" />}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t px-6 py-2 text-xs text-muted-foreground bg-card/30 shrink-0">
        Viser {filtered.length} pladser · {sites.filter(s => s.active).length} aktive i drift · {sites.filter(s => s.hasMarker).length} med markør · {sites.filter(s => s.geometryCount > 0).length} med geometri
      </div>
    </div>
  );
}
