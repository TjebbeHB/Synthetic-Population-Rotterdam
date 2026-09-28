import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Check, Database, FileText, MapPin, RefreshCw, TrainFront, Users } from 'lucide-react';
import { FEATURES, type Feature, type Population, type SourceBundle } from '../lives/types';
import { CBS_YEARS } from '../lives/cbsYears';
import { SNAPSHOT, fetchSource } from '../lives/sources';
import { NATIONAL_SNAPSHOT, fetchNationalSource } from './nationalSource';
import { geographicSummaries, wijkCode, type GeographyLevel } from '../lives/geography';
import LivesMap from '../lives/LivesMap';
import FullscreenMap from '../lives/FullscreenMap';
import { sewageName } from '../lives/sewage';
import ActivityAgenda from '../lives/ActivityAgenda';
import translink from '../data/translinkProfiles.json';
import type { ResearchRequest, ResearchSummary } from './export';
import '../lives/lives.css';
import './population.css';

type View = 'generate' | 'map';
type Scope = 'rotterdam' | 'national' | 'province';
interface NSContext { schema: string; source: string; sourceUrl: string; retrievedAt: string; use: string; stations: {code:string;name:string;latitude:number;longitude:number;country:string}[]; }
interface DiskWriter { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void>; }
const fmt=(n:number)=>n.toLocaleString('nl-NL');
const usable=(source:SourceBundle)=>source.areas.filter(a=>a.ages.every(n=>n>=0)&&a.ages.some(n=>n>0));
const supportsDisk = () => 'showSaveFilePicker' in window && window.isSecureContext;

