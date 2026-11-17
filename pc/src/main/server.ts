import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  codiceValido, impronta, nomeSessione, nuovoGettone, sessioneValida, simboliCollegamento, telefonoDaGettone, VERSIONE_PROTOCOLLO,
  type CodiceAttivo, type TelefonoAbbinato,
} from '../core/abbinamento';
import type { CodaUscita, FileInUscita } from '../core/coda';
import { nomeLibero, nomeSicuro } from '../core/nomi';
import type { Certificato } from './sicurezza';

export const PORTA_PREFERITA = 47313;
const MASSIMO_FILE = 16 * 1024 ** 3;   // 16 GB
const MASSIMO_TESTO = 1024 * 1024;     // 1 MB
const MASSIMO_JSON = 16 * 1024;

export interface Dipendenze {
  nomePC: () => string;
  cartella: () => string;
  telefoni: () => TelefonoAbbinato[];
  aggiungiTelefono: (t: TelefonoAbbinato) => void;
  contatto: (id: string) => void;
  codice: () => CodiceAttivo | undefined;
  /** il codice è stato usato (o provato troppe volte): va cambiato */
  bruciaCodice: () => void;
  vicino: () => { stato: string; forza: number; livello: number };
  /** il PC accetta richieste di collegamento avvicinando? */
  visibile: () => boolean;
  /** come il Bluetooth sente il dispositivo con questo nome */
  statoDi: (nome: string) => { stato: string; livello: number };
  /** file in attesa di partire verso i telefoni */
  coda: () => CodaUscita;
  /** il telefono ha l'app aperta (ha appena chiesto la coda) */
  aperto: (telefonoId: string) => void;
}

/** Una richiesta di collegamento avvicinando, in attesa che tu prema "Collega" sul PC. */
export interface Richiesta {
  sessione: string; nonce: string; nome: string; id: string; simboli: number[];
  stato: 'attesa' | 'ok' | 'rifiutato'; gettone?: string; creata: number;
}
const DURATA_RICHIESTA_MS = 90_000;

export interface Arrivo { id: string; nome: string; totale: number; ricevuti: number; telefono: TelefonoAbbinato; indice: number; quanti: number }

/**
 * Il server di Fionda sulla rete di casa (HTTPS, certificato del PC).
 * Eventi: 'abbinato' (telefono), 'inizio' / 'avanzamento' / 'fine' / 'errore' (Arrivo, + percorso a fine), 'testo'.
 *
 *   POST /v1/abbina  {codice, nome, id}      → {gettone, pc}      (unica chiamata senza gettone)
 *   GET  /v1/ciao                            → {pc, versione}     (il telefono controlla che l'abbinamento valga ancora)
 *   GET  /v1/vicino                          → {stato, forza}     (il PC "sente" il telefono via Bluetooth?)
 *   POST /v1/file    corpo = il file         → {nome}             intestazioni x-fionda-nome / -indice / -quanti
 *   POST /v1/testo   corpo = testo UTF-8     → {ok}               (finisce negli appunti del PC)
 */
export class ServerFionda extends EventEmitter {
  porta = 0;
  private server?: https.Server;
  private richieste = new Map<string, Richiesta>();
  /** telefoni in attesa di file (richiesta "lunga" aperta): si svegliano appena ne arriva uno */
  private attese = new Map<string, Set<() => void>>();
  private tentativiSbagliati = 0;

  constructor(private cert: Certificato, private d: Dipendenze) { super(); }

  async avvia(): Promise<number> {
    this.server = https.createServer({ key: this.cert.chiave, cert: this.cert.cert, minVersion: 'TLSv1.2' }, (req, res) => {
      this.gestisci(req, res).catch((e) => {
        console.warn('[server]', (e as Error).message);
        if (!res.headersSent) rispondi(res, 500, { errore: 'interno' });
      });
    });
    this.server.requestTimeout = 0; // i video grandi possono metterci minuti
    this.server.headersTimeout = 20_000;
    for (let p = PORTA_PREFERITA; p < PORTA_PREFERITA + 10; p++) {
      const ok = await new Promise<boolean>((fatto) => {
        const errore = () => fatto(false);
        this.server!.once('error', errore);
        this.server!.listen(p, '0.0.0.0', () => { this.server!.off('error', errore); fatto(true); });
      });
      if (ok) { this.porta = p; return p; }
    }
    throw new Error('nessuna porta libera');
  }

  ferma() { this.server?.close(); }

  private async gestisci(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'https://fionda');
    if (req.method === 'POST' && url.pathname === '/v1/abbina') return this.abbina(req, res);
    if (req.method === 'POST' && url.pathname === '/v1/avvicina') return this.avvicina(req, res);
    if (req.method === 'GET' && url.pathname === '/v1/avvicina') return this.esitoAvvicina(url, res);

