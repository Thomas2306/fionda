import { describe, expect, it } from 'vitest';
import { casoConSeme, Sciame } from '../src/core/particelle';
import { avvicina, nuovaMolla, passoMolla } from '../src/core/molla';

describe('particelle', () => {
  it('il richiamo viene risucchiato dal bordo e lo segnala', () => {
    const s = new Sciame(casoConSeme(7));
    for (let i = 0; i < 40; i++) s.richiamo(300, 200);
    let arrivi = 0;
    for (let t = 0; t < 3; t += 1 / 60) { s.passo(1 / 60); arrivi += s.arrivi.length; }
    expect(arrivi).toBeGreaterThan(30);
    expect(s.particelle.length).toBe(0);
  });

  it('non supera il massimo (niente rallentamenti con troppe particelle)', () => {
    const s = new Sciame(casoConSeme(1), 100);
    for (let i = 0; i < 500; i++) s.richiamo(0, 100);
    expect(s.particelle.length).toBe(100);
  });

  it('le orbite seguono il file trascinato', () => {
    const s = new Sciame(casoConSeme(3));
    for (let i = 0; i < 20; i++) s.orbita({ u: 100, v: 100 });
    s.passo(1 / 60, { u: 500, v: 80 });
    for (const p of s.particelle) expect(Math.hypot(p.u - 500, p.v - 80)).toBeLessThan(60);
  });

  it('lo scoppio va verso l\'interno, mai oltre il bordo', () => {
    const s = new Sciame(casoConSeme(5));
    s.scoppio(400);
    for (let i = 0; i < 30; i++) { s.passo(1 / 60); for (const p of s.particelle) expect(p.v).toBeGreaterThanOrEqual(0); }
  });

  it('l\'ingresso parte dal bordo, entra e rallenta', () => {
    const s = new Sciame(casoConSeme(11));
    for (let i = 0; i < 30; i++) s.ingresso(300, 200);
    s.passo(0.1);
    const v1 = s.particelle.map((p) => p.vv);
    for (const p of s.particelle) expect(p.v).toBeGreaterThan(0);
    s.passo(0.1);
    s.particelle.forEach((p, i) => expect(p.vv).toBeLessThan(v1[i]));
  });

  it('stesso seme → stessa animazione (demo registrabile)', () => {
    const a = new Sciame(casoConSeme(9)), b = new Sciame(casoConSeme(9));
    a.scoppio(10, 20); b.scoppio(10, 20);
    a.passo(0.1); b.passo(0.1);
    expect(a.particelle).toEqual(b.particelle);
  });

  it('la luce entra e si spegne morbida', () => {
    const p = { tipo: 'scia' as const, u: 0, v: 0, vu: 0, vv: 0, eta: 0, durata: 1, dim: 1, colore: 0 };
    expect(Sciame.luce(p)).toBe(0);
    expect(Sciame.luce({ ...p, eta: 0.3 })).toBeGreaterThan(0.8);
    expect(Sciame.luce({ ...p, eta: 0.99 })).toBeLessThan(0.05);
  });
});

describe('molla', () => {
  it('arriva all\'obiettivo, anche con fotogrammi lenti', () => {
    const veloce = nuovaMolla(0), lento = nuovaMolla(0);
    for (let i = 0; i < 120; i++) passoMolla(veloce, 1, 1 / 60);
    for (let i = 0; i < 12; i++) passoMolla(lento, 1, 1 / 6);
    expect(veloce.valore).toBeCloseTo(1, 2);
    expect(lento.valore).toBeCloseTo(1, 2);
  });
  it('con poco smorzamento rimbalza (l\'elastico della fionda)', () => {
    const m = nuovaMolla(1);
    let sotto = false;
    for (let i = 0; i < 60; i++) { passoMolla(m, 0, 1 / 60, 300, 0.2); if (m.valore < -0.1) sotto = true; }
    expect(sotto).toBe(true);
  });
  it('avvicina: metà strada ogni mezza vita', () => {
    expect(avvicina(0, 1, 0.12, 0.12)).toBeCloseTo(0.5);
  });
});
