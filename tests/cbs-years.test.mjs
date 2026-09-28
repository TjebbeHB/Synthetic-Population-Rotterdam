import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {unzipSync,strFromU8} from 'fflate';
const fixture=JSON.parse(await readFile(new URL('./fixtures/cbs-history.json',import.meta.url),'utf8'));
const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const {parseSource,fetchSource}=await loader.ssrLoadModule('/src/lives/sources.ts');
const {cbsNumber,yearConfig}=await loader.ssrLoadModule('/src/lives/cbsYears.ts');
const {exportResearch}=await loader.ssrLoadModule('/src/population/export.ts');
await loader.close();
test('2022 field suffixes preserve actual household counts and missing assignment inputs',()=>{
 const source=parseSource(fixture[2022],'live'),area=source.areas[0];
 assert.equal(source.year,2022);assert.equal(source.table,'85318NED');
 assert.equal(area.households,10890);assert.equal(area.single,6645);assert.equal(area.education[0],2140);
 assert.equal(area.workers,null);assert.deepEqual(area.pupils,[null,null,null,null,null]);
 assert.equal(source.agePrior.length,20);assert.equal(source.sources.find(s=>s.title.includes('banen')).period,'2022MM12');
 assert.ok(source.sources.some(s=>s.title.includes('Kaartgeometrie')&&s.period==='2024'));
});
test('2023 work and school counts use their named variables rather than 2024 numeric suffixes',()=>{
 const source=parseSource(fixture[2023],'live'),area=source.areas[0];
 assert.equal(area.households,11825);assert.equal(area.single,7485);assert.equal(area.pupils[0],600);
 assert.equal(area.workers,11860);assert.equal(area.education[0],2680);
 assert.equal(source.sources.find(s=>s.title.includes('banen')).period,'2023MM12');
 assert.equal(yearConfig(2022).municipalities,345);assert.equal(yearConfig(2023).municipalities,342);
 assert.equal(yearConfig(2022).provinceCode,'Code_26');assert.equal(yearConfig(2024).provinceCode,'Code_28');
});
test('missing and suppressed values never fall through to fabricated historical counts',()=>{
 assert.equal(cbsNumber({WerkzameBeroepsbevolking_73:null},'WerkzameBeroepsbevolking_70'),null);
 assert.equal(cbsNumber({OpleidingsniveauLaag_64:null},'BasisonderwijsVmboMbo1_67'),null);
 assert.equal(cbsNumber({WerkzameBeroepsbevolking_73:-1},'WerkzameBeroepsbevolking_70'),null);
 assert.equal(cbsNumber({WerkzameBeroepsbevolking_73:0},'WerkzameBeroepsbevolking_70'),0);
 assert.throws(()=>yearConfig(2021));assert.throws(()=>yearConfig(NaN));
});
test('historical CBS fetch requests the selected tables and matching periods',async()=>{
 const original=globalThis.fetch,urls=[];
 globalThis.fetch=async url=>{
  const parsed=new URL(url);urls.push(parsed);
  const value=parsed.pathname.includes('71488ned')?fixture[2022].ages:parsed.pathname.includes('85481NED')?fixture[2022].commute:parsed.pathname.endsWith('/WijkenEnBuurten')?fixture[2022].names:fixture[2022].rows;
  return {ok:true,json:async()=>({value})};
 };
 try{
  const source=await fetchSource(2022);assert.equal(source.year,2022);
  assert.equal(urls.filter(u=>u.pathname.includes('85318NED')).length,2);
  assert.ok(urls.find(u=>u.pathname.includes('71488ned')).searchParams.get('$filter').includes('2022JJ00'));
  assert.ok(urls.find(u=>u.pathname.includes('85481NED')).searchParams.get('$filter').includes('2022MM12'));
  assert.ok(urls.every(u=>!u.href.includes('2024')));
 }finally{globalThis.fetch=original;}
});
test('2022 research archive labels source year and fixed map years, with no invented workers or pupils',async()=>{
 const source=parseSource(fixture[2022],'live'),chunks=[];
 await exportResearch({source,options:{seed:42,count:100,areas:source.areas.map(a=>a.id),features:['households','schools','work'],commuteKm:7,eventParticipation:.35},includeActivities:false,includeTranslink:false},async c=>chunks.push(Buffer.from(c)),()=>{});
 const files=unzipSync(Buffer.concat(chunks)),manifest=JSON.parse(strFromU8(files['manifest.json']));
 assert.equal(manifest.sourceYear,2022);assert.equal(manifest.mapGeometryYear,2024);assert.equal(manifest.sewageBoundaryYear,2022);
 assert.equal(JSON.parse(strFromU8(files['source-inputs.json'])).table,'85318NED');
 const people=strFromU8(files['ROT/people.csv']);assert.ok(people.includes('missing_source'));assert.ok(people.includes('partial_source'));
 const checks=JSON.parse(strFromU8(files['ROT/quality.json'])).checks;
 assert.ok(checks.every(c=>c.workerActual===0&&c.schoolActual.every(n=>n===0)));
});