    const gettone = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const tel = telefonoDaGettone(this.d.telefoni(), gettone);
    if (!tel) { req.resume(); return rispondi(res, 401, { errore: 'non abbinato' }); }
    this.d.contatto(tel.id);

    if (req.method === 'GET' && url.pathname === '/v1/ciao') return rispondi(res, 200, { pc: this.d.nomePC(), versione: VERSIONE_PROTOCOLLO });
    if (req.method === 'GET' && url.pathname === '/v1/vicino') return rispondi(res, 200, this.d.vicino());
    if (req.method === 'POST' && url.pathname === '/v1/testo') return this.testo(req, res, tel);
    if (req.method === 'POST' && url.pathname === '/v1/file') return this.file(req, res, tel);
    if (req.method === 'GET' && url.pathname === '/v1/coda') return this.elencoCoda(url, req, res, tel);
    if (req.method === 'GET' && url.pathname === '/v1/coda/file') return this.scaricaCoda(url, req, res, tel);
    if (req.method === 'POST' && url.pathname === '/v1/coda/ricevuto') { req.resume(); return this.ricevuto(url, res, tel); }
    req.resume();
    rispondi(res, 404, { errore: 'sconosciuto' });
  }

  private async abbina(req: IncomingMessage, res: ServerResponse) {
    const corpo = await leggiJson(req);
    if (!codiceValido(this.d.codice(), corpo?.codice, Date.now())) {
      // troppi tentativi sbagliati → il codice del QR cambia (nessuno può provarli tutti)
      if (++this.tentativiSbagliati >= 5) { this.tentativiSbagliati = 0; this.d.bruciaCodice(); }
      return rispondi(res, 403, { errore: 'codice non valido o scaduto: inquadra di nuovo il QR' });
    }
    this.tentativiSbagliati = 0;
    this.d.bruciaCodice();
    const gettone = nuovoGettone();
    const nome = typeof corpo.nome === 'string' && corpo.nome.trim() ? corpo.nome.trim().slice(0, 60) : 'iPhone';
    const id = typeof corpo.id === 'string' && /^[\w-]{8,64}$/.test(corpo.id) ? corpo.id : randomUUID();
    const t: TelefonoAbbinato = { id, nome, impronta: impronta(gettone), aggiunto: Date.now() };
    this.d.aggiungiTelefono(t);
    this.emit('abbinato', t);
    rispondi(res, 200, { gettone, pc: this.d.nomePC(), versione: VERSIONE_PROTOCOLLO });
  }

  /**
   * Il telefono chiede di collegarsi avvicinandosi. Vale solo se il Bluetooth del PC sente
   * PROPRIO quel telefono (nome "FP-" + sessione) VICINO: da un'altra stanza non si entra.
   * Poi serve comunque il "Collega" sul PC, dopo aver confrontato i simboli.
   */
  private async avvicina(req: IncomingMessage, res: ServerResponse) {
    const c = await leggiJson(req);
    if (!this.d.visibile()) return rispondi(res, 403, { stato: 'invisibile', errore: 'Il PC non è visibile: attivalo dal menu di Fionda.' });
    if (!c || !sessioneValida(c.sessione) || typeof c.nonce !== 'string' || !/^[\w-]{8,64}$/.test(c.nonce)) return rispondi(res, 400, { errore: 'richiesta strana' });
    this.pulisciRichieste();
    const esistente = this.richieste.get(c.sessione);
    if (esistente) {
      if (!stessoNonce(esistente, c.nonce)) return rispondi(res, 409, { stato: 'occupato' });
      return rispondi(res, 200, { stato: esistente.stato, pc: this.d.nomePC(), simboli: esistente.simboli });
    }
    const ble = this.d.statoDi(nomeSessione(c.sessione));
    if (ble.stato !== 'VICINO') return rispondi(res, 409, { stato: 'lontano', livello: ble.livello });
    if ([...this.richieste.values()].some((r) => r.stato === 'attesa')) return rispondi(res, 429, { stato: 'occupato' });
    const r: Richiesta = {
      sessione: c.sessione, nonce: c.nonce, simboli: simboliCollegamento(this.cert.impronta, c.nonce, c.sessione),
      nome: typeof c.nome === 'string' && c.nome.trim() ? c.nome.trim().slice(0, 60) : 'iPhone',
      id: typeof c.id === 'string' && /^[\w-]{8,64}$/.test(c.id) ? c.id : randomUUID(),
      stato: 'attesa', creata: Date.now(),
    };
    this.richieste.set(r.sessione, r);
    this.emit('richiesta', r);
    rispondi(res, 200, { stato: 'attesa', pc: this.d.nomePC(), simboli: r.simboli });
  }

  private esitoAvvicina(url: URL, res: ServerResponse) {
    this.pulisciRichieste();
    const r = this.richieste.get(url.searchParams.get('sessione') ?? '');
    if (!r || !stessoNonce(r, url.searchParams.get('nonce') ?? '')) return rispondi(res, 404, { stato: 'scaduto' });
    if (r.stato === 'ok') { this.richieste.delete(r.sessione); return rispondi(res, 200, { stato: 'ok', gettone: r.gettone, pc: this.d.nomePC() }); }
    if (r.stato === 'rifiutato') this.richieste.delete(r.sessione);
    const ble = this.d.statoDi(nomeSessione(r.sessione));
    rispondi(res, 200, { stato: r.stato, livello: ble.livello });
  }

  // ---------- PC → telefono ----------

  /** C'è un file nuovo per questo telefono: sveglia la sua richiesta lunga, se è aperta. */
  avvisaCoda(telefonoId: string) {
    const s = this.attese.get(telefonoId);
    if (!s) return;
    this.attese.delete(telefonoId);
    for (const f of s) f();
  }

  /**
   * Il telefono (app aperta) chiede: c'è qualcosa per me? Se non c'è niente aspettiamo fino a
   * `attesa` secondi (max 25): appena lasci un file sul bordo la risposta parte subito.
   */
  private async elencoCoda(url: URL, req: IncomingMessage, res: ServerResponse, tel: TelefonoAbbinato) {
    this.d.aperto(tel.id);
    const elenco = () => this.d.coda().perTelefono(tel.id).map((v) => ({ id: v.id, nome: v.nome, dimensione: v.dimensione }));
    const attesa = Math.min(25, Math.max(0, Number(url.searchParams.get('attesa')) || 0));
    if (elenco().length || attesa === 0) return rispondi(res, 200, { file: elenco() });
    await new Promise<void>((fatto) => {
      let set = this.attese.get(tel.id);
      if (!set) { set = new Set(); this.attese.set(tel.id, set); }
      const sveglia = () => { clearTimeout(timer); set!.delete(sveglia); fatto(); };
      const timer = setTimeout(sveglia, attesa * 1000);
      set.add(sveglia);
      req.on('close', sveglia);
    });
    if (!res.destroyed) { this.d.aperto(tel.id); rispondi(res, 200, { file: elenco() }); }
  }

  private scaricaCoda(url: URL, req: IncomingMessage, res: ServerResponse, tel: TelefonoAbbinato) {
    const v = this.d.coda().trova(tel.id, url.searchParams.get('id') ?? '');
    if (!v) return rispondi(res, 404, { errore: 'non c\'è più' });
    let dim: number;
    try { dim = fs.statSync(v.percorso).size; } catch {
      this.d.coda().togli(tel.id, v.id);
      this.emit('uscita', { fase: 'errore', voce: v, motivo: 'il file sul PC non esiste più' });
      return rispondi(res, 410, { errore: 'il file sul PC non esiste più' });
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': dim, 'x-fionda-nome': encodeURIComponent(v.nome), 'cache-control': 'no-store' });
    this.emit('uscita', { fase: 'inizio', voce: v, inviati: 0, totale: dim });
    let inviati = 0, ultimo = 0;
    const flusso = fs.createReadStream(v.percorso);
    flusso.on('data', (p: Buffer | string) => {
      inviati += p.length;
      const ora = Date.now();
      if (ora - ultimo > 80) { ultimo = ora; this.emit('uscita', { fase: 'avanzamento', voce: v, inviati, totale: dim }); }
    });
    flusso.on('error', () => res.destroy());
    req.on('close', () => flusso.destroy());
    flusso.pipe(res);
  }

  private ricevuto(url: URL, res: ServerResponse, tel: TelefonoAbbinato) {
    const v = this.d.coda().togli(tel.id, url.searchParams.get('id') ?? '');
    if (!v) return rispondi(res, 404, { errore: 'sconosciuto' });
    this.emit('uscita', { fase: 'consegnato', voce: v, telefono: tel.nome });
    rispondi(res, 200, { ok: true });
  }

  /** "Collega" premuto sul PC. */
  accetta(sessione: string): TelefonoAbbinato | undefined {
    const r = this.richieste.get(sessione);
    if (!r || r.stato !== 'attesa') return undefined;
    const gettone = nuovoGettone();
    const t: TelefonoAbbinato = { id: r.id, nome: r.nome, impronta: impronta(gettone), aggiunto: Date.now() };
    this.d.aggiungiTelefono(t);
    r.stato = 'ok'; r.gettone = gettone;
    this.emit('abbinato', t);
    return t;
  }

  rifiuta(sessione: string) {
    const r = this.richieste.get(sessione);
    if (r && r.stato === 'attesa') r.stato = 'rifiutato';
  }

  private pulisciRichieste() {
    const ora = Date.now();
    for (const [k, r] of this.richieste) if (ora - r.creata > DURATA_RICHIESTA_MS) { this.richieste.delete(k); this.emit('richiesta-scaduta', r); }
  }

  private async testo(req: IncomingMessage, res: ServerResponse, tel: TelefonoAbbinato) {
    const buf = await leggiTutto(req, MASSIMO_TESTO);
    if (!buf) return rispondi(res, 413, { errore: 'testo troppo lungo' });
    this.emit('testo', { testo: buf.toString('utf8'), telefono: tel });
    rispondi(res, 200, { ok: true });
  }

  private async file(req: IncomingMessage, res: ServerResponse, tel: TelefonoAbbinato) {
    const totale = Number(req.headers['content-length'] ?? -1);
    if (!(totale >= 0)) { req.resume(); return rispondi(res, 411, { errore: 'manca la dimensione' }); }
    if (totale > MASSIMO_FILE) { req.resume(); return rispondi(res, 413, { errore: 'file troppo grande' }); }
    let grezzo = String(req.headers['x-fionda-nome'] ?? '');
    try { grezzo = decodeURIComponent(grezzo); } catch { /* lo puliamo comunque */ }
    const nome = nomeSicuro(grezzo);
    const cartella = this.d.cartella();
    fs.mkdirSync(cartella, { recursive: true });
    const temp = path.join(cartella, `.fionda-${randomBytes(6).toString('hex')}.parziale`);
    const a: Arrivo = {
      id: randomUUID(), nome, totale, ricevuti: 0, telefono: tel,
      indice: Math.max(1, Number(req.headers['x-fionda-indice']) || 1), quanti: Math.max(1, Number(req.headers['x-fionda-quanti']) || 1),
    };
    this.emit('inizio', a);
    const out = fs.createWriteStream(temp, { flags: 'wx' });
    let ultimoAvviso = 0, rotto = false;
    const pulisci = (motivo: string) => {
      if (rotto) return; rotto = true;
      out.destroy(); fs.rm(temp, { force: true }, () => {});
      this.emit('errore', { ...a, motivo });
    };
    req.on('data', (pezzo: Buffer) => {
      a.ricevuti += pezzo.length;
      if (a.ricevuti > totale) { pulisci('più dati del previsto'); req.destroy(); return; }
      const ora = Date.now();
      if (ora - ultimoAvviso > 80) { ultimoAvviso = ora; this.emit('avanzamento', a); }
    });
    req.on('aborted', () => pulisci('interrotto dal telefono'));
    req.pipe(out);
    await new Promise<void>((fatto) => { out.on('close', () => fatto()); out.on('error', () => { pulisci('scrittura fallita'); fatto(); }); });
    if (rotto) return rispondi(res, 400, { errore: 'trasferimento interrotto' });
    if (a.ricevuti !== totale) { pulisci('file incompleto'); return rispondi(res, 400, { errore: 'file incompleto' }); }
    const finale = nomeLibero(nome, (n) => fs.existsSync(path.join(cartella, n)));
    const percorso = path.join(cartella, finale);
    fs.renameSync(temp, percorso);
    this.emit('fine', { ...a, nome: finale, percorso });
    rispondi(res, 200, { nome: finale });
  }
}

function stessoNonce(r: Richiesta, nonce: string) {
  const a = Buffer.from(r.nonce), b = Buffer.from(nonce);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rispondi(res: ServerResponse, codice: number, corpo: unknown) {
  if (res.headersSent) return;
  const testo = JSON.stringify(corpo);
  res.writeHead(codice, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(testo), 'cache-control': 'no-store' });
  res.end(testo);
}

async function leggiTutto(req: IncomingMessage, massimo: number): Promise<Buffer | null> {
  const pezzi: Buffer[] = [];
  let n = 0;
  for await (const p of req) {
    n += (p as Buffer).length;
    if (n > massimo) { req.resume(); return null; }
    pezzi.push(p as Buffer);
  }
  return Buffer.concat(pezzi);
}

async function leggiJson(req: IncomingMessage): Promise<any> {
  const b = await leggiTutto(req, MASSIMO_JSON);
  if (!b) return null;
  try { return JSON.parse(b.toString('utf8')); } catch { return null; }
}
