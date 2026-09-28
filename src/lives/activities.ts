import { attends } from './transmission';
import type { Population } from './types';

export interface ActivityEpisode {
  start: number; end: number; label: string; area: string;
  cluster: number | null; kind: 'home' | 'school' | 'work' | 'event' | 'travel';
}
export const WEEKDAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
export const clockTime = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

/** Illustrative clock times layered onto the same attendance rules as the ABM.
 * Not an ODiN diary. Travel does not create additional transmission contacts.
 */
export function dailyActivities(population: Population, id: number, weekday: number): ActivityEpisode[] {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('Ongeldige weekdag.');
  const person = population.people[id];
  if (!person) throw new Error('Onbekende persoon.');
  const day = weekday + 1;
  const at = (cluster: number | null) => cluster !== null && cluster >= 0 &&
    population.clusters[cluster]?.members.includes(id) && attends(person, population.clusters[cluster], day);
  const visits: ActivityEpisode[] = [];
  const visit = (cluster: number, kind: ActivityEpisode['kind'], start: number, end: number) => {
    const c = population.clusters[cluster];
    visits.push({ start, end, label: c.label, area: c.area, cluster, kind });
  };
  if (at(person.school)) visit(person.school!, 'school', 510, 900);
  if (at(person.work) && person.work !== person.household) {
    visit(person.work!, 'work', visits.length ? 990 : 540, visits.length ? 1200 : 1020);
  }
  if (at(person.event)) visit(person.event!, 'event', 840, 1020);
  visits.sort((a, b) => a.start - b.start);
  const home: Omit<ActivityEpisode, 'start' | 'end'> = {
    label: person.role === 'institutional' ? 'Wooninstelling' : 'Thuis / niet ingevulde tijd',
    area: person.area, cluster: person.household >= 0 ? person.household : null, kind: 'home',
  };
  const episodes: ActivityEpisode[] = [];
  let cursor = 0;
  for (const activity of visits) {
    // Existing model has weekday work/school and Saturday events. Explicitly
    // reject inconsistent future rosters instead of silently overlapping time.
    if (activity.start - 30 < cursor) throw new Error('Overlappende activiteiten in het weekrooster.');
    if (cursor < activity.start - 30) episodes.push({ ...home, start: cursor, end: activity.start - 30 });
    episodes.push({ start: activity.start - 30, end: activity.start, label: 'Reis naar activiteit', area: activity.area, cluster: null, kind: 'travel' });
    episodes.push(activity);
    episodes.push({ start: activity.end, end: activity.end + 30, label: 'Reis naar huis', area: person.area, cluster: null, kind: 'travel' });
    cursor = activity.end + 30;
  }
  if (cursor < 1440) episodes.push({ ...home, start: cursor, end: 1440 });
  return episodes;
}
