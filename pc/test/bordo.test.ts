import { describe, expect, it } from 'vitest';
import { aBordo, bordoVicinoAlMouse, daBordo, fascia, latoConsigliato, latoInterno, latoVersoCuiTrascini, valutaMouse, ZONA, type Lato, type Trascinamento } from '../src/core/bordo';

// Due monitor come sul PC di prova: il principale 1280x... a destra, il secondo a sinistra (x negative)
const principale = { x: 0, y: 0, width: 1280, height: 720 };
const secondo = { x: -1920, y: 0, width: 1920, height: 1080 };

describe('fascia', () => {
  it('sta attaccata al lato scelto', () => {
    expect(fascia(principale, 'destra', 480)).toEqual({ x: 800, y: 0, width: 480, height: 720 });
    expect(fascia(principale, 'sinistra', 480)).toEqual({ x: 0, y: 0, width: 480, height: 720 });
    expect(fascia(principale, 'basso', 480)).toEqual({ x: 0, y: 240, width: 1280, height: 480 });
  });
  it('non è mai più profonda dello schermo', () => {
    expect(fascia({ x: 0, y: 0, width: 300, height: 200 }, 'alto', 480).height).toBe(200);
  });
});

describe('coordinate del bordo', () => {
  it('andata e ritorno per i quattro lati', () => {
    for (const lato of ['destra', 'sinistra', 'alto', 'basso'] as Lato[]) {
      const { u, v } = aBordo(lato, 480, 720, 100, 300);
      expect(daBordo(lato, 480, 720, u, v)).toEqual({ x: 100, y: 300 });
    }
  });
  it('v = 0 sul bordo, cresce verso l\'interno', () => {
    expect(aBordo('destra', 480, 720, 480, 10).v).toBe(0);
    expect(aBordo('destra', 480, 720, 380, 10).v).toBe(100);
  });
});

describe('lati tra due monitor', () => {
  it('il lato sinistro del principale tocca il secondo monitor', () => {
    expect(latoInterno(principale, [principale, secondo], 'sinistra')).toBe(true);
    expect(latoInterno(principale, [principale, secondo], 'destra')).toBe(false);
  });
  it('consiglia un lato esterno', () => {
    expect(latoConsigliato(principale, [principale, secondo])).toBe('destra');
    expect(latoConsigliato(secondo, [principale, secondo])).toBe('sinistra');
  });
});

describe('quando la finestra si sveglia (Windows, modo tasto)', () => {
  const nuovo = (): Trascinamento => ({ premutoDa: null });

  it('mai senza tasto premuto, anche sul bordo', () => {
    const t = nuovo();
    expect(valutaMouse({ x: 1279, y: 300 }, principale, 'destra', false, t, 'tasto').toccabile).toBe(false);
  });

  it('un clic fermo vicino al bordo non la sveglia (il clic arriva all\'app sotto)', () => {
    const t = nuovo();
    expect(valutaMouse({ x: 1270, y: 300 }, principale, 'destra', true, t, 'tasto').toccabile).toBe(false);
    expect(valutaMouse({ x: 1272, y: 302 }, principale, 'destra', true, t, 'tasto').toccabile).toBe(false);
  });

  it('trascinamento verso il lato scelto → toccabile, con forza crescente', () => {
    const t = nuovo();
    valutaMouse({ x: 900, y: 300 }, principale, 'destra', true, t, 'tasto');
    const meta = valutaMouse({ x: 1280 - 1 - ZONA / 2, y: 300 }, principale, 'destra', true, t, 'tasto');
    const bordo = valutaMouse({ x: 1279, y: 300 }, principale, 'destra', true, t, 'tasto');
    expect(meta.toccabile).toBe(true);
    expect(bordo.forza).toBeGreaterThan(meta.forza);
    expect(bordo.forza).toBeCloseTo(1);
  });

  it('passando sul lato opposto (verso l\'altro monitor) NON si sveglia (bug della prova di fase 0)', () => {
    const t = nuovo();
    valutaMouse({ x: -400, y: 400 }, principale, 'destra', true, t, 'tasto');
    const r = valutaMouse({ x: 1, y: 422 }, principale, 'destra', true, t, 'tasto');
    expect(r.toccabile).toBe(false);
  });

  it('rilasciando il tasto torna trasparente e dimentica il punto di partenza', () => {
    const t = nuovo();
    valutaMouse({ x: 900, y: 300 }, principale, 'destra', true, t, 'tasto');
    valutaMouse({ x: 1279, y: 300 }, principale, 'destra', true, t, 'tasto');
    expect(valutaMouse({ x: 1279, y: 300 }, principale, 'destra', false, t, 'tasto').toccabile).toBe(false);
    expect(t.premutoDa).toBeNull();
  });
});

describe('bordo automatico vicino al mouse', () => {
  const schermi = [principale, secondo];
  it('mouse sul principale vicino a destra → destra del principale', () => {
    expect(bordoVicinoAlMouse({ x: 1100, y: 300 }, schermi)).toEqual({ schermo: 0, lato: 'destra' });
  });
  it('mouse sul principale vicino al lato che tocca il secondo monitor → mai quel lato', () => {
    const r = bordoVicinoAlMouse({ x: 5, y: 360 }, schermi);
    expect(r.schermo).toBe(0);
    expect(r.lato).not.toBe('sinistra');
  });
  it('mouse sul secondo monitor → lo schermo del mouse, lato esterno più vicino', () => {
    expect(bordoVicinoAlMouse({ x: -1900, y: 500 }, schermi)).toEqual({ schermo: 1, lato: 'sinistra' });
    expect(bordoVicinoAlMouse({ x: -900, y: 1070 }, schermi)).toEqual({ schermo: 1, lato: 'basso' });
  });
  it('un solo schermo: tutti i lati valgono', () => {
    expect(bordoVicinoAlMouse({ x: 3, y: 360 }, [principale])).toEqual({ schermo: 0, lato: 'sinistra' });
  });
  it('trascinando: il lato esterno verso cui vai, null se sei in mezzo', () => {
    expect(latoVersoCuiTrascini({ x: 1250, y: 300 }, schermi)).toEqual({ schermo: 0, lato: 'destra' });
    expect(latoVersoCuiTrascini({ x: -1910, y: 500 }, schermi)).toEqual({ schermo: 1, lato: 'sinistra' });
    expect(latoVersoCuiTrascini({ x: 10, y: 360 }, schermi)?.lato ?? null).not.toBe('sinistra');
    expect(latoVersoCuiTrascini({ x: 640, y: 360 }, [{ x: 0, y: 0, width: 1280, height: 1440 }])).toBeNull();
  });
});

describe('modo striscia (Mac/Linux)', () => {
  it('toccabile solo negli ultimissimi pixel', () => {
    const t: Trascinamento = { premutoDa: null };
    expect(valutaMouse({ x: 1278, y: 10 }, principale, 'destra', null, t, 'striscia').toccabile).toBe(true);
    expect(valutaMouse({ x: 1260, y: 10 }, principale, 'destra', null, t, 'striscia').toccabile).toBe(false);
  });
});
