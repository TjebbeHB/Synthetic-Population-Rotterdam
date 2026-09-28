import { yearConfig, cbsNumber as number } from '../lives/cbsYears';
import snapshot from '../data/cbsNetherlandsSnapshot.json';
import type { AgePrior, AreaSource, SourceBundle } from '../lives/types';
type Row = Record<string, unknown>;
const BASE = 'https://opendata.cbs.nl/ODataApi/OData/';
export function agePriors(rows: Row[]): AgePrior[] {
  return rows.flatMap(r => {
    const code = String(r.Leeftijd).trim(), lo = code === '22000' ? 95 : (Number(code) / 100 - 701) * 5;
    return !Number.isInteger(lo) || lo < 0 || lo > 95 ? [] : [{ lo, hi: lo === 95 ? 104 : lo + 4,
      count:number(r,'TotaalPersonenInHuishoudens_1')??0, child:number(r,'ThuiswonendKind_3')??0,
      institutional:number(r,'PersonenInInstitutioneleHuishoudens_12')??0,singleParent:number(r,'OuderInEenouderhuishouden_10')??0,
      parents:(number(r,'PartnerInNietGehuwdPaarMetKinderen_8')??0)+(number(r,'PartnerInGehuwdPaarMetKinderen_9')??0) }];
  }).sort((a,b)=>a.lo-b.lo);
}
export function parseNational(rows: Row[], geography: Row[], ages: Row[], nationalAges: Row[], mode: 'live'|'snapshot', retrievedAt = new Date().toISOString(), year = 2024): SourceBundle {
  const config=yearConfig(year);
  const provinces = new Map(geography.map(r=>[String(r.Code_1).trim(),{province:String(r[config.provinceCode]).trim(),provinceName:String(r[config.provinceName]).trim()}]));
  const areas: AreaSource[] = rows.filter(r=>/^GM\d{4}$/.test(String(r.WijkenEnBuurten).trim())&&(number(r,'AantalInwoners_5')??0)>0).map(r=>{
    const id=String(r.WijkenEnBuurten).trim();
    return {id,name:String(r.Gemeentenaam_1).trim(),...provinces.get(id),population:number(r,'AantalInwoners_5')!,
      ages:['k_0Tot15Jaar_8','k_15Tot25Jaar_9','k_25Tot45Jaar_10','k_45Tot65Jaar_11','k_65JaarOfOuder_12'].map(k=>number(r,k)??-1),
      male:number(r,'Mannen_6'),households:number(r,'HuishoudensTotaal_29'),single:number(r,'Eenpersoonshuishoudens_30'),noKids:number(r,'HuishoudensZonderKinderen_31'),withKids:number(r,'HuishoudensMetKinderen_32'),workers:number(r,'WerkzameBeroepsbevolking_70'),
      pupils:['LeerlingenPo_62','LeerlingenVoInclVavo_63','StudentenMboExclExtranei_64','StudentenHbo_65','StudentenWo_66'].map(k=>number(r,k)),
      education:['BasisonderwijsVmboMbo1_67','HavoVwoMbo24_68','HboWo_69'].map(k=>number(r,k)),
      incomeLow:number(r,'k_40HuishoudensMetLaagsteInkomen_84'),incomeHigh:number(r,'k_20HuishoudensMetHoogsteInkomen_85'),cars:number(r,'PersonenautoSPerHuishouden_107'),lat:null,lon:null};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const grouped = new Map<string, Row[]>(); for(const row of ages){const id=String(row.RegioS).trim();if(!grouped.has(id))grouped.set(id,[]);grouped.get(id)!.push(row);}
  const areaAgePriors=Object.fromEntries([...grouped].map(([id,values])=>[id,agePriors(values)])),agePrior=agePriors(nationalAges);
  if(areas.length!==config.municipalities||new Set(areas.map(a=>a.id)).size!==areas.length||areas.some(a=>!/^PV\d{2}$/.test(a.province??'')||a.ages.some(n=>n<0)||areaAgePriors[a.id]?.length!==20)||agePrior.length!==20)throw new Error('De landelijke CBS-bron is onvolledig. De eerdere bron blijft beschikbaar.');
  return {scope:'national',year,table:config.kwb,retrievedAt,mode,areas,agePrior,areaAgePriors,outsideWorkShare:0,sources:[
    {title:`CBS Kerncijfers wijken en buurten ${year} · gemeenten`,url:BASE+config.kwb,period:String(year),note:'Gemeentelijke bevolkings-, huishoud- en kenmerkmarges. Variabelen kunnen andere referentiejaren hebben; zie tabelmetadata. Geen buurtverdeling buiten Rotterdam.'},
    {title:`CBS Gebieden in Nederland ${year}`,url:BASE+config.geography,period:String(year),note:'Officiële gemeente- en provinciecodes voor dit bronjaar.'},
    {title:'CBS leeftijd en huishoudpositie per gemeente',url:BASE+'71488ned',period:`${year}JJ00`,note:'Eigen gemeentelijke vijfjaarsprioren. Onbekende/niet-toepasselijke huishoudposities tellen als nul bij de gewichten. 95+ afgekapt op 104.'},
  ]};
}
export const NATIONAL_SNAPSHOT = snapshot as SourceBundle;
export async function fetchNationalSource(signal?: AbortSignal, year = 2024) {
  const config=yearConfig(year);
  async function get(table: string, filter?: string) {
    const url=BASE+table+'/TypedDataSet'+(filter?'?$filter='+encodeURIComponent(filter):'');
    const response=await fetch(url,{signal});if(!response.ok)throw new Error(`Landelijke CBS-opvraag mislukt (${response.status}).`);
    const data=await response.json();if(!Array.isArray(data.value)||data['odata.nextLink']||data['@odata.nextLink'])throw new Error('Onvolledige CBS-tabel.');return data.value as Row[];
  }
  const base=`Perioden eq '${year}JJ00' and Geslacht eq 'T001038' and Leeftijd ne '10000'`;
  const [rows,geo,national]=await Promise.all([get(config.kwb,"startswith(WijkenEnBuurten,'GM')"),get(config.geography),get('71488ned',"RegioS eq 'NL01  ' and "+base)]);
  // CBS estimates wildcard queries across historical region codes above its
  // 10,000-row cap. Explicit current municipality batches stay bounded.
  const codes=geo.map(r=>String(r.Code_1).trim());
  const batches:string[][]=[];for(let i=0;i<codes.length;i+=25)batches.push(codes.slice(i,i+25));
  const results:Row[][]=new Array(batches.length);let next=0;
  await Promise.all(Array.from({length:Math.min(4,batches.length)},async()=>{
    while(next<batches.length){const index=next++;const regions=batches[index].map(code=>`RegioS eq '${code}'`).join(' or ');results[index]=await get('71488ned',`${base} and (${regions})`);}
  }));
  const ages=results.flat();
  return parseNational(rows,geo,ages,national,'live',new Date().toISOString(),year);
}
