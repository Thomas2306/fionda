import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import QRCode from 'qrcode';
import { indirizziDiCasa, stessoTesto, type TelefonoAbbinato } from '../core/abbinamento';
import { nomeLibero, nomeSicuro } from '../core/nomi';
import { paginaTelefono, type FileCondiviso } from '../core/paginaTelefono';
import type { Arrivo } from './server';

const PORTA = 47314;
const DURATA_MS = 15 * 60 * 1000;
const MASSIMO_FILE = 16 * 1024 ** 3;

/**
 * Riserva SENZA APP: per chi non ha Fionda sul telefono.
 * Il PC accende un piccolo server sulla rete di casa SOLO mentre la finestra "Senza app" è aperta
 * (al massimo 15 minuti), con un indirizzo segreto nel QR. Il telefono lo apre con Safari:
 * scarica i file scelti sul PC e manda i suoi. Si spegne chiudendo la finestra.
 * Eventi come il server dell'app: 'inizio' / 'avanzamento' / 'fine' / 'errore' (stesso bordo e cronologia).
 */
export class SenzaApp extends EventEmitter {
  private server?: http.Server;
  private finestra?: BrowserWindow;
  private gettone = '';
  private porta = 0;
  private scade = 0;
  private timer?: NodeJS.Timeout;
  file: (FileCondiviso & { percorso: string })[] = [];
  private telefono: TelefonoAbbinato = { id: 'senza-app', nome: 'telefono senza app', impronta: '', aggiunto: 0 };

  constructor(private preload: string, private pagina: (f: BrowserWindow, nome: string) => void, private icona: string,
              private nomePC: () => string, private cartella: () => string) {
    super();
    ipcMain.on('senzaapp:pronta', () => this.aggiorna());
    ipcMain.on('senzaapp:aggiungi', (_e, percorsi: unknown) => { if (Array.isArray(percorsi)) this.aggiungi(percorsi.filter((p): p is string => typeof p === 'string')); });
    ipcMain.on('senzaapp:scegli', async () => {
      if (!this.finestra) return;
      const r = await dialog.showOpenDialog(this.finestra, { title: 'File da mandare al telefono', properties: ['openFile', 'multiSelections'] });
      if (!r.canceled) this.aggiungi(r.filePaths);
    });
    ipcMain.on('senzaapp:togli', (_e, id: unknown) => { this.file = this.file.filter((f) => f.id !== id); this.aggiorna(); });
  }

  aggiungi(percorsi: string[]) {
    for (const p of percorsi) {
      try {
        const st = fs.statSync(p);
        if (st.isFile() && !this.file.some((f) => f.percorso === p)) this.file.push({ id: randomUUID(), nome: path.basename(p), dimensione: st.size, percorso: p });
      } catch { /* sparito */ }
    }
    this.aggiorna();
  }

  async apri(percorsi: string[] = []) {
    if (this.finestra && !this.finestra.isDestroyed()) { this.aggiungi(percorsi); this.finestra.show(); this.finestra.focus(); return; }
    this.file = [];
    this.gettone = randomBytes(16).toString('base64url');
    this.scade = Date.now() + DURATA_MS;
    await this.accendi();
    this.aggiungi(percorsi);
    this.finestra = new BrowserWindow({
      width: 440, height: 880, resizable: false, maximizable: false, title: 'Fionda — senza app', show: false,
      backgroundColor: '#0b0a18', autoHideMenuBar: true, icon: this.icona,
      webPreferences: { preload: this.preload, sandbox: false, contextIsolation: true, nodeIntegration: false },
    });
    this.finestra.once('ready-to-show', () => this.finestra?.show());
    this.finestra.on('closed', () => { this.finestra = undefined; this.spegni(); });
    if (process.env.FIONDA_FOTO) setTimeout(() => this.finestra?.webContents.capturePage().then((img) => fs.writeFileSync(path.join(process.env.FIONDA_FOTO!, 'senzaapp.png'), img.toPNG())), 2500);
    this.pagina(this.finestra, 'senzaapp');
    // dopo 15 minuti si chiude da sola (l'indirizzo non resta valido per sempre)
    this.timer = setTimeout(() => this.finestra?.close(), DURATA_MS);
  }

  /** indirizzo da mettere nel QR */
  indirizzo() { return `http://${indirizziDiCasa(os.networkInterfaces())[0] ?? '127.0.0.1'}:${this.porta}/t/${this.gettone}`; }

