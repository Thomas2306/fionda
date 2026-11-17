import { contextBridge, ipcRenderer, webUtils } from 'electron';

/** Ponte minimo e sicuro tra le finestre (bordo, abbinamento) e il processo principale. */
const api = {
  // --- bordo ---
  suDati: (f: (d: unknown) => void) => ipcRenderer.on('dati', (_e, d) => f(d)),
  suMouse: (f: (m: unknown) => void) => ipcRenderer.on('mouse', (_e, m) => f(m)),
  suTelefono: (f: (t: unknown) => void) => ipcRenderer.on('telefono', (_e, t) => f(t)),
  /** la demo simula un rilascio in (x, y) con questi nomi */
  suLancioDemo: (f: (l: { x: number; y: number; nomi: string[] }) => void) => ipcRenderer.on('lancio-demo', (_e, l) => f(l)),
  /** un file sta arrivando dal telefono / è arrivato */
  suArrivo: (f: (a: unknown) => void) => ipcRenderer.on('arrivo', (_e, a) => f(a)),
  /** PC → telefono: il file lasciato sul bordo è in coda / parte / è arrivato */
  suUscita: (f: (u: unknown) => void) => ipcRenderer.on('uscita', (_e, u) => f(u)),
  pronto: () => ipcRenderer.send('pronto'),
  lanciati: (percorsi: string[]) => ipcRenderer.send('lanciati', percorsi),
  fps: (s: { media: number; peggiore: number; fotogrammi: number; particelle: number }) => ipcRenderer.send('fps', s),
  log: (m: string) => ipcRenderer.send('log', m),
  percorso: (f: File) => webUtils.getPathForFile(f),
  // --- finestra di abbinamento ---
  suAbbina: (f: (s: unknown) => void) => ipcRenderer.on('abbina', (_e, s) => f(s)),
  abbinaPronta: () => ipcRenderer.send('abbina:pronta'),
  nuovoQR: () => ipcRenderer.send('abbina:nuovo'),
  rimuoviTelefono: (id: string) => ipcRenderer.send('abbina:rimuovi', id),
  apriCartella: () => ipcRenderer.send('apri-cartella'),
  // --- conferma del collegamento avvicinando ---
  suRichiesta: (f: (d: unknown) => void) => ipcRenderer.on('richiesta', (_e, d) => f(d)),
  richiestaPronta: () => ipcRenderer.send('richiesta:pronta'),
  rispondiRichiesta: (si: boolean) => ipcRenderer.send('richiesta:rispondi', si),
  // --- cronologia ---
  suCronologia: (f: (d: unknown) => void) => ipcRenderer.on('cronologia', (_e, d) => f(d)),
  cronologiaPronta: () => ipcRenderer.send('cronologia:pronta'),
  miniatura: (id: string) => ipcRenderer.invoke('cronologia:miniatura', id) as Promise<string | null>,
  apriVoce: (id: string, modo: 'apri' | 'cartella' | 'copia') => ipcRenderer.send('cronologia:apri', id, modo),
  svuotaCronologia: () => ipcRenderer.send('cronologia:svuota'),
  cartellaCronologia: () => ipcRenderer.send('cronologia:cartella'),
  // --- senza app ---
  suSenzaApp: (f: (d: unknown) => void) => ipcRenderer.on('senzaapp', (_e, d) => f(d)),
  senzaAppPronta: () => ipcRenderer.send('senzaapp:pronta'),
  aggiungiSenzaApp: (percorsi: string[]) => ipcRenderer.send('senzaapp:aggiungi', percorsi),
  scegliSenzaApp: () => ipcRenderer.send('senzaapp:scegli'),
  togliSenzaApp: (id: string) => ipcRenderer.send('senzaapp:togli', id),
};
contextBridge.exposeInMainWorld('fionda', api);
export type ApiFionda = typeof api;
