import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MapPin, Search, ChevronUp, ChevronDown, X, Hexagon,
  ToggleLeft, ToggleRight, SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

type ExcelData = Record<string, string | number | null | undefined>;

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
  excelData: ExcelData | null;
};

type Area = { id: string; name: string };

const NIVEAU_LABELS: Record<string, { label: string; color: string }> = {
  vip:   { label: "VIP",   color: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  hoj:   { label: "HØJ",   color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  lav:   { label: "LAV",   color: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
  basis: { label: "BASIS", color: "bg-zinc-600/20 text-zinc-400 border-zinc-600/40" },
};

const STATUS_CFG: Record<string, { label: string; dot: string; row: string }> = {
  Aktiv:    { label: "Aktiv",   dot: "bg-green-400",             row: "" },
  NyAktiv:  { label: "NyAktiv", dot: "bg-teal-400",              row: "" },
  Inaktiv:  { label: "Inaktiv", dot: "bg-zinc-500",              row: "opacity-50" },
  Tilbud:   { label: "Tilbud",  dot: "bg-yellow-400",            row: "opacity-70" },
  Udgår:    { label: "Udgår",   dot: "bg-red-500",               row: "opacity-40" },
  "(blank)":{ label: "—",       dot: "bg-zinc-700",              row: "opacity-40" },
};

function getStatusCfg(s: string | null) {
  return STATUS_CFG[s || "(blank)"] ?? { label: s, dot: "bg-zinc-600", row: "" };
}

function xd(site: SiteAdmin, key: string): string {
  const v = site.excelData?.[key];
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

const DAGE_LABELS: Record<string, string> = { altid: "Alle dage", hverdage: "Hverdage" };

// Column definition: { header, group, width, accessor, align? }
type ColDef = {
  key: string;
  header: string;
  group: string;
  groupColor: string;
  w: number;
  get: (s: SiteAdmin) => string | React.ReactNode;
  sortVal?: (s: SiteAdmin) => string;
  align?: "center" | "right";
  mono?: boolean;
  sticky?: boolean;
};

const GRP = {
  udkald: { label: "Udkaldskriterier", color: "bg-blue-900/30 text-blue-300" },
  stamdata: { label: "PladsGrunddata", color: "bg-emerald-900/30 text-emerald-300" },
  kontakt: { label: "Kontakt & Kontrakt", color: "bg-violet-900/30 text-violet-300" },
  priser: { label: "Priser", color: "bg-amber-900/30 text-amber-300" },
  drift: { label: "Drift", color: "bg-cyan-900/30 text-cyan-300" },
  arealer: { label: "Arealer", color: "bg-teal-900/30 text-teal-300" },
  forbrug: { label: "Forbrug", color: "bg-orange-900/30 text-orange-300" },
  ruter: { label: "Ruter", color: "bg-rose-900/30 text-rose-300" },
  tider: { label: "Tider", color: "bg-sky-900/30 text-sky-300" },
  beregnet: { label: "Beregnet", color: "bg-zinc-800/60 text-zinc-400" },
};

import React from "react";

const COLS: ColDef[] = [
  // ── Udkaldskriterier ──────────────────────────────────────
  {
    key: "excelStatus", header: "Status", group: "udkald", groupColor: GRP.udkald.color, w: 90, sticky: true,
    get: (s) => {
      const cfg = getStatusCfg(s.excelStatus);
      return <span className="inline-flex items-center gap-1.5 text-xs">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="text-foreground/80">{cfg.label}</span>
      </span>;
    },
    sortVal: (s) => s.excelStatus ?? "",
  },
  {
    key: "level", header: "Niveau", group: "udkald", groupColor: GRP.udkald.color, w: 72,
    get: (s) => {
      const cfg = NIVEAU_LABELS[s.level] ?? { label: s.level.toUpperCase(), color: "bg-muted text-muted-foreground" };
      return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${cfg.color}`}>{cfg.label}</span>;
    },
    sortVal: (s) => s.level,
    align: "center",
  },
  {
    key: "dayRule", header: "KunHverdage", group: "udkald", groupColor: GRP.udkald.color, w: 96,
    get: (s) => DAGE_LABELS[s.dayRule] ?? s.dayRule,
    sortVal: (s) => s.dayRule,
  },
  {
    key: "areaName", header: "Vejrområde", group: "udkald", groupColor: GRP.udkald.color, w: 110,
    get: (s) => s.areaName,
    sortVal: (s) => s.areaName,
  },
  // ── PladsGrunddata ────────────────────────────────────────
  {
    key: "name", header: "PladsNavn", group: "stamdata", groupColor: GRP.stamdata.color, w: 210, sticky: true,
    get: (s) => <span className="font-medium">{s.name}</span>,
    sortVal: (s) => s.name,
  },
  {
    key: "vaKunde", header: "VaNrKunde", group: "stamdata", groupColor: GRP.stamdata.color, w: 90,
    get: (s) => s.vaKunde ?? "—", sortVal: (s) => s.vaKunde ?? "",
  },
  {
    key: "kunde", header: "Kunde", group: "stamdata", groupColor: GRP.stamdata.color, w: 130,
    get: (s) => s.kunde ?? "—", sortVal: (s) => s.kunde ?? "",
  },
  {
    key: "bigCustomer", header: "Storkunde", group: "stamdata", groupColor: GRP.stamdata.color, w: 120,
    get: (s) => s.bigCustomer ?? "—", sortVal: (s) => s.bigCustomer ?? "",
  },
  {
    key: "gennemgaaet2025", header: "gennemgået 2025", group: "stamdata", groupColor: GRP.stamdata.color, w: 100,
    get: (s) => xd(s, "gennemgaaet2025"),
  },
  {
    key: "kortOmraade", header: "KortOmråde", group: "stamdata", groupColor: GRP.stamdata.color, w: 110,
    get: (s) => xd(s, "kortOmraade"),
  },
  {
    key: "smapsId", header: "ScribbelNr", group: "stamdata", groupColor: GRP.stamdata.color, w: 90,
    get: (s) => s.smapsId ?? "—", mono: true,
  },
  {
    key: "address", header: "Adresse", group: "stamdata", groupColor: GRP.stamdata.color, w: 160,
    get: (s) => s.address ?? "—", sortVal: (s) => s.address ?? "",
  },
  {
    key: "postalCode", header: "Postnr", group: "stamdata", groupColor: GRP.stamdata.color, w: 66,
    get: (s) => s.postalCode ?? "—", sortVal: (s) => s.postalCode ?? "", mono: true,
  },
  {
    key: "city", header: "By", group: "stamdata", groupColor: GRP.stamdata.color, w: 100,
    get: (s) => s.city ?? "—", sortVal: (s) => s.city ?? "",
  },
  // ── Kontakt & Kontrakt ────────────────────────────────────
  {
    key: "ansvarlig1", header: "Ansvarlig1", group: "kontakt", groupColor: GRP.kontakt.color, w: 140,
    get: (s) => xd(s, "ansvarlig1"),
  },
  {
    key: "ansvarlig2", header: "Ansvarlig2", group: "kontakt", groupColor: GRP.kontakt.color, w: 140,
    get: (s) => xd(s, "ansvarlig2"),
  },
  {
    key: "afregningsmodel", header: "Afregningsmodel", group: "kontakt", groupColor: GRP.kontakt.color, w: 110,
    get: (s) => xd(s, "afregningsmodel"),
  },
  {
    key: "ejendomskontakt", header: "Ejendomskontakt", group: "kontakt", groupColor: GRP.kontakt.color, w: 130,
    get: (s) => xd(s, "ejendomskontakt"),
  },
  {
    key: "email", header: "email", group: "kontakt", groupColor: GRP.kontakt.color, w: 150,
    get: (s) => xd(s, "email"),
  },
  // ── Priser ────────────────────────────────────────────────
  {
    key: "timepris", header: "Timepris", group: "priser", groupColor: GRP.priser.color, w: 76,
    get: (s) => xd(s, "timepris"), align: "right",
  },
  {
    key: "ueTimepris", header: "UeTimepris", group: "priser", groupColor: GRP.priser.color, w: 82,
    get: (s) => xd(s, "ueTimepris"), align: "right",
  },
  {
    key: "provision", header: "Provision", group: "priser", groupColor: GRP.priser.color, w: 78,
    get: (s) => xd(s, "provision"), align: "right",
  },
  {
    key: "agent", header: "Agent", group: "priser", groupColor: GRP.priser.color, w: 100,
    get: (s) => xd(s, "agent"),
  },
  {
    key: "saltTillaeg", header: "SaltTillæg", group: "priser", groupColor: GRP.priser.color, w: 80,
    get: (s) => xd(s, "saltTillaeg"), align: "right",
  },
  {
    key: "saltningInclSalt", header: "Saltning incl salt", group: "priser", groupColor: GRP.priser.color, w: 100,
    get: (s) => xd(s, "saltningInclSalt"), align: "right",
  },
  {
    key: "stroeUE", header: "strø UE", group: "priser", groupColor: GRP.priser.color, w: 70,
    get: (s) => xd(s, "stroeUE"), align: "right",
  },
  {
    key: "stroeAva", header: "Strø ava", group: "priser", groupColor: GRP.priser.color, w: 70,
    get: (s) => xd(s, "stroeAva"), align: "right",
  },
  {
    key: "snerydningInclSaltning", header: "Snerydning incl saltning", group: "priser", groupColor: GRP.priser.color, w: 120,
    get: (s) => xd(s, "snerydningInclSaltning"), align: "right",
  },
  {
    key: "kombiUE", header: "Kombi UE", group: "priser", groupColor: GRP.priser.color, w: 76,
    get: (s) => xd(s, "kombiUE"), align: "right",
  },
  {
    key: "kombiAvance", header: "KombiAvance", group: "priser", groupColor: GRP.priser.color, w: 86,
    get: (s) => xd(s, "kombiAvance"), align: "right",
  },
  {
    key: "prisOK", header: "Pris OK", group: "priser", groupColor: GRP.priser.color, w: 72,
    get: (s) => xd(s, "prisOK"),
  },
  {
    key: "uePrisOk", header: "UE pris ok", group: "priser", groupColor: GRP.priser.color, w: 80,
    get: (s) => xd(s, "uePrisOk"),
  },
  {
    key: "stroePrM2", header: "STRØ pr m2", group: "priser", groupColor: GRP.priser.color, w: 84,
    get: (s) => xd(s, "stroePrM2"), align: "right",
  },
  {
    key: "kombiPrM2", header: "KOMBI pr m2", group: "priser", groupColor: GRP.priser.color, w: 88,
    get: (s) => xd(s, "kombiPrM2"), align: "right",
  },
  {
    key: "ueStroPrM2", header: "Ue strø pr m2", group: "priser", groupColor: GRP.priser.color, w: 90,
    get: (s) => xd(s, "ueStroPrM2"), align: "right",
  },
  {
    key: "ueKombiPrM2", header: "Ue kombi pr m2", group: "priser", groupColor: GRP.priser.color, w: 94,
    get: (s) => xd(s, "ueKombiPrM2"), align: "right",
  },
  {
    key: "fastprisSnevagten", header: "Fastpris snevagten", group: "priser", groupColor: GRP.priser.color, w: 100,
    get: (s) => xd(s, "fastprisSnevagten"), align: "right",
  },
  {
    key: "stroepris", header: "Strøpris", group: "priser", groupColor: GRP.priser.color, w: 76,
    get: (s) => xd(s, "stroepris"), align: "right",
  },
  {
    key: "kombipris", header: "kombipris", group: "priser", groupColor: GRP.priser.color, w: 76,
    get: (s) => xd(s, "kombipris"), align: "right",
  },
  {
    key: "stroeture", header: "Strøture", group: "priser", groupColor: GRP.priser.color, w: 72,
    get: (s) => xd(s, "stroeture"), align: "right",
  },
  {
    key: "sneture", header: "Sneture", group: "priser", groupColor: GRP.priser.color, w: 68,
    get: (s) => xd(s, "sneture"), align: "right",
  },
  // ── Bemærkninger ──────────────────────────────────────────
  {
    key: "egneBemaerkninger", header: "Egne bemærkninger", group: "drift", groupColor: GRP.drift.color, w: 160,
    get: (s) => xd(s, "egneBemaerkninger"),
  },
  {
    key: "bemaerkninger", header: "Bemærkninger", group: "drift", groupColor: GRP.drift.color, w: 160,
    get: (s) => xd(s, "bemaerkninger"),
  },
  // ── Drift ─────────────────────────────────────────────────
  {
    key: "codeKey", header: "KodeNøgle", group: "drift", groupColor: GRP.drift.color, w: 90,
    get: (s) => s.codeKey ?? "—", mono: true,
  },
  {
    key: "kort", header: "Kort", group: "drift", groupColor: GRP.drift.color, w: 80,
    get: (s) => xd(s, "kort"),
  },
  {
    key: "app", header: "App", group: "drift", groupColor: GRP.drift.color, w: 90,
    get: (s) => s.app ?? "—",
  },
  {
    key: "iceControl", header: "Strømiddel", group: "drift", groupColor: GRP.drift.color, w: 90,
    get: (s) => s.iceControl ?? "—",
  },
  // ── Arealer ───────────────────────────────────────────────
  {
    key: "pladsArealM2", header: "PladsArealM2", group: "arealer", groupColor: GRP.arealer.color, w: 90,
    get: (s) => xd(s, "pladsArealM2"), align: "right",
  },
  {
    key: "stiLaengdeM", header: "StiLængdeM", group: "arealer", groupColor: GRP.arealer.color, w: 82,
    get: (s) => xd(s, "stiLaengdeM"), align: "right",
  },
  {
    key: "haandLaengdeM", header: "HåndLængdeM", group: "arealer", groupColor: GRP.arealer.color, w: 88,
    get: (s) => xd(s, "haandLaengdeM"), align: "right",
  },
  {
    key: "ureaArealM2", header: "UreaArealM2", group: "arealer", groupColor: GRP.arealer.color, w: 84,
    get: (s) => xd(s, "ureaArealM2"), align: "right",
  },
  {
    key: "arealIAlt", header: "Areal i alt", group: "arealer", groupColor: GRP.arealer.color, w: 82,
    get: (s) => xd(s, "arealIAlt"), align: "right",
  },
  {
    key: "molokker", header: "Molokker", group: "arealer", groupColor: GRP.arealer.color, w: 72,
    get: (s) => xd(s, "molokker"), align: "right",
  },
  {
    key: "svalegange", header: "Svalegange", group: "arealer", groupColor: GRP.arealer.color, w: 80,
    get: (s) => xd(s, "svalegange"), align: "right",
  },
  {
    key: "trapper", header: "Trapper", group: "arealer", groupColor: GRP.arealer.color, w: 68,
    get: (s) => xd(s, "trapper"), align: "right",
  },
  // ── Forbrug ───────────────────────────────────────────────
  {
    key: "saltforbrugV20g", header: "SaltforbrugV20g", group: "forbrug", groupColor: GRP.forbrug.color, w: 102,
    get: (s) => xd(s, "saltforbrugV20g"), align: "right",
  },
  {
    key: "ureaforbrugV20g", header: "UreaforbrugV20g", group: "forbrug", groupColor: GRP.forbrug.color, w: 102,
    get: (s) => xd(s, "ureaforbrugV20g"), align: "right",
  },
  // ── Ruter ─────────────────────────────────────────────────
  {
    key: "pladssalterRute", header: "PladssalterRute", group: "ruter", groupColor: GRP.ruter.color, w: 108,
    get: (s) => xd(s, "pladssalterRute"),
  },
  {
    key: "stiRute", header: "StiRute", group: "ruter", groupColor: GRP.ruter.color, w: 80,
    get: (s) => xd(s, "stiRute"),
  },
  {
    key: "haandRute", header: "HåndRute", group: "ruter", groupColor: GRP.ruter.color, w: 80,
    get: (s) => xd(s, "haandRute"),
  },
  {
    key: "snetraktorrute", header: "Snetraktorrute", group: "ruter", groupColor: GRP.ruter.color, w: 104,
    get: (s) => xd(s, "snetraktorrute"),
  },
  {
    key: "ekstraHoej", header: "Ekstra høj", group: "ruter", groupColor: GRP.ruter.color, w: 80,
    get: (s) => xd(s, "ekstraHoej"),
  },
  // ── Tider Salt ────────────────────────────────────────────
  {
    key: "pladsTidSalt", header: "PladsTidSalt", group: "tider", groupColor: GRP.tider.color, w: 90,
    get: (s) => xd(s, "pladsTidSalt"), align: "right",
  },
  {
    key: "stiTidSalt", header: "StiTidSalt", group: "tider", groupColor: GRP.tider.color, w: 80,
    get: (s) => xd(s, "stiTidSalt"), align: "right",
  },
  {
    key: "haandTidSalt", header: "HåndTidSalt", group: "tider", groupColor: GRP.tider.color, w: 84,
    get: (s) => xd(s, "haandTidSalt"), align: "right",
  },
  {
    key: "pladsTidKombi", header: "PladsTidKombi", group: "tider", groupColor: GRP.tider.color, w: 94,
    get: (s) => xd(s, "pladsTidKombi"), align: "right",
  },
  {
    key: "stiTidKombi", header: "StiTidKombi", group: "tider", groupColor: GRP.tider.color, w: 84,
    get: (s) => xd(s, "stiTidKombi"), align: "right",
  },
  {
    key: "haandTidKombi", header: "HåndTidKombi", group: "tider", groupColor: GRP.tider.color, w: 88,
    get: (s) => xd(s, "haandTidKombi"), align: "right",
  },
  {
    key: "snetraktorTidKombi", header: "SneTraktorTidKombi", group: "tider", groupColor: GRP.tider.color, w: 108,
    get: (s) => xd(s, "snetraktorTidKombi"), align: "right",
  },
  // ── Beregnet ──────────────────────────────────────────────
  {
    key: "beregnetStroe", header: "BeregnetStrø", group: "beregnet", groupColor: GRP.beregnet.color, w: 90,
    get: (s) => xd(s, "beregnetStroe"), align: "right",
  },
  {
    key: "beregnetKombi", header: "BeregnetKombi", group: "beregnet", groupColor: GRP.beregnet.color, w: 96,
    get: (s) => xd(s, "beregnetKombi"), align: "right",
  },
  {
    key: "beregnetStroePrM2", header: "Beregnet strø/m2", group: "beregnet", groupColor: GRP.beregnet.color, w: 100,
    get: (s) => xd(s, "beregnetStroePrM2"), align: "right",
  },
  {
    key: "beregnetKombiPrM2", header: "Beregnet kombi/m2", group: "beregnet", groupColor: GRP.beregnet.color, w: 104,
    get: (s) => xd(s, "beregnetKombiPrM2"), align: "right",
  },
  {
    key: "snevagtkontrol", header: "Snevagt kontrol", group: "beregnet", groupColor: GRP.beregnet.color, w: 98,
    get: (s) => xd(s, "snevagtkontrol"),
  },
  // ── Meta (ikke fra Excel, men nyttige) ────────────────────
  {
    key: "hasMarker", header: "Markør", group: "beregnet", groupColor: GRP.beregnet.color, w: 64,
    get: (s) => s.hasMarker
      ? <MapPin className="w-4 h-4 text-green-400 inline" />
      : <X className="w-4 h-4 text-muted-foreground/30 inline" />,
    align: "center",
  },
  {
    key: "geometryCount", header: "Geo", group: "beregnet", groupColor: GRP.beregnet.color, w: 56,
    get: (s) => s.geometryCount > 0
      ? <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-400">
          <Hexagon className="w-3 h-3" />{s.geometryCount}
        </span>
      : <span className="text-muted-foreground/30 text-xs">—</span>,
    sortVal: (s) => String(s.geometryCount).padStart(4, "0"),
    align: "center",
  },
  {
    key: "active", header: "Drift", group: "beregnet", groupColor: GRP.beregnet.color, w: 56,
    get: () => null,
    sortVal: (s) => s.active ? "1" : "0",
    align: "center",
  },
];

// Compute sticky left offsets for sticky cols
const STICKY_OFFSETS: Record<string, number> = {};
let stickyLeft = 0;
for (const col of COLS) {
  if (col.sticky) {
    STICKY_OFFSETS[col.key] = stickyLeft;
    stickyLeft += col.w;
  }
}

// Compute group spans
type GroupSpan = { key: string; label: string; color: string; span: number };
function buildGroupSpans(): GroupSpan[] {
  const spans: GroupSpan[] = [];
  for (const col of COLS) {
    const last = spans[spans.length - 1];
    if (last && last.key === col.group) {
      last.span++;
    } else {
      const grp = Object.values(GRP).find(g => g.label === Object.values(GRP).find(gg => gg === GRP[col.group as keyof typeof GRP])?.label);
      const grpEntry = GRP[col.group as keyof typeof GRP];
      spans.push({ key: col.group, label: grpEntry?.label ?? col.group, color: grpEntry?.color ?? "", span: 1 });
    }
  }
  return spans;
}
const GROUP_SPANS = buildGroupSpans();

export default function PladserPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [niveauFilter, setNiveauFilter] = useState("alle");
  const [areaFilter, setAreaFilter] = useState("alle");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address ?? "").toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q) ||
        (s.postalCode ?? "").toLowerCase().includes(q) ||
        (s.codeKey ?? "").toLowerCase().includes(q) ||
        (s.kunde ?? "").toLowerCase().includes(q) ||
        (s.vaKunde ?? "").toLowerCase().includes(q) ||
        (s.smapsId ?? "").toLowerCase().includes(q) ||
        (s.bigCustomer ?? "").toLowerCase().includes(q) ||
        Object.values(s.excelData ?? {}).some(v => String(v ?? "").toLowerCase().includes(q))
      );
    }
    if (niveauFilter !== "alle") list = list.filter((s) => s.level === niveauFilter);
    if (areaFilter !== "alle") list = list.filter((s) => s.areaId === areaFilter);

    const col = COLS.find(c => c.key === sortKey);
    list.sort((a, b) => {
      const av = col?.sortVal ? col.sortVal(a) : String((a as Record<string, unknown>)[sortKey] ?? "");
      const bv = col?.sortVal ? col.sortVal(b) : String((b as Record<string, unknown>)[sortKey] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv, "da") : bv.localeCompare(av, "da");
    });
    return list;
  }, [sites, search, statusFilter, niveauFilter, areaFilter, sortKey, sortDir]);

  const counts = useMemo(() => ({
    aktiv:   sites.filter(s => s.excelStatus === "Aktiv").length,
    nyAktiv: sites.filter(s => s.excelStatus === "NyAktiv").length,
    udgar:   sites.filter(s => s.excelStatus === "Udgår").length,
    tilbud:  sites.filter(s => s.excelStatus === "Tilbud").length,
    inaktiv: sites.filter(s => s.excelStatus === "Inaktiv").length,
  }), [sites]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const hasFilters = search || statusFilter !== "alle" || niveauFilter !== "alle" || areaFilter !== "alle";

  const thBase = "px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-foreground select-none border-r border-border/20";
  const tdBase = "px-2 py-2 text-xs align-middle border-r border-border/10";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-card/50 px-5 py-3 shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Pladser</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Indlæser…" : `${filtered.length} af ${sites.length} pladser fra arket (linje 1–939)`}
              {!isLoading && <span className="ml-2 opacity-60">
                · {counts.aktiv} Aktiv · {counts.nyAktiv} NyAktiv · {counts.tilbud} Tilbud · {counts.inaktiv} Inaktiv · {counts.udgar} Udgår
              </span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44 max-w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Søg i alle felter…"
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
              {["Aktiv","NyAktiv","Tilbud","Inaktiv","Udgår"].map(s => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      s==="Aktiv"?"bg-green-400":s==="NyAktiv"?"bg-teal-400":
                      s==="Tilbud"?"bg-yellow-400":s==="Inaktiv"?"bg-zinc-500":"bg-red-500"
                    }`}/>
                    {s}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={niveauFilter} onValueChange={setNiveauFilter}>
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
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="Område" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle områder</SelectItem>
              {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground"
              onClick={() => { setSearch(""); setStatusFilter("alle"); setNiveauFilter("alle"); setAreaFilter("alle"); }}>
              <X className="w-3.5 h-3.5 mr-1" /> Nulstil
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: COLS.reduce((s, c) => s + c.w, 0) + "px" }}>
          {/* Group header row */}
          <thead className="sticky top-0 z-20">
            <tr>
              {GROUP_SPANS.map((grp, gi) => (
                <th
                  key={gi}
                  colSpan={grp.span}
                  className={`px-2 py-1 text-center text-[10px] font-semibold tracking-wide border-b border-border/30 border-r border-r-border/20 ${grp.color}`}
                >
                  {grp.label}
                </th>
              ))}
            </tr>
            {/* Column header row */}
            <tr className="bg-card/95 backdrop-blur-sm border-b border-border/60">
              {COLS.map((col) => {
                const isSticky = col.sticky;
                const stickyStyle = isSticky
                  ? { position: "sticky" as const, left: STICKY_OFFSETS[col.key], zIndex: 10, minWidth: col.w, maxWidth: col.w, backgroundColor: "var(--card)" }
                  : { minWidth: col.w, maxWidth: col.w };
                return (
                  <th
                    key={col.key}
                    style={stickyStyle}
                    className={`${thBase} ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""} ${isSticky ? "shadow-[2px_0_4px_rgba(0,0,0,0.2)]" : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className={`inline-flex items-center gap-0.5 ${col.align === "right" ? "flex-row-reverse" : col.align === "center" ? "justify-center" : ""}`}>
                      <span className="truncate">{col.header}</span>
                      {sortKey === col.key
                        ? sortDir === "asc"
                          ? <ChevronUp className="w-3 h-3 shrink-0 text-primary" />
                          : <ChevronDown className="w-3 h-3 shrink-0 text-primary" />
                        : <ChevronUp className="w-3 h-3 shrink-0 opacity-15" />
                      }
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={COLS.length} className="text-center py-16 text-muted-foreground">Indlæser pladser…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="text-center py-16 text-muted-foreground">Ingen pladser matcher filtret</td>
              </tr>
            ) : (
              filtered.map((s) => {
                const rowCls = getStatusCfg(s.excelStatus).row;
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-border/30 hover:bg-accent/30 cursor-pointer transition-colors ${rowCls}`}
                    onClick={() => setLocation(`/pladser/${s.id}`)}
                  >
                    {COLS.map((col) => {
                      const isSticky = col.sticky;
                      const stickyStyle = isSticky
                        ? { position: "sticky" as const, left: STICKY_OFFSETS[col.key], zIndex: 1, minWidth: col.w, maxWidth: col.w, backgroundColor: "var(--card)" }
                        : { minWidth: col.w, maxWidth: col.w };

                      if (col.key === "active") {
                        return (
                          <td
                            key={col.key}
                            style={stickyStyle}
                            className={`${tdBase} text-center`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActiveMutation.mutate({ id: s.id, active: !s.active });
                            }}
                          >
                            {s.active
                              ? <ToggleRight className="w-5 h-5 text-green-400 inline hover:opacity-70" />
                              : <ToggleLeft className="w-5 h-5 text-muted-foreground/40 inline hover:opacity-70" />}
                          </td>
                        );
                      }

                      const val = col.get(s);
                      return (
                        <td
                          key={col.key}
                          style={stickyStyle}
                          title={typeof val === "string" ? val : undefined}
                          className={`${tdBase} ${col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : ""} ${col.mono ? "font-mono" : ""} ${isSticky ? "shadow-[2px_0_4px_rgba(0,0,0,0.15)]" : ""} text-muted-foreground overflow-hidden`}
                        >
                          <div className="truncate">{val}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t px-5 py-1.5 text-xs text-muted-foreground bg-card/30 shrink-0 flex items-center gap-4">
        <span>{filtered.length} af {sites.length} pladser fra Excel</span>
        <span className="text-border">·</span>
        <span>{sites.filter(s => s.active).length} aktive i drift</span>
        <span className="text-border">·</span>
        <span>{sites.filter(s => s.hasMarker).length} med markør</span>
        <span className="text-border">·</span>
        <span>{sites.filter(s => s.geometryCount > 0).length} med geometri</span>
        <span className="text-border">·</span>
        <span>74 kolonner · horisontal scroll →</span>
      </div>
    </div>
  );
}
