import { CBS_YEARS, yearConfig, cbsNumber as number } from './cbsYears';
import centroids from '../data/rotterdamCentroids.json';
import snapshot from '../data/cbsRotterdamSnapshot.json';
import geometry from '../data/rotterdamBuurten.json';
import type { AgePrior, AreaSource, SourceBundle } from './types';

const BASE = 'https://opendata.cbs.nl/ODataApi/OData/';
export const TABLES: Record<number, string> = Object.fromEntries(Object.entries(CBS_YEARS).map(([year,c])=>[year,c.kwb]));
type Row = Record<string, unknown>;
export interface RawSource { year: number; retrievedAt: string; rows: Row[]; names: Row[]; ages: Row[]; commute: Row[] }
const profiles = centroids.buurten;
const centres=new Map(geometry.features.map(f=>{
  const coordinates=f.geometry.coordinates as unknown as number[][][][];
  const points=(f.geometry.type==='Polygon'?[coordinates]:coordinates).flat(2) as unknown as number[][];
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return [f.properties.code,{lat:(Math.min(...ys)+Math.max(...ys))/2,lon:(Math.min(...xs)+Math.max(...xs))/2}];
}));
export function parseSource(raw: RawSource, mode: SourceBundle['mode']): SourceBundle {
  const config=yearConfig(raw.year);
  const names = new Map(raw.names.map(r => [String(r.Key).trim(), String(r.Title).trim()]));
  const areas: AreaSource[] = raw.rows.filter(r => String(r.WijkenEnBuurten).trim().startsWith('BU0599') && (number(r, 'AantalInwoners_5') ?? 0) > 0).map(r => {
    const id = String(r.WijkenEnBuurten).trim(), p = profiles.find(x => x.id === id), centre=centres.get(id);
    return { id, name: names.get(id) ?? p?.name ?? id, population: number(r, 'AantalInwoners_5')!,
      ages: ['k_0Tot15Jaar_8','k_15Tot25Jaar_9','k_25Tot45Jaar_10','k_45Tot65Jaar_11','k_65JaarOfOuder_12'].map(k => number(r, k) ?? -1),
      male: number(r, 'Mannen_6'), households: number(r,'HuishoudensTotaal_29'), single: number(r,'Eenpersoonshuishoudens_30'),
      noKids: number(r,'HuishoudensZonderKinderen_31'), withKids: number(r,'HuishoudensMetKinderen_32'),
      workers: number(r,'WerkzameBeroepsbevolking_70'),
      pupils: ['LeerlingenPo_62','LeerlingenVoInclVavo_63','StudentenMboExclExtranei_64','StudentenHbo_65','StudentenWo_66'].map(k => number(r,k)),
      education: ['BasisonderwijsVmboMbo1_67','HavoVwoMbo24_68','HboWo_69'].map(k => number(r,k)),
      incomeLow: number(r,'k_40HuishoudensMetLaagsteInkomen_84'), incomeHigh: number(r,'k_20HuishoudensMetHoogsteInkomen_85'), cars: number(r,'PersonenautoSPerHuishouden_107'),
      lat: p?.lat ?? centre?.lat ?? null, lon: p?.lon ?? centre?.lon ?? null };
  }).sort((a,b) => a.id.localeCompare(b.id));
  const agePrior: AgePrior[] = raw.ages.flatMap(r => {
    const code = String(r.Leeftijd).trim(), lo = code === '22000' ? 95 : (Number(code) / 100 - 701) * 5;
    if (!Number.isInteger(lo) || lo < 0 || lo > 95) return [];
    return [{ lo, hi: lo === 95 ? 104 : lo + 4, count: number(r,'TotaalPersonenInHuishoudens_1') ?? 0,
      child: number(r,'ThuiswonendKind_3') ?? 0, institutional: number(r,'PersonenInInstitutioneleHuishoudens_12') ?? 0,
      singleParent: number(r,'OuderInEenouderhuishouden_10') ?? 0,
      parents: (number(r,'PartnerInNietGehuwdPaarMetKinderen_8') ?? 0) + (number(r,'PartnerInGehuwdPaarMetKinderen_9') ?? 0) }];
  });
  const jobs = raw.commute.filter(r => String(r.WerkregioS).trim().startsWith('GM'));
  const all = jobs.reduce((s,r) => s + (number(r,'BanenVanWerknemers_1') ?? 0), 0);
  const outside = jobs.filter(r => String(r.WerkregioS).trim() !== 'GM0599').reduce((s,r) => s + (number(r,'BanenVanWerknemers_1') ?? 0), 0);
  if (!areas.length || agePrior.length !== 20 || !all) throw new Error('CBS-bron is onvolledig. De vorige populatie blijft behouden.');
  return { year: raw.year, table: TABLES[raw.year], retrievedAt: raw.retrievedAt, mode, areas, agePrior, outsideWorkShare: outside/all,
    sources: [
      { title:'Kaartgeometrie Rotterdam', url:'https://www.pdok.nl/introductie/-/article/cbs-wijken-en-buurten', period:'2024', note:'De kaart gebruikt vaste CBS/PDOK-grenzen 2024. Bij andere bronjaren is dit een ruimtelijke referentie via gelijke codes, geen historische grensreconstructie. Niet-passende codes krijgen geen locatie.' },
      { title: `CBS Kerncijfers wijken en buurten ${raw.year}`, url: `${BASE}${TABLES[raw.year]}`, period: String(raw.year), note: 'Bevolking op 1 januari. Onderwijs, arbeid en inkomen kunnen een ander referentiemoment hebben; zie CBS-tabeltoelichting. Null betekent onbekend of onderdrukt.' },
      { title: 'CBS Rotterdam: leeftijd en huishoudpositie', url: `${BASE}71488ned`, period: `${raw.year}JJ00`, note: 'Vijfjaarsleeftijden, institutionele bewoners en gezinspositie op gemeenteniveau; lokale verdeling is een aanname. Binnen vijfjaarsgroepen uniforme leeftijden; 95+ afgekapt op 104.' },
      { title: 'CBS banen: woon- en werkregio', url: `${BASE}85481NED`, period: config.commutePeriod, note: `December ${config.commutePeriod.slice(0,4)}${raw.year===2025 ? ' (2025 nog niet beschikbaar)' : ''}. Aandeel buiten Rotterdam onder waargenomen gemeentebestemmingen; banen van werknemers, geen personen of ritten. Binnenstedelijke werkplekken, uren en dagroosters zijn aannames.` },
    ] };
}
export const SNAPSHOT = parseSource(snapshot as RawSource, 'snapshot');

