/**
 * Cronologia dei file passati tra telefono e PC (arrivati e mandati), per la finestrella "Cronologia".
 * Puro: si prova con Vitest. Il salvataggio su disco lo fa il processo principale.
 */
import type { Genere } from './nomi';

export interface VoceCronologia {
  id: string;
  verso: 'arrivato' | 'mandato';
  nome: string;
  /** percorso sul PC (per Apri / Apri cartella); vuoto per testo e link */
  percorso: string;
  telefono: string;
  dimensione: number;
  genere: Genere | 'collegato';
  quando: number;
  /** testo o link copiato negli appunti */
  testo?: string;
}

export const MASSIMO_VOCI = 300;

export class Cronologia {
  constructor(public voci: VoceCronologia[] = []) {}

  aggiungi(v: VoceCronologia) {
    this.voci.unshift(v);
    if (this.voci.length > MASSIMO_VOCI) this.voci.length = MASSIMO_VOCI;
  }

  togli(id: string) { this.voci = this.voci.filter((v) => v.id !== id); }

  svuota() { this.voci = []; }

  /** Raggruppa per giorno ("Oggi", "Ieri", "12 novembre") mantenendo l'ordine dal più recente. */
  perGiorno(ora = Date.now()): { giorno: string; voci: VoceCronologia[] }[] {
    const gruppi: { giorno: string; voci: VoceCronologia[] }[] = [];
    for (const v of this.voci) {
      const g = nomeGiorno(v.quando, ora);
      const ultimo = gruppi[gruppi.length - 1];
      if (ultimo && ultimo.giorno === g) ultimo.voci.push(v); else gruppi.push({ giorno: g, voci: [v] });
    }
    return gruppi;
  }
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function nomeGiorno(t: number, ora = Date.now()): string {
  const inizio = (x: number) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const giorni = Math.round((inizio(ora) - inizio(t)) / 86_400_000);
  if (giorni === 0) return 'Oggi';
  if (giorni === 1) return 'Ieri';
  const d = new Date(t);
  const anno = d.getFullYear() !== new Date(ora).getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MESI[d.getMonth()]}${anno}`;
}
