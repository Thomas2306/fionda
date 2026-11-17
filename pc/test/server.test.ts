// Prova vera del protocollo: server HTTPS acceso, un "telefono finto" si abbina e manda file.
import { createHash, X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CodiceAttivo, TelefonoAbbinato } from '../src/core/abbinamento';
import { CodaUscita } from '../src/core/coda';
import { ServerFionda } from '../src/main/server';

let server: ServerFionda;
let cartella: string;
let impronta: string;
let codice: CodiceAttivo | undefined;
let visibile = true;
const coda = new CodaUscita();
const telefoni: TelefonoAbbinato[] = [];
const eventi: string[] = [];

function chiama(metodo: string, percorso: string, corpo?: Buffer | string, intestazioni: Record<string, string> = {}) {
  return new Promise<{ codice: number; json: any; impronta: string }>((fatto, errore) => {
    const req = https.request({ host: '127.0.0.1', port: server.porta, path: percorso, method: metodo, rejectUnauthorized: false,
      headers: { ...intestazioni, ...(corpo !== undefined ? { 'content-length': Buffer.byteLength(corpo) } : {}) } }, (res) => {
      // come fa l'iPhone: si fida SOLO del certificato con l'impronta letta nel QR
      const cert = (res.socket as any).getPeerCertificate();
      const imp = createHash('sha256').update(cert.raw).digest('hex');
      let t = '';
      res.on('data', (d) => (t += d));
      res.on('end', () => fatto({ codice: res.statusCode ?? 0, json: t ? JSON.parse(t) : null, impronta: imp }));
    });
    req.on('error', errore);
    if (corpo !== undefined) req.write(corpo);
    req.end();
  });
}

beforeAll(async () => {
  cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'fionda-test-'));
  const r = await Promise.resolve(selfsigned.generate([{ name: 'commonName', value: 'Fionda' }], { keySize: 2048, algorithm: 'sha256' }));
  impronta = createHash('sha256').update(new X509Certificate(r.cert).raw).digest('hex');
  server = new ServerFionda({ chiave: r.private, cert: r.cert, impronta }, {
    nomePC: () => 'PC-PROVA', cartella: () => cartella, telefoni: () => telefoni,
    aggiungiTelefono: (t) => telefoni.push(t), contatto: () => {},
    codice: () => codice, bruciaCodice: () => { codice = undefined; }, vicino: () => ({ stato: 'VICINO', forza: 0.8, livello: 0.9 }),
    coda: () => coda, aperto: () => {},
    visibile: () => visibile, statoDi: (n) => ({ stato: n === 'FP-1a2b' ? 'VICINO' : 'LONTANO', livello: 0.5 }),
  });
  for (const e of ['abbinato', 'inizio', 'fine', 'errore', 'testo', 'uscita']) server.on(e, () => eventi.push(e));
  await server.avvia();
}, 30_000);

afterAll(() => { server.ferma(); fs.rmSync(cartella, { recursive: true, force: true }); });

