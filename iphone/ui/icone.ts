/**
 * Le icone di Fionda: disegnate da noi, niente emoji. STESSO FILE nel PC (pc/src/core/icone.ts)
 * e nell'iPhone (iphone/ui/icone.ts): un test controlla che siano identici.
 *
 * - GLIFI: icone dell'interfaccia, a tratto (viewBox 24×24, tratto 1,8, punte arrotondate).
 * - FORME: le 16 forme piene dei simboli del collegamento avvicinando. Simbolo n = forma (n % 16)
 *   nel colore (n / 16): 32 simboli, come i 32 valori che calcolano PC e telefono.
 */
export const GLIFI = {
  telefono: 'M8.5 2.5h7a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z M10.5 18.5h3',
  pc: 'M3.5 4.5h17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z M8.5 20.5h7 M12 16.5v4',
  onde: 'M5.5 9a9 9 0 0 1 13 0 M8.2 12a5.2 5.2 0 0 1 7.6 0 M12 15.6v.01',
  file: 'M6.5 2.5h7l5 5v13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z M13.5 2.5v5h5',
  foto: 'M3.5 5.5h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M2.5 15.5l5-5 4 4 3-3 7 7 M16 9.5h.01',
  video: 'M3.5 5.5h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M15.5 10l6-3.5v11l-6-3.5',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5',
  cartella: 'M2.5 6.5a1 1 0 0 1 1-1h5l2 2.5h10a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1z',
  spunta: 'M5 12.5l4.5 4.5L19 7.5',
  attesa: 'M7 2.5h10 M7 21.5h10 M8 2.5c0 5.5 8 5 8 9.5s-8 4-8 9.5 M16 2.5c0 5.5-8 5-8 9.5s8 4 8 9.5',
  scudo: 'M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z M8.5 12l2.5 2.5 4.5-5',
  su: 'M12 20V5 M6 11l6-6 6 6',
  destra: 'M4 12h15 M13 6l6 6-6 6',
  qr: 'M3.5 3.5h6v6h-6z M14.5 3.5h6v6h-6z M3.5 14.5h6v6h-6z M14.5 14.5h2.5v2.5h-2.5z M18 18h2.5v2.5h-2.5z M14.5 20.5h1.5 M20.5 14.5v1.5',
  condividi: 'M12 3v12 M7.5 7.5L12 3l4.5 4.5 M5 11v8.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V11',
  chiudi: 'M6 6l12 12 M18 6L6 18',
  fionda: 'M6.5 3v3.8a5.5 5.5 0 0 0 11 0V3 M12 12.3V21.5 M6.5 4.2c1.8 2.9 3.6 4.1 5.5 4.1s3.7-1.2 5.5-4.1 M12 8.3h.01',
} as const;

export type NomeGlifo = keyof typeof GLIFI;

/** Scintilla piena a 4 punte (decorazioni). */
export const SCINTILLA = 'M12 1.5l2.4 8.1 8.1 2.4-8.1 2.4L12 22.5l-2.4-8.1L1.5 12l8.1-2.4z';

/** Le 16 forme piene dei simboli (viewBox 24×24). */
export const FORME: { nome: string; d: string; pari?: boolean }[] = [
  { nome: 'cerchio', d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z' },
  { nome: 'triangolo', d: 'M12 3.2l9.3 16.6H2.7z' },
  { nome: 'quadrato', d: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { nome: 'rombo', d: 'M12 2l10 10-10 10L2 12z' },
  { nome: 'stella', d: 'M12 2l2.9 6.6 7.1.7-5.4 4.7 1.7 7L12 17.2 5.7 21l1.7-7L2 9.3l7.1-.7z' },
  { nome: 'esagono', d: 'M12 2l8.7 5v10L12 22l-8.7-5V7z' },
  { nome: 'luna', d: 'M14.5 2.5a9.5 9.5 0 1 0 7 15.8A7.8 7.8 0 0 1 14.5 2.5z' },
  { nome: 'goccia', d: 'M12 2.5c4.2 5.2 7 8.7 7 12.2a7 7 0 0 1-14 0c0-3.5 2.8-7 7-12.2z' },
  { nome: 'cuore', d: 'M12 21s-8.5-5.3-8.5-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 3.2C20.5 15.7 12 21 12 21z' },
  { nome: 'fulmine', d: 'M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z' },
  { nome: 'croce', d: 'M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z' },
  { nome: 'anello', d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z', pari: true },
  { nome: 'foglia', d: 'M20.5 3.5C9 3.5 3.5 9 3.5 20.5 15 20.5 20.5 15 20.5 3.5z' },
  { nome: 'corona', d: 'M3 7.5l4.6 4L12 4l4.4 7.5L21 7.5 19.2 19H4.8z' },
  { nome: 'scintilla', d: SCINTILLA },
  { nome: 'nuvola', d: 'M7.2 19a4.6 4.6 0 0 1-.8-9.1 6 6 0 0 1 11.5 1.6 3.8 3.8 0 0 1-.3 7.5z' },
];

/** I due colori dei simboli: [inizio, fine] del gradiente. */
export const COLORI_SIMBOLI: { nome: string; da: string; a: string }[] = [
  { nome: 'viola', da: '#9B7CFF', a: '#5B3BFF' },
  { nome: 'ciano', da: '#8EF0FF', a: '#14A9DE' },
];

export function simbolo(n: number) {
  const forma = FORME[((n % 32) + 32) % 32 % 16];
  const colore = COLORI_SIMBOLI[Math.floor((((n % 32) + 32) % 32) / 16)];
  return { forma, colore, nome: `${forma.nome} ${colore.nome}` };
}

/** Un glifo come SVG in testo (per le pagine HTML del PC). */
export function svgGlifo(nome: NomeGlifo, dim = 24, colore = 'currentColor', tratto = 1.8): string {
  return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" fill="none" stroke="${colore}" stroke-width="${tratto}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${GLIFI[nome]}"/></svg>`;
}

/** Un simbolo del collegamento come SVG in testo, con gradiente e luce. */
export function svgSimbolo(n: number, dim = 36): string {
  const { forma, colore, nome } = simbolo(n);
  const id = `g${n}-${Math.random().toString(36).slice(2, 7)}`;
  return `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" role="img" aria-label="${nome}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colore.da}"/><stop offset="1" stop-color="${colore.a}"/></linearGradient></defs><path d="${forma.d}" fill="url(#${id})"${forma.pari ? ' fill-rule="evenodd"' : ''}/></svg>`;
}
