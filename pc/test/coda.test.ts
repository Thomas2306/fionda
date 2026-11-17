import { describe, expect, it } from 'vitest';
import { CodaUscita, SCADENZA_MS, telefonoDestinatario } from '../src/core/coda';

const voce = (id: string, telefonoId = 'a', creato = 0) => ({ id, telefonoId, percorso: `C:\\x\\${id}`, nome: `${id}.jpg`, dimensione: 10, creato });

describe('coda dei file in uscita', () => {
  it('ognuno vede solo i suoi file', () => {
    const c = new CodaUscita();
    c.aggiungi(voce('1', 'a', 100)); c.aggiungi(voce('2', 'b', 100));
    expect(c.perTelefono('a', 200).map((v) => v.id)).toEqual(['1']);
    expect(c.trova('b', '1')).toBeUndefined(); // il telefono b non può scaricare il file di a
    expect(c.togli('b', '1')).toBeUndefined();
    expect(c.togli('a', '1')?.id).toBe('1');
    expect(c.quanti).toBe(1);
  });
  it('dopo una settimana si dimentica', () => {
    const c = new CodaUscita([voce('1', 'a', 0)]);
    expect(c.perTelefono('a', SCADENZA_MS - 1)).toHaveLength(1);
    expect(c.perTelefono('a', SCADENZA_MS + 1)).toHaveLength(0);
  });
  it('telefono rimosso → i suoi file non partono', () => {
    const c = new CodaUscita([voce('1', 'a'), voce('2', 'b')]);
    c.dimenticaTelefono('a');
    expect(c.voci.map((v) => v.id)).toEqual(['2']);
  });
});

describe('a chi mandare il file', () => {
  const telefoni = [{ id: 'a', nome: 'iPhone A', ultimoContatto: 5000 }, { id: 'b', nome: 'iPhone B', ultimoContatto: 9000 }];
  it('prima quello con l\'app aperta adesso', () => {
    expect(telefonoDestinatario(telefoni, new Map([['a', 99_000]]), 100_000)?.id).toBe('a');
  });
  it('altrimenti quello sentito più di recente', () => {
    expect(telefonoDestinatario(telefoni, new Map([['a', 1000]]), 100_000)?.id).toBe('b');
  });
  it('nessun telefono abbinato → nessuno', () => {
    expect(telefonoDestinatario([], new Map())).toBeUndefined();
  });
});
