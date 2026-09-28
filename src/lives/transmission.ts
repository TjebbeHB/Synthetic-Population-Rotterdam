// Shared attendance and map-state helpers; legacy epidemic simulation is not included.
import type { Cluster, Person, Trace } from './types';
export function attends(person: Person, cluster: Cluster, day: number) {
  const weekday=(day-1)%7; // Simulation day 1 is Monday.
  const working=person.work===cluster.id;
  return cluster.days.includes(weekday) && (!working||!!person.workDays?.includes(weekday)) && !(cluster.kind==='household'&&person.role==='unresolved');
}
export function stateAt(trace: Trace | null, id: number, day: number): 'S'|'E'|'I'|'R' {
  if(!trace||trace.infectedOn[id]<0||day<trace.infectedOn[id])return 'S';
  if(day<trace.infectiousOn[id])return 'E';
  return day<trace.recoveredOn[id]?'I':'R';
}
