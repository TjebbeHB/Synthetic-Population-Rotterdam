// Run locally: NS_API_KEY=<your subscription key> node scripts/fetch-ns-stations.mjs
// The secret is never written to a file, request URL or frontend bundle.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const key=process.env.NS_API_KEY;
if(!key){console.error('Set NS_API_KEY locally after subscribing at https://apiportal.ns.nl/ . Do not paste the key into the website.');process.exit(1);}
const url='https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2/stations';
try{
 const response=await fetch(url,{headers:{'Ocp-Apim-Subscription-Key':key,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(response.status===401||response.status===403?'NS subscription is not authorised for this API product.':`NS request failed (${response.status}). Retry later if rate-limited.`);
 const raw=await response.json(),rows=Array.isArray(raw)?raw:raw.payload;
 if(!Array.isArray(rows))throw new Error('Unrecognised NS station response; verify the API product schema.');
 const stations=rows.filter(s=>(s.land??s.country)==='NL').map(s=>({code:s.code,name:s.namen?.lang??s.name,latitude:s.lat??s.latitude,longitude:s.lng??s.longitude,country:'NL'}));
 if(!stations.length||stations.some(s=>typeof s.code!=='string'||typeof s.name!=='string'||!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude)||s.latitude<50||s.latitude>54||s.longitude<3||s.longitude>8))throw new Error('Station data failed validation. No snapshot written.');
 const out=resolve(process.argv[2]??'output/ns-stations.json');await mkdir(dirname(out),{recursive:true});
 await writeFile(out,JSON.stringify({schema:'ns-stations-1',source:'NS',sourceUrl:url,retrievedAt:new Date().toISOString(),use:'station_context_only',stations},null,2));
 console.log(`Saved ${stations.length} Dutch stations to ${out}. Import this JSON in the population generator.`);
}catch(error){console.error(error.message);process.exitCode=1;}
