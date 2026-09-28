import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const file=resolve(process.argv[2]??'output/rotterdam-2024-full.zip');
const reference=JSON.parse(await readFile(new URL('./reference-sha256.json',import.meta.url),'utf8'));
const hash=createHash('sha256');let bytes=0;
for await(const chunk of createReadStream(file)){hash.update(chunk);bytes+=chunk.length;}
const sha256=hash.digest('hex');
if(sha256!==reference.sha256||bytes!==reference.bytes){console.error(JSON.stringify({match:false,bytes,sha256,expected:reference}));process.exitCode=1;}
else console.log(`MATCH: ${file}\nSHA-256 ${sha256}\nThe complete archive matches the reference byte for byte.`);
