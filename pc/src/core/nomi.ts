/**
 * Nomi dei file che arrivano dal telefono: mai fidarsi. Niente percorsi (..\, /), niente caratteri vietati
 * da Windows, niente nomi riservati (CON, NUL...), lunghezza limitata. E mai sovrascrivere un file esistente.
 * Puro: si prova con Vitest.
 */
const RISERVATI = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export function nomeSicuro(grezzo: string, riserva = 'file'): string {
  let n = String(grezzo ?? '');
  try { n = n.normalize('NFC'); } catch { /* stringa strana: la puliamo comunque */ }
  // solo l'ultimo pezzo di un eventuale percorso
  n = n.split(/[\\/]/).pop() ?? '';
  n = n
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/^[\s.]+/, '')      // niente nomi nascosti o che iniziano con punti
    .replace(/[\s.]+$/, '');     // Windows non vuole punti o spazi in fondo
  if (!n) n = riserva;
  if (RISERVATI.test(n)) n = '_' + n;
  // massimo 150 caratteri, tenendo l'estensione
  if (n.length > 150) {
    const punto = n.lastIndexOf('.');
    const est = punto > 0 && n.length - punto <= 12 ? n.slice(punto) : '';
    n = n.slice(0, 150 - est.length) + est;
  }
  return n;
}

/** "foto.jpg" esiste già → "foto (1).jpg", "foto (2).jpg"... */
export function nomeLibero(nome: string, esiste: (n: string) => boolean): string {
  if (!esiste(nome)) return nome;
  const punto = nome.lastIndexOf('.');
  const base = punto > 0 ? nome.slice(0, punto) : nome;
  const est = punto > 0 ? nome.slice(punto) : '';
  for (let i = 1; i < 10000; i++) {
    const n = `${base} (${i})${est}`;
    if (!esiste(n)) return n;
  }
  return `${base} (${Date.now()})${est}`;
}

export type Genere = 'immagine' | 'video' | 'testo' | 'altro';

export function genere(nome: string): Genere {
  const est = nome.toLowerCase().split('.').pop() ?? '';
  if (['jpg', 'jpeg', 'png', 'heic', 'heif', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'dng'].includes(est)) return 'immagine';
  if (['mov', 'mp4', 'm4v', 'avi', 'mkv', 'webm', 'hevc'].includes(est)) return 'video';
  if (['txt', 'url', 'webloc'].includes(est)) return 'testo';
  return 'altro';
}

/** Dimensione leggibile: 1536 → "1,5 MB". */
export function dimensione(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = byte / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',')} ${u[i]}`;
}
