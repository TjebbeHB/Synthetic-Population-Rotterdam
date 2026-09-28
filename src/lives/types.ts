export type Feature = 'households' | 'schools' | 'work' | 'events' | 'education' | 'income' | 'cars';
export type Layer = 'household' | 'school' | 'work' | 'event' | 'institution';
export interface AreaSource {
  id: string; name: string; province?: string; provinceName?: string; population: number; ages: number[]; male: number | null;
  households: number | null; single: number | null; noKids: number | null; withKids: number | null;
  workers: number | null; pupils: (number | null)[]; education: (number | null)[];
  incomeLow: number | null; incomeHigh: number | null; cars: number | null;
  lat: number | null; lon: number | null;
}
export interface AgePrior { lo: number; hi: number; count: number; child: number; institutional: number; singleParent: number; parents: number }
export interface SourceBundle {
  scope?: 'rotterdam' | 'national';
  areaAgePriors?: Record<string, AgePrior[]>;
  year: number; table: string; retrievedAt: string; mode: 'snapshot' | 'live';
  areas: AreaSource[]; agePrior: AgePrior[]; outsideWorkShare: number;
  sources: { title: string; url: string; period: string; note: string }[];
}
export interface GenerateOptions { seed: number; count: number; areas: string[]; features: Feature[]; commuteKm: number; eventParticipation: number; }
export interface Person {
  sewageId?: string | null; sewageStatus?: 'linked' | 'no-location' | 'outside-boundaries' | 'overlap';
  id: number; area: string; age: number; sex: 'M' | 'V' | '?';
  household: number; role: 'child' | 'parent' | 'partner' | 'single' | 'co_resident' | 'institutional' | 'unresolved';
  parents: number[]; student: boolean; employed: boolean; activity: string;
  school: number | null; work: number | null; event: number | null;
  education?: string; income?: string; cars?: number; workDays?: number[];
}
export interface Cluster { id: number; kind: Layer; area: string; label: string; members: number[]; days: number[]; }
export interface AreaValidation {
  id: string; n: number; ageTarget: number[]; ageActual: number[];
  householdTarget: number | null; householdActual: number; singleTarget: number | null; singleActual: number;
  workerTarget: number | null; workerActual: number; unresolvedChildren: number;
  schoolTarget: (number | null)[]; schoolActual: number[];
}
export interface Population {
  sewage?: { source: string; published: string; retrieved: string; method: string; note: string; counts: Record<string, number> };
  version: string; options: GenerateOptions; source: SourceBundle; people: Person[]; clusters: Cluster[];
  checks: AreaValidation[]; warnings: string[]; representedResidents: number; isSample: boolean;
}
export interface Transmission { number: number; source: number; target: number; day: number; layer: Layer; cluster: number; generation: number }
export interface EpidemicOptions { seed: number; index: number; days: number; probability: number; latentDays: number; infectiousDays: number; }
export interface Trace { options: EpidemicOptions; infectedOn: number[]; infectiousOn: number[]; recoveredOn: number[]; transmissions: Transmission[]; }
export const LAYER_LABELS: Record<Layer, string> = { household: 'Huishouden', school: 'School', work: 'Werk', event: 'Evenement', institution: 'Instelling' };
export const FEATURES: { id: Feature; label: string; description: string; recommended?: boolean }[] = [
  { id: 'households', label: 'Huishoudens & familie', description: 'Leeftijdsgrenzen, ouder-kindrelaties en gedeelde woningen.', recommended: true },
  { id: 'schools', label: 'School & studie', description: 'Leerlingen naar woonbuurt; klassen per leeftijd. Inclusief werkende studenten.', recommended: true },
  { id: 'work', label: 'Werk & pendel', description: 'Werkende inwoners; Rotterdamse woon-werkverdeling als bestemmingsprior.', recommended: true },
  { id: 'events', label: 'Evenementen', description: 'Optionele, veronderstelde ontmoetingen. Geen CBS-contactregistratie.' },
  { id: 'education', label: 'Opleidingsniveau', description: 'Buurtverdeling van behaald onderwijs, 15–74 jaar. Ontbrekend blijft onbekend.' },
  { id: 'income', label: 'Huishoudinkomen', description: 'Lage 40%, middelste 40%, hoge 20% van de nationale verdeling.' },
  { id: 'cars', label: 'Autobezit', description: 'Auto’s per huishouden; verdeling naar huishoudkenmerken is een aanname.' },
];
