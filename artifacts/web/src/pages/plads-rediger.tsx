import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { ArrowLeft, MapPin, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

type Site = {
  id: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  level: string;
  dayRule: string;
  active: boolean;
  notes: string | null;
  codeKey: string | null;
  iceControl: string | null;
  app: string | null;
  bigCustomer: string | null;
  kunde: string | null;
  vaKunde: string | null;
  smapsId: string | null;
  areaId: string;
  areaName: string;
  geometryCount: number;
  markers: { lat: number; lng: number; label: string | null }[];
};

type FormState = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  level: string;
  dayRule: string;
  active: boolean;
  notes: string;
  codeKey: string;
  iceControl: string;
  app: string;
  bigCustomer: string;
  kunde: string;
  vaKunde: string;
};

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-start py-3 border-b border-border/40 last:border-0">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export default function PladsRedigerPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: site, isLoading } = useQuery<Site>({
    queryKey: ["site", id],
    queryFn: () => fetch(`${API}/sites/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

  const [form, setForm] = useState<FormState>({
    name: "", address: "", postalCode: "", city: "",
    level: "lav", dayRule: "altid", active: true, notes: "",
    codeKey: "", iceControl: "", app: "", bigCustomer: "",
    kunde: "", vaKunde: "",
  });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!site) return;
    setForm({
      name: site.name ?? "",
      address: site.address ?? "",
      postalCode: site.postalCode ?? "",
      city: site.city ?? "",
      level: site.level ?? "lav",
      dayRule: site.dayRule ?? "altid",
      active: site.active ?? true,
      notes: site.notes ?? "",
      codeKey: site.codeKey ?? "",
      iceControl: site.iceControl ?? "",
      app: site.app ?? "",
      bigCustomer: site.bigCustomer ?? "",
      kunde: site.kunde ?? "",
      vaKunde: site.vaKunde ?? "",
    });
    setIsDirty(false);
  }, [site]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setIsDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || undefined,
          address: form.address || null,
          postalCode: form.postalCode || null,
          city: form.city || null,
          level: form.level,
          dayRule: form.dayRule,
          active: form.active,
          notes: form.notes || null,
          codeKey: form.codeKey || null,
          iceControl: form.iceControl || null,
          app: form.app || null,
          bigCustomer: form.bigCustomer || null,
          kunde: form.kunde || null,
          vaKunde: form.vaKunde || null,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site", id] });
      qc.invalidateQueries({ queryKey: ["sites-admin"] });
      toast({ title: "Plads gemt" });
      setIsDirty(false);
      setLocation(`/pladser/${id}`);
    },
    onError: () => toast({ title: "Fejl ved gemning", variant: "destructive" }),
  });

  const geocodeMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/sites/${id}/geocode`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["site", id] });
      toast({ title: `Markør opdateret: ${data.lat?.toFixed(5)}, ${data.lng?.toFixed(5)}` });
    },
    onError: () => toast({ title: "Geokodning fejlede", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Indlæser…
      </div>
    );
  }

  if (!site) {
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

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/pladser/${id}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Tilbage
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-bold truncate max-w-sm">Rediger: {site.name}</h1>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!isDirty || saveMutation.isPending}
          className="gap-1.5"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Gemmer…" : "Gem ændringer"}
        </Button>
      </div>

      {/* Stamdata */}
      <section className="bg-card border rounded-2xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Stamdata</h2>
        <div className="space-y-0">
          <FieldRow label="Pladsnavn">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="h-8" />
          </FieldRow>
          <FieldRow label="Adresse" hint="Gadenavn og nummer">
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} className="h-8" placeholder="Eksempel: Vestergade 9B" />
          </FieldRow>
          <FieldRow label="Postnr">
            <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} className="h-8 w-28" placeholder="8600" />
          </FieldRow>
          <FieldRow label="By">
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} className="h-8" placeholder="Silkeborg" />
          </FieldRow>
        </div>
      </section>

      {/* Udkald & Drift */}
      <section className="bg-card border rounded-2xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Udkald & Drift</h2>
        <div className="space-y-0">
          <FieldRow label="Niveau">
            <Select value={form.level} onValueChange={(v) => set("level", v)}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vip">VIP</SelectItem>
                <SelectItem value="hoj">HØJ</SelectItem>
                <SelectItem value="lav">LAV</SelectItem>
                <SelectItem value="basis">BASIS</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Dage">
            <Select value={form.dayRule} onValueChange={(v) => set("dayRule", v)}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="altid">Alle dage</SelectItem>
                <SelectItem value="hverdage">Kun hverdage</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Aktiv">
            <Select value={form.active ? "true" : "false"} onValueChange={(v) => set("active", v === "true")}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Aktiv</SelectItem>
                <SelectItem value="false">Inaktiv</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="KodeNøgle">
            <Input value={form.codeKey} onChange={(e) => set("codeKey", e.target.value)} className="h-8 font-mono" />
          </FieldRow>
          <FieldRow label="Strømiddel" hint="Fra Excel: Strømiddel (col 45)">
            <Input value={form.iceControl} onChange={(e) => set("iceControl", e.target.value)} className="h-8" placeholder="Vejsalt / Urea" />
          </FieldRow>
          <FieldRow label="App" hint="App-system">
            <Input value={form.app} onChange={(e) => set("app", e.target.value)} className="h-8" />
          </FieldRow>
        </div>
      </section>

      {/* Kunde */}
      <section className="bg-card border rounded-2xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Kunde</h2>
        <div className="space-y-0">
          <FieldRow label="Kundenavn" hint="Fra Excel: Kunde (col 6)">
            <Input value={form.kunde} onChange={(e) => set("kunde", e.target.value)} className="h-8" placeholder="Snevagten" />
          </FieldRow>
          <FieldRow label="VA-Nr (Kunde)" hint="Fra Excel: VaNrKunde (col 5)">
            <Input value={form.vaKunde} onChange={(e) => set("vaKunde", e.target.value)} className="h-8 font-mono" />
          </FieldRow>
          <FieldRow label="Storkunde" hint="Fra Excel: Storkunde (col 7)">
            <Input value={form.bigCustomer} onChange={(e) => set("bigCustomer", e.target.value)} className="h-8" />
          </FieldRow>
        </div>
      </section>

      {/* Bemærkninger */}
      <section className="bg-card border rounded-2xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Bemærkninger</h2>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Interne bemærkninger om pladsen…"
        />
      </section>

      {/* Geokodning */}
      <section className="bg-card border rounded-2xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5" /> Markør & Geokodning
        </h2>
        <div className="flex items-center justify-between">
          <div>
            {marker ? (
              <p className="text-sm text-muted-foreground">
                Nuværende markør: <span className="font-mono text-foreground">{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen markør sat endnu</p>
            )}
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Geokodning bruger ovenstående adresse via Danmarks Adresseregister (DAWA)
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => geocodeMutation.mutate()}
            disabled={geocodeMutation.isPending || !site.address}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${geocodeMutation.isPending ? "animate-spin" : ""}`} />
            {marker ? "Genkod adresse" : "Geokod adresse"}
          </Button>
        </div>
      </section>

      {/* Bottom save */}
      <div className="flex justify-end gap-3 pb-4">
        <Button variant="outline" onClick={() => setLocation(`/pladser/${id}`)}>
          Annuller
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!isDirty || saveMutation.isPending}
        >
          <Save className="w-4 h-4 mr-1.5" />
          {saveMutation.isPending ? "Gemmer…" : "Gem ændringer"}
        </Button>
      </div>
    </div>
  );
}
