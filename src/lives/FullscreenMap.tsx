import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minimize } from 'lucide-react';

export default function FullscreenMap({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [full, setFull] = useState(false);
  const nativeRequested = useRef(false);
  async function close() {
    if (document.fullscreenElement === container.current) await document.exitFullscreen().catch(() => {});
    setFull(false); trigger.current?.focus();
  }
  async function toggle() {
    if (full) { await close(); return; }
    setFull(true);
    if (container.current?.requestFullscreen) {
      try { await container.current.requestFullscreen(); nativeRequested.current = true; }
      catch { nativeRequested.current = false; } // Fixed viewport fallback for iOS/embedded browsers.
    }
  }
  useEffect(() => {
    if (!full) return;
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const onChange = () => { if (!document.fullscreenElement && nativeRequested.current) { nativeRequested.current = false; setFull(false); trigger.current?.focus(); } };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void close(); }
      if (event.key === 'Tab') {
        const focusable = [...(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('fullscreenchange', onChange); document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('keydown', onKey); };
  }, [full]);
  return <div ref={container} className={`lives-fullscreen-map${full ? ' is-fullscreen' : ''}`} role={full ? 'dialog' : undefined} aria-modal={full || undefined} aria-label="Geografische kaart">
    <div className="lives-fullscreen-toolbar"><span>Rotterdam · synthetische populatie</span><button ref={trigger} type="button" onClick={() => void toggle()} aria-pressed={full}>{full ? <Minimize size={16}/> : <Maximize size={16}/>} {full ? 'Sluiten' : 'Volledig scherm'}</button></div>
    {children}
  </div>;
}
