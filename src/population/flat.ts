import { dailyActivities } from '../lives/activities';
import { householdPoint } from '../lives/locations';
import { wijkCode, GEOMETRY } from '../lives/geography';
import { sewageName } from '../lives/sewage';
import type { Population } from '../lives/types';

export const FLAT_COLUMNS = [
  'home_area_name','wijk_code','wijk_name','municipality_code','municipality_name',
  'source_year','source_table','source_retrieved_at','model_version','seed','synthetic',
  'activity_status','home_longitude','home_latitude','location_basis','map_geometry_year','sewage_name','sewage_boundary_year',
  ...['household','school','work','event'].flatMap(k => [`${k}_kind`,`${k}_area`,`${k}_label`,`${k}_cluster_days_monday0`,`${k}_member_count`]),
  'household_resident_count','household_resident_ids','parents_json','memberships_json',
  'activities_included',...['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => `${d}_activities_json`),
];

/** A denormalization only: no RNG draws or reassignment of any person. Lists
 * are encoded as JSON instead of losing multiple relatives/groups/episodes. */
export function* flatRows(p: Population, prefix: string, baseRows: Iterable<unknown[]>, includeActivities: boolean) {
  const areas = new Map(p.source.areas.map(a => [a.id,a]));
  const wijken = new Map(GEOMETRY.wijk.features.map(f => [f.properties.code,f.properties.name]));
  const cid = (id: number) => `${prefix}:C${id}`, pid = (id: number) => `${prefix}:P${id}`;
  const membersByPerson: number[][] = Array.from({length:p.people.length}, () => []);
  const residentsByHome = new Map<number, number[]>();
  for (const c of p.clusters) for (const id of c.members) membersByPerson[id].push(c.id);
  for (const person of p.people) if (person.household >= 0) {
    if (!residentsByHome.has(person.household)) residentsByHome.set(person.household, []);
    residentsByHome.get(person.household)!.push(person.id);
  }
  const points = new Map<string, ReturnType<typeof householdPoint>>();
  const clusterFields = (id: number | null) => {
    const c = id === null || id < 0 ? undefined : p.clusters[id];
    return c ? [c.kind,c.area,c.label,c.days.join('|'),c.members.length] : ['','','','',''];
  };
  let i = 0;
  for (const base of baseRows) {
    const person = p.people[i++], area = areas.get(person.area)!;
    const key = `${person.area}:${person.household >= 0 ? 'h'+person.household : 'p'+person.id}`;
    if (!points.has(key)) points.set(key, p.source.scope === 'national' ? null : householdPoint(person,p.options.seed));
    const point = points.get(key), wijk = wijkCode(person.area);
    const homeResidents = residentsByHome.get(person.household) ?? [];
    const memberships = membersByPerson[person.id].map(id => {
      const c = p.clusters[id];
      return {cluster_id:cid(id),kind:c.kind,area:c.area,label:c.label,days_monday0:c.days,member_ids:c.members.map(pid)};
    });
    const parents = person.parents.map(id => ({person_id:pid(id),age:p.people[id].age,sex:p.people[id].sex,household_role:p.people[id].role}));
    const days = Array.from({length:7},(_,day) => includeActivities ? JSON.stringify(dailyActivities(p,person.id,day).map(a =>
      [a.start,a.end,a.kind,a.label,a.area,a.cluster === null ? '' : cid(a.cluster)])) : '');
    yield [...base, area.name, wijk, wijken.get(wijk) ?? '', p.source.scope === 'national' ? person.area : 'GM0599', p.source.scope === 'national' ? area.name : 'Rotterdam',
      p.source.year,p.source.table,p.source.retrievedAt,p.version,p.options.seed,true,person.activity,
      point?.[0],point?.[1],point ? 'synthetic_point_within_2024_buurt_not_address' : 'no_location', p.source.scope === 'national' ? '' : 2024,
      person.sewageId ? sewageName(person.sewageId) : '', p.source.scope === 'national' ? '' : 2022,
      ...clusterFields(person.household),...clusterFields(person.school),...clusterFields(person.work),...clusterFields(person.event),
      homeResidents.length,homeResidents.map(pid).join('|'),JSON.stringify(parents),JSON.stringify(memberships),includeActivities,...days];
  }
}