async function rows(url: string, signal?: AbortSignal): Promise<Row[]> {
  const result: Row[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < 100; page++) {
    if (!next.startsWith(BASE)) throw new Error('Onverwachte CBS-vervolgpagina.');
    const response = await fetch(next, { signal });
    if (!response.ok) throw new Error(`CBS is niet bereikbaar (${response.status}). Gebruik de meegeleverde bron of probeer opnieuw.`);
    const data = await response.json();
    if (!Array.isArray(data.value)) throw new Error('CBS gaf geen geldige tabel terug.');
    result.push(...data.value); next = data['odata.nextLink'] ?? data['@odata.nextLink'];
  }
  if (next) throw new Error('CBS-tabel is te groot voor deze selectie.');
  return result;
}
export async function fetchSource(year: number, signal?: AbortSignal): Promise<SourceBundle> {
  const config=yearConfig(year), table=config.kwb;
  const query = (t: string, entity: string, filter?: string) => `${BASE}${t}/${entity}${filter ? `?$filter=${encodeURIComponent(filter)}` : ''}`;
  const [data,names,ages,commute] = await Promise.all([
    rows(query(table,'TypedDataSet',"startswith(WijkenEnBuurten,'BU0599')"),signal),
    rows(query(table,'WijkenEnBuurten',"startswith(Key,'BU0599')"),signal),
    rows(query('71488ned','TypedDataSet',`RegioS eq 'GM0599' and Perioden eq '${year}JJ00' and Geslacht eq 'T001038' and Leeftijd ne '10000'`),signal),
    rows(query('85481NED','TypedDataSet',`WoonregioS eq 'GM0599' and Perioden eq '${config.commutePeriod}' and startswith(WerkregioS,'GM')`),signal),
  ]);
  return parseSource({ year, retrievedAt: new Date().toISOString(), rows:data, names, ages, commute },'live');
}
