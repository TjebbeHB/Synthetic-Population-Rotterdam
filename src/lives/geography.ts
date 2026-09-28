import buurten from '../data/rotterdamBuurten.json';
import wijken from '../data/rotterdamWijken.json';
import { stateAt } from './transmission';
import type { Population, Trace } from './types';

export type GeographyLevel = 'wijk' | 'buurt';
export const GEOMETRY = { wijk: wijken, buurt: buurten };
// CBS codes consist of municipality (4), wijk (2), then buurt (2) digits.
export function wijkCode(buurt: string) {
  return /^BU\d{8}$/.test(buurt) ? `WK${buurt.slice(2, 8)}` : '';
}
export function matchesArea(buurt: string, selection: string) {
  return !selection || buurt === selection || wijkCode(buurt) === selection;
}
export interface GeographicSummary {
  id: string; name: string; n: number; infectious: number; cases: number;
}
export function geographicSummaries(population: Population, trace: Trace | null, day: number, level: GeographyLevel) {
  const summaries = new Map<string, GeographicSummary>();
  const names = new Map(GEOMETRY[level].features.map(f => [f.properties.code, f.properties.name]));
  for (const person of population.people) {
    const id = level === 'wijk' ? wijkCode(person.area) : person.area;
    let row = summaries.get(id);
    if (!row) {
      row = { id, name: names.get(id) ?? population.source.areas.find(a => a.id === id)?.name ?? id, n: 0, infectious: 0, cases: 0 };
      summaries.set(id, row);
    }
    row.n++;
    if (stateAt(trace, person.id, day) === 'I') row.infectious++;
    if (trace && trace.infectedOn[person.id] >= 0 && trace.infectedOn[person.id] <= day) row.cases++;
  }
  return [...summaries.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

// Spread the display sample through the entire selection, rather than showing
// only the first buurt in a population ordered by CBS code. Counts use everyone.
export function mapPersonIds(population: Population, area: string, limit = 1500) {
  const people = population.people.filter(p => matchesArea(p.area, area));
  const n = Math.min(people.length, limit);
  return Array.from({ length: n }, (_, i) => people[Math.floor(i * people.length / n)].id);
}
