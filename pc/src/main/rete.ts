import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, clipboard, nativeImage, Notification, screen, shell } from 'electron';
import QRCode from 'qrcode';
import { codificaQR, DURATA_CODICE_MS, indirizziDiCasa, nuovoCodice, VERSIONE_PROTOCOLLO, type CodiceAttivo, type TelefonoAbbinato } from '../core/abbinamento';
import { CodaUscita, telefonoDestinatario, type FileInUscita } from '../core/coda';
import type { VoceCronologia } from '../core/cronologia';
import { simbolo } from '../core/icone';
import { dimensione, genere } from '../core/nomi';
import type { Config } from './config';
import { salvaConfig } from './config';
import { certificato } from './sicurezza';
import { eHeic, heicInJpg } from './heic';
import { ServerFionda, type Arrivo, type Richiesta } from './server';

/** PC → telefono: cosa succede al file lasciato sul bordo (per l'effetto del bordo). */
export interface DatiUscita {
  fase: 'nessuno' | 'accodato' | 'inizio' | 'avanzamento' | 'consegnato' | 'errore';
  nomi?: string[];
  telefono?: string;
  /** il telefono ha l'app aperta: parte subito */
  subito?: boolean;
  /** 0-1 */
  avanzamento?: number;
  /** file ancora in attesa per i telefoni */
  inAttesa: number;
  motivo?: string;
}

export interface DatiArrivo {
  fase: 'inizio' | 'avanzamento' | 'fine' | 'errore';
  id: string;
  nome: string;
  telefono: string;
  /** 0-1 */
  avanzamento: number;
  indice: number; quanti: number;
  /** miniatura (data:) per foto e video, solo a fine */
  miniatura?: string;
  genere?: string;
  dimensione?: string;
}

/**
 * Tutto quello che riguarda la rete: server, abbinamento (QR + finestra), file in arrivo.
 * `inviaBordo` porta gli arrivi all'effetto del bordo.
 */
export class Rete {
  server?: ServerFionda;
  private codice?: CodiceAttivo;
  private finestra?: BrowserWindow;
  private appenaAbbinato?: string;
  private impronta = '';
  private bonjour?: any;
  private richiesta?: { finestra: BrowserWindow; r: Richiesta };
  errore?: string;

  constructor(
    private config: () => Config,
    private inviaBordo: (a: DatiArrivo) => void,
    private vicino: () => { stato: string; forza: number; livello: number },
    private statoDi: (nome: string) => { stato: string; livello: number },
    private preload: string,
    private pagina: (f: BrowserWindow, nome: string) => void,
    private icona: string,
    private inviaUscita: (u: DatiUscita) => void,
  ) {}

  /** ogni file passato finisce anche nella cronologia */
  alRegistro?: (v: VoceCronologia) => void;

  /** file in attesa di partire verso il telefono (sopravvivono al riavvio del PC) */
  coda = new CodaUscita(this.leggiCoda());
  /** telefoni con l'app aperta adesso (ultima richiesta della coda) */
  private aperti = new Map<string, number>();

  private fileCoda() { return path.join(app.getPath('userData'), 'coda-uscita.json'); }
  private leggiCoda(): FileInUscita[] {
    try { return JSON.parse(fs.readFileSync(this.fileCoda(), 'utf8')); } catch { return []; }
  }
  private salvaCoda() {
    try { fs.writeFileSync(this.fileCoda(), JSON.stringify(this.coda.voci, null, 2)); } catch { /* pazienza */ }
  }

  /**
   * File lasciati sul bordo → in coda per il telefono giusto.
   * Se l'app è aperta partono subito; se no aspettano che tu la apra.
   */
  accoda(percorsi: string[]): DatiUscita {
    const tel = telefonoDestinatario(this.telefoni(), this.aperti);
    if (!tel) return { fase: 'nessuno', inAttesa: this.coda.quanti };
    const nomi: string[] = [];
    for (const p of percorsi) {
      let st: fs.Stats;
      try { st = fs.statSync(p); } catch { continue; }
      if (!st.isFile()) continue; // le cartelle per ora no
      const nome = path.basename(p);
      this.coda.aggiungi({ id: randomUUID(), telefonoId: tel.id, percorso: p, nome, dimensione: st.size, creato: Date.now() });
      nomi.push(nome);
    }
    if (!nomi.length) return { fase: 'errore', motivo: 'Le cartelle non si possono ancora mandare: scegli dei file.', inAttesa: this.coda.quanti };
    this.salvaCoda();
    this.server?.avvisaCoda(tel.id);
    const subito = Date.now() - (this.aperti.get(tel.id) ?? 0) < 30_000;
    console.log(`[uscita] ${this.nascosto(nomi.join(', '))} → ${tel.nome} (${subito ? 'app aperta: parte subito' : 'in attesa che apri Fionda'})`);
    return { fase: 'accodato', nomi, telefono: tel.nome, subito, inAttesa: this.coda.quanti };
  }

