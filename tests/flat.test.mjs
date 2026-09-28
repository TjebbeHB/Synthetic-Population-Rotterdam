import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { unzipSync, strFromU8 } from 'fflate';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const {exportResearch}=await loader.ssrLoadModule('/src/population/export.ts');
const {SNAPSHOT}=await loader.ssrLoadModule('/src/lives/sources.ts');
await loader.close();
const request={source:SNAPSHOT,options:{count:1500,seed:20260925,areas:SNAPSHOT.areas.filter(a=>a.ages.every(n=>n>=0)&&a.ages.some(n=>n>0)).map(a=>a.id),features:['households','schools','work','events','education','income','cars'],commuteKm:7,eventParticipation:.35},includeActivities:true,includeTranslink:true,generatedAt:'2026-09-28T00:00:00.000Z'};
function csv(bytes){
  const text=strFromU8(bytes).replace(/^\uFEFF/,''),rows=[];let row=[],field='',quote=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(field);field='';}else if(c==='\n'&&!quote){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
  assert.equal(quote,false);assert.equal(field,'');const columns=rows.shift();assert.equal(new Set(columns).size,columns.length,'column names must be unique');
  return rows.map(row=>{assert.equal(row.length,columns.length);return Object.fromEntries(columns.map((k,i)=>[k,row[i]]));});
}
async function archive(req){const chunks=[];await exportResearch(req,async c=>chunks.push(c),()=>{});return unzipSync(Buffer.concat(chunks));}
test('flat export is lossless against linked people, clusters, memberships and every activity',async()=>{
  const files=await archive({...request,includeFlat:true}),plain=await archive(request);
  for(const name of ['people.csv','clusters.csv','memberships.csv','activities.csv'])assert.deepEqual(files['ROT/'+name],plain['ROT/'+name],`flat export must not alter ${name}`);
  const people=csv(files['ROT/people.csv']),flat=csv(files['ROT/people-flat.csv']);assert.equal(flat.length,1500);
  const clusters=new Map(csv(files['ROT/clusters.csv']).map(c=>[c.cluster_id,c]));
  const memberSets=new Map();for(const m of csv(files['ROT/memberships.csv'])){if(!memberSets.has(m.cluster_id))memberSets.set(m.cluster_id,[]);memberSets.get(m.cluster_id).push(m.person_id);}
  const activities=new Map();for(const a of csv(files['ROT/activities.csv'])){const k=a.person_id+':'+a.weekday_monday0;if(!activities.has(k))activities.set(k,[]);activities.get(k).push([+a.start_minute,+a.end_minute,a.kind,a.label,a.destination_area,a.cluster_id]);}
  const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  let memberships=0;
  for(let i=0;i<flat.length;i++){
    const f=flat[i],person=people[i];for(const [key,value]of Object.entries(person))assert.equal(f[key],value);
    const residents=people.filter(p=>p.household_id===f.household_id).map(p=>p.person_id);assert.equal(+f.household_resident_count,residents.length);assert.deepEqual(f.household_resident_ids.split('|'),residents);
    for(const parent of JSON.parse(f.parents_json)){const p=people.find(p=>p.person_id===parent.person_id);assert.equal(parent.age,+p.age);assert.equal(parent.sex,p.sex);assert.equal(parent.household_role,p.household_role);}
    for(const m of JSON.parse(f.memberships_json)){const c=clusters.get(m.cluster_id);assert.ok(m.member_ids.includes(f.person_id));assert.deepEqual(m.member_ids,memberSets.get(m.cluster_id));for(const k of ['kind','area','label'])assert.equal(m[k],c[k]);assert.equal(m.days_monday0.join('|'),c.days_monday0);memberships++;}
    for(const group of ['household','school','work','event']){const c=clusters.get(f[group+'_id']);if(c){assert.equal(f[group+'_kind'],c.kind);assert.equal(f[group+'_member_count'],c.member_count);}}
    for(let d=0;d<7;d++)assert.deepEqual(JSON.parse(f[days[d]+'_activities_json']),activities.get(f.person_id+':'+d));
  }
  assert.equal(memberships,csv(files['ROT/memberships.csv']).length);
});
test('disabled features and diaries remain explicitly absent in flat output',async()=>{
  const files=await archive({...request,options:{...request.options,count:20,features:[]},includeActivities:false,includeFlat:true});
  for(const p of csv(files['ROT/people-flat.csv'])){assert.equal(p.household_id,'');assert.equal(p.household_resident_count,'0');assert.equal(p.memberships_json,'[]');assert.equal(p.activities_included,'false');assert.equal(p.monday_activities_json,'');}
  assert.ok(!files['ROT/activities.csv']);
});
test('standalone generator runs outside repository and reproduces ZIP across time zones without overwriting',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rotterdam-generator-'));
  try{
    await exec(process.execPath,['scripts/build-validation.mjs',dir]);
    const generator=join(dir,'generator.mjs');
    for(const [name,tz]of [['a','UTC'],['b','Pacific/Honolulu']])await exec(process.execPath,[generator,'--count','100','--out',join(dir,name+'.zip')],{cwd:dir,env:{...process.env,TZ:tz}});
    assert.deepEqual(await readFile(join(dir,'a.zip')),await readFile(join(dir,'b.zip')));
    const before=await readFile(join(dir,'a.zip'));await assert.rejects(exec(process.execPath,[generator,'--count','100','--out',join(dir,'a.zip')],{cwd:dir}));assert.deepEqual(await readFile(join(dir,'a.zip')),before);
    await assert.rejects(exec(process.execPath,[generator,'--unknown'],{cwd:dir}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
