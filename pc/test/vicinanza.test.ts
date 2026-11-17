import { describe, expect, it } from 'vitest';
import { creaVicinanza, forzaDaSegnale, livelloDaSegnale } from '../src/core/vicinanza';

describe('vicinanza', () => {
  it('parte PERSO e diventa VICINO con un segnale forte', () => {
    const v = creaVicinanza();
    expect(v.stato).toBe('PERSO');
    expect(v.pacchetto(-42, 0)).toBe('VICINO');
  });

  it('un segnale debole al primo pacchetto è LONTANO', () => {
    expect(creaVicinanza().pacchetto(-66, 0)).toBe('LONTANO');
  });

  it('isteresi: tra le due soglie resta com\'era (niente lampeggi a ~30 cm)', () => {
    const v = creaVicinanza();
    v.pacchetto(-45, 0);
    for (let i = 1; i < 30; i++) v.pacchetto(i % 2 ? -54 : -58, i * 100); // valori veri misurati a 30 cm
    expect(v.stato).toBe('VICINO');
    const l = creaVicinanza();
    l.pacchetto(-66, 0);
    for (let i = 1; i < 30; i++) l.pacchetto(i % 2 ? -54 : -58, i * 100);
    expect(l.stato).toBe('LONTANO');
  });

  it('un pacchetto strano isolato non cambia stato', () => {
    const v = creaVicinanza();
    for (let i = 0; i < 10; i++) v.pacchetto(-42, i * 100);
    v.pacchetto(-79, 1000);
    expect(v.stato).toBe('VICINO');
  });

  it('allontanandosi davvero diventa LONTANO', () => {
    const v = creaVicinanza();
    v.pacchetto(-42, 0);
    for (let i = 1; i < 20; i++) v.pacchetto(-66, i * 100);
    expect(v.stato).toBe('LONTANO');
  });

  it('PERSO dopo 4 secondi di silenzio, e scarta i valori non validi', () => {
    const v = creaVicinanza();
    v.pacchetto(-45, 0);
    expect(v.pacchetto(127, 100)).toBe('VICINO');
    expect(v.pacchetto(NaN, 100)).toBe('VICINO');
    expect(v.tick(3000)).toBe('VICINO');
    expect(v.tick(4200)).toBe('PERSO');
    expect(v.media).toBeNull();
  });

  it('livello: continuo anche da lontano, 0 se perso', () => {
    expect(livelloDaSegnale(null, 'PERSO')).toBe(0);
    expect(livelloDaSegnale(-70, 'PERSO')).toBe(0);
    const lontano = livelloDaSegnale(-70, 'LONTANO'), medio = livelloDaSegnale(-58, 'LONTANO'), attaccato = livelloDaSegnale(-38, 'VICINO');
    expect(lontano).toBeGreaterThan(0);
    expect(medio).toBeGreaterThan(lontano);
    expect(attaccato).toBe(1);
  });

  it('forza: 0 se non è VICINO, cresce avvicinandosi, mai sopra 1', () => {
    expect(forzaDaSegnale(-45, 'LONTANO')).toBe(0);
    expect(forzaDaSegnale(null, 'VICINO')).toBe(0);
    const lontanino = forzaDaSegnale(-55, 'VICINO');
    const attaccato = forzaDaSegnale(-38, 'VICINO');
    expect(lontanino).toBeGreaterThan(0);
    expect(attaccato).toBeGreaterThan(lontanino);
    expect(attaccato).toBe(1);
  });
});
