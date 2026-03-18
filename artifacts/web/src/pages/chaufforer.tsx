import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Phone, Mail, Search, UserCheck, UserX } from "lucide-react";
import { useAppData } from "@/hooks/use-app-data";
import { clsx } from "clsx";

const ROLE_LABELS: Record<string, string> = {
  "chauffør": "Chauffør",
  "disponent": "Disponent",
  "admin": "Admin",
};

const ROLE_COLORS: Record<string, string> = {
  "chauffør": "bg-blue-100 text-blue-700 border-blue-200",
  "disponent": "bg-purple-100 text-purple-700 border-purple-200",
  "admin": "bg-orange-100 text-orange-700 border-orange-200",
};

function getInitials(firstName: string, lastName: string) {
  return ((firstName?.[0] || "") + (lastName?.[0] || "")).toUpperCase() || "?";
}

function fullName(firstName: string, lastName: string) {
  return [firstName, lastName].filter(Boolean).join(" ");
}

export default function ChauffororPage() {
  const { people, isLoading } = useAppData();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const filtered = people.filter(p => {
    const name = fullName(p.firstName, p.lastName).toLowerCase();
    if (search && !name.includes(search.toLowerCase()) && !(p.phone || "").includes(search)) return false;
    if (filterRole && p.role !== filterRole) return false;
    if (filterActive !== null && p.active !== filterActive) return false;
    return true;
  });

  const roles = Array.from(new Set(people.map(p => p.role).filter(Boolean)));
  const activeCount = people.filter(p => p.active).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-in fade-in duration-300 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" />
            Chauffører & Personale
          </h1>
          <p className="text-muted-foreground mt-1">
            {people.length} personer · {activeCount} aktive
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Søg navn eller telefon..."
            className="pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-56"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterActive(filterActive === true ? null : true)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
              filterActive === true ? "bg-green-100 text-green-700 border-green-300" : "bg-card border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Aktive
          </button>
          <button
            onClick={() => setFilterActive(filterActive === false ? null : false)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
              filterActive === false ? "bg-red-100 text-red-700 border-red-300" : "bg-card border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <UserX className="w-3.5 h-3.5" />
            Inaktive
          </button>
        </div>

        <div className="flex gap-2">
          {roles.map(role => (
            <button
              key={role}
              onClick={() => setFilterRole(filterRole === role ? null : role)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                filterRole === role
                  ? ROLE_COLORS[role] || "bg-primary/10 text-primary border-primary/30"
                  : "bg-card border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {ROLE_LABELS[role] || role}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-lg font-medium">Ingen personer fundet</p>
          <p className="text-sm mt-1">Prøv at justere filtrene</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(person => (
            <Card key={person.id} className={clsx("hover:shadow-md transition-all duration-200", !person.active && "opacity-60")}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className={clsx(
                    "w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                    person.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {getInitials(person.firstName, person.lastName)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{fullName(person.firstName, person.lastName)}</p>
                    <span className={clsx(
                      "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border mt-1",
                      ROLE_COLORS[person.role || ""] || "bg-muted text-muted-foreground border-border"
                    )}>
                      {ROLE_LABELS[person.role || ""] || person.role || "Ukendt"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {person.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{person.phone}</span>
                    </div>
                  )}
                  {person.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{person.email}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className={clsx(
                    "text-xs font-medium",
                    person.active ? "text-green-600" : "text-muted-foreground"
                  )}>
                    {person.active ? "● Aktiv" : "○ Inaktiv"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