export default function PopulationLab({view,onView}:{view:View;onView:(view:View)=>void}) {
  const [scope,setScope]=useState<Scope>('rotterdam'),[province,setProvince]=useState('PV28');
  const [source,setSource]=useState(SNAPSHOT),[loadingYear,setLoadingYear]=useState<number|null>(null);
  const sourceCache=useRef(new Map<string,SourceBundle>([['rotterdam:2024',SNAPSHOT],['national:2024',NATIONAL_SNAPSHOT]]));
  const [count,setCount]=useState(5000),[seed,setSeed]=useState(20260925),[features,setFeatures]=useState<Feature[]>(['households','schools','work']);
  const [activities,setActivities]=useState(false),[transit,setTransit]=useState(false),[ns,setNS]=useState<NSContext|null>(null);
  const [busy,setBusy]=useState<{completed:number;total:number;name:string}|null>(null),[fetching,setFetching]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<{summary:ResearchSummary;url:string|null;filename:string;scope:Scope;seed:number}|null>(null);
  const [population,setPopulation]=useState<Population|null>(null),[selected,setSelected]=useState(0),[level,setLevel]=useState<GeographyLevel>('wijk'),[area,setArea]=useState('');
  const worker=useRef<Worker|null>(null),writer=useRef<DiskWriter|null>(null),abort=useRef<AbortController|null>(null);
  const national=source.scope==='national'?source:NATIONAL_SNAPSHOT;
  const areas=useMemo(()=>usable(source).filter(a=>scope!=='province'||a.province===province),[source,scope,province]);
  const total=areas.reduce((n,a)=>n+a.population,0);
  const provinces=useMemo(()=>[...new Map(national.areas.map(a=>[a.province!,a.provinceName!])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'nl')),[national]);
  const mapSummaries=useMemo(()=>population?geographicSummaries(population,null,0,level):[],[population,level]);
  const person=population?.people[selected];
  useEffect(()=>()=>{worker.current?.terminate();void writer.current?.abort();abort.current?.abort();},[]);
  useEffect(()=>()=>{if(result?.url)URL.revokeObjectURL(result.url);},[result]);
  function toggle(id:Feature){setFeatures(old=>{const next=old.includes(id)?old.filter(f=>f!==id):[...old,id];if((id==='income'||id==='cars')&&!next.includes('households'))next.push('households');return id==='households'&&!next.includes(id)?next.filter(f=>f!=='income'&&f!=='cars'):next;});}
  const sourceRequest=useRef(0);
  async function loadSource(nextScope:Scope,year:number,force=false){
    const requestId=++sourceRequest.current;abort.current?.abort();
    const key=`${nextScope==='rotterdam'?'rotterdam':'national'}:${year}`;
    const apply=(updated:SourceBundle)=>{
      sourceCache.current.set(key,updated);setSource(updated);setScope(nextScope);
      const max=usable(updated).filter(a=>nextScope!=='province'||a.province===province).reduce((n,a)=>n+a.population,0);
      setCount(n=>Math.min(scope===nextScope?n:5000,max));
    };
    setError('');const cached=sourceCache.current.get(key);
    if(cached&&!force){apply(cached);setFetching(false);setLoadingYear(null);abort.current=null;return;}
    setFetching(true);setLoadingYear(year);const controller=new AbortController();abort.current=controller;
    const timeout=setTimeout(()=>controller.abort(),90000);
    try{const updated=nextScope==='rotterdam'?await fetchSource(year,controller.signal):await fetchNationalSource(controller.signal,year);if(!controller.signal.aborted&&requestId===sourceRequest.current)apply(updated);}
    catch(e){if(requestId===sourceRequest.current)setError(e instanceof Error&&e.name!=='AbortError'?`${e.message} Het vorige bronjaar blijft actief.`:'CBS-opvraag verlopen. Het vorige bronjaar blijft actief.');}
    finally{clearTimeout(timeout);if(requestId===sourceRequest.current){setFetching(false);setLoadingYear(null);abort.current=null;}}
  }
  async function cancel(){worker.current?.terminate();worker.current=null;await writer.current?.abort().catch(()=>{});writer.current=null;setBusy(null);setError('Generatie geannuleerd. Een onvolledig bestand is geen bruikbare dataset.');}
  async function generate(){
    setError('');
    if(!Number.isInteger(count)||count<1||count>total||!Number.isInteger(seed)||seed<0||seed>4294967295){setError('Kies een geldig aantal personen en een gehele seed van 0 tot 4294967295.');return;}
    const filename=`synthetisch-${scope==='province'?province.toLowerCase():scope}-${source.year}-${count}-seed${seed}.zip`;
    if(count>250000&&!supportsDisk()){setError('Voor meer dan 250.000 personen is direct opslaan nodig. Gebruik Chrome/Edge op desktop, of de landelijke exportopdracht in de methodebeschrijving. Kleinere datasets werken hier wel.');return;}
    try{
      if(count>250000){
        const handle=await (window as unknown as {showSaveFilePicker:(options:unknown)=>Promise<{createWritable:()=>Promise<DiskWriter>}>}).showSaveFilePicker({suggestedName:filename,types:[{description:'ZIP research dataset',accept:{'application/zip':['.zip']}}]});
        writer.current=await handle.createWritable();
      }
    }catch(e){if((e as Error).name!=='AbortError')setError('Bestand kon niet worden geopend voor direct opslaan.');return;}
    setBusy({completed:0,total:count,name:'Bronnen en export voorbereiden'});setResult(null);
    const chunks:Uint8Array[]=[];
    const w=new Worker(new URL('./research.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    const request:ResearchRequest={source,options:{seed,count,areas:areas.map(a=>a.id),features,commuteKm:7,eventParticipation:.35},includeActivities:activities&&count<=100000,includeTranslink:transit,nsStations:ns??undefined};
    const fail=async(message:string)=>{w.terminate();if(worker.current===w)worker.current=null;await writer.current?.abort().catch(()=>{});writer.current=null;setBusy(null);setError(message);};
    w.onmessage=async({data})=>{
      if(worker.current!==w)return;
      try{
        if(data.type==='chunk'){if(writer.current)await writer.current.write(data.chunk);else chunks.push(data.chunk);if(worker.current===w)w.postMessage({type:'ack'});}
        else if(data.type==='progress')setBusy(data);
        else if(data.type==='population'){setPopulation(data.population);setSelected(0);setArea('');}
        else if(data.type==='complete'){
          const direct=!!writer.current;if(writer.current)await writer.current.close();writer.current=null;
          const url=direct?null:URL.createObjectURL(new Blob(chunks as BlobPart[],{type:'application/zip'}));
          setResult({summary:data.summary,url,filename,scope,seed});setBusy(null);w.terminate();worker.current=null;
        }else if(data.type==='error')await fail(data.message);
      }catch{await fail('Het exportbestand kon niet worden geschreven. Controleer vrije schijfruimte en probeer opnieuw.');}
    };
    w.onerror=(event)=>void fail(`De generator is gestopt. ${event.message || 'Probeer een kleinere populatie of de command-line export.'}`);
    w.postMessage({type:'export',request});
  }
  async function importNS(file:File|undefined){
    if(!file)return;setError('');
    try{
      if(file.size>2_000_000)throw new Error('NS-bestand is te groot.');
      const data=JSON.parse(await file.text()) as NSContext;
      if(data.schema!=='ns-stations-1'||data.source!=='NS'||data.use!=='station_context_only'||!Number.isFinite(Date.parse(data.retrievedAt))||!Array.isArray(data.stations)||!data.stations.length||data.stations.length>5000||data.stations.some(s=>typeof s.code!=='string'||typeof s.name!=='string'||!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude)||s.latitude<50||s.latitude>54||s.longitude<3||s.longitude>8))throw new Error('Gebruik het stationsbestand van de NS-connector; geen API-sleutel of onbewerkt bestand.');
      setNS({schema:data.schema,source:'NS',sourceUrl:'https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2/stations',retrievedAt:data.retrievedAt,use:data.use,stations:data.stations.map(s=>({code:s.code,name:s.name,latitude:s.latitude,longitude:s.longitude,country:'NL'}))});
    }catch(e){setError((e as Error).message);}
  }
  return <main className="lives-workspace population-lab">
    <div className="population-heading"><div><div className="lives-kicker">SYNTHETISCHE POPULATIES · ONDERZOEKSPROTOTYPE</div><h1>{view==='generate'?'Synthetische mensen, klaar voor onderzoek':'Rotterdam op de kaart'}</h1><p>{view==='generate'?'Stel een populatie samen uit CBS-cijfers. Download personen, huishoudens, relaties en de volledige methode.':'Verken fictieve huishoudens binnen wijk- en buurtgrenzen.'}</p></div><a className="population-document" href="/research/methods.md" download><FileText size={18}/> Methode (.md)</a></div>
    {error&&<div className="lives-error" role="alert">{error}</div>}
    {busy&&<div className="lives-progress" role="status"><span>{busy.name} · {fmt(busy.completed)} / {fmt(busy.total)}</span><progress max={busy.total} value={busy.completed}/><button onClick={()=>void cancel()}>Annuleren</button></div>}
    <div hidden={view!=='generate'}>
      <fieldset className="population-form" disabled={!!busy||fetching}>
        <section className="lives-panel"><div className="population-section-title"><span>01</span><h2>Kies het gebied</h2></div>
          <div className="population-scope">{([['rotterdam','Rotterdam','Buurten + kaart'],['province','Provincie','Gemeentelijke datasets'],['national','Nederland','Alle gemeenten']] as const).map(([id,title,caption])=><button type="button" key={id} aria-pressed={scope===id} onClick={()=>void loadSource(id,source.year)}><strong>{title}</strong><span>{caption}</span></button>)}</div>
          <label className="population-field">CBS-bronjaar<select value={source.year} onChange={e=>void loadSource(scope,+e.target.value)}>{Object.keys(CBS_YEARS).map(year=><option key={year} value={year}>{year}{year==='2024'?' · standaard':''}</option>)}</select></label>
          {scope==='province'&&<label className="population-field">Provincie<select value={province} onChange={e=>{setProvince(e.target.value);setCount(5000);}}>{provinces.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
          <div className="population-source"><Database size={22}/><div><strong>CBS {source.year} · {source.mode==='live'?'live opgehaald':'meegeleverde snapshot'}</strong><span>{areas.length} {scope==='rotterdam'?'bruikbare buurten':'gemeenten'} · {fmt(total)} inwoners</span><small>Opgehaald {new Date(source.retrievedAt).toLocaleDateString('nl-NL')}</small></div></div>
          <button type="button" onClick={()=>void loadSource(scope,source.year,true)}><RefreshCw size={16}/>{fetching?`CBS ${loadingYear} ophalen…`:'Ververs CBS-bronnen'}</button>
          <p className="lives-footnote">Het bronjaar bepaalt bevolking, huishoudens en de gemeentelijke indeling. Je krijgt de huidige CBS-revisie van dat jaar. Onderwijs en inkomen kunnen andere peilmomenten hebben. Ontbrekende kenmerken blijven onbekend; geen aanvulling uit andere jaren. Geen login nodig.</p>
          <details><summary>Bronnen en dekking</summary>{source.sources.map(s=><p key={s.title}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><br/>{s.period} · {s.note}</p>)}<p>{source.year===2025&&scope==='rotterdam'?'De pendelprior gebruikt december 2024; december 2025 is nog niet beschikbaar. ':''}Rotterdam bevat alleen buurten met bruikbare leeftijdsmarges; de export vermeldt uitsluitingen. Landelijke gemeenten worden onafhankelijk gegenereerd.</p></details>
        </section>
        <section className="lives-panel"><div className="population-section-title"><span>02</span><h2>Kies de kenmerken</h2></div>
          <p className="population-fixed-features"><Check size={16}/> Leeftijd, geslacht en woongebied inbegrepen</p>
          <div className="lives-features">{FEATURES.map(f=><label key={f.id}><input type="checkbox" checked={features.includes(f.id)} onChange={()=>toggle(f.id)}/><span><strong>{scope!=='rotterdam'&&f.id==='work'?'Werk':f.label}{f.recommended&&<small>Aanbevolen basis</small>}</strong><span>{scope!=='rotterdam'&&f.id==='work'?'Werkende inwoners; werkteams binnen de eigen gemeente. Geen landelijke pendelmatrix.':scope!=='rotterdam'&&f.id==='schools'?'Leerlingen naar woongemeente; veronderstelde lokale klassen per leeftijd.':scope!=='rotterdam'&&f.id==='education'?'Gemeentelijke verdeling van behaald onderwijs, 15–74 jaar.':f.description}</span>{f.id==='schools'&&areas.every(a=>a.pupils.every(n=>n===null))&&<em>Geen leerlingaantallen in CBS {source.year}; geen schooltoewijzingen.</em>}{f.id==='work'&&areas.every(a=>a.workers===null)&&<em>Geen werkende-personenaantallen in CBS {source.year}; geen werktoewijzingen.</em>}{f.id==='education'&&areas.every(a=>a.education.every(n=>n===null))&&<em>Geen opleidingscijfers beschikbaar in deze bron.</em>}</span></label>)}</div>
          <p className="lives-footnote">Gezinsrelaties, contactgroepen en roosters zijn aannames. Elke export bevat controles en een gegevenswoordenboek.</p>
        </section>
        <section className="lives-panel population-generate"><div className="population-section-title"><span>03</span><h2>Genereer & download</h2></div>
          <label className="population-field">Aantal synthetische personen<input type="number" min={1} max={total} value={count} onChange={e=>setCount(+e.target.value)}/></label>
          <div className="lives-presets"><button type="button" onClick={()=>setCount(Math.min(5000,total))}>5.000</button><button type="button" onClick={()=>setCount(Math.min(100000,total))}>100.000</button><button type="button" onClick={()=>setCount(total)}>Alle inwoners</button></div>
          <label className="population-field">Seed voor herhaalbaarheid<input type="number" min={0} max={4294967295} value={seed} onChange={e=>setSeed(+e.target.value)}/></label>
          <label className="population-checkbox"><input type="checkbox" checked={activities&&count<=100000} disabled={count>100000} onChange={e=>setActivities(e.target.checked)}/><span>Activiteiten per persoon meeleveren<small>Voorbeeldweek · veel extra rijen · tot 100.000 personen in de browser</small></span></label>
          <p>{count<total?'Steekproef van de gekozen gebieden. Eén rij is één synthetisch persoon; er is geen opschaling.':'Eén synthetisch record per inwoner in de vertegenwoordigde CBS-totalen.'}</p>
          {count>250000&&<p className="lives-warning">Grote export: gebruik Chrome/Edge op desktop om direct naar schijf te schrijven, of de exportopdracht in de methode. Houd dit tabblad open. {fmt(count)} personen kunnen enkele minuten en veel schijfruimte vragen.</p>}
          <button className="lives-primary" type="button" onClick={()=>void generate()}><Users size={18}/> {count>250000?'Kies bestand & genereer':'Genereer onderzoeksdataset'}</button>
          <div className="population-package"><strong>In één ZIP-bestand</strong><span>Personen · huishoudens & clusters · lidmaatschappen · kwaliteitscontrole · CBS-invoer · methode & woordenboek</span></div>
          <a href="/research/data-dictionary.md" download>Gegevenswoordenboek downloaden</a>
        </section>
      </fieldset>
      {result&&<section className="lives-panel population-result" aria-live="polite"><div><Check size={22}/><div><h2>Dataset gereed · {fmt(result.summary.people)} personen</h2><p>{result.summary.batches} batch(es) · {fmt(result.summary.households)} particuliere huishoudens · seed {result.seed}</p><small>{result.filename}</small></div></div><div className="population-result-actions">{result.url?<a className="population-download" href={result.url} download={result.filename}><ArrowDownToLine size={18}/> Download dataset (.zip)</a>:<strong>Opgeslagen in het gekozen bestand</strong>}{result.scope==='rotterdam'&&<button onClick={()=>onView('map')}><MapPin size={17}/> Bekijk Rotterdam</button>}</div><p>{result.summary.unresolvedChildren?`${fmt(result.summary.unresolvedChildren)} minderjarigen zonder passende gezinsplaatsing; zie kwaliteitsrapport.`:'Geen onopgeloste minderjarigen in deze run.'} De kwaliteit van de huishoudtotalen staat per gebied in de export.</p></section>}
      <section className="lives-panel population-examples"><h2>Datasets op aanvraag</h2><p>Genereer hierboven een eigen dataset en download het ZIP-bestand. Voor grote landelijke exports kunt u ook de command-line generator gebruiken; zie de README en methodebeschrijving.</p></section>
      <section className="lives-panel population-mobility"><div className="population-section-title"><TrainFront size={21}/><h2>Mobiliteitsdata als onderzoekscontext</h2></div><div className="population-mobility-grid">
        <div><h3>Translink · open data</h3><p>Landelijke inchecks per uur en weekdag. Referentieprofiel 2025; bronbestand tot {translink.dateEnd}. Geen individuele reizen, stations of wijkstromen.</p><label className="population-checkbox"><input type="checkbox" disabled={!!busy} checked={transit} onChange={e=>setTransit(e.target.checked)}/><span>Uurprofielen toevoegen aan de ZIP<small>Externe referentie; verandert de gegenereerde personen niet.</small></span></label><a href={translink.landingUrl} target="_blank" rel="noreferrer">Bron: Translink</a></div>
        <div><h3>NS · stations & reisinformatie</h3><p>{ns?`${ns.stations.length} stations geïmporteerd · ${new Date(ns.retrievedAt).toLocaleDateString('nl-NL')}`:'Nog niet verbonden. Meld je aan bij het NS API Developer Portal en vraag toegang tot het passende API-product.'}</p><a href="https://apiportal.ns.nl/startersguide" target="_blank" rel="noreferrer">NS-account en API-toegang</a><label className="population-field">Stationsbestand van de lokale connector<input type="file" accept="application/json,.json" disabled={!!busy} onChange={e=>void importNS(e.target.files?.[0])}/></label><small>Importeer alleen het stationsbestand. API-sleutels horen niet in deze website. Stations zijn context, geen waargenomen passagiersstromen.</small><details><summary>Connector gebruiken</summary><p>In het project leest <code>scripts/fetch-ns-stations.mjs</code> de lokale omgevingsvariabele <code>NS_API_KEY</code> en maakt <code>output/ns-stations.json</code>. Hiervoor is een werkende NS-productabonnementssleutel nodig. Dit bestand kun je hier toevoegen.</p></details></div>
      </div></section>
    </div>
    {view==='map'&&(!population?<section className="lives-panel population-empty"><MapPin size={36}/><h2>Genereer eerst een Rotterdamse populatie</h2><p>De kaart toont de mensen uit je laatste Rotterdamse dataset. Landelijke en provinciale datasets zijn beschikbaar als download.</p><button className="lives-primary" onClick={()=>{void loadSource('rotterdam',source.year);onView('generate');}}>Naar Rotterdam genereren</button></section>:<>
      <div className="population-map-heading"><p><strong>{fmt(population.people.length)} synthetische personen</strong> · CBS {population.source.year} · seed {population.options.seed}<br/>Kaart toont maximaal 1.500 verspreid gekozen personen plus de selectie. Huishoudleden delen één fictieve woonlocatie.</p><div className="lives-geography-controls"><label>Niveau<select value={level} onChange={e=>{const next=e.target.value as GeographyLevel;setLevel(next);setArea(next==='wijk'?wijkCode(area):'');}}><option value="wijk">Wijk</option><option value="buurt">Buurt</option></select></label><label>Gebied<select value={area} onChange={e=>setArea(e.target.value)}><option value="">Heel Rotterdam</option>{mapSummaries.map(a=><option key={a.id} value={a.id}>{a.name} · {a.n}</option>)}{area&&!mapSummaries.some(a=>a.id===area)&&<option value={area}>{area} · geen personen</option>}</select></label></div></div>
      <div className="population-map-layout"><section className="lives-visual"><FullscreenMap><LivesMap population={population} trace={null} day={0} area={area} level={level} summaries={mapSummaries} selected={selected} onSelect={setSelected} onArea={setArea} populationOnly/><p className="lives-map-caption">CBS/PDOK-grenzen 2024{population.source.year!==2024?` · referentiekaart voor CBS ${population.source.year}, geen historische grenzen`:""}. Stippen zijn verzonnen woonlocaties, geen adressen. Niet-gegenereerde gebieden hebben geen uitkomst.</p></FullscreenMap></section>
      <aside className="lives-panel population-person">{person&&<><h2>Persoon R{person.id+1}</h2><p>{person.age} jaar · {population.source.areas.find(a=>a.id===person.area)?.name}</p><dl><dt>Huishoudrol</dt><dd>{person.role}</dd><dt>Activiteit</dt><dd>{person.activity}</dd><dt>Rioolgebied (schatting)</dt><dd>{sewageName(person.sewageId)}</dd></dl><p className="lives-footnote">Rioolkoppeling via fictieve woning en RIVM-grenzen 2022; geen bevestigde aansluiting. {person.sewageStatus}</p><ActivityAgenda population={population} selected={selected}/></>}</aside></div>
    </>)}
  </main>;
}
