import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { nomeLibero } from '../core/nomi';

const richiedi = createRequire(__filename);

/** Le foto dell'iPhone in HEIC che Windows spesso non apre: le trasformiamo in JPG. */
export function eHeic(nome: string) { return /\.(heic|heif)$/i.test(nome); }

/**
 * Converte in JPG in un thread a parte (la conversione è pesante: il bordo e il mouse non devono scattare).
 * Restituisce il percorso del JPG (l'HEIC originale viene tolto) oppure quello originale se non riesce.
 */
export async function heicInJpg(percorso: string): Promise<string> {
  let modulo: string;
  try { modulo = richiedi.resolve('heic-convert'); } catch { return percorso; }
  // nel programma installato il convertitore sta fuori dall'archivio (i thread non leggono dentro app.asar)
  modulo = modulo.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const cartella = path.dirname(percorso);
  const base = path.basename(percorso).replace(/\.(heic|heif)$/i, '');
  const dest = path.join(cartella, nomeLibero(`${base}.jpg`, (n) => fs.existsSync(path.join(cartella, n))));
  const codice = `
    const { parentPort, workerData } = require('node:worker_threads');
    const fs = require('node:fs');
    const converti = require(workerData.modulo);
    converti({ buffer: fs.readFileSync(workerData.da), format: 'JPEG', quality: 0.92 })
      .then((jpg) => { fs.writeFileSync(workerData.a, Buffer.from(jpg)); parentPort.postMessage('ok'); })
      .catch((e) => parentPort.postMessage('errore: ' + e.message));`;
  const esito = await new Promise<string>((fatto) => {
    const w = new Worker(codice, { eval: true, workerData: { modulo, da: percorso, a: dest } });
    const timer = setTimeout(() => { w.terminate(); fatto('errore: troppo lento'); }, 60_000);
    w.once('message', (m) => { clearTimeout(timer); fatto(String(m)); w.terminate(); });
    w.once('error', (e: Error) => { clearTimeout(timer); fatto('errore: ' + e.message); });
  });
  if (esito !== 'ok') { console.warn('[heic]', esito); fs.rm(dest, { force: true }, () => {}); return percorso; }
  fs.rm(percorso, { force: true }, () => {});
  return dest;
}