describe('server di Fionda', () => {
  let gettone = '';

  it('il certificato è quello del QR', async () => {
    const r = await chiama('GET', '/v1/ciao');
    expect(r.impronta).toBe(impronta);
  });

  it('senza abbinamento non si entra', async () => {
    expect((await chiama('GET', '/v1/ciao')).codice).toBe(401);
    expect((await chiama('POST', '/v1/file', 'ciao', { 'x-fionda-nome': 'a.txt' })).codice).toBe(401);
  });

  it('codice sbagliato → no; codice giusto → gettone; il codice non si riusa', async () => {
    codice = { codice: 'giusto', scade: Date.now() + 60_000 };
    expect((await chiama('POST', '/v1/abbina', JSON.stringify({ codice: 'sbagliato', nome: 'iPhone' }))).codice).toBe(403);
    const r = await chiama('POST', '/v1/abbina', JSON.stringify({ codice: 'giusto', nome: 'iPhone di prova', id: 'telefono-0001' }));
    expect(r.codice).toBe(200);
    expect(r.json.pc).toBe('PC-PROVA');
    gettone = r.json.gettone;
    expect(telefoni[0].nome).toBe('iPhone di prova');
    expect(telefoni[0].impronta).not.toContain(gettone); // sul PC solo l'impronta
    expect((await chiama('POST', '/v1/abbina', JSON.stringify({ codice: 'giusto', nome: 'altro' }))).codice).toBe(403);
  });

  it('con il gettone: ciao e vicino', async () => {
    const h = { authorization: `Bearer ${gettone}` };
    expect((await chiama('GET', '/v1/ciao', undefined, h)).json.pc).toBe('PC-PROVA');
    expect((await chiama('GET', '/v1/vicino', undefined, h)).json.stato).toBe('VICINO');
  });

  it('riceve un file intero, con nome ripulito e senza sovrascrivere', async () => {
    const h = { authorization: `Bearer ${gettone}`, 'x-fionda-nome': encodeURIComponent('..\\..\\vacanze è bella.jpg') };
    const dati = Buffer.alloc(3 * 1024 * 1024, 7);
    const a = await chiama('POST', '/v1/file', dati, h);
    const b = await chiama('POST', '/v1/file', dati, h);
    expect(a.json.nome).toBe('vacanze è bella.jpg');
    expect(b.json.nome).toBe('vacanze è bella (1).jpg');
    expect(fs.readFileSync(path.join(cartella, a.json.nome)).equals(dati)).toBe(true);
    expect(fs.readdirSync(cartella).filter((f) => f.endsWith('.parziale'))).toEqual([]);
    expect(eventi).toContain('fine');
  });

  it('avvicinando: solo se il Bluetooth sente QUEL telefono vicino, poi serve il Collega sul PC', async () => {
    const lontano = await chiama('POST', '/v1/avvicina', JSON.stringify({ sessione: 'ffff', nonce: 'nonce-di-prova-1', nome: 'iPhone B' }));
    expect(lontano.codice).toBe(409);
    const r = await chiama('POST', '/v1/avvicina', JSON.stringify({ sessione: '1a2b', nonce: 'nonce-di-prova-1', nome: 'iPhone B', id: 'telefono-0002' }));
    expect(r.codice).toBe(200);
    expect(r.json.simboli).toHaveLength(4);
    expect((await chiama('GET', '/v1/avvicina?sessione=1a2b&nonce=sbagliato')).codice).toBe(404);
    expect((await chiama('GET', '/v1/avvicina?sessione=1a2b&nonce=nonce-di-prova-1')).json.stato).toBe('attesa');
    const t = server.accetta('1a2b');
    expect(t?.nome).toBe('iPhone B');
    const ok = await chiama('GET', '/v1/avvicina?sessione=1a2b&nonce=nonce-di-prova-1');
    expect(ok.json.stato).toBe('ok');
    expect((await chiama('GET', '/v1/ciao', undefined, { authorization: `Bearer ${ok.json.gettone}` })).codice).toBe(200);
    // il gettone si ritira una volta sola
    expect((await chiama('GET', '/v1/avvicina?sessione=1a2b&nonce=nonce-di-prova-1')).codice).toBe(404);
  });

  it('PC invisibile → niente collegamento avvicinando', async () => {
    visibile = false;
    expect((await chiama('POST', '/v1/avvicina', JSON.stringify({ sessione: '1a2b', nonce: 'nonce-di-prova-2' }))).codice).toBe(403);
    visibile = true;
  });

  it('PC → telefono: la richiesta lunga si sveglia, il file arriva intero, solo al telefono giusto', async () => {
    const h = { authorization: `Bearer ${gettone}` };
    const idTel = telefoni.find((x) => x.nome === 'iPhone di prova')!.id;
    // il telefono aspetta (fino a 5 s); dopo 300 ms lasciamo un file sul bordo
    const sorgente = path.join(cartella, 'da-mandare.bin');
    const dati = Buffer.alloc(2 * 1024 * 1024, 9);
    fs.writeFileSync(sorgente, dati);
    const inizio = Date.now();
    setTimeout(() => { coda.aggiungi({ id: 'f1', telefonoId: idTel, percorso: sorgente, nome: 'da-mandare.bin', dimensione: dati.length, creato: Date.now() }); server.avvisaCoda(idTel); }, 300);
    const elenco = await chiama('GET', '/v1/coda?attesa=5', undefined, h);
    expect(Date.now() - inizio).toBeLessThan(2500);
    expect(elenco.json.file.map((x: any) => x.id)).toEqual(['f1']);
    // un altro telefono non lo vede e non lo scarica
    const altro = (await chiama('POST', '/v1/abbina', JSON.stringify({ codice: (codice = { codice: 'due', scade: Date.now() + 60_000 }).codice, nome: 'Altro' }))).json.gettone;
    expect((await chiama('GET', '/v1/coda', undefined, { authorization: `Bearer ${altro}` })).json.file).toEqual([]);
    expect((await chiama('GET', '/v1/coda/file?id=f1', undefined, { authorization: `Bearer ${altro}` })).codice).toBe(404);
    // scaricamento intero
    const scaricato = await new Promise<Buffer>((ok, ko) => {
      https.get({ host: '127.0.0.1', port: server.porta, path: '/v1/coda/file?id=f1', rejectUnauthorized: false, headers: h }, (res) => {
        expect(decodeURIComponent(String(res.headers['x-fionda-nome']))).toBe('da-mandare.bin');
        const pezzi: Buffer[] = []; res.on('data', (p) => pezzi.push(p)); res.on('end', () => ok(Buffer.concat(pezzi)));
      }).on('error', ko);
    });
    expect(scaricato.equals(dati)).toBe(true);
    expect(coda.quanti).toBe(1); // resta finché il telefono non dice "ricevuto"
    expect((await chiama('POST', '/v1/coda/ricevuto?id=f1', '', h)).codice).toBe(200);
    expect(coda.quanti).toBe(0);
    expect(eventi).toContain('uscita');
  });

  it('testo → evento testo', async () => {
    const r = await chiama('POST', '/v1/testo', 'https://example.com', { authorization: `Bearer ${gettone}` });
    expect(r.codice).toBe(200);
    expect(eventi).toContain('testo');
  });
});
