import { useState } from 'react';
import { Database, Map } from 'lucide-react';
import PopulationLab from './population/PopulationLab';

export default function App() {
  const [view, setView] = useState<'generate' | 'map'>('generate');
  function show(next: 'generate' | 'map') { window.scrollTo({top:0}); setView(next); }
  return <div className="pdpc-shell ggd-theme">
    <header className="pdpc-topbar population-topbar">
      <a className="pdpc-brand ggd-brand" href="#genereren" onClick={() => show('generate')}><img src="/ggd-rotterdam-rijnmond.svg" alt="GGD Rotterdam-Rijnmond" width="220" height="48"/><span>Populatie Lab<span>Onderzoeksprototype · geen officieel GGD-dashboard</span></span></a>
      <nav aria-label="Hoofdnavigatie">
        <button aria-current={view === 'generate' ? 'page' : undefined} onClick={() => show('generate')}><Database size={17}/> Populatie genereren</button>
        <button aria-current={view === 'map' ? 'page' : undefined} onClick={() => show('map')}><Map size={17}/> Rotterdamse kaart</button>
      </nav>
    </header>
    <PopulationLab view={view} onView={show}/>
  </div>;
}
