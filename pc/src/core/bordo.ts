/**
 * Geometria del bordo: quale lato, quale schermo, quando la finestra deve diventare "toccabile".
 * Puro: niente Electron, si prova con Vitest.
 *
 * La finestra dell'effetto non copre tutto lo schermo: è una fascia lungo il lato scelto (PROFONDITA px).
 * Più piccola = Windows compone meno pixel trasparenti a ogni fotogramma → 60 fps senza fatica.
 */
export type Lato = 'sinistra' | 'destra' | 'alto' | 'basso';
export const LATI: Lato[] = ['destra', 'sinistra', 'alto', 'basso'];

export interface Rett { x: number; y: number; width: number; height: number }
export interface Punto { x: number; y: number }

/** profondità della fascia dell'effetto, in px */
export const PROFONDITA = 480;
/** distanza dal bordo in cui la finestra si sveglia durante un trascinamento */
export const ZONA = 140;
/** distanza dal bordo in cui si può lasciare il file */
export const ZONA_RILASCIO = 64;
/** spessore della striscia sempre toccabile (Mac/Linux) */
export const STRISCIA = 6;
/** quanto deve muoversi il mouse col tasto giù prima di considerarlo un trascinamento */
const SOGLIA_MOSSA = 12;

/** Rettangolo della fascia dell'effetto dentro lo schermo. */
export function fascia(schermo: Rett, lato: Lato, profondita = PROFONDITA): Rett {
  const p = Math.min(profondita, lato === 'sinistra' || lato === 'destra' ? schermo.width : schermo.height);
  if (lato === 'destra') return { x: schermo.x + schermo.width - p, y: schermo.y, width: p, height: schermo.height };
  if (lato === 'sinistra') return { x: schermo.x, y: schermo.y, width: p, height: schermo.height };
  if (lato === 'alto') return { x: schermo.x, y: schermo.y, width: schermo.width, height: p };
  return { x: schermo.x, y: schermo.y + schermo.height - p, width: schermo.width, height: p };
}

