import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { unzipSync, strFromU8 } from 'fflate';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeComplete } from '../scripts/export-research.mjs';

const execute = promisify(execFile);
const loader = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { exportResearch, researchBatches, batchSeed } = await loader.ssrLoadModule('/src/population/export.ts');
const { SNAPSHOT } = await loader.ssrLoadModule('/src/lives/sources.ts');
const { NATIONAL_SNAPSHOT } = await loader.ssrLoadModule('/src/population/nationalSource.ts');
const { RNG } = await loader.ssrLoadModule('/src/lives/random.ts');
await loader.close();
const options = { seed: 20260925, count: 2000, areas: SNAPSHOT.areas.filter(a => a.ages.every(n => n >= 0) && a.ages.some(n => n > 0)).map(a => a.id), features: ['households', 'schools', 'work'], commuteKm: 7, eventParticipation: .35 };
const request = { source: SNAPSHOT, options, includeActivities: true, includeTranslink: true };

function csv(bytes) {
  const text = strFromU8(bytes).replace(/^\uFEFF/, ''), rows = [];
  let record = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c === ',') { record.push(field); field = ''; }
    else if (!quoted && c === '\n') { record.push(field.replace(/\r$/, '')); rows.push(record); record = []; field = ''; }
    else field += c;
  }
  assert.equal(quoted, false, 'CSV quotes close');
  assert.equal(field, '', 'CSV has complete final row');
  const [headers, ...values] = rows;
  return values.map(fields => { assert.equal(fields.length, headers.length); return Object.fromEntries(headers.map((h, i) => [h, fields[i]])); });
}
async function archive(input) {
  const chunks = [], progress = []; let writing = false;
  const summary = await exportResearch(input, async chunk => {
    assert.equal(writing, false, 'sink writes must not overlap'); writing = true;
    await new Promise(resolve => setImmediate(resolve)); chunks.push(Buffer.from(chunk)); writing = false;
  }, (...p) => progress.push(p));
  assert.equal(progress.at(-1)[0], input.options.count);
  const zip = Buffer.concat(chunks);
  return { files: unzipSync(zip), summary, zip };
}
const json = bytes => JSON.parse(strFromU8(bytes));
function assertJoins(files, prefix) {
  const people = csv(files[`${prefix}/people.csv`]), clusters = csv(files[`${prefix}/clusters.csv`]), memberships = csv(files[`${prefix}/memberships.csv`]);
  const byPerson = new Map(people.map(p => [p.person_id, p])), byCluster = new Map(clusters.map(c => [c.cluster_id, c]));
  assert.equal(byPerson.size, people.length); assert.equal(byCluster.size, clusters.length);
  const membershipsByCluster = new Map(clusters.map(c => [c.cluster_id, new Set()]));
  for (const m of memberships) {
    assert.ok(byPerson.has(m.person_id)); assert.ok(byCluster.has(m.cluster_id));
    const ids = membershipsByCluster.get(m.cluster_id); assert.ok(!ids.has(m.person_id)); ids.add(m.person_id);
  }
  for (const c of clusters) assert.equal(membershipsByCluster.get(c.cluster_id).size, Number(c.member_count));
  for (const p of people) {
    assert.ok(p.person_id.startsWith(prefix + ':P'));
    for (const field of ['household_id', 'school_id', 'work_id', 'event_id']) if (p[field]) {
      assert.ok(byCluster.has(p[field])); assert.ok(membershipsByCluster.get(p[field]).has(p.person_id));
    }
    for (const parentId of p.parent_ids.split('|').filter(Boolean)) {
      const parent = byPerson.get(parentId); assert.ok(parent); assert.equal(parent.household_id, p.household_id);
      assert.ok(Number(parent.age) - Number(p.age) >= 18); assert.ok(Number(parent.age) - Number(p.age) <= 50);
    }
  }
  return { people, byPerson, byCluster };
}