  private async aggiorna() {
    if (!this.finestra || this.finestra.isDestroyed()) return;
    const url = this.indirizzo();
    if (process.env.FIONDA_CODICE_PROVA) console.log('[prova] senza app', url);
    const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 0, width: 420, color: { dark: '#14102bff', light: '#ffffffff' } });
    this.finestra.webContents.send('senzaapp', { qr, url, scade: this.scade, file: this.file.map(({ id, nome, dimensione }) => ({ id, nome, dimensione })) });
  }

  private async accendi() {
    this.server = http.createServer((req, res) => this.gestisci(req, res).catch(() => { if (!res.headersSent) { res.writeHead(500); res.end(); } }));
    this.server.requestTimeout = 0;
    for (let p = PORTA; p < PORTA + 10; p++) {
      const ok = await new Promise<boolean>((fatto) => {
        const e = () => fatto(false);
        this.server!.once('error', e);
        this.server!.listen(p, '0.0.0.0', () => { this.server!.off('error', e); fatto(true); });
      });
      if (ok) { this.porta = p; console.log(`[senza app] acceso su ${this.indirizzo().replace(this.gettone, '…')}`); return; }
    }
  }

  private spegni() {
    clearTimeout(this.timer);
    this.server?.close();
    this.server?.closeAllConnections?.();
    this.server = undefined;
    this.gettone = '';
    this.file = [];
    console.log('[senza app] spento');
  }

  private async gestisci(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://fionda');
    const [, t, gettone, azione, id] = url.pathname.split('/');
    if (t !== 't' || !this.gettone || !gettone || !stessoTesto(gettone, this.gettone) || Date.now() > this.scade) {
      req.resume(); res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Indirizzo scaduto: inquadra di nuovo il QR sul PC.'); return;
    }
    const base = `/t/${this.gettone}`;
    if (req.method === 'GET' && !azione) {
      const html = paginaTelefono({ pc: this.nomePC(), base, file: this.file });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      res.end(html); return;
    }
    if (req.method === 'GET' && azione === 'f') {
      const f = this.file.find((x) => x.id === decodeURIComponent(id ?? ''));
      if (!f || !fs.existsSync(f.percorso)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'content-type': 'application/octet-stream', 'content-length': fs.statSync(f.percorso).size, 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="${f.nome.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.nome)}`,
      });
      fs.createReadStream(f.percorso).pipe(res);
      return;
    }
    if (req.method === 'POST' && azione === 'su') return this.ricevi(url, req, res);
    req.resume(); res.writeHead(404); res.end();
  }

  /** Il telefono senza app manda un file: stesso trattamento del server dell'app (nomi puliti, mai sovrascrivere). */
  private async ricevi(url: URL, req: http.IncomingMessage, res: http.ServerResponse) {
    const totale = Number(req.headers['content-length'] ?? -1);
    if (!(totale >= 0) || totale > MASSIMO_FILE) { req.resume(); res.writeHead(413); res.end(); return; }
    const nome = nomeSicuro(url.searchParams.get('nome') ?? '');
    const cartella = this.cartella();
    fs.mkdirSync(cartella, { recursive: true });
    const temp = path.join(cartella, `.fionda-${randomBytes(6).toString('hex')}.parziale`);
    const a: Arrivo = { id: randomUUID(), nome, totale, ricevuti: 0, telefono: this.telefono, indice: 1, quanti: 1 };
    this.emit('inizio', a);
    const out = fs.createWriteStream(temp, { flags: 'wx' });
    let ultimo = 0, rotto = false;
    req.on('data', (p: Buffer) => {
      a.ricevuti += p.length;
      if (a.ricevuti > totale) { rotto = true; req.destroy(); return; }
      if (Date.now() - ultimo > 80) { ultimo = Date.now(); this.emit('avanzamento', a); }
    });
    req.on('aborted', () => { rotto = true; });
    req.pipe(out);
    await new Promise<void>((fatto) => out.on('close', () => fatto()));
    if (rotto || a.ricevuti !== totale) {
      fs.rm(temp, { force: true }, () => {});
      this.emit('errore', { ...a, motivo: 'interrotto' });
      if (!res.headersSent) { res.writeHead(400); res.end(); }
      return;
    }
    const finale = nomeLibero(nome, (n) => fs.existsSync(path.join(cartella, n)));
    const percorso = path.join(cartella, finale);
    fs.renameSync(temp, percorso);
    this.emit('fine', { ...a, nome: finale, percorso });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  }

  ferma() { this.finestra?.close(); this.spegni(); }
}
