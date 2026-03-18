import type { Area, Site, Callout, Customer, Person } from "@workspace/api-client-react";

export const MOCK_CUSTOMERS: Customer[] = [
  { id: "c1", name: "Københavns Kommune", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "c2", name: "Frederiksberg Kommune", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

export const MOCK_AREAS: Area[] = [
  { id: "a1", name: "Vesterbro", description: "Indre Vesterbro og Enghave", active: true, customerId: "c1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "a2", name: "Nørrebro", description: "Nørrebrogade og sidegader", active: true, customerId: "c1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "a3", name: "Amager", description: "Amagerbro og Sundby", active: true, customerId: "c1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "a4", name: "Frederiksberg", description: "Frederiksberg C", active: true, customerId: "c2", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

export const MOCK_SITES: Site[] = [
  { id: "s1", areaId: "a1", name: "Kødbyen (Torvet)", level: "vip", dayRule: "altid", active: true, address: "Flæsketorvet 1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "s2", areaId: "a1", name: "Enghave Plads", level: "hoj", dayRule: "altid", active: true, address: "Enghave Plads", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "s3", areaId: "a2", name: "Sankt Hans Torv", level: "vip", dayRule: "altid", active: true, address: "Sankt Hans Torv", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "s4", areaId: "a2", name: "Blågårds Plads", level: "lav", dayRule: "hverdage", active: true, address: "Blågårds Plads", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "s5", areaId: "a3", name: "Amagerbro Torv", level: "hoj", dayRule: "altid", active: true, address: "Amagerbrogade 100", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "s6", areaId: "a4", name: "Frederiksberg Rådhusplads", level: "vip", dayRule: "altid", active: true, address: "Smallegade 1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "s7", areaId: "a4", name: "Gammel Kongevej Cykelsti", level: "basis", dayRule: "hverdage_og_lordag", active: true, address: "Gammel Kongevej", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// Mock coordinates for sites since base Site type doesn't include markers in list view
export const MOCK_SITE_COORDS: Record<string, { lat: number, lng: number }> = {
  "s1": { lat: 55.6676, lng: 12.5615 },
  "s2": { lat: 55.6673, lng: 12.5451 },
  "s3": { lat: 55.6917, lng: 12.5612 },
  "s4": { lat: 55.6865, lng: 12.5574 },
  "s5": { lat: 55.6622, lng: 12.6033 },
  "s6": { lat: 55.6778, lng: 12.5332 },
  "s7": { lat: 55.6754, lng: 12.5471 },
};

export const MOCK_CALLOUTS: Callout[] = [
  { id: "co1", title: "Snestorm Nord & Vest", status: "aktiv", notes: "Kør forsigtigt", startedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "co2", title: "Præventiv Saltning - VIP", status: "kladde", notes: "Forventet frost inat", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

export const MOCK_PEOPLE: Person[] = [
  { id: "p1", firstName: "Lars", lastName: "Hansen", role: "chauffør", companyId: "c1", active: true, phone: "+45 12345678", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "p2", firstName: "Mette", lastName: "Jensen", role: "disponent", companyId: "c1", active: true, phone: "+45 87654321", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
