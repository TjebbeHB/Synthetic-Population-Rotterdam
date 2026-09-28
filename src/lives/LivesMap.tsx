import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection, Feature } from 'geojson';
import { householdPoint } from './locations';
import { GEOMETRY, mapPersonIds, matchesArea, type GeographyLevel, type GeographicSummary } from './geography';
import { stateAt } from './transmission';
import type { Population, Trace } from './types';

export const STATE_COLORS = { S: '#738c9a', E: '#c48b15', I: '#d33140', R: '#25785c' };
export const MAPPED_AREAS = new Set(GEOMETRY.buurt.features.map(f => f.properties.code));
const shade = (row?: GeographicSummary) => !row?.n ? '#cbd5db' : !row.infectious ? '#e3f0ec' : row.infectious / row.n < .01 ? '#f5c0a2' : row.infectious / row.n < .05 ? '#e97963' : '#c73046';

export default function LivesMap({ population, trace, day, area, level, summaries, selected, onSelect, onArea, populationOnly = false }: {
  populationOnly?: boolean; population: Population; trace: Trace | null; day: number; area: string; level: GeographyLevel;
  summaries: GeographicSummary[]; selected: number; onSelect: (id: number) => void; onArea: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null);
  const points = useRef<L.LayerGroup | null>(null), boundaries = useRef<L.LayerGroup | null>(null);
  const current = useRef({ onSelect, onArea }); current.current = { onSelect, onArea };
  const locations = useRef(new Map<string, [number, number] | null>());
  const [tileError, setTileError] = useState(false);
  const sample = useMemo(() => mapPersonIds(population, area), [population, area]);
  useEffect(() => { locations.current.clear(); }, [population]);
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { preferCanvas: true }).setView([51.924, 4.48], 11);
    map.current = m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).on('tileerror', () => setTileError(true)).addTo(m);
    m.attributionControl.addAttribution('CBS / PDOK 2024 · synthetische locaties');
    boundaries.current = L.layerGroup().addTo(m);
    points.current = L.layerGroup().addTo(m);
    const observer = new ResizeObserver(() => m.invalidateSize({ pan: false }));
    observer.observe(host.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; points.current = null; boundaries.current = null; };
  }, []);
  useEffect(() => {
    const group = boundaries.current; if (!group) return;
    group.clearLayers();
    const rows = new Map(summaries.map(row => [row.id, row]));
    L.geoJSON(GEOMETRY[level] as FeatureCollection, {
      style: feature => ({
        color: feature?.properties.code === area ? '#174f5c' : '#6f8a90',
        weight: feature?.properties.code === area ? 3 : 1,
        fillColor: populationOnly ? (rows.get(feature?.properties.code)?.n ? '#c7e6d0' : '#cbd5db') : shade(rows.get(feature?.properties.code)), fillOpacity: .5,
        dashArray: rows.has(feature?.properties.code) ? undefined : '4 4',
      }),
      onEachFeature: (feature, layer) => {
        layer.on('click', () => current.current.onArea(feature.properties.code));
        const row = rows.get(feature.properties.code), label = document.createElement('span');
        label.textContent = `${feature.properties.name} · ${row ? `${row.n.toLocaleString('nl-NL')} synthetische personen${populationOnly ? '' : ' · '}${populationOnly ? '' : trace ? `${row.infectious} besmettelijk (${(100 * row.infectious / row.n).toFixed(1)}%) op dag ${day}` : 'nog geen simulatie'}` : 'geen personen gegenereerd'}`;
        layer.bindTooltip(label, { sticky: true });
      },
    }).addTo(group);
  }, [level, summaries, area, trace, day, populationOnly]);
  useEffect(() => {
    const group = points.current; if (!group) return;
    group.clearLayers();
    const location = (id: number) => {
      const p = population.people[id]; if (!p) return null;
      const key = `${p.area}:${p.household >= 0 ? 'h' + p.household : 'p' + id}`;
      if (!locations.current.has(key)) locations.current.set(key, householdPoint(p, population.options.seed));
      const xy = locations.current.get(key); return xy ? L.latLng(xy[1], xy[0]) : null;
    };
    const transmissions = (trace?.transmissions ?? []).filter(t => t.day <= day &&
      (matchesArea(population.people[t.source].area, area) || matchesArea(population.people[t.target].area, area))).slice(0, 120);
    const ids = new Set([selected, ...(trace ? [trace.options.index] : []), ...transmissions.flatMap(t => [t.source, t.target]), ...sample]);
    for (const id of ids) {
      const p = population.people[id], xy = location(id); if (!xy) continue;
      const state = stateAt(trace, id, day), indexCase = trace?.options.index === id;
      const marker = L.circleMarker(xy, { radius: id === selected || indexCase ? 7 : state === 'I' ? 5 : 3,
        color: id === selected || indexCase ? '#172c38' : populationOnly ? '#004c31' : STATE_COLORS[state], weight: id === selected || indexCase ? 3 : 1,
        fillColor: populationOnly ? '#00811f' : STATE_COLORS[state], fillOpacity: .8 }).addTo(group);
      marker.on('click', () => current.current.onSelect(id));
      const label = document.createElement('span');
      label.textContent = `${indexCase ? 'Eerste patiënt · ' : ''}R${id + 1} · ${p.age} jaar · ${p.activity}`;
      marker.bindTooltip(label);
    }
    for (const t of transmissions) {
      const a = location(t.source), b = location(t.target); if (!a || !b) continue;
      const label = document.createElement('span');
      label.textContent = `#${t.number} · dag ${t.day} · R${t.source + 1} → R${t.target + 1} · ${population.clusters[t.cluster].label}`;
      L.polyline([a, b], { color: '#d33140', weight: 2, opacity: .8 }).bindTooltip(label).addTo(group);
      const el = document.createElement('span'); el.className = 'lives-edge-number'; el.textContent = String(t.number);
      L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { interactive: false,
        icon: L.divIcon({ html: el, className: 'lives-map-number', iconSize: [22, 20] }) }).addTo(group);
    }
  }, [population, trace, day, area, selected, sample, populationOnly]);
  useEffect(() => {
    const feature = GEOMETRY[level].features.find(f => f.properties.code === area);
    if (feature) map.current?.fitBounds(L.geoJSON(feature as Feature).getBounds(), { padding: [20, 20], maxZoom: 15 });
    else if (!area) map.current?.setView([51.924, 4.48], 11);
  }, [area, level]);
  return <><div className="lives-map" ref={host} role="region" aria-label={`Rotterdamse ${level}kaart met synthetische huishoudens${populationOnly ? '' : ' en transmissies'}`}/>
    {tileError && <p className="lives-map-caption" role="status">De achtergrondkaart is niet volledig geladen. CBS-grenzen en synthetische locaties blijven beschikbaar.</p>}
    {populationOnly ? <div className="lives-map-legend" aria-label="Gegenereerde populatie"><strong>Synthetische populatie</strong><span><i style={{background:'#c7e6d0'}}/>Personen gegenereerd</span><span><i style={{background:'#cbd5db'}}/>Niet gegenereerd</span><span><i style={{background:'#00811f'}}/>Fictieve woonlocatie</span></div> : <div className="lives-map-legend" aria-label="Besmettelijk aandeel van gegenereerde personen">
      <strong>Besmettelijk{trace ? ` · dag ${day}` : ' · nog geen simulatie'}</strong>
      {[['#e3f0ec', '0%'], ['#f5c0a2', '< 1%'], ['#e97963', '1–<5%'], ['#c73046', '≥ 5%'], ['#cbd5db', 'Niet gegenereerd']].map(([color, label]) => <span key={label}><i style={{ background: color }}/>{label}</span>)}
    </div>}</>;
}
