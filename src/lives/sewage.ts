import geometry from '../data/rotterdamSewage.json';
import { householdPoint } from './locations';
import type { Population } from './types';

export const SEWAGE_GEOMETRY = geometry;
export const SEWAGE_SOURCE = {
  source: geometry.source, published: geometry.published, retrieved: geometry.retrieved,
  method: 'synthetic-home-point-in-polygon',
  note: 'RIVM-kaartgrenzen 2022; geschatte koppeling van verzonnen woonlocaties. Geen bevestigde rioolaansluiting.',
};
export type SewageStatus = 'linked' | 'no-location' | 'outside-boundaries' | 'overlap';
export interface SewageAssignment { sewageId: string | null; sewageStatus: SewageStatus }
type Point = [number, number];
type Polygon = Point[][];
const shapes = geometry.features.map(f => {
  const polygons = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Polygon[];
  const outer = polygons.flatMap(p => p[0]);
  return { code: f.properties.code, polygons, bounds: [Math.min(...outer.map(p => p[0])), Math.min(...outer.map(p => p[1])), Math.max(...outer.map(p => p[0])), Math.max(...outer.map(p => p[1]))] };
});
function inRing(point: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function catchmentForPoint(point: Point | null): SewageAssignment {
  if (!point) return { sewageId: null, sewageStatus: 'no-location' };
  const matches = shapes.filter(s => point[0] >= s.bounds[0] && point[0] <= s.bounds[2] && point[1] >= s.bounds[1] && point[1] <= s.bounds[3] &&
    s.polygons.some(p => inRing(point, p[0]) && !p.slice(1).some(hole => inRing(point, hole))));
  return matches.length === 1 ? { sewageId: matches[0].code, sewageStatus: 'linked' } :
    { sewageId: null, sewageStatus: matches.length ? 'overlap' : 'outside-boundaries' };
}
export function attachCatchments(population: Population) {
  const cache = new Map<string, SewageAssignment>();
  const counts: Record<SewageStatus, number> = { linked: 0, 'no-location': 0, 'outside-boundaries': 0, overlap: 0 };
  for (const person of population.people) {
    const key = `${person.area}:${person.household >= 0 ? 'h' + person.household : 'p' + person.id}`;
    let assignment = cache.get(key);
    if (!assignment) { assignment = catchmentForPoint(householdPoint(person, population.options.seed)); cache.set(key, assignment); }
    Object.assign(person, assignment); counts[assignment.sewageStatus]++;
  }
  population.sewage = { ...SEWAGE_SOURCE, counts };
  return population;
}
export const sewageName = (id: string | null | undefined) => geometry.features.find(f => f.properties.code === id)?.properties.name ?? 'Niet gekoppeld';
