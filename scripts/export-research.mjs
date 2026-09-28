import { createServer } from 'vite';
import { open, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A successful write may consume fewer bytes than requested, especially on
// external disks. Do not acknowledge a ZIP chunk until every byte is written.
export async function writeComplete(file, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await file.write(chunk, offset, chunk.length - offset, null);
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0) throw new Error('The output file stopped accepting data.');
    offset += bytesWritten;
  }
}

export async function main(args = process.argv.slice(2)) {
  const value = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
  const loader = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  let file, temporary, ownsTemporary = false;
  try {
    const { exportResearch } = await loader.ssrLoadModule('/src/population/export.ts');
    const { NATIONAL_SNAPSHOT, fetchNationalSource } = await loader.ssrLoadModule('/src/population/nationalSource.ts');
    const { SNAPSHOT, fetchSource } = await loader.ssrLoadModule('/src/lives/sources.ts');
    const scope = value('--scope', 'rotterdam');
    if (!['rotterdam', 'national', 'province'].includes(scope)) throw new Error('Unknown scope.');
    const year=Number(value('--year','2024'));
    const live=args.includes('--live')||year!==2024;
    const source = scope === 'rotterdam'
      ? (live ? await fetchSource(year, AbortSignal.timeout(60000)) : SNAPSHOT)
      : (live ? await fetchNationalSource(AbortSignal.timeout(90000),year) : NATIONAL_SNAPSHOT);
    const selected = source.areas.filter(a => a.ages.every(n => n >= 0) && a.ages.some(n => n > 0) && (scope !== 'province' || a.province === value('--province', 'PV28')));
    if (!selected.length) throw new Error('No valid areas selected.');
    const total = selected.reduce((n, a) => n + a.population, 0), count = args.includes('--full') ? total : Number(value('--count', '5000'));
    const options = { count, seed: Number(value('--seed', '20260925')), areas: selected.map(a => a.id), features: value('--features', 'households,schools,work').split(',').filter(Boolean), commuteKm: 7, eventParticipation: .35 };
    const out = resolve(value('--out', `output/${scope}-${year}.zip`));
    await mkdir(dirname(out), { recursive: true });
    temporary = out + '.partial';
    file = await open(temporary, 'wx');
    ownsTemporary = true;
    let last = -1;
    const summary = await exportResearch({ source, options, includeActivities: args.includes('--activities'), includeTranslink: args.includes('--translink') },
      chunk => writeComplete(file, chunk),
      (n, total, name) => { const percent = Math.floor(n / total * 100); if (percent !== last) { last = percent; console.log(`${percent}% ${name} (${n}/${total})`); } });
    await file.close(); file = null;
    await rename(temporary, out); ownsTemporary = false;
    console.log(JSON.stringify({ out, people: summary.people, batches: summary.batches, unresolvedChildren: summary.unresolvedChildren }));
    return summary;
  } finally {
    if (file) await file.close().catch(() => {});
    // If exclusive creation failed, the existing .partial belongs to another
    // export and must be preserved.
    if (ownsTemporary) await rm(temporary, { force: true });
    await loader.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
