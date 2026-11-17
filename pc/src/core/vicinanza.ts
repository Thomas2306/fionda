/**
 * Filtro "vicino / lontano" sulla forza del segnale Bluetooth (RSSI, in dBm: -35 = attaccato, -70 = lontano).
 * Valori misurati il 16/11/2026 con un iPhone vero e un PC (media):
 *   appoggiato -33/-45 · ~30 cm -50/-58 · 1-3 m -60/-67. I singoli pacchetti ballano di 10-15 dBm.
 *
 * - media mobile esponenziale: smussa i salti;
 * - isteresi: VICINO sopra `entra`, torna LONTANO solo sotto `esci` → niente lampeggi al confine;
 * - PERSO se non arriva niente per `persoMs` (app chiusa, telefono lontano).
 */
export type StatoTelefono = 'VICINO' | 'LONTANO' | 'PERSO';

export interface OpzioniVicinanza { entra?: number; esci?: number; alfa?: number; persoMs?: number }

export const SOGLIE = { entra: -52, esci: -60 } as const;

export function creaVicinanza({ entra = SOGLIE.entra, esci = SOGLIE.esci, alfa = 0.3, persoMs = 4000 }: OpzioniVicinanza = {}) {
  let media: number | null = null;
  let stato: StatoTelefono = 'PERSO';
  let ultimo = -Infinity;
  return {
    pacchetto(rssi: number, ora: number): StatoTelefono {
      // 127 = "non disponibile" su alcuni sistemi
      if (!Number.isFinite(rssi) || rssi >= 20) return stato;
      media = media === null || stato === 'PERSO' ? rssi : media + alfa * (rssi - media);
      ultimo = ora;
      if (stato === 'PERSO') stato = media >= entra ? 'VICINO' : 'LONTANO';
      else if (stato === 'LONTANO' && media >= entra) stato = 'VICINO';
      else if (stato === 'VICINO' && media <= esci) stato = 'LONTANO';
      return stato;
    },
    tick(ora: number): StatoTelefono {
      if (stato !== 'PERSO' && ora - ultimo > persoMs) { stato = 'PERSO'; media = null; }
      return stato;
    },
    get stato() { return stato; },
    get media() { return media; },
  };
}

/**
 * Quanto "forte" disegnare il bordo quando il telefono è VICINO: 0 al confine, 1 quando è attaccato.
 * Così la luce cresce mentre il telefono si avvicina, invece di accendersi di colpo.
 */
/**
 * Livello continuo 0-1, anche da LONTANO: -78 dBm (stanza accanto) → 0, -40 (attaccato) → 1.
 * Serve al telefono per far crescere luce e vibrazione mentre ti avvicini, prima ancora di essere VICINO.
 */
export function livelloDaSegnale(media: number | null, stato: StatoTelefono, { min = -78, max = -40 } = {}): number {
  if (stato === 'PERSO' || media === null) return 0;
  return Math.max(0, Math.min(1, (media - min) / (max - min)));
}

export function forzaDaSegnale(media: number | null, stato: StatoTelefono, { min = SOGLIE.esci, max = -40 } = {}): number {
  if (stato !== 'VICINO' || media === null) return 0;
  const f = (media - min) / (max - min);
  return Math.max(0.25, Math.min(1, f));
}
