import { describe, expect, it } from 'vitest';
import { Cronologia, MASSIMO_VOCI, nomeGiorno } from '../src/core/cronologia';

const voce = (id: string, quando: number) => ({ id, verso: 'arrivato' as const, nome: `${id}.jpg`, percorso: '', telefono: 'iPhone', dimensione: 1, genere: 'immagine' as const, quando });
const ora = new Date(2026, 10, 17, 15, 0).getTime();

describe('cronologia', () => {
  it('le più recenti in cima, mai più di MASSIMO_VOCI', () => {
    const c = new Cronologia();
    for (let i = 0; i < MASSIMO_VOCI + 5; i++) c.aggiungi(voce(String(i), i));
    expect(c.voci).toHaveLength(MASSIMO_VOCI);
    expect(c.voci[0].id).toBe(String(MASSIMO_VOCI + 4));
  });
  it('raggruppa per giorno', () => {
    const c = new Cronologia();
    c.aggiungi(voce('vecchio', new Date(2026, 10, 12, 10).getTime()));
    c.aggiungi(voce('ieri', new Date(2026, 10, 16, 23).getTime()));
    c.aggiungi(voce('oggi1', new Date(2026, 10, 17, 9).getTime()));
    c.aggiungi(voce('oggi2', new Date(2026, 10, 17, 14).getTime()));
    const g = c.perGiorno(ora);
    expect(g.map((x) => x.giorno)).toEqual(['Oggi', 'Ieri', '12 novembre']);
    expect(g[0].voci.map((v) => v.id)).toEqual(['oggi2', 'oggi1']);
  });
  it('nome del giorno con l\'anno solo se diverso', () => {
    expect(nomeGiorno(new Date(2025, 0, 3).getTime(), ora)).toBe('3 gennaio 2025');
  });
  it('togli e svuota', () => {
    const c = new Cronologia([voce('a', 1), voce('b', 2)]);
    c.togli('a');
    expect(c.voci.map((v) => v.id)).toEqual(['b']);
    c.svuota();
    expect(c.voci).toEqual([]);
  });
});
