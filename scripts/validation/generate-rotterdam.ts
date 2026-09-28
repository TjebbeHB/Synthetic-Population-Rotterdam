import { open, mkdir, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { exportResearch } from '../../src/population/export';
import { SNAPSHOT } from '../../src/lives/sources';
import { FEATURES } from '../../src/lives/types';

// The validation release deliberately uses frozen inputs and options.
// No network requests, wall-clock timestamps or random seeds are introduced.
const args = process.argv.slice(2);
const allowed = new Set(['--out','--count','--help']);
for (let i=0;i<args.length;i++) {
  if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
  if (args[i] !== '--help' && (!args[i+1] || args[++i].startsWith('--'))) throw new Error('Missing option value.');
}
if (args.includes('--help')) {
  console.log('node generator.mjs [--out output/rotterdam-2024-full.zip] [--count N]\nDefault: all usable Rotterdam CBS 2024 neighbourhoods, all features, seven-day activities, seed 20260925. --count makes a sample for smoke tests.');
} else {
  const value = (key:string, fallback:string) => args.includes(key) ? args[args.indexOf(key)+1] : fallback;
  const areas = SNAPSHOT.areas.filter(a => a.ages.every(n=>n>=0) && a.ages.some(n=>n>0));
  const total = areas.reduce((n,a)=>n+a.population,0), count = Number(value('--count',String(total)));
  if (!Number.isSafeInteger(count) || count < 1 || count > total) throw new Error(`Count must be 1–${total}.`);
  const out = resolve(value('--out','output/rotterdam-2024-full.zip'));
  await mkdir(dirname(out),{recursive:true});
  // Exclusive final destination reservation prevents overwriting a received reference.
  const reserved = await open(out,'wx'); await reserved.close();
  let file;
  let ownsPartial = false;
  try {
    file = await open(out+'.partial','wx'); ownsPartial = true;
    console.log(`Generating ${count.toLocaleString('en-US')} people from ${areas.length} frozen CBS neighbourhoods. This can take several minutes.`);
    const summary = await exportResearch({source:SNAPSHOT,options:{count,seed:20260925,areas:areas.map(a=>a.id),features:FEATURES.map(f=>f.id),commuteKm:7,eventParticipation:.35},
      includeActivities:true,includeTranslink:true,includeFlat:true,generatedAt:'2026-09-28T00:00:00.000Z'},
      async chunk => { let offset=0; while(offset<chunk.length) { const {bytesWritten}=await file!.write(chunk,offset,chunk.length-offset,null); if(bytesWritten<=0)throw new Error('Disk write made no progress.');offset+=bytesWritten; } },
      (done,total,name) => console.log(`${name}: ${done}/${total}`));
    await file.close(); file=undefined;
    await rename(out+'.partial',out); ownsPartial=false;
    console.log(JSON.stringify({out,people:summary.people,households:summary.households,unresolvedChildren:summary.unresolvedChildren}));
  } catch(error) {
    await file?.close();
    if (ownsPartial) await rm(out+'.partial',{force:true});
    await rm(out,{force:true});
    throw error;
  }
}
