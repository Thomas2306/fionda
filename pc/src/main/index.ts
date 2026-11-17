import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Display, ipcMain, Menu, nativeImage, nativeTheme, screen, Tray } from 'electron';
import icona from '../../risorse/icona.png?asset';
import { bordoVicinoAlMouse, fascia, latoConsigliato, latoInterno, LATI, latoVersoCuiTrascini, valutaMouse, ZONA, type Lato, type Trascinamento } from '../core/bordo';
import { capacita, parole, sistema } from '../core/piattaforma';
import type { DatiBordo, DatiMouse, DatiTelefono, ScenaDemo } from '../core/tipi';
import { leggiConfig, salvaConfig, type Config } from './config';
import { lettoreTasto } from './mouse';
import { Ascoltatore, type Telefono } from './telefono';
import { Rete } from './rete';
import { ArchivioCronologia } from './cronologia';
import { SenzaApp } from './senzaapp';

const SISTEMA = sistema(process.platform);
const PUO = capacita(SISTEMA);
const P = parole(SISTEMA);
const NOMI_LATO: Record<Lato, string> = { destra: 'Destra', sinistra: 'Sinistra', alto: 'In alto', basso: 'In basso' };

if (!app.requestSingleInstanceLock()) app.quit();

let config: Config;
let win: BrowserWindow | undefined;
let tray: Tray | undefined;
let schermo: Display;
let lato: Lato = 'destra';
let toccabile = false;
let ultimoMouseInviato = false;
let demoAttiva = false;
const trascinamento: Trascinamento = { premutoDa: null };
const tasto = lettoreTasto(SISTEMA);
const ascoltatore = new Ascoltatore();
let telefono: Telefono = { stato: 'PERSO', forza: 0, livello: 0, nome: '', media: null };
let rete: Rete;
let cronologia: ArchivioCronologia;
let senzaApp: SenzaApp;
const PRELOAD = path.join(__dirname, '../preload/index.js');