export function dentro(p: Punto, r: Rett) {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

/** Distanza (px) del punto dal lato scelto dello schermo. Negativa se il punto è oltre il lato. */
export function distanzaDalLato(p: Punto, s: Rett, lato: Lato) {
  if (lato === 'destra') return s.x + s.width - 1 - p.x;
  if (lato === 'sinistra') return p.x - s.x;
  if (lato === 'alto') return p.y - s.y;
  return s.y + s.height - 1 - p.y;
}

/**
 * Coordinate "del bordo": u = lungo il lato (da 0 alla sua lunghezza), v = profondità verso l'interno (0 = sul bordo).
 * L'interfaccia disegna tutto in (u, v): così lo stesso effetto vale per i quattro lati.
 */
export function aBordo(lato: Lato, w: number, h: number, x: number, y: number): { u: number; v: number } {
  if (lato === 'destra') return { u: y, v: w - x };
  if (lato === 'sinistra') return { u: y, v: x };
  if (lato === 'alto') return { u: x, v: y };
  return { u: x, v: h - y };
}
export function daBordo(lato: Lato, w: number, h: number, u: number, v: number): Punto {
  if (lato === 'destra') return { x: w - v, y: u };
  if (lato === 'sinistra') return { x: v, y: u };
  if (lato === 'alto') return { x: u, y: v };
  return { x: u, y: h - v };
}
export function lunghezzaLato(lato: Lato, w: number, h: number) {
  return lato === 'destra' || lato === 'sinistra' ? h : w;
}

/** Il lato scelto tocca un altro monitor? (allora il telefono non può stare lì: lo diciamo nel menu) */
export function latoInterno(schermo: Rett, altri: Rett[], lato: Lato): boolean {
  const s = schermo;
  const sovrappone = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
  return altri.some((o) => {
    if (o === s || (o.x === s.x && o.y === s.y && o.width === s.width && o.height === s.height)) return false;
    if (lato === 'destra') return Math.abs(o.x - (s.x + s.width)) <= 1 && sovrappone(o.y, o.y + o.height, s.y, s.y + s.height);
    if (lato === 'sinistra') return Math.abs(o.x + o.width - s.x) <= 1 && sovrappone(o.y, o.y + o.height, s.y, s.y + s.height);
    if (lato === 'alto') return Math.abs(o.y + o.height - s.y) <= 1 && sovrappone(o.x, o.x + o.width, s.x, s.x + s.width);
    return Math.abs(o.y - (s.y + s.height)) <= 1 && sovrappone(o.x, o.x + o.width, s.x, s.x + s.width);
  });
}

/** Il primo lato "esterno" (che non tocca altri monitor), preferendo destra. */
export function latoConsigliato(schermo: Rett, altri: Rett[]): Lato {
  return LATI.find((l) => !latoInterno(schermo, altri, l)) ?? 'destra';
}

/**
 * Modalità "automatico": il Bluetooth sa solo QUANTO è vicino il telefono, non da che parte.
 * Allora accendiamo lo schermo dove sta il mouse (quello che stai guardando) e, di quello,
 * il lato esterno più vicino al cursore. I lati che toccano un altro monitor non contano
 * (il telefono non può stare in mezzo a due schermi), a meno che non ci sia altro.
 */
export function bordoVicinoAlMouse(p: Punto, schermi: Rett[]): { schermo: number; lato: Lato } {
  if (!schermi.length) return { schermo: 0, lato: 'destra' };
  let i = schermi.findIndex((s) => dentro(p, s));
  if (i < 0) {
    // cursore fuori da tutti (succede per un attimo cambiando monitor): il più vicino
    const d = (s: Rett) => Math.hypot(Math.max(s.x - p.x, 0, p.x - (s.x + s.width)), Math.max(s.y - p.y, 0, p.y - (s.y + s.height)));
    i = schermi.reduce((m, s, k) => (d(s) < d(schermi[m]) ? k : m), 0);
  }
  const s = schermi[i];
  const esterni = LATI.filter((l) => !latoInterno(s, schermi, l));
  const candidati = esterni.length ? esterni : LATI;
  let migliore = candidati[0];
  for (const l of candidati) if (distanzaDalLato(p, s, l) < distanzaDalLato(p, s, migliore)) migliore = l;
  return { schermo: i, lato: migliore };
}

/**
 * Durante un trascinamento in modalità automatico: verso quale lato (di quale schermo) stai andando?
 * Restituisce null se non sei vicino a nessun lato esterno.
 */
export function latoVersoCuiTrascini(p: Punto, schermi: Rett[], entro = ZONA * 2.5): { schermo: number; lato: Lato } | null {
  const i = schermi.findIndex((s) => dentro(p, s));
  if (i < 0) return null;
  const s = schermi[i];
  let migliore: Lato | null = null;
  for (const l of LATI) {
    if (latoInterno(s, schermi, l)) continue;
    const d = distanzaDalLato(p, s, l);
    if (d < entro && (migliore === null || d < distanzaDalLato(p, s, migliore))) migliore = l;
  }
  return migliore ? { schermo: i, lato: migliore } : null;
}

export interface Trascinamento {
  /** dove è iniziata la pressione del tasto (null = tasto su) */
  premutoDa: Punto | null;
}

export interface EsitoMouse {
  /** la finestra deve ricevere il mouse (per sentire il file trascinato) */
  toccabile: boolean;
  /** 0 lontano dal bordo, 1 sul bordo; solo durante un trascinamento */
  forza: number;
  /** tasto giù e mouse già mosso: è un trascinamento */
  trascina: boolean;
  /** il cursore è sullo schermo del bordo */
  sulloSchermo: boolean;
  distanza: number;
}

/**
 * Decide, a ogni giro (16 ms), se la finestra del bordo deve "svegliarsi".
 * - modo 'tasto' (Windows): solo se il tasto è giù, il mouse si è mosso e sei vicino al lato scelto.
 *   Così un clic normale vicino al bordo non viene mai bloccato.
 * - modo 'striscia' (Mac/Linux): toccabile solo negli ultimi STRISCIA px del lato.
 */
export function valutaMouse(
  p: Punto, schermo: Rett, lato: Lato, giu: boolean | null, stato: Trascinamento, modo: 'tasto' | 'striscia',
): EsitoMouse {
  if (giu && !stato.premutoDa) stato.premutoDa = { ...p };
  if (!giu) stato.premutoDa = null;
  const sulloSchermo = dentro(p, schermo);
  const distanza = distanzaDalLato(p, schermo, lato);
  const vicino = sulloSchermo && distanza < ZONA;
  const mosso = !!stato.premutoDa && Math.hypot(p.x - stato.premutoDa.x, p.y - stato.premutoDa.y) > SOGLIA_MOSSA;
  const trascina = !!giu && mosso;
  const toccabile = modo === 'tasto' ? trascina && vicino : sulloSchermo && distanza < STRISCIA;
  const forza = trascina && vicino ? 1 - Math.max(0, distanza) / ZONA : 0;
  return { toccabile, forza, trascina, sulloSchermo, distanza };
}
