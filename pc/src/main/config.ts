import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { TelefonoAbbinato } from '../core/abbinamento';
import type { Lato } from '../core/bordo';

/** Impostazioni di FIONDA: nella cartella dati dell'app (%APPDATA%\fionda). */
export interface Config {
  /** lato dove tieni il telefono; 'auto' (o niente) = il lato esterno più vicino al mouse, sullo schermo del mouse */
  lato?: Lato | 'auto';
  /** id dello schermo (undefined = principale) */
  schermo?: number;
  tema?: 'sistema' | 'chiaro' | 'scuro';
  /** nasconde i nomi dei file (per video e screenshot) */
  registrazione?: boolean;
  /** suoni al lancio, all'arrivo e al collegamento (di serie sì) */
  suoni?: boolean;
  /** foto HEIC dell'iPhone convertite in JPG all'arrivo (di serie sì) */
  heicInJpg?: boolean;
  /** visibile ai telefoni vicini (collegamento avvicinando); di serie sì */
  visibile?: boolean;
  /** telefoni abbinati (solo l'impronta del gettone) */
  telefoni?: TelefonoAbbinato[];
}

const file = () => path.join(app.getPath('userData'), 'config.json');

export function leggiConfig(): Config {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; }
}

let timer: NodeJS.Timeout | undefined;
export function salvaConfig(c: Config) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(c, null, 2)); } catch {}
  }, 300);
}