/** Carica una pagina dell'interfaccia (index = bordo, abbina = finestra del QR). */
function pagina(f: BrowserWindow, nome: string) {
  if (process.env.ELECTRON_RENDERER_URL) f.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${nome}.html`);
  else f.loadFile(path.join(__dirname, `../renderer/${nome}.html`));
}

const automatico = () => (config.lato ?? 'auto') === 'auto';
/** file in arrivo adesso: mentre arrivano il bordo non si sposta */
let arriviInCorso = 0;

function scegliSchermo() {
  const tutti = screen.getAllDisplays();
  if (automatico()) {
    const b = bordoVicinoAlMouse(screen.getCursorScreenPoint(), tutti.map((d) => d.bounds));
    schermo = tutti[b.schermo] ?? screen.getPrimaryDisplay();
    lato = b.lato;
    return;
  }
  schermo = tutti.find((d) => d.id === config.schermo) ?? screen.getPrimaryDisplay();
  lato = (config.lato as Lato | undefined) ?? latoConsigliato(schermo.bounds, tutti.map((d) => d.bounds));
}

/** Sposta la fascia dell'effetto su un altro lato/schermo (modalità automatico). */
function posiziona(d: Display, l: Lato) {
  if (!win || win.isDestroyed() || (d.id === schermo.id && l === lato)) return;
  schermo = d; lato = l;
  win.setBounds(fascia(d.bounds, l));
  if (toccabile) { toccabile = false; win.setIgnoreMouseEvents(true, { forward: true }); }
  invia('dati', datiBordo());
}

/** Automatico: accende il lato esterno più vicino al mouse, sullo schermo del mouse. */
function bordoDalMouse() {
  if (!automatico() || arriviInCorso > 0) return;
  const tutti = screen.getAllDisplays();
  const b = bordoVicinoAlMouse(screen.getCursorScreenPoint(), tutti.map((d) => d.bounds));
  if (tutti[b.schermo]) posiziona(tutti[b.schermo], b.lato);
}

function temaAttuale(): 'chiaro' | 'scuro' {
  return nativeTheme.shouldUseDarkColors ? 'scuro' : 'chiaro';
}

function datiBordo(): DatiBordo {
  const r = fascia(schermo.bounds, lato);
  return { lato, larghezza: r.width, altezza: r.height, tema: temaAttuale(), registrazione: !!config.registrazione, suoni: config.suoni !== false };
}

/** La finestra dell'effetto: una fascia trasparente lungo il lato scelto, sempre sopra, che lascia passare i clic. */
function creaFinestra() {
  win?.destroy();
  scegliSchermo();
  const r = fascia(schermo.bounds, lato);
  win = new BrowserWindow({
    x: r.x, y: r.y, width: r.width, height: r.height,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    focusable: false, skipTaskbar: true, show: false, alwaysOnTop: true, enableLargerThanScreen: true,
    title: 'FIONDA', type: SISTEMA === 'darwin' ? 'panel' : 'toolbar',
    webPreferences: { preload: PRELOAD, sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  // sopra a tutto, anche alla barra delle app; visibile nelle registrazioni dello schermo (è lo spettacolo)
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  toccabile = false;
  // Windows a volte arrotonda posizione e dimensioni con lo schermo in scala: le rimettiamo esatte
  win.once('ready-to-show', () => { win?.setBounds(r); win?.showInactive(); });
  win.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.warn(`[bordo] ${e.message} (${e.sourceId}:${e.lineNumber})`); });
  win.webContents.on('render-process-gone', (_e, d) => console.warn('[bordo] interfaccia caduta', d.reason));
  pagina(win, 'index');
}

function invia(canale: string, dati: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(canale, dati);
}

/** Ogni 16 ms: dov'è il mouse, il tasto è giù, stai trascinando verso il bordo? */
function giroMouse() {
  if (!win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const giu = tasto();
  // automatico: durante un trascinamento la fascia va sul lato verso cui stai andando (anche su un altro schermo)
  if (automatico() && !demoAttiva && giu && trascinamento.premutoDa && arriviInCorso === 0
      && Math.hypot(p.x - trascinamento.premutoDa.x, p.y - trascinamento.premutoDa.y) > 12) {
    const tutti = screen.getAllDisplays();
    const v = latoVersoCuiTrascini(p, tutti.map((d) => d.bounds));
    if (v && tutti[v.schermo]) posiziona(tutti[v.schermo], v.lato);
  }
  const e = valutaMouse(p, schermo.bounds, lato, giu, trascinamento, PUO.rilevaTrascinamento);
  if (!demoAttiva && e.toccabile !== toccabile) {
    toccabile = e.toccabile;
    win.setIgnoreMouseEvents(!toccabile, { forward: true });
  }
  // all'interfaccia mandiamo il mouse solo durante un trascinamento (più l'ultimo "finito"): niente traffico inutile
  const attivo = e.trascina && e.sulloSchermo && e.distanza < ZONA * 2.5;
  if (demoAttiva || (!attivo && !ultimoMouseInviato)) return;
  ultimoMouseInviato = attivo;
  const r = fascia(schermo.bounds, lato);
  const m: DatiMouse = { x: p.x - r.x, y: p.y - r.y, trascina: attivo, forza: e.forza };
  invia('mouse', m);
}

function inviaTelefono() {
  if (demoAttiva) return;
  const t: DatiTelefono = { stato: telefono.stato, forza: telefono.forza, nome: telefono.nome };
  invia('telefono', t);
}

/**
 * Demo dell'effetto, senza telefono e senza mouse: per provarlo, per i video e per le verifiche automatiche.
 * FIONDA_DEMO=1 la fa partire all'avvio (=giro la ripete); FIONDA_FOTO=cartella salva dei fotogrammi.
 */
function demo(scena: ScenaDemo) {
  if (!win) return;
  bordoDalMouse();
  demoAttiva = true;
  const r = fascia(schermo.bounds, lato);
  const L = lato === 'destra' || lato === 'sinistra' ? r.height : r.width;
  const daBordo = (u: number, v: number) =>
    lato === 'destra' ? { x: r.width - v, y: u } : lato === 'sinistra' ? { x: v, y: u } : lato === 'alto' ? { x: u, y: v } : { x: u, y: r.height - v };
  const inizio = Date.now();
  if (scena === 'arrivo') return demoArrivo();
  const conTelefono = scena !== 'trascina';
  const conFile = scena !== 'telefono';
  const t0File = conTelefono ? 6.2 : 0.4;
  const fine = conFile ? t0File + 3.4 : 6;
  const liscio = (x: number) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const foto = process.env.FIONDA_FOTO;
  const daFotografare = foto ? [2.6, 4.2, t0File + 1.0, t0File + 1.6, t0File + 1.75, t0File + 1.95, t0File + 2.3] : [];
  let lanciato = false;
  const timer = setInterval(() => {
    const t = (Date.now() - inizio) / 1000;
    if (conTelefono) {
      const f = t < 0.4 ? 0 : t < 3 ? 0.25 + 0.75 * liscio((t - 0.4) / 2.6) : t < 4.6 ? 1 : 1 - liscio((t - 4.6) / 1);
      const stato = t < 0.4 ? 'PERSO' : t < 5.4 ? 'VICINO' : 'LONTANO';
      win?.webContents.send('telefono', { stato, forza: stato === 'VICINO' ? Math.max(0.25, f) : 0, nome: 'FIONDA' } satisfies DatiTelefono);
    }
    if (conFile) {
      const k = (t - t0File) / 1.7;
      if (k >= 0 && k <= 1) {
        const v = 430 - 400 * liscio(k) + Math.sin(k * 9) * 10 * (1 - k);
        const u = L * 0.56 - 130 * liscio(k) + Math.sin(k * 5) * 26;
        const p = daBordo(u, v);
        win?.webContents.send('mouse', { ...p, trascina: true, forza: Math.max(0, 1 - v / ZONA), file: v < ZONA } as DatiMouse);
      } else if (k > 1 && !lanciato) {
        lanciato = true;
        const p = daBordo(L * 0.56 - 130, 30);
        win?.webContents.send('mouse', { ...p, trascina: false, forza: 0 } satisfies DatiMouse);
        win?.webContents.send('lancio-demo', { ...p, nomi: ['vacanze-2026.jpg'] });
      }
    }
    while (daFotografare.length && t >= daFotografare[0]) {
      const quando = daFotografare.shift()!;
      win?.webContents.capturePage().then((img) => {
        fs.mkdirSync(foto!, { recursive: true });
        fs.writeFileSync(path.join(foto!, `demo-${scena}-${quando.toFixed(2)}s.png`), img.toPNG());
      });
    }
    if (t > fine) {
      clearInterval(timer);
      demoAttiva = false;
      inviaTelefono();
      if (process.env.FIONDA_DEMO === 'giro') setTimeout(() => demo(scena), 600);
      else if (process.env.FIONDA_DEMO && process.env.FIONDA_ESCI) setTimeout(() => app.quit(), 1500);
    }
  }, 16);
}

/** Demo dell'arrivo: il telefono si avvicina, una foto arriva (barra che sale), la cartolina esce dal bordo. */
function demoArrivo() {
  if (!win) return;
  bordoDalMouse();
  demoAttiva = true;
  const inizio = Date.now();
  const foto = process.env.FIONDA_FOTO;
  const daFotografare = foto ? [1.2, 2.2, 3.0, 3.25, 3.6, 4.4] : [];
  const miniatura = nativeImage.createFromPath(icona).resize({ width: 360 }).toDataURL();
  const base = { id: 'demo', nome: 'IMG_2026.HEIC', telefono: 'iPhone', indice: 1, quanti: 1 };
  let finito = false;
  const timer = setInterval(() => {
    const t = (Date.now() - inizio) / 1000;
    const vicino = t > 0.2 && t < 4.6;
    win?.webContents.send('telefono', { stato: vicino ? 'VICINO' : 'LONTANO', forza: vicino ? 0.8 : 0, nome: 'FIONDA-C' } satisfies DatiTelefono);
    if (t > 1 && t < 3) win?.webContents.send('arrivo', { ...base, fase: t < 1.05 ? 'inizio' : 'avanzamento', avanzamento: (t - 1) / 2 });
    if (t >= 3 && !finito) { finito = true; win?.webContents.send('arrivo', { ...base, fase: 'fine', avanzamento: 1, miniatura, genere: 'immagine', dimensione: '2,4 MB' }); }
    while (daFotografare.length && t >= daFotografare[0]) {
      const quando = daFotografare.shift()!;
      win?.webContents.capturePage().then((img) => { fs.mkdirSync(foto!, { recursive: true }); fs.writeFileSync(path.join(foto!, `demo-arrivo-${quando.toFixed(2)}s.png`), img.toPNG()); });
    }
    if (t > 7) {
      clearInterval(timer); demoAttiva = false; inviaTelefono();
      if (process.env.FIONDA_DEMO && process.env.FIONDA_ESCI) setTimeout(() => app.quit(), 800);
    }
  }, 16);
}

function aggiornaTray() {
  if (!tray) return;
  const bt = ascoltatore.bluetooth;
  const tel = bt === 'spento' ? `Bluetooth spento: accendilo da ${P.impostazioniBluetooth}`
    : bt === 'non autorizzato' ? 'Bluetooth: permesso negato'
    : bt === 'non disponibile' ? 'Bluetooth non disponibile su questo computer'
    : telefono.stato === 'VICINO' ? `Telefono vicino${telefono.nome ? ` (${telefono.nome})` : ''}`
    : telefono.stato === 'LONTANO' ? 'Telefono lontano' : 'Nessun telefono con Fionda aperta';
  tray.setToolTip(`FIONDA — ${tel}`);
  const tutti = screen.getAllDisplays();
  const altri = tutti.map((d) => d.bounds);
  const primario = screen.getPrimaryDisplay().id;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tel, enabled: false },
    { type: 'separator' },
    { label: rete?.telefoni().length ? 'Abbina un altro telefono…' : 'Abbina il telefono…', click: () => rete.apriFinestra() },
    { label: 'Cronologia…', click: () => cronologia.apriFinestra() },
    { label: 'Telefono senza app (QR e Safari)…', click: () => senzaApp.apri() },
    { label: 'Apri i file ricevuti', click: () => rete.apriCartella() },
    ...(rete?.coda.quanti ? [{ label: `Annulla i ${rete.coda.quanti} file in attesa per il telefono`, click: () => { rete.svuotaCoda(); aggiornaTray(); } }] : []),
    { label: 'Visibile ai telefoni vicini (collegarsi avvicinando)', type: 'checkbox', checked: config.visibile !== false,
      click: (m) => { config.visibile = m.checked; salvaConfig(config); rete.annunciaInRete(); } },
    { type: 'separator' },
    { label: 'Dove si accende il bordo', submenu: [
      { label: 'Automatico: il lato più vicino al mouse', type: 'radio' as const, checked: automatico(),
        click: () => { config.lato = 'auto'; salvaConfig(config); creaFinestra(); aggiornaTray(); } },
      { type: 'separator' as const },
      ...LATI.map((l) => ({
        label: `Sempre ${NOMI_LATO[l].toLowerCase()}${latoInterno(schermo.bounds, altri, l) ? ' (lì c’è un altro monitor)' : ''}`,
        type: 'radio' as const, checked: !automatico() && l === lato,
        click: () => { config.lato = l; config.schermo = schermo.id; salvaConfig(config); creaFinestra(); aggiornaTray(); },
      })),
    ] },
    ...(tutti.length > 1 && !automatico() ? [{ label: 'Su quale schermo', submenu: tutti.map((d, i) => ({
      label: `Schermo ${i + 1}${d.id === primario ? ' (principale)' : ''} — ${d.size.width}×${d.size.height}`,
      type: 'radio' as const, checked: d.id === schermo.id,
      click: () => { config.schermo = d.id; config.lato = undefined; salvaConfig(config); creaFinestra(); aggiornaTray(); },
    })) }] : []),
    { label: 'Prova l’effetto', submenu: [
      { label: 'Telefono che si avvicina', click: () => demo('telefono') },
      { label: 'File trascinato e lanciato', click: () => demo('trascina') },
      { label: 'Foto che arriva dal telefono', click: () => demo('arrivo') },
      { label: 'Tutto di fila', click: () => demo('tutto') },
    ] },
    { label: 'Colori', submenu: [
      { label: `Come ${P.sistema}`, type: 'radio', checked: (config.tema ?? 'sistema') === 'sistema', click: () => impostaTema('sistema') },
      { label: 'Chiaro', type: 'radio', checked: config.tema === 'chiaro', click: () => impostaTema('chiaro') },
      { label: 'Scuro', type: 'radio', checked: config.tema === 'scuro', click: () => impostaTema('scuro') },
    ] },
    { label: 'Foto HEIC dell’iPhone in JPG', type: 'checkbox', checked: config.heicInJpg !== false,
      click: (m) => { config.heicInJpg = m.checked; salvaConfig(config); } },
    { label: 'Suoni', type: 'checkbox', checked: config.suoni !== false,
      click: (m) => { config.suoni = m.checked; salvaConfig(config); invia('dati', datiBordo()); } },
    { label: 'Modalità registrazione (nasconde i nomi dei file)', type: 'checkbox', checked: !!config.registrazione,
      click: (m) => { config.registrazione = m.checked; salvaConfig(config); invia('dati', datiBordo()); } },
    { type: 'separator' },
    { label: 'Esci', click: () => app.quit() },
  ]));
}

function impostaTema(t: Config['tema']) {
  config.tema = t; salvaConfig(config);
  nativeTheme.themeSource = t === 'chiaro' ? 'light' : t === 'scuro' ? 'dark' : 'system';
  aggiornaTray();
}

app.on('second-instance', () => demo('tutto'));

app.whenReady().then(() => {
  config = leggiConfig();
  nativeTheme.themeSource = config.tema === 'chiaro' ? 'light' : config.tema === 'scuro' ? 'dark' : 'system';
  if (SISTEMA === 'win32') app.setAppUserModelId('Fionda');
  if (SISTEMA === 'darwin') app.dock?.hide();

  ipcMain.on('pronto', () => {
    invia('dati', datiBordo());
    inviaTelefono();
    if (rete) invia('uscita', { fase: 'errore', inAttesa: rete.coda.quanti });
    if (process.env.FIONDA_DEMO && !pronto) setTimeout(() => demo((process.env.FIONDA_SCENA as ScenaDemo) || 'tutto'), 800);
    pronto = true;
  });
  let pronto = false;
  // file lasciati sul bordo → al telefono (subito se l'app è aperta, se no in attesa)
  ipcMain.on('lanciati', (_e, percorsi: unknown) => {
    if (!Array.isArray(percorsi)) return;
    const lista = percorsi.filter((p): p is string => typeof p === 'string');
    const esito = rete.accoda(lista);
    invia('uscita', esito);
    // nessun telefono collegato: si apre la riserva senza app con quei file già pronti
    if (esito.fase === 'nessuno') senzaApp.apri(lista);
    aggiornaTray();
  });
  ipcMain.on('fps', (_e, s: { media: number; peggiore: number; fotogrammi: number; particelle: number }) =>
    console.log(`[fps] media ${s.media.toFixed(1)} · peggiore ${s.peggiore.toFixed(1)} · ${s.fotogrammi} fotogrammi · ${s.particelle} particelle`));
  ipcMain.on('log', (_e, m: string) => console.log('[bordo]', m));
  ipcMain.on('abbina:pronta', () => rete.aggiornaFinestra());
  ipcMain.on('abbina:nuovo', () => rete.nuovoCodice());
  ipcMain.on('abbina:rimuovi', (_e, id: unknown) => { if (typeof id === 'string') { rete.rimuovi(id); aggiornaTray(); } });
  ipcMain.on('apri-cartella', () => rete.apriCartella());
  ipcMain.on('richiesta:pronta', (e) => e.sender.send('richiesta', rete.datiRichiesta()));
  ipcMain.on('richiesta:rispondi', (_e, si: unknown) => { rete.rispondiRichiesta(si === true); aggiornaTray(); });

  rete = new Rete(() => config, (a) => {
    if (a.fase === 'inizio') { if (telefono.stato !== 'VICINO') bordoDalMouse(); arriviInCorso++; }
    if (a.fase === 'fine' || a.fase === 'errore') arriviInCorso = Math.max(0, arriviInCorso - 1);
    invia('arrivo', a);
  }, () => ({ stato: telefono.stato, forza: telefono.forza, livello: telefono.livello }), (n) => (process.env.FIONDA_PROVA_VICINO && n.startsWith('FP-') ? { stato: 'VICINO', livello: 0.9 } : ascoltatore.statoDi(n)), PRELOAD, pagina, icona, (u) => { invia('uscita', u); if (u.fase === 'consegnato' || u.fase === 'errore') aggiornaTray(); });
  cronologia = new ArchivioCronologia(PRELOAD, pagina, icona, () => !!config.registrazione, () => rete.cartella());
  rete.alRegistro = (v) => cronologia.aggiungi(v);
  senzaApp = new SenzaApp(PRELOAD, pagina, icona, () => rete.nomePC(), () => rete.cartella());
  rete.ascoltaArrivi(senzaApp);
  // solo per le prove automatiche: apre subito la riserva senza app con questo file
  if (process.env.FIONDA_PROVA_SENZAAPP) setTimeout(() => senzaApp.apri([process.env.FIONDA_PROVA_SENZAAPP!]), 1500);
  rete.avvia().then(() => { if ((!rete.telefoni().length || process.env.FIONDA_CODICE_PROVA) && !process.env.FIONDA_DEMO) rete.apriFinestra(); });

  creaFinestra();
  tray = new Tray(nativeImage.createFromPath(icona).resize({ width: 16, height: 16, quality: 'best' }));
  if (SISTEMA === 'win32') tray.on('click', () => demo('tutto'));
  aggiornaTray();

  setInterval(giroMouse, 16);

  ascoltatore.on('telefono', (t: Telefono) => {
    const cambiato = t.stato !== telefono.stato;
    // il telefono è appena arrivato vicino: accendiamo il lato giusto PRIMA che parta la luce
    if (cambiato && t.stato === 'VICINO') bordoDalMouse();
    telefono = t;
    inviaTelefono();
    if (cambiato) aggiornaTray();
  });
  ascoltatore.on('bluetooth', () => aggiornaTray());
  if (!process.env.FIONDA_NO_BLUETOOTH) ascoltatore.avvia();

  nativeTheme.on('updated', () => invia('dati', datiBordo()));
  const rifai = () => { creaFinestra(); aggiornaTray(); };
  screen.on('display-added', rifai);
  screen.on('display-removed', rifai);
  screen.on('display-metrics-changed', rifai);
  console.log(`FIONDA pronta: bordo ${lato} dello schermo ${schermo.id} (${schermo.bounds.width}×${schermo.bounds.height}).`);
});

app.on('will-quit', () => { ascoltatore.ferma(); rete?.ferma(); senzaApp?.ferma(); });
app.on('window-all-closed', () => { /* resta nell'area di notifica */ });
