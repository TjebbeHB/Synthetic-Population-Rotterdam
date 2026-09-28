import { Zip, ZipDeflate, strToU8 } from 'fflate';
import { generatePopulation, LIFE_VERSION, quotas } from '../lives/generate';
import { dailyActivities } from '../lives/activities';
import { FEATURES, type GenerateOptions, type Population, type SourceBundle } from '../lives/types';
import translink from '../data/translinkProfiles.json';
import methods from '../../docs/research-methods.md?raw';
import dictionary from '../../docs/research-data-dictionary.md?raw';

export interface ResearchRequest {
  source: SourceBundle; options: GenerateOptions; includeActivities: boolean; includeTranslink: boolean;
  nsStations?: unknown;
}
export interface ResearchSummary { people: number; batches: number; households: number; unresolvedChildren: number; warnings: string[]; checks: Population['checks']; }
export function batchSeed(seed: number, code: string) {
  let hash = seed >>> 0;
  for (const char of code) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
export function researchBatches(request: ResearchRequest) {
  const { source, options } = request;
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 4294967295) throw new Error('Seed moet een geheel getal tussen 0 en 4294967295 zijn.');
  if (new Set(options.areas).size !== options.areas.length) throw new Error('Selecteer ieder brongebied slechts eenmaal.');
  if (new Set(options.features).size !== options.features.length || options.features.some(f => !FEATURES.some(allowed => allowed.id === f))) throw new Error('Ongeldige persoonskenmerken.');
  if ((options.features.includes('income') || options.features.includes('cars')) && !options.features.includes('households')) throw new Error('Inkomen en autobezit vereisen huishoudens.');
  if (!Number.isFinite(options.commuteKm) || options.commuteKm < 1 || options.commuteKm > 30 || !Number.isFinite(options.eventParticipation) || options.eventParticipation < 0 || options.eventParticipation > 1) throw new Error('Ongeldige contactinstellingen.');
  const areas = source.areas.filter(a => options.areas.includes(a.id));
  if (!areas.length || areas.length !== new Set(options.areas).size) throw new Error('Selecteer geldige brongebieden.');
  if (areas.some(a => a.ages.length !== 5 || a.ages.some(n => !Number.isFinite(n) || n < 0) || !a.ages.some(n => n > 0))) throw new Error('Ontbrekende leeftijdsmarges in geselecteerde brongebieden.');
  if (source.scope === 'national' && areas.some(a => source.areaAgePriors?.[a.id]?.length !== 20)) throw new Error('Ontbrekende gemeentelijke leeftijdsprioren.');
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > areas.reduce((n, a) => n + a.population, 0)) throw new Error('Ongeldige populatiegrootte.');
  if (source.scope !== 'national') return [{ prefix: 'ROT', source, options }];
  const sizes = quotas(options.count, areas.map(a => a.population));
  return areas.flatMap((area, i) => sizes[i] ? [{
    prefix: area.id, source: { ...source, areas: [area], agePrior: source.areaAgePriors?.[area.id] ?? source.agePrior, areaAgePriors: undefined, outsideWorkShare: 0 },
    options: { ...options, count: sizes[i], areas: [area.id], seed: batchSeed(options.seed, area.id) },
  }] : []);
}
const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const row = (values: unknown[]) => values.map(cell).join(',') + '\r\n';
export const PERSON_COLUMNS = ['person_id','local_id','home_area','province_code','age','sex','household_id','household_role','parent_ids','student','school_assignment_status','employed','employment_assignment_status','school_id','work_id','event_id','work_days_monday0','education','household_income_band','household_cars','sewage_id','sewage_status'];
export function* personRows(p: Population, prefix: string) {
  const id = (n: number | null) => n === null || n < 0 ? '' : `${prefix}:C${n}`;
  const areas = new Map(p.source.areas.map(a => [a.id, a]));
  for (const person of p.people) {
    const area = areas.get(person.area)!;
    yield [ `${prefix}:P${person.id}`, person.id, person.area, area.province ?? (person.area.startsWith('BU0599') ? 'PV28' : ''), person.age, person.sex,
      id(person.household), person.role, person.parents.map(n => `${prefix}:P${n}`).join('|'), person.student,
      !p.options.features.includes('schools') ? 'disabled' : area.pupils.some(n => n === null) ? 'partial_source' : person.student ? 'assigned' : 'not_assigned',
      person.employed, !p.options.features.includes('work') ? 'disabled' : area.workers === null ? 'missing_source' : person.employed ? 'assigned' : 'not_assigned',
      id(person.school), id(person.work), id(person.event), person.workDays?.join('|'), person.education, person.income, person.cars, person.sewageId,
      person.sewageStatus ?? 'outside_geographic_coverage' ];
  }
}
/** ZIP streams incrementally; each CSV entry is municipality-sized. The sink
 * supplies backpressure, so a national export never retains the full country. */
