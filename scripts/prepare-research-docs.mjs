import { copyFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/research/', root), {recursive:true});
for (const name of ['methods','data-dictionary']) await copyFile(new URL(`docs/research-${name}.md`,root),new URL(`public/research/${name}.md`,root));
