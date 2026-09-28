import { exportResearch, type ResearchRequest } from './export';
let acknowledge: (() => void) | null = null, running = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'ack') { acknowledge?.(); acknowledge = null; return; }
  if (data.type !== 'export' || running) return;
  running = true;
  try {
    const summary = await exportResearch(data.request as ResearchRequest,
      chunk => new Promise<void>(resolve => { acknowledge = resolve; self.postMessage({ type:'chunk', chunk }, { transfer: [chunk.buffer as ArrayBuffer] }); }),
      (completed,total,name) => self.postMessage({type:'progress',completed,total,name}),
      population => self.postMessage({type:'population',population}));
    self.postMessage({type:'complete',summary});
  } catch (error) { self.postMessage({type:'error',message:error instanceof Error ? error.message : 'Export mislukt.'}); }
  finally { running = false; }
};