test('Rotterdam ZIP preserves IDs, relations, complete weekly activities and provenance', async () => {
  const { files, summary } = await archive(request);
  assert.equal(summary.people, options.count); assert.equal(summary.batches, 1);
  for (const name of ['methods.md', 'data-dictionary.md', 'source-inputs.json', 'manifest.json', 'ROT/quality.json', 'external/translink-hourly-profiles.json']) assert.ok(files[name], name);
  const { people, byPerson, byCluster } = assertJoins(files, 'ROT'); assert.equal(people.length, options.count);
  const agenda = new Map();
  for (const a of csv(files['ROT/activities.csv'])) {
    assert.ok(byPerson.has(a.person_id)); if (a.cluster_id) assert.ok(byCluster.has(a.cluster_id));
    assert.equal(a.basis, 'assumed_schedule');
    const key = a.person_id + ':' + a.weekday_monday0;
    assert.equal(Number(a.start_minute), agenda.get(key) ?? 0); assert.ok(Number(a.end_minute) > Number(a.start_minute)); agenda.set(key, Number(a.end_minute));
  }
  assert.equal(agenda.size, people.length * 7); assert.ok([...agenda.values()].every(end => end === 1440));
  const manifest = json(files['manifest.json']); assert.equal(manifest.translink, 'aggregate_reference_only_not_used_to_assign_trips'); assert.equal(manifest.ns, 'not_connected');
  assert.deepEqual(json(files['source-inputs.json']), SNAPSHOT);
  assert.equal(manifest.batchSeeds.ROT, options.seed); assert.equal(manifest.summary.people, options.count);
  const quality = json(files['ROT/quality.json']); for (const check of quality.checks) assert.deepEqual(check.ageActual, check.ageTarget);
});

test('national source and export cover all municipalities and disclose disabled assignments', async () => {
  assert.equal(NATIONAL_SNAPSHOT.areas.length, 342); assert.equal(new Set(NATIONAL_SNAPSHOT.areas.map(a => a.province)).size, 12);
  assert.equal(NATIONAL_SNAPSHOT.areas.reduce((n, a) => n + a.population, 0), 17942942);
  const input = { source: NATIONAL_SNAPSHOT, options: { ...options, count: 50000, areas: NATIONAL_SNAPSHOT.areas.map(a => a.id), features: [] }, includeActivities: false, includeTranslink: false };
  const { files, summary } = await archive(input); assert.equal(summary.people, 50000); assert.equal(summary.batches, 342);
  const globalIds = new Set(); let count = 0;
  for (const area of NATIONAL_SNAPSHOT.areas) {
    const { people } = assertJoins(files, area.id);
    for (const p of people) {
      assert.ok(!globalIds.has(p.person_id)); globalIds.add(p.person_id); count++;
      assert.equal(p.home_area, area.id); assert.equal(p.province_code, area.province);
      assert.equal(p.household_id, ''); assert.equal(p.school_assignment_status, 'disabled'); assert.equal(p.employment_assignment_status, 'disabled');
      assert.equal(p.sewage_status, 'outside_geographic_coverage');
    }
    assert.deepEqual(json(files[`${area.id}/quality.json`]).sourceAgePrior, NATIONAL_SNAPSHOT.areaAgePriors[area.id]);
  }
  assert.equal(count, 50000); assert.ok(!files['external/translink-hourly-profiles.json']);
  const manifest = json(files['manifest.json']); assert.equal(manifest.geography, 'municipality'); assert.equal(manifest.sample, true); assert.equal(manifest.excludedAreas.length, 0);
  assert.ok(manifest.summary.warnings.some(w => w.includes('onafhankelijk')));
});

test('municipality batches are reproducible with distinct stable seeds and missing work status', async () => {
  const areas = NATIONAL_SNAPSHOT.areas.slice(0, 4).map(a => a.id);
  const source = { ...NATIONAL_SNAPSHOT, areas: NATIONAL_SNAPSHOT.areas.map(a => ({ ...a, workers: null })) };
  const input = { source, options: { ...options, count: 800, areas }, includeActivities: false, includeTranslink: false };
  const a = await archive(input), b = await archive(input);
  for (const path of Object.keys(a.files).filter(path => path !== 'manifest.json')) assert.deepEqual(a.files[path], b.files[path], path);
  const m = json(a.files['manifest.json']); assert.equal(new Set(Object.values(m.batchSeeds)).size, 4);
  for (const code of areas) {
    assert.equal(m.batchSeeds[code], batchSeed(options.seed, code));
    for (const person of csv(a.files[`${code}/people.csv`])) { assert.equal(person.employment_assignment_status, 'missing_source'); assert.equal(person.employed, 'false'); }
  }
  const seedsA = researchBatches(input).map(b => [b.prefix, b.options.seed]);
  assert.deepEqual(researchBatches({ ...input, options: { ...input.options, areas: [...areas].reverse() } }).map(b => [b.prefix, b.options.seed]), seedsA);
  assert.notEqual(batchSeed(options.seed, areas[0]), batchSeed(options.seed + 1, areas[0]));
});

