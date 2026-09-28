import { useMemo, useState } from 'react';
import { clockTime, dailyActivities, WEEKDAYS } from './activities';
import type { Population } from './types';

export default function ActivityAgenda({ population, selected }: { population: Population; selected: number }) {
  const [weekday, setWeekday] = useState(0);
  const episodes = useMemo(() => dailyActivities(population, selected, weekday), [population, selected, weekday]);
  const areaName = (id: string) => population.source.areas.find(a => a.id === id)?.name ?? (id === 'outside' ? 'Buiten Rotterdam' : id);
  return <details className="lives-agenda" open>
    <summary>Activiteiten · voorbeeldweek</summary>
    <label>Dag van de week<select value={weekday} onChange={e => setWeekday(+e.target.value)}>{WEEKDAYS.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>
    <ol>{episodes.map((activity, i) => <li key={i} data-kind={activity.kind}>
      <time>{clockTime(activity.start)}–{clockTime(activity.end)}</time>
      <strong>{activity.label}</strong><span>{areaName(activity.area)}</span>
    </li>)}</ol>
    <p>School, werk en evenementen volgen de gegenereerde aanwezigheidsdagen. Kloktijden en 30 minuten per reis zijn aannames; er worden geen echte verplaatsingen gereconstrueerd. Overige tijd is nog niet ingevuld met sport, winkelen of bezoek. Vervoermiddel en ODiN-kalibratie ontbreken nog.</p>
  </details>;
}
