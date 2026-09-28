import type { AreaSource, Cluster, Feature, GenerateOptions, Person, Population, SourceBundle } from './types';
export const LIFE_VERSION = 'synthetic-lives-2.0';
import { RNG } from './random';
export { RNG } from './random';
import { attachCatchments } from './sewage';
export function quotas(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0 || weights.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Ongeldige aantallen in bron of selectie.');
  const sum=weights.reduce((s,n)=>s+n,0); if (!sum) return weights.map(()=>0);
  const exact=weights.map(n=>n/sum*total), result=exact.map(Math.floor);
  const order=exact.map((n,i)=>({i,r:n-result[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
  const remainder=total-result.reduce((s,n)=>s+n,0);
  for(let i=0;i<remainder;i++) result[order[i].i]++;
  return result;
}
const bands = [[0,14],[15,24],[25,44],[45,64],[65,104]];
export const ageBand = (n: number) => n<15?0:n<25?1:n<45?2:n<65?3:4;
export function validateOptions(source: SourceBundle, options: GenerateOptions) {
  if (!Number.isSafeInteger(options.seed) || options.seed<0 || options.seed>4294967295) throw new Error('Seed moet een geheel getal tussen 0 en 4294967295 zijn.');
  if (!Number.isInteger(options.count) || options.count<1 || options.count>1500000) throw new Error('Kies 1 tot 1.500.000 synthetische mensen per generatiebatch.');
  if (!options.areas.length || new Set(options.areas).size!==options.areas.length || options.areas.some(id=>!source.areas.some(a=>a.id===id))) throw new Error('Selecteer geldige brongebieden.');
  const allowed: Feature[]=['households','schools','work','events','education','income','cars'];
  if(options.features.some(f=>!allowed.includes(f))) throw new Error('Onbekend persoonskenmerk.');
  if((options.features.includes('income')||options.features.includes('cars'))&&!options.features.includes('households')) throw new Error('Inkomen en autobezit vereisen huishoudens.');
  if(!Number.isFinite(options.commuteKm)||options.commuteKm<1||options.commuteKm>30||!Number.isFinite(options.eventParticipation)||options.eventParticipation<0||options.eventParticipation>1) throw new Error('Ongeldige contactinstellingen.');
  const selected=source.areas.filter(a=>options.areas.includes(a.id));
  if (selected.some(a=>a.ages.some(n=>n<0)||!a.ages.some(n=>n>0))) throw new Error('Voor een geselecteerde buurt ontbreken leeftijdsgegevens. Kies een andere bron of buurt.');
  if(options.count>selected.reduce((s,a)=>s+a.population,0)) throw new Error('De selectie bevat minder inwoners dan het gevraagde aantal.');
  return selected;
}

export function generatePopulation(source: SourceBundle, options: GenerateOptions, progress?: (n:number,total:number)=>void): Population {
  const areas=validateOptions(source,options), rng=new RNG(options.seed), enabled=new Set(options.features);
  const people: Person[]=[],clusters: Cluster[]=[], warnings=new Set<string>(),checks: Population['checks']=[];
  const residentTotal=areas.reduce((s,a)=>s+a.population,0), sizes=quotas(options.count,areas.map(a=>a.population));
  const cluster=(kind:Cluster['kind'],area:string,members:Person[],label:string,days:number[]= [0,1,2,3,4,5,6]) => {
    const c:Cluster={id:clusters.length,kind,area,members:members.map(p=>p.id),label,days};clusters.push(c); return c.id;
  };
  const cityParents=source.agePrior.reduce((s,a)=>s+a.parents,0), citySingleParents=source.agePrior.reduce((s,a)=>s+a.singleParent,0);
  const singleParentShare=citySingleParents/Math.max(1,citySingleParents+cityParents/2);
  const prior=(age:number)=>source.agePrior.find(a=>age>=a.lo&&age<=a.hi)!;
  const select=(members:Person[],n:number,weight:(p:Person)=>number)=>members.map(p=>({p,rank:-Math.log(Math.max(1e-12,rng.next()))/Math.max(.00001,weight(p))})).sort((a,b)=>a.rank-b.rank).slice(0,Math.max(0,Math.min(members.length,n))).map(r=>r.p);
  for(let ai=0;ai<areas.length;ai++) {
    const a=areas[ai],n=sizes[ai],scale=n/a.population, ageTarget=quotas(n,a.ages), residents:Person[]=[];
    const allAges:number[]=[];
    for(let b=0;b<5;b++) {
      const [lo,hi]=bands[b], fine=source.agePrior.filter(p=>p.lo>=lo&&p.hi<=hi);
      const counts=quotas(ageTarget[b],fine.map(p=>p.count));
      if(counts.reduce((s,c)=>s+c,0)!==ageTarget[b])throw new Error('De leeftijdsbron is onvolledig.');
      fine.forEach((p,j)=>{for(let k=0;k<counts[j];k++)allAges.push(p.lo+Math.floor(rng.next()*(p.hi-p.lo+1)));});
    }
    rng.shuffle(allAges);
    const sexes=a.male===null?Array(n).fill('?'):rng.shuffle(Array.from({length:n},(_,i)=>i<Math.round(n*a.male!/a.population)?'M':'V'));
    for(let i=0;i<n;i++){const p:Person={id:people.length,area:a.id,age:allAges[i],sex:sexes[i],household:-1,role:'unresolved',parents:[],student:false,employed:false,activity:'Niet toegewezen',school:null,work:null,event:null}; people.push(p); residents.push(p);}
    if(enabled.has('households')) {
      const institutional=new Set<number>();
      for(const ap of source.agePrior){const group=residents.filter(p=>p.age>=ap.lo&&p.age<=ap.hi); for(const p of select(group,Math.round(group.length*ap.institutional/Math.max(1,ap.count)),()=>1))institutional.add(p.id);}
      for(const stage of [0,1,2]) {
        const members=rng.shuffle(residents.filter(p=>institutional.has(p.id)&&(p.age<18?0:p.age<65?1:2)===stage));
        for(let k=0;k<members.length;k+=20){const group=members.slice(k,k+20),id=cluster('institution',a.id,group,`Instellingsgroep · ${a.name} · ${k/20+1}`);for(const p of group){p.household=id;p.role='institutional';}}
      }
      // Age buckets let us find feasible relatives without altering any person's age.
      const adults:Person[][]=Array.from({length:105},()=>[]), dependents:Person[][]=Array.from({length:105},()=>[]);
      for(const p of residents.filter(p=>!institutional.has(p.id))){const ap=prior(p.age); if(p.age<18||rng.next()<ap.child/Math.max(1,ap.count-ap.institutional))dependents[p.age].push(p);else adults[p.age].push(p);}
      const takeAdult=(lo:number,hi:number,centre:number)=>{
        const weights=adults.map((bucket,age)=>age>=Math.max(18,lo)&&age<=hi?bucket.length*Math.exp(-Math.pow((age-centre)/10,2)/2):0);
        return weights.some(w=>w>0)?adults[rng.pick(weights)].pop():undefined;
      };
      let depCount=dependents.reduce((s,b)=>s+b.length,0), families=0;
      const targetFamilies=Math.max(1,Math.round((a.withKids??a.population*.13)*scale));
      for(let age=104;age>=0;age--) while(dependents[age].length) {
        const child=dependents[age].pop()!; depCount--;
        const parent=takeAdult(child.age+18,Math.min(104,child.age+50),child.age+31);
        if(!parent){
          if(child.age>=18){adults[child.age].push(child);continue;}
          const existing=clusters.find(c=>c.area===a.id&&c.kind==='household'&&c.members.some(id=>people[id].role==='parent')&&c.members.filter(id=>people[id].role==='child').length<4&&c.members.every(id=>people[id].role==='parent'?people[id].age-child.age>=18&&people[id].age-child.age<=50:Math.abs(people[id].age-child.age)<=12));
          if(existing){child.household=existing.id;child.role='child';child.parents=existing.members.filter(id=>people[id].role==='parent');existing.members.push(child.id);continue;}
          const id=cluster('household',a.id,[child],`Onopgelost huishouden · ${a.name}`);child.household=id;warnings.add('Minderjarigen zonder haalbare oudercombinatie zijn als onopgelost gemarkeerd; hun huishoudcontacten zijn uitgeschakeld.');continue;
        }
        const children=[child], desired=Math.min(4,Math.max(1,Math.round((depCount+1)/Math.max(1,targetFamilies-families))));
        for(let younger=age;younger>=Math.max(0,age-12)&&children.length<desired;younger--) while(dependents[younger].length&&children.length<desired&&parent.age-younger<=50){children.push(dependents[younger].pop()!);depCount--;}
        const youngest=Math.min(...children.map(p=>p.age)), second=rng.next()>singleParentShare?takeAdult(Math.max(child.age+18,parent.age-12),Math.min(youngest+50,parent.age+12),parent.age):undefined;
        const parents=second?[parent,second]:[parent], members=[...parents,...children],id=cluster('household',a.id,members,`Gezin · ${a.name} · ${families+1}`);
        for(const p of parents){p.household=id;p.role='parent';} for(const p of children){p.household=id;p.role='child';p.parents=parents.map(p=>p.id);} families++;
      }
      const singles=Math.min(adults.reduce((s,b)=>s+b.length,0),Math.round((a.single??a.population*.25)*scale));
      for(let k=0;k<singles;k++){const p=takeAdult(18,104,50)!;const id=cluster('household',a.id,[p],`Alleenwonend · ${a.name}`);p.household=id;p.role='single';}
      // Shared/no-child households are explicit; they are never automatically labelled parents.
      for(let age=104;age>=18;age--)while(adults[age].length){
        const p=adults[age].pop()!,other=takeAdult(Math.max(18,p.age-12),Math.min(104,p.age+12),p.age);
        const members=other?[p,other]:[p],id=cluster('household',a.id,members,`${other?'Zonder kinderen':'Alleenwonend'} · ${a.name}`);
        for(const q of members){q.household=id;q.role=other?'partner':'single';}
      }
    }
    const schoolTarget:(number|null)[]=[],schoolActual:number[]=[];
    // Primary/secondary/study are separated; resident enrolment counts are capacity targets.
    if(enabled.has('schools')){
      const stages=[{lo:4,hi:11,target:a.pupils[0],label:'Basisschool',span:1},{lo:12,hi:17,target:a.pupils[1],label:'Middelbare school',span:1},{lo:16,hi:29,target:a.pupils.slice(2).every(v=>v!==null)?a.pupils.slice(2).reduce<number>((s,v)=>s+v!,0):null,label:'Mbo / hoger onderwijs',span:5}];
      for(const stage of stages){
        const candidates=residents.filter(p=>p.age>=stage.lo&&p.age<=stage.hi&&!p.student&&p.role!=='institutional');
        const target=stage.target===null?0:Math.round(stage.target*scale), group=select(candidates,target,p=>p.age<25?1:.25);
        schoolTarget.push(stage.target===null?null:target);schoolActual.push(group.length);
        if(stage.target===null)warnings.add('Ontbrekende schooldeelname wordt niet ingevuld: deze bewoners krijgen geen toegewezen school.');
        if(target>candidates.length)warnings.add('Schoolinschrijvingen overschrijden soms het aantal geschikte personen; toewijzing is begrensd en kan afwijken van CBS (andere peildatum / dubbele inschrijvingen).');
        const cohorts=new Map<number,Person[]>();for(const p of group){p.student=true;const key=Math.floor(p.age/stage.span);if(!cohorts.has(key))cohorts.set(key,[]);cohorts.get(key)!.push(p);}
        for(const [cohort,members] of cohorts)for(let k=0;k<members.length;k+=25){const batch=members.slice(k,k+25),id=cluster('school',a.id,batch,`${stage.label} · ${a.name} · cohort ${cohort*stage.span}`, [0,1,2,3,4]);for(const p of batch)p.school=id;}
      }
    }
    const eligible=residents.filter(p=>p.age>=15&&p.age<75&&p.role!=='institutional'), workerTarget=a.workers===null?null:Math.round(a.workers*scale);
    if(enabled.has('work')){
      if(workerTarget===null)warnings.add('Arbeidsgegevens ontbreken in geselecteerde buurten. Arbeidsstatus blijft onbekend; werkcontacten zijn daar uitgeschakeld.');
      else {
        const workers=select(eligible,workerTarget,p=>p.age<18?.08:p.age<25?(p.student?.3:.7):p.age<60?1:p.age<67?.65:.15);
        if(workerTarget>eligible.length)warnings.add('CBS-werkenden overschrijden de geschikte leeftijdspopulatie; werktoewijzing is begrensd.');
        for(const p of workers){p.employed=true;const days=p.student?2:(rng.next()<.35?3:5);p.workDays=rng.shuffle([0,1,2,3,4]).slice(0,days).sort();}
      }
    }
    for(const p of residents){p.activity=p.student?(p.employed?'Student + werkend':'School / studie'):p.employed?'Werkend':p.age<4?'Jong kind':p.age<18?'Minderjarig':!enabled.has('work')||a.workers===null?'Arbeidsstatus onbekend':p.age>=67?'Niet werkend · 67+':'Niet werkend';}
    if(enabled.has('education')){
      const eligible=residents.filter(p=>p.age>=15&&p.age<75);
      for(const p of residents)p.education=p.age<15||p.age>=75?'Buiten CBS-doelgroep':'Onbekend';
      if(a.education.every(v=>v!==null)&&a.education.some(v=>(v??0)>0)){
        const counts=quotas(eligible.length,a.education as number[]);let remaining=[...eligible];
        // Structural attainment constraints: do not award higher education to children.
        for(const index of [2,1,0]){const candidates=remaining.filter(p=>index===2?p.age>=21:index===1?p.age>=17:true); const picked=select(candidates,counts[index],()=>1);const ids=new Set(picked.map(p=>p.id));for(const p of picked)p.education=['Laag','Midden','Hoog'][index];remaining=remaining.filter(p=>!ids.has(p.id));}
        if(remaining.length)warnings.add('Onderwijsverdeling kan niet volledig worden toegewezen onder de leeftijdsgrenzen; resterende waarden blijven onbekend.');
      } else warnings.add('Ontbrekend opleidingsniveau blijft onbekend. Herkomstcategorieën worden niet omgerekend.');
    }
    const privateHH=clusters.filter(c=>c.area===a.id&&c.kind==='household');
    if(enabled.has('income')||enabled.has('cars')){
      const groups=privateHH.map(c=>c.members.map(id=>people[id]));
      if(enabled.has('income')){
        for(const group of groups)for(const p of group)p.income='Onbekend';
        if(a.incomeLow!==null&&a.incomeHigh!==null){const counts=quotas(groups.length,[a.incomeLow,Math.max(0,100-a.incomeLow-a.incomeHigh),a.incomeHigh]);const ranked=groups.map(g=>({g,score:g.filter(p=>p.employed).length+g.filter(p=>p.education==='Hoog').length*.3+rng.next()*3})).sort((a,b)=>a.score-b.score);ranked.forEach(({g},i)=>{for(const p of g)p.income=i<counts[0]?'Laag (40%)':i<counts[0]+counts[1]?'Midden (40%)':'Hoog (20%)';});}
        else warnings.add('Ontbrekend huishoudinkomen blijft onbekend.');
      }
      if(enabled.has('cars')&&a.cars!==null){
        const counts=quotas(Math.round(groups.length*a.cars),groups.map(g=>Math.max(.1,g.filter(p=>p.age>=18).length*(g[0].income==='Hoog (20%)'?1.3:1))*(.2+rng.next()*1.6)));
        groups.forEach((g,i)=>g.forEach(p=>p.cars=counts[i]));
      }
    }
    const ageActual=bands.map((_,b)=>residents.filter(p=>ageBand(p.age)===b).length);
    checks.push({id:a.id,n,ageTarget,ageActual,householdTarget:!enabled.has('households')||a.households===null?null:Math.round(a.households*scale),householdActual:privateHH.length,singleTarget:!enabled.has('households')||a.single===null?null:Math.round(a.single*scale),singleActual:privateHH.filter(c=>c.members.length===1).length,workerTarget:enabled.has('work')?workerTarget:null,workerActual:residents.filter(p=>p.employed).length,unresolvedChildren:enabled.has('households')?residents.filter(p=>p.age<18&&p.role==='unresolved').length:0,schoolTarget,schoolActual});
    progress?.(ai+1,areas.length);
  }
  // Shared destination pools create cross-neighbourhood contacts; company counts are not used as resident occupations.
  const workers=new Map<string,Person[]>(), areaMap=new Map(areas.map(a=>[a.id,a]));
  // Explicit assumed staff links prevent closed school and institution islands.
  // These are existing employed residents, never extra people or unobserved job counts.
  const staffPools=new Map<string,Person[]>();
  for(const p of rng.shuffle(people.filter(p=>p.employed&&!p.student&&p.age>=25&&p.age<67))){if(!staffPools.has(p.area))staffPools.set(p.area,[]);staffPools.get(p.area)!.push(p);}
  for(const c of clusters.filter(c=>c.kind==='school'||c.kind==='institution')){
    if(!enabled.has('work'))break;
    const wanted=c.kind==='school'?1:Math.max(1,Math.ceil(c.members.length/5));
    for(let k=0;k<wanted;k++){
      const pool=staffPools.get(c.area)?.length?staffPools.get(c.area):[...staffPools.values()].find(p=>p.length);
      const p=pool?.pop();if(!p){warnings.add('Niet alle school- en instellingsgroepen konden een werkende medewerker krijgen.');break;}
      p.work=c.id;c.members.push(p.id);
    }
  }
  const destinationWeights=new Map<string,number[]>();
  for(const a of areas)destinationWeights.set(a.id,areas.map(b=>{const km=a.lat!==null&&b.lat!==null?Math.hypot((a.lat-b.lat)*111,(a.lon!-b.lon!)*69):a.id===b.id?0:10;return Math.sqrt(Math.max(1,b.population))*Math.exp(-km/options.commuteKm);}));
  for(const p of people.filter(p=>p.employed&&p.work===null)){
    const destination=rng.next()<source.outsideWorkShare?'outside':areas[rng.pick(destinationWeights.get(p.area)!)].id;
    const key=destination; if(!workers.has(key))workers.set(key,[]);workers.get(key)!.push(p);
  }
  for(const [area,members] of workers){rng.shuffle(members);for(let k=0;k<members.length;k+=16){const batch=members.slice(k,k+16),id=cluster('work',area,batch,`Werkteam · ${areaMap.get(area)?.name??'buiten Rotterdam'} · ${k/16+1}`,[0,1,2,3,4]);for(const p of batch)p.work=id;}}
  if(enabled.has('events')){
    const attendees=rng.shuffle(people.filter(p=>p.age>=12&&p.role!=='institutional'&&rng.next()<options.eventParticipation));
    for(let k=0;k<attendees.length;k+=40){const batch=attendees.slice(k,k+40), area=batch[0].area,id=cluster('event',area,batch,`Evenement ${k/40+1}`,[5]);for(const p of batch)p.event=id;}
  }
  warnings.add('Leeftijden binnen vijfjaarsgroepen, familieparen, roosters, werkplekken en contacten zijn synthetische aannames. De fit op invoermarges is geen onafhankelijke validatie.');
  if(enabled.has('households'))warnings.add(`Instellingsbewoners volgen ${source.scope === 'national' ? 'gemeentelijke' : 'Rotterdamse'} leeftijdsprioren; contactgroepen van 20 en hun lokale verdeling zijn aannames, geen waargenomen instellingen.`);
  if(enabled.has('work'))warnings.add('Scholen krijgen één toegewezen medewerker per klas; instellingen één per vijf bewoners. Deze werkende inwoners verbinden clusters via hun eigen huishouden; aantallen, functies en aanwezigheid zijn aannames.');
  else if(enabled.has('households'))warnings.add('Zonder werkcontacten zijn instellingsgroepen niet via medewerkers met de overige bevolking verbonden.');
  if(enabled.has('income')||enabled.has('cars'))warnings.add('Verbanden van inkomen en auto’s met huishouden en werk zijn expliciete modelaannames, niet uit CBS-kruistabellen geschat.');
  if(sizes.some(n=>n===0))warnings.add('De steekproef is te klein om elke geselecteerde buurt te bevatten. Buurten met nul personen krijgen geen uitkomst.');
  const population: Population = { version:LIFE_VERSION,options:{...options},source,people,clusters,checks,warnings:[...warnings],representedResidents:residentTotal,isSample:options.count<residentTotal };
  return source.scope==='national'?population:attachCatchments(population);
}
