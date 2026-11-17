/**
 * Le particelle dell'effetto, in coordinate del bordo (u = lungo il lato, v = verso l'interno, 0 = sul bordo).
 * Solo fisica e regole di vita: il disegno lo fa l'interfaccia. Puro e con caso iniettabile → si prova con Vitest.
 *
 * Tipi:
 * - richiamo: nasce dentro lo schermo e viene "risucchiata" dal bordo (il telefono che chiama). Sparisce quando lo tocca.
 * - orbita: gira attorno al file che stai trascinando (il punto `centro`).
 * - scia: rimane dietro alla sfera lanciata, rallenta e si spegne.
 * - scintilla: esplosione quando la sfera passa il bordo.
 */
export type TipoParticella = 'richiamo' | 'orbita' | 'scia' | 'scintilla' | 'ingresso';

export interface Particella {
  tipo: TipoParticella;
  u: number; v: number;
  vu: number; vv: number;
  /** età in secondi e durata massima */
  eta: number; durata: number;
  /** raggio in px */
  dim: number;
  /** indice del colore nella tavolozza */
  colore: number;
  /** solo orbita: angolo, raggio, velocità angolare */
  ang?: number; raggio?: number; giri?: number;
  /** la particella ha toccato il bordo (per il lampo) */
  arrivata?: boolean;
}

export interface Centro { u: number; v: number }

export const COLORI_TAVOLOZZA = 4;

export class Sciame {
  particelle: Particella[] = [];
  /** quante particelle hanno toccato il bordo nell'ultimo passo (l'interfaccia ci fa un piccolo lampo) */
  arrivi: { u: number; colore: number }[] = [];
  constructor(private caso: () => number = Math.random, readonly massimo = 700) {}

  private aggiungi(p: Particella) {
    if (this.particelle.length >= this.massimo) this.particelle.shift();
    this.particelle.push(p);
  }

  /** Una particella di richiamo vicino al punto `u` del bordo, sparsa su `larghezza`. */
  richiamo(u: number, larghezza: number, profondita: [number, number] = [70, 260]) {
    const c = this.caso;
    this.aggiungi({
      tipo: 'richiamo', u: u + (c() - 0.5) * larghezza, v: profondita[0] + c() * (profondita[1] - profondita[0]),
      vu: (c() - 0.5) * 30, vv: -(10 + c() * 30), eta: 0, durata: 2.6 + c(), dim: 1.2 + c() * 2.2,
      colore: Math.floor(c() * COLORI_TAVOLOZZA),
    });
  }

  orbita(centro: Centro) {
    const c = this.caso;
    this.aggiungi({
      tipo: 'orbita', u: centro.u, v: centro.v, vu: 0, vv: 0, eta: 0, durata: 0.9 + c() * 0.9, dim: 1 + c() * 1.8,
      colore: Math.floor(c() * COLORI_TAVOLOZZA), ang: c() * Math.PI * 2, raggio: 18 + c() * 34, giri: (c() < 0.5 ? -1 : 1) * (3 + c() * 4),
    });
  }

  scia(u: number, v: number, vu: number, vv: number) {
    const c = this.caso;
    this.aggiungi({
      tipo: 'scia', u: u + (c() - 0.5) * 6, v: v + (c() - 0.5) * 6, vu: vu * 0.15 + (c() - 0.5) * 40, vv: vv * 0.15 + (c() - 0.5) * 40,
      eta: 0, durata: 0.35 + c() * 0.4, dim: 1.5 + c() * 2.5, colore: Math.floor(c() * COLORI_TAVOLOZZA),
    });
  }

  /** Un file sta arrivando: particelle che escono dal bordo verso l'interno e rallentano (i dati che entrano). */
  ingresso(u: number, larghezza: number) {
    const c = this.caso;
    this.aggiungi({
      tipo: 'ingresso', u: u + (c() - 0.5) * larghezza, v: 0, vu: (c() - 0.5) * 60, vv: 160 + c() * 360,
      eta: 0, durata: 0.8 + c() * 0.7, dim: 1 + c() * 2, colore: Math.floor(c() * COLORI_TAVOLOZZA),
    });
  }

  /** Esplosione sul bordo nel punto `u`: le scintille si aprono a ventaglio verso l'interno e lungo il lato. */
  scoppio(u: number, quante = 90) {
    const c = this.caso;
    for (let i = 0; i < quante; i++) {
      const a = (c() - 0.5) * Math.PI * 0.95; // verso l'interno, aperto a ventaglio
      const vel = 120 + c() * 520;
      this.aggiungi({
        tipo: 'scintilla', u, v: 2, vu: Math.sin(a) * vel * 1.4, vv: Math.cos(a) * vel * 0.55,
        eta: 0, durata: 0.5 + c() * 0.8, dim: 1 + c() * 2.6, colore: Math.floor(c() * COLORI_TAVOLOZZA),
      });
    }
  }

  /** Avanza di dt secondi. `centro` = dove sta il file trascinato (per le orbite). */
  passo(dt: number, centro?: Centro) {
    this.arrivi.length = 0;
    const tenute: Particella[] = [];
    for (const p of this.particelle) {
      p.eta += dt;
      if (p.tipo === 'richiamo') {
        // il bordo tira sempre più forte, con un filo di deriva laterale verso il centro del risucchio
        p.vv -= (60 + 900 * Math.min(1, p.eta / 1.6)) * dt;
        p.vu *= Math.pow(0.4, dt);
        p.u += p.vu * dt; p.v += p.vv * dt;
        if (p.v <= 0) { this.arrivi.push({ u: p.u, colore: p.colore }); continue; }
      } else if (p.tipo === 'orbita') {
        p.ang! += p.giri! * dt;
        const r = p.raggio! * (1 - 0.35 * (p.eta / p.durata));
        const cu = centro?.u ?? p.u, cv = centro?.v ?? p.v;
        p.u = cu + Math.cos(p.ang!) * r;
        p.v = Math.max(1, cv + Math.sin(p.ang!) * r);
      } else {
        const attrito = p.tipo === 'scia' ? 0.05 : p.tipo === 'ingresso' ? 0.08 : 0.12;
        p.vu *= Math.pow(attrito, dt); p.vv *= Math.pow(attrito, dt);
        p.u += p.vu * dt; p.v += p.vv * dt;
        if (p.v < 0) { p.v = -p.v; p.vv = Math.abs(p.vv) * 0.4; }
      }
      if (p.eta < p.durata) tenute.push(p);
    }
    this.particelle = tenute;
  }

  /** Luminosità 0-1: entra morbida e si spegne morbida. */
  static luce(p: Particella) {
    const t = p.eta / p.durata;
    const entrata = Math.min(1, p.eta / 0.18);
    return entrata * (1 - t * t);
  }
}

/** Caso ripetibile (per i test e per la demo registrabile). */
export function casoConSeme(seme = 1) {
  let s = seme >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}