test('invalid original national requests fail before seed coercion or output', async () => {
  const base = { source: NATIONAL_SNAPSHOT, options: { ...options, count: 20, areas: [NATIONAL_SNAPSHOT.areas[0].id] }, includeActivities: false, includeTranslink: false };
  for (const changed of [{ seed: NaN }, { seed: -1 }, { seed: .5 }, { seed: 4294967296 }, { areas: [...base.options.areas, ...base.options.areas] }, { areas: ['GM9999'] }, { features: ['unknown'] }, { features: ['income'] }, { commuteKm: NaN }]) {
    let writes = 0;
    await assert.rejects(exportResearch({ ...base, options: { ...base.options, ...changed } }, async () => { writes++; }, () => {}));
    assert.equal(writes, 0, 'invalid request must not start an export');
  }
});

test('ZIP export propagates a disk failure and honors asynchronous sink writes', async () => {
  const error = new Error('disk full'); let writes = 0;
  await assert.rejects(exportResearch(request, async () => { if (++writes === 3) throw error; }, () => {}), e => e === error);
  assert.equal(writes, 3);
});

test('32-bit random stream stays reproducible beyond five million draws', () => {
  const seed = 20260915, rng = new RNG(seed), targets = new Set([1, 4917759, 4917760, 4917761, 5000000]);
  for (let i = 1; i <= 5000000; i++) {
    const value = rng.next();
    if (!targets.has(i)) continue;
    // Direct big-integer position calculation detects loss of precision from
    // accumulating state above Number.MAX_SAFE_INTEGER on large populations.
    let t = Number((BigInt(seed) + BigInt(i) * 0x6D2B79F5n) & 0xffffffffn);
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    assert.equal(value, ((t ^ t >>> 14) >>> 0) / 4294967296);
  }
});

test('CLI file writer completes short writes and rejects zero progress', async () => {
  const chunks = [], input = Uint8Array.from({ length: 31 }, (_, i) => i);
  await writeComplete({ async write(bytes, offset, length) { const n = Math.min(length, 7); chunks.push(Buffer.from(bytes.subarray(offset, offset + n))); return { bytesWritten: n }; } }, input);
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(input));
  await assert.rejects(writeComplete({ async write() { return { bytesWritten: 0 }; } }, input));
});

test('CLI writes a usable ZIP and never deletes an existing partial export', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pdpc-research-test-'));
  try {
    const out = join(dir, 'sample.zip'), partial = out + '.partial', sentinel = Buffer.from('another export owns this');
    await writeFile(partial, sentinel);
    await assert.rejects(execute(process.execPath, ['scripts/export-research.mjs', '--scope', 'rotterdam', '--count', '200', '--out', out]));
    assert.deepEqual(await readFile(partial), sentinel); assert.deepEqual(await readdir(dir), ['sample.zip.partial']);
    await rm(partial);
    await execute(process.execPath, ['scripts/export-research.mjs', '--scope', 'rotterdam', '--count', '200', '--out', out]);
    const files = unzipSync(await readFile(out)); assert.equal(csv(files['ROT/people.csv']).length, 200); assert.equal(json(files['manifest.json']).summary.people, 200);
    assert.deepEqual(await readdir(dir), ['sample.zip']);
    const nationalOut = join(dir, 'national.zip');
    await execute(process.execPath, ['scripts/export-research.mjs', '--scope', 'national', '--count', '500', '--features', '', '--out', nationalOut]);
    const national = unzipSync(await readFile(nationalOut));
    assert.equal(Object.entries(national).filter(([path]) => path.endsWith('/people.csv')).reduce((n, [, bytes]) => n + csv(bytes).length, 0), 500);
    assert.equal(json(national['manifest.json']).scope, 'national');
    await assert.rejects(execute(process.execPath, ['scripts/export-research.mjs', '--scope', 'national', '--seed', 'NaN', '--count', '10', '--out', join(dir, 'invalid.zip')]));
    assert.ok(!(await readdir(dir)).some(name => name.startsWith('invalid')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
