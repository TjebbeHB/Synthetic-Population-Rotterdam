"""Independent, standard-library check of the generated CSVs (no generator imports).
Usage: python3 audit.py reference.zip validation-report.json
"""
import csv, hashlib, io, itertools, json, sys, zipfile
from collections import Counter, defaultdict
from pathlib import Path

archive, destination = map(Path, sys.argv[1:3])
csv.field_size_limit(100_000_000)
def sha_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
def number(value, prefix):
    assert value.startswith(prefix), value
    return int(value[len(prefix):])
with zipfile.ZipFile(archive) as z:
    def rows(name):
        with z.open(name) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
            assert len(reader.fieldnames) == len(set(reader.fieldnames)), name
            for row in reader:
                assert None not in row and None not in row.values(), name
                yield row
    manifest = json.loads(z.read('manifest.json'))
    source = json.loads(z.read('source-inputs.json'))
    n = manifest['summary']['people']
    people, homes, areas = [], defaultdict(list), Counter()
    for i, p in enumerate(rows('ROT/people.csv')):
        assert p['person_id'] == f'ROT:P{i}'
        assert p['local_id'] == str(i)
        people.append((int(p['age']), p['sex'], p['household_role'], p['household_id']))
        if p['household_id']: homes[p['household_id']].append(p['person_id'])
        areas[p['home_area']] += 1
    assert len(people) == n
    clusters = {}
    for c in rows('ROT/clusters.csv'):
        assert c['cluster_id'] not in clusters
        clusters[c['cluster_id']] = c
    rosters, person_groups = defaultdict(list), [[] for _ in range(n)]
    membership_count = 0
    for m in rows('ROT/memberships.csv'):
        cid, pid = m['cluster_id'], m['person_id']
        assert cid in clusters
        i = number(pid, 'ROT:P'); assert 0 <= i < n
        assert cid not in person_groups[i]
        person_groups[i].append(cid); rosters[cid].append(pid); membership_count += 1
    for cid, c in clusters.items(): assert len(rosters[cid]) == int(c['member_count'])
    activity_groups = iter(itertools.groupby(rows('ROT/activities.csv'), lambda a:a['person_id']))
    activity_count = flat_count = 0
    max_flat_cell = 0
    originals = iter(rows('ROT/people.csv'))
    for i, f in enumerate(rows('ROT/people-flat.csv')):
        original = next(originals)
        for key, value in original.items(): assert f[key] == value, (i, key)
        assert f['person_id'] == f'ROT:P{i}'
        assert f['synthetic'] == 'true' and f['activities_included'] == 'true'
        assert int(f['source_year']) == manifest['sourceYear']
        for group in ['household','school','work','event']:
            cid = f[group+'_id']
            if cid:
                assert cid in person_groups[i]
                c = clusters[cid]
                for suffix in ['kind','area','label','member_count']: assert f[group+'_'+suffix] == c[suffix]
                assert f[group+'_cluster_days_monday0'] == c['days_monday0']
        home = homes.get(f['household_id'], [])
        assert int(f['household_resident_count']) == len(home)
        assert f['household_resident_ids'] == '|'.join(home)
        parents = json.loads(f['parents_json'])
        assert [p['person_id'] for p in parents] == (f['parent_ids'].split('|') if f['parent_ids'] else [])
        for parent in parents:
            j = number(parent['person_id'], 'ROT:P'); assert 0 <= j < n
            age, sex, role, hid = people[j]
            assert (parent['age'],parent['sex'],parent['household_role']) == (age,sex,role)
            assert hid == f['household_id'] and role == 'parent'
            assert 18 <= age-int(f['age']) <= 50
        memberships = json.loads(f['memberships_json'])
        assert [m['cluster_id'] for m in memberships] == person_groups[i]
        for m in memberships:
            c = clusters[m['cluster_id']]
            for key in ['kind','area','label']: assert m[key] == c[key]
            assert '|'.join(map(str,m['days_monday0'])) == c['days_monday0']
            assert m['member_ids'] == rosters[m['cluster_id']]
        pid, linked_iter = next(activity_groups)
        assert pid == f['person_id']
        linked = list(linked_iter); reconstructed = []
        for day, name in enumerate(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']):
            cursor = 0
            for start,end,kind,label,area,cid in json.loads(f[name+'_activities_json']):
                assert start == cursor and end > start and end <= 1440
                if cid: assert cid in person_groups[i]
                reconstructed.append(dict(person_id=pid,weekday_monday0=str(day),start_minute=str(start),end_minute=str(end),kind=kind,label=label,destination_area=area,cluster_id=cid,basis='assumed_schedule'))
                cursor = end
            assert cursor == 1440
        assert reconstructed == linked
        activity_count += len(linked); flat_count += 1
        max_flat_cell = max(max_flat_cell, max(map(len,f.values())))
        if flat_count % 100000 == 0: print(f'Checked {flat_count:,} people',flush=True)
    assert flat_count == n and next(originals,None) is None and next(activity_groups,None) is None
    source_areas = {a['id']:a for a in source['areas']}
    if not manifest['sample']:
        for code in manifest['options']['areas']: assert areas[code] == source_areas[code]['population']
    quality = json.loads(z.read('ROT/quality.json'))
    for c in quality['checks']:
        assert c['n'] == areas[c['id']] and c['ageActual'] == c['ageTarget']
    entries = {}
    for entry in z.infolist():
        h = hashlib.sha256()
        with z.open(entry) as f:
            for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
        entries[entry.filename] = {'bytes':entry.file_size,'sha256':h.hexdigest()}
    report = {
        'archive':archive.name,'sha256':sha_file(archive),'bytes':archive.stat().st_size,
        'source_year':manifest['sourceYear'],'seed':manifest['options']['seed'],
        'people':n,'flat_rows':flat_count,'clusters':len(clusters),'memberships':membership_count,'activity_rows':activity_count,
        'included_neighbourhoods':len(areas),'included_population':sum(areas.values()),
        'excluded_areas':manifest['excludedAreas'],'excluded_population':sum(a['population'] for a in manifest['excludedAreas']),
        'max_flat_cell_characters':max_flat_cell,
        'checks':{'unique_person_and_cluster_ids':True,'all_foreign_keys_valid':True,'flat_equals_linked_for_all_rows':True,'all_diaries_match_and_cover_24h':True,'parent_age_gaps_valid':True,'all_entries_pass_crc_and_sha256':True},
        'quality_totals':{k:sum(c.get(k) or 0 for c in quality['checks']) for k in ['householdTarget','householdActual','singleTarget','singleActual','workerTarget','workerActual','unresolvedChildren']},
        'warnings':quality['warnings'],'entries':entries,
        'interpretation':'Structural validation and reproducibility only; no independent validation of demographic or behavioural realism.',
    }
destination.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['entries','warnings']},ensure_ascii=False,indent=2))
