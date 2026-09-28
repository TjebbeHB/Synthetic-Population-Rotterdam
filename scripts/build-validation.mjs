import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
const out = resolve(process.argv[2] ?? 'output/rotterdam-validation-code');
await mkdir(out,{recursive:true});
const result=await build({entryPoints:['scripts/validation/generate-rotterdam.ts'],outfile:resolve(out,'generator.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,
  plugins:[{name:'raw-documents',setup(b){b.onResolve({filter:/\.md\?raw$/},a=>({path:relative(process.cwd(),resolve(a.resolveDir,a.path.replace(/\?raw$/,''))),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}}]});
await writeFile(resolve(out,'build-inputs.json'),JSON.stringify(result.metafile,null,2));
console.log(`Standalone generator: ${out}/generator.mjs (all runtime dependencies and source snapshots embedded)`);