  svuotaCoda() { this.coda.svuota(); this.salvaCoda(); this.inviaUscita({ fase: 'errore', motivo: 'Invii annullati', inAttesa: 0 }); }

  cartella() { return path.join(app.getPath('downloads'), 'Fionda'); }
  nomePC() { return os.hostname(); }
  telefoni() { return this.config().telefoni ?? []; }

  async avvia() {
    const cert = await certificato();
    this.impronta = cert.impronta;
    this.server = new ServerFionda(cert, {
      nomePC: () => this.nomePC(),
      cartella: () => this.cartella(),
      telefoni: () => this.telefoni(),
      aggiungiTelefono: (t) => {
        const c = this.config();
        c.telefoni = [...(c.telefoni ?? []).filter((x) => x.id !== t.id), t];
        salvaConfig(c);
      },
      contatto: (id) => {
        const t = this.telefoni().find((x) => x.id === id);
        if (t && (!t.ultimoContatto || Date.now() - t.ultimoContatto > 60_000)) { t.ultimoContatto = Date.now(); salvaConfig(this.config()); }
      },
      codice: () => this.codice,
      bruciaCodice: () => { this.codice = undefined; },
      vicino: this.vicino,
      visibile: () => this.config().visibile !== false,
      statoDi: this.statoDi,
      coda: () => this.coda,
      aperto: (id) => {
        const primaVolta = !this.aperti.has(id);
        this.aperti.set(id, Date.now());
        // solo per le prove automatiche: la prima volta che il telefono apre l'app, "lasciamo" un file sul bordo
        if (primaVolta && process.env.FIONDA_PROVA_INVIA) setTimeout(() => this.inviaUscita(this.accoda([process.env.FIONDA_PROVA_INVIA!])), 500);
      },
    });
    try {
      const porta = await this.server.avvia();
      console.log(`[rete] in ascolto su ${indirizziDiCasa(os.networkInterfaces()).join(', ')} porta ${porta} (protocollo ${VERSIONE_PROTOCOLLO})`);
    } catch (e) {
      this.errore = `Il server non parte: ${(e as Error).message}`;
      console.warn('[rete]', this.errore);
    }
    this.annunciaInRete();
    this.server.on('richiesta', (r: Richiesta) => this.chiediConferma(r));
    this.server.on('richiesta-scaduta', (r: Richiesta) => { if (this.richiesta?.r.sessione === r.sessione) this.richiesta.finestra.close(); });
    this.server.on('abbinato', (t: TelefonoAbbinato) => {
      console.log(`[rete] abbinato: ${t.nome}`);
      // animazione sul bordo: il telefono è "entrato"
      this.inviaBordo({ fase: 'fine', id: `collegato-${Date.now()}`, nome: 'Collegato!', telefono: t.nome, avanzamento: 1, indice: 1, quanti: 1, genere: 'collegato' });
      this.alRegistro?.({ id: randomUUID(), verso: 'arrivato', nome: t.nome, percorso: '', telefono: t.nome, dimensione: 0, genere: 'collegato', quando: Date.now() });
      this.appenaAbbinato = t.nome;
      this.aggiornaFinestra();
      setTimeout(() => { this.appenaAbbinato = undefined; this.finestra?.close(); }, 2600);
    });
    this.ascoltaArrivi(this.server);
    this.server.on('uscita', (u: { fase: string; voce: FileInUscita; inviati?: number; totale?: number; telefono?: string; motivo?: string }) => {
      const nome = this.telefoni().find((x) => x.id === u.voce.telefonoId)?.nome ?? 'telefono';
      if (u.fase === 'consegnato' || u.fase === 'errore') this.salvaCoda();
      if (u.fase === 'consegnato') {
        console.log(`[uscita] consegnato: ${this.nascosto(u.voce.nome)} → ${nome}`);
        this.alRegistro?.({ id: u.voce.id, verso: 'mandato', nome: u.voce.nome, percorso: u.voce.percorso, telefono: nome, dimensione: u.voce.dimensione, genere: genere(u.voce.nome), quando: Date.now() });
      }
      this.inviaUscita({
        fase: u.fase as DatiUscita['fase'], nomi: [u.voce.nome], telefono: nome, motivo: u.motivo,
        avanzamento: u.totale ? (u.inviati ?? 0) / u.totale : undefined, inAttesa: this.coda.quanti,
      });
    });
    this.server.on('testo', ({ testo, telefono }: { testo: string; telefono: TelefonoAbbinato }) => {
      clipboard.writeText(testo);
      this.alRegistro?.({ id: randomUUID(), verso: 'arrivato', nome: /^https?:\/\//i.test(testo.trim()) ? 'Link' : 'Testo', percorso: '', telefono: telefono.nome, dimensione: Buffer.byteLength(testo), genere: 'testo', quando: Date.now(), testo });
      const link = /^https?:\/\/\S+$/i.test(testo.trim());
      this.inviaBordo({ fase: 'fine', id: String(Date.now()), nome: link ? 'Link copiato' : 'Testo copiato', telefono: telefono.nome, avanzamento: 1, indice: 1, quanti: 1, genere: 'testo' });
      this.notifica(link ? 'Link copiato negli appunti' : 'Testo copiato negli appunti', this.config().registrazione ? '' : testo.slice(0, 120), link ? () => shell.openExternal(testo.trim()) : undefined);
    });
  }

  /** File che arrivano (dal server dell'app o dalla pagina senza app): bordo, HEIC, cronologia, notifica. */
  ascoltaArrivi(em: import('node:events').EventEmitter) {
      const dati = (fase: DatiArrivo['fase'], a: Arrivo): DatiArrivo => ({
        fase, id: a.id, nome: a.nome, telefono: a.telefono.nome, avanzamento: a.totale ? a.ricevuti / a.totale : 1, indice: a.indice, quanti: a.quanti,
      });
      em.on('inizio', (a: Arrivo) => { console.log(`[arrivo] ${this.nascosto(a.nome)} (${dimensione(a.totale)}) da ${a.telefono.nome}`); this.inviaBordo(dati('inizio', a)); });
      em.on('avanzamento', (a: Arrivo) => this.inviaBordo(dati('avanzamento', a)));
      em.on('errore', (a: Arrivo & { motivo: string }) => { console.warn(`[arrivo] errore: ${a.motivo}`); this.inviaBordo(dati('errore', a)); });
      em.on('fine', async (a: Arrivo & { percorso: string }) => {
        // foto HEIC dell'iPhone → JPG (Windows spesso non le apre)
        if (this.config().heicInJpg !== false && eHeic(a.nome)) {
          a.percorso = await heicInJpg(a.percorso);
          a.nome = path.basename(a.percorso);
        }
        const g = genere(a.nome);
        let miniatura: string | undefined;
        if (g === 'immagine' || g === 'video') {
          try { miniatura = (await nativeImage.createThumbnailFromPath(a.percorso, { width: 420, height: 420 })).toDataURL(); } catch { /* HEIC senza codec, ecc. */ }
        }
        console.log(`[arrivo] salvato: ${this.nascosto(a.percorso)}`);
        this.inviaBordo({ ...dati('fine', a), miniatura, genere: g, dimensione: dimensione(a.totale) });
        this.alRegistro?.({ id: a.id, verso: 'arrivato', nome: a.nome, percorso: a.percorso, telefono: a.telefono.nome, dimensione: a.totale, genere: g, quando: Date.now() });
        if (a.indice === a.quanti) this.notifica(a.quanti > 1 ? `${a.quanti} file da ${a.telefono.nome}` : `${a.nome} da ${a.telefono.nome}`, 'Clic per vederlo nella cartella', () => shell.showItemInFolder(a.percorso));
      });
  }

  private nascosto(t: string) { return this.config().registrazione ? '(nascosto)' : t; }

  private notifica(titolo: string, corpo: string, clic?: () => void) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: titolo, body: corpo, icon: this.icona, silent: false });
    if (clic) n.on('click', clic);
    n.show();
  }

  /**
   * "Visibile ai telefoni vicini": il PC si annuncia sulla rete di casa (Bonjour/mDNS, _fionda._tcp)
   * con nome e impronta del certificato. Il telefono lo trova e chiede di collegarsi avvicinandosi.
   */
  async annunciaInRete() {
    const visibile = this.config().visibile !== false;
    try {
      if (!visibile || !this.server?.porta) { this.bonjour?.unpublishAll?.(); this.bonjour?.destroy?.(); this.bonjour = undefined; return; }
      if (this.bonjour) return;
      const { Bonjour } = await import('bonjour-service');
      this.bonjour = new Bonjour();
      this.bonjour.publish({ name: `Fionda ${this.nomePC()}`, type: 'fionda', port: this.server.porta, txt: { v: String(VERSIONE_PROTOCOLLO), n: this.nomePC(), f: this.impronta } });
      console.log('[rete] visibile ai telefoni vicini (_fionda._tcp)');
    } catch (e) { console.warn('[rete] annuncio in rete non riuscito:', (e as Error).message); }
  }

  /** Un telefono vicino vuole collegarsi: finestra con i 4 simboli, "Collega" / "Rifiuta". */
  private chiediConferma(r: Richiesta) {
    console.log(`[rete] richiesta di collegamento da ${r.nome}: ${r.simboli.map((n) => simbolo(n).nome).join(', ')}`);
    this.richiesta?.finestra.close();
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const w = 400, h = 380;
    const f = new BrowserWindow({
      width: w, height: h, x: Math.round(area.x + (area.width - w) / 2), y: Math.round(area.y + (area.height - h) / 2),
      frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: false, show: false, title: 'Fionda — collegare il telefono?',
      backgroundColor: '#00000000', icon: this.icona,
      webPreferences: { preload: this.preload, sandbox: false, contextIsolation: true, nodeIntegration: false },
    });
    f.setAlwaysOnTop(true, 'floating');
    this.richiesta = { finestra: f, r };
    f.once('ready-to-show', () => { f.show(); f.focus(); });
    if (process.env.FIONDA_FOTO) setTimeout(() => f.webContents.capturePage().then((img) => require('node:fs').writeFileSync(require('node:path').join(process.env.FIONDA_FOTO!, 'richiesta.png'), img.toPNG())), 1500);
    f.on('closed', () => {
      if (this.richiesta?.finestra === f) { this.server?.rifiuta(r.sessione); this.richiesta = undefined; }
    });
    this.pagina(f, 'richiesta');
  }

  /** dati per la finestra di conferma */
  datiRichiesta() {
    const r = this.richiesta?.r;
    return r ? { nome: r.nome, simboli: r.simboli, pc: this.nomePC() } : null;
  }

  rispondiRichiesta(si: boolean) {
    const q = this.richiesta;
    if (!q) return;
    this.richiesta = undefined;
    if (si) this.server?.accetta(q.r.sessione); else this.server?.rifiuta(q.r.sessione);
    setTimeout(() => { if (!q.finestra.isDestroyed()) q.finestra.close(); }, si ? 900 : 0);
  }

  /** Nuovo codice usa-e-getta e QR. */
  private async statoFinestra() {
    if (!this.codice || Date.now() >= this.codice.scade) this.codice = { codice: process.env.FIONDA_CODICE_PROVA || nuovoCodice(), scade: Date.now() + DURATA_CODICE_MS };
    const indirizzi = indirizziDiCasa(os.networkInterfaces());
    const testo = codificaQR({ v: VERSIONE_PROTOCOLLO, n: this.nomePC(), h: indirizzi, p: this.server?.porta ?? 0, c: this.codice.codice, f: this.impronta });
    if (process.env.FIONDA_CODICE_PROVA) console.log('[prova] QR', testo);
    const qr = await QRCode.toDataURL(testo, { errorCorrectionLevel: 'M', margin: 0, width: 480, color: { dark: '#14102bff', light: '#ffffffff' } });
    return {
      qr, scade: this.codice.scade, indirizzi, porta: this.server?.porta ?? 0, errore: this.errore,
      telefoni: this.telefoni().map(({ id, nome, aggiunto, ultimoContatto }) => ({ id, nome, aggiunto, ultimoContatto })),
      appenaAbbinato: this.appenaAbbinato,
    };
  }

  async aggiornaFinestra() {
    if (!this.finestra || this.finestra.isDestroyed()) return;
    this.finestra.webContents.send('abbina', await this.statoFinestra());
  }

  nuovoCodice() { this.codice = undefined; this.aggiornaFinestra(); }

  rimuovi(id: string) {
    const c = this.config();
    c.telefoni = (c.telefoni ?? []).filter((t) => t.id !== id);
    salvaConfig(c);
    this.coda.dimenticaTelefono(id);
    this.salvaCoda();
    this.aggiornaFinestra();
  }

  apriFinestra() {
    if (this.finestra && !this.finestra.isDestroyed()) { this.finestra.show(); this.finestra.focus(); return; }
    this.finestra = new BrowserWindow({
      width: 440, height: 900, resizable: false, maximizable: false, minimizable: true, title: 'Fionda — collega il telefono',
      backgroundColor: '#0b0a18', autoHideMenuBar: true, show: false, icon: this.icona,
      webPreferences: { preload: this.preload, sandbox: false, contextIsolation: true, nodeIntegration: false },
    });
    this.finestra.once('ready-to-show', () => this.finestra?.show());
    if (process.env.FIONDA_FOTO) setTimeout(() => this.finestra?.webContents.capturePage().then((img) => require('node:fs').writeFileSync(require('node:path').join(process.env.FIONDA_FOTO!, 'abbina.png'), img.toPNG())), 2500);
    this.finestra.on('closed', () => { this.finestra = undefined; this.codice = undefined; });
    this.pagina(this.finestra, 'abbina');
  }

  apriCartella() { shell.openPath(this.cartella()); }

  ferma() { this.server?.ferma(); try { this.bonjour?.unpublishAll?.(); this.bonjour?.destroy?.(); } catch {} }
}