export async function exportResearch(request: ResearchRequest, sink: (chunk: Uint8Array) => Promise<void>, progress: (done: number, total: number, name: string) => void, onPopulation?: (p: Population) => void): Promise<ResearchSummary> {
  const pending: Uint8Array[] = []; let zipError: Error | null = null, written = 0;
  const zip = new Zip((error, data) => { if (error) zipError = error; else pending.push(data); });
  async function flush() {
    if (zipError) throw zipError;
    for (const chunk of pending.splice(0)) {
      written += chunk.length;
      if (written >= 0xffffffff) throw new Error('ZIP wordt groter dan 4 GB. Exporteer per provincie.');
      await sink(chunk);
    }
  }
  const entry = (name: string) => { const f = new ZipDeflate(name, { level: 1 }); f.mtime = new Date('2024-01-01T00:00:00Z'); zip.add(f); return f; };
  function push(file: ZipDeflate, data: Uint8Array, final: boolean) {
    if (file.size + data.length >= 0xffffffff) throw new Error('Een CSV-bestand wordt groter dan 4 GB. Exporteer een kleinere selectie of zonder activiteiten.');
    file.push(data, final);
  }
  async function textFile(name: string, content: string) { push(entry(name), strToU8(content), true); await flush(); }
  async function csv(name: string, columns: string[], rows: Iterable<unknown[]>) {
    const file = entry(name); push(file, strToU8('\uFEFF' + row(columns)), false);
    let lines = '', count = 0;
    for (const values of rows) {
      lines += row(values);
      if (++count % 1000 === 0) { push(file, strToU8(lines), false); lines = ''; await flush(); }
    }
    push(file, strToU8(lines), true); await flush();
  }
  const summary: ResearchSummary = { people: 0, batches: 0, households: 0, unresolvedChildren: 0, warnings: [], checks: [] };
  const batches = researchBatches(request), warnings = new Set<string>();
  await textFile('methods.md', methods); await textFile('data-dictionary.md', dictionary);
  await textFile('source-inputs.json', JSON.stringify(request.source));
  const batchSeeds: Record<string, number> = {};
  for (const batch of batches) {
    progress(summary.people, request.options.count, batch.source.areas.length === 1 ? batch.source.areas[0].name : 'Rotterdam');
    const p = generatePopulation(batch.source, batch.options), prefix = batch.prefix;
    batchSeeds[prefix] = batch.options.seed;
    await csv(`${prefix}/people.csv`, PERSON_COLUMNS, personRows(p, prefix));
    await csv(`${prefix}/clusters.csv`, ['cluster_id','kind','area','label','days_monday0','member_count'], p.clusters.map(c => [`${prefix}:C${c.id}`,c.kind,c.area,c.label,c.days.join('|'),c.members.length]));
    function* memberships() { for (const c of p.clusters) for (const id of c.members) yield [`${prefix}:C${c.id}`,`${prefix}:P${id}`]; }
    await csv(`${prefix}/memberships.csv`, ['cluster_id','person_id'], memberships());
    if (request.includeActivities) {
      function* activities() { for (const person of p.people) for (let day = 0; day < 7; day++) for (const a of dailyActivities(p, person.id, day)) yield [`${prefix}:P${person.id}`,day,a.start,a.end,a.kind,a.label,a.area,a.cluster === null ? '' : `${prefix}:C${a.cluster}`,'assumed_schedule']; }
      await csv(`${prefix}/activities.csv`, ['person_id','weekday_monday0','start_minute','end_minute','kind','label','destination_area','cluster_id','basis'], activities());
    }
    await textFile(`${prefix}/quality.json`, JSON.stringify({ checks:p.checks, warnings:p.warnings, sourceAgePrior:p.source.agePrior, sewage:p.sewage, isSample:p.isSample }, null, 2));
    summary.people += p.people.length; summary.batches++; summary.households += p.clusters.filter(c => c.kind === 'household').length;
    summary.unresolvedChildren += p.checks.reduce((n, c) => n + c.unresolvedChildren, 0); summary.checks.push(...p.checks);
    p.warnings.forEach(w => warnings.add(w));
    if (request.source.scope !== 'national') onPopulation?.(p);
  }
  if (request.includeTranslink) await textFile('external/translink-hourly-profiles.json', JSON.stringify(translink, null, 2));
  if (request.nsStations) await textFile('external/ns-stations.json', JSON.stringify(request.nsStations, null, 2));
  if (request.source.scope === 'national') warnings.add('Gemeenten zijn onafhankelijk gegenereerd. Geen gemeentegrensoverschrijdende families, woon-werkstromen of contactnetwerken; werk- en schoolgroepen zijn lokale modelaannames.');
  summary.warnings = [...warnings];
  await textFile('manifest.json', JSON.stringify({ modelVersion:LIFE_VERSION, methodsVersion:'2.1', generatedAt:new Date().toISOString(), options:request.options,
    scope:request.source.scope ?? 'rotterdam', sourceYear:request.source.year, batchSeeds, includeActivities:request.includeActivities,
    translink:request.includeTranslink ? 'aggregate_reference_only_not_used_to_assign_trips' : 'not_included', ns:request.nsStations ? 'station_context_only_not_passenger_flows' : 'not_connected',
    sample:request.options.count < request.source.areas.filter(a=>request.options.areas.includes(a.id)).reduce((n,a)=>n+a.population,0),
    excludedAreas:request.source.areas.filter(a=>!request.options.areas.includes(a.id)).map(a=>({id:a.id,name:a.name,population:a.population})),
    zeroAllocatedAreas:request.options.areas.filter(id => !summary.checks.some(c => c.id === id)),
    mapGeometryYear:request.source.scope === 'national' ? null : 2024,
    sewageBoundaryYear:request.source.scope === 'national' ? null : 2022,
    geography:request.source.scope === 'national' ? 'municipality' : 'buurt', coverageNotes:'Only represented source areas; no extrapolation to ungenerated people. Rounded source totals may differ from national totals.',
    summary }, null, 2));
  zip.end(); await flush(); progress(summary.people, request.options.count, 'Gereed'); return summary;
}
