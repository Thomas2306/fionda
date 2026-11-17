/**
 * L'effetto del bordo: aura di luce, particelle "richiamate" dal telefono, l'elastico della fionda
 * quando trascini un file, e il lancio. Tutto in coordinate del bordo (u lungo il lato, v verso l'interno),
 * così vale uguale per i quattro lati. Si disegna solo quando c'è qualcosa da mostrare (zero consumo a riposo).
 */
import type { ApiFionda } from '../preload';
import { aBordo, daBordo, lunghezzaLato, ZONA_RILASCIO, type Lato } from '../core/bordo';
import { avvicina, nuovaMolla, passoMolla } from '../core/molla';
import { Sciame, type Particella } from '../core/particelle';
import { svgGlifo, type NomeGlifo } from '../core/icone';
import { impostaSuoni, suonoArrivo, suonoCollegato, suonoConsegnato, suonoLancio } from './suoni';
import type { DatiBordo, DatiMouse, DatiTelefono } from '../core/tipi';

declare global { interface Window { fionda: ApiFionda } }
const api = window.fionda;

const tela = document.getElementById('tela') as HTMLCanvasElement;
const g = tela.getContext('2d', { alpha: true, desynchronized: true })!;
const etichetta = document.getElementById('etichetta')!;

// ---------- tavolozza (il nostro stile: notte viola, lavanda, ciano, bianco caldo) ----------
const TAVOLOZZE = {
  scuro: ['#7B5CFF', '#BBA8FF', '#5CE1FF', '#FFFFFF'],
  chiaro: ['#5B3BFF', '#8E6BFF', '#14A9DE', '#EEE8FF'],
};
let sprite: HTMLCanvasElement[] = [];
/** Un bagliore morbido già disegnato per colore: disegnarlo con drawImage costa pochissimo. */
function creaSprite(colore: string) {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!;
  const r = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, colore); r.addColorStop(0.18, colore + 'CC'); r.addColorStop(0.45, colore + '44'); r.addColorStop(1, colore + '00');
  x.fillStyle = r; x.fillRect(0, 0, n, n);
  return c;
}
function preparaColori(tema: 'chiaro' | 'scuro') { sprite = TAVOLOZZE[tema].map(creaSprite); }

// ---------- stato ricevuto ----------
let dati: DatiBordo = { lato: 'destra', larghezza: innerWidth, altezza: innerHeight, tema: 'scuro', registrazione: false, suoni: true };
let mouse: DatiMouse = { x: 0, y: 0, trascina: false, forza: 0 };
let telefono: DatiTelefono = { stato: 'PERSO', forza: 0, nome: '' };
let fileSentito = false;

let W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
function misura() {
  W = innerWidth; H = innerHeight; dpr = devicePixelRatio || 1;
  tela.width = Math.round(W * dpr); tela.height = Math.round(H * dpr);
}
addEventListener('resize', () => { misura(); sveglia(); });
misura(); preparaColori('scuro');

const lato = () => dati.lato as Lato;
const L = () => lunghezzaLato(lato(), W, H);
const aSchermo = (u: number, v: number) => daBordo(lato(), W, H, u, v);
const verticale = () => lato() === 'destra' || lato() === 'sinistra';

// ---------- animazione: valori morbidi ----------
let luceTelefono = 0;           // 0-1
let luceTrascina = 0;           // 0-1
let impulso = 0;                // lampo del lancio, si spegne da solo
const centro = nuovaMolla(0);   // dove si concentra la luce lungo il lato
let centroPronto = false;
const tensione = nuovaMolla(0); // l'elastico: 1 = teso verso il file, 0 = a riposo; rimbalza al rilascio
let tasca = { u: 0, v: 0 };     // dove sta il file (la "tasca" dell'elastico)
let tempo = 0;
const sciame = new Sciame();
let accumulo = 0;
let lampi: { u: number; eta: number; colore: number }[] = [];
let onde: { u: number; eta: number }[] = [];
let sfera: { u: number; v: number; vu: number; vv: number; eta: number } | null = null;

// ---------- input ----------
api.suDati((d) => {
  const vecchio = dati.tema;
  dati = d as DatiBordo;
  impostaSuoni(dati.suoni);
  if (dati.tema !== vecchio || !sprite.length) preparaColori(dati.tema);
  etichetta.classList.toggle('chiaro', dati.tema === 'chiaro');
  misura(); sveglia();
});
api.suMouse((m) => {
  mouse = m as DatiMouse;
  if (mouse.file) fileSentito = true;
  if (!mouse.trascina) fileSentito = !!mouse.file && fileSentito;
  sveglia();
});
api.suTelefono((t) => { telefono = t as DatiTelefono; sveglia(); });
api.suLancioDemo((l) => lancia(l.x, l.y, l.nomi));

// ---------- arrivi dal telefono ----------
interface DatiArrivo {
  fase: 'inizio' | 'avanzamento' | 'fine' | 'errore';
  id: string; nome: string; telefono: string; avanzamento: number; indice: number; quanti: number;
  miniatura?: string; genere?: string; dimensione?: string;
}
/** file in arrivo adesso (id → avanzamento 0-1) */
const inArrivo = new Map<string, number>();
let luceRicezione = 0;
/** le "cartoline" dei file arrivati: escono dal bordo, si fermano un attimo, poi svaniscono */
interface Cartolina { el: HTMLElement; u: number; v: ReturnType<typeof nuovaMolla>; scala: ReturnType<typeof nuovaMolla>; eta: number; durata: number }
let cartoline: Cartolina[] = [];
const contenitore = document.getElementById('cartoline')!;
const ICONE: Record<string, NomeGlifo> = { video: 'video', testo: 'link', altro: 'file', immagine: 'foto', collegato: 'telefono' };

api.suArrivo((x) => {
  const a = x as DatiArrivo;
  if (a.fase === 'inizio' || a.fase === 'avanzamento') {
    inArrivo.set(a.id, a.avanzamento);
    const pct = Math.round(a.avanzamento * 100);
    const nome = dati.registrazione ? 'un file' : a.nome;
    mostraEtichetta(`${a.quanti > 1 ? `${a.indice} di ${a.quanti} · ` : ''}Arriva ${nome} · ${pct}%`, L() * 0.5, 4000, 'telefono');
  } else {
    inArrivo.delete(a.id);
    if (a.fase === 'fine') nuovaCartolina(a);
    else mostraEtichetta(`Invio interrotto${dati.registrazione ? '' : ` · ${a.nome}`}`, L() * 0.5);
  }
  sveglia();
});

function nuovaCartolina(a: DatiArrivo) {
  const el = document.createElement('div');
  el.className = 'cartolina';
  const fig = document.createElement('div');
  fig.className = 'figura';
  if (a.miniatura && !dati.registrazione) { const img = document.createElement('img'); img.src = a.miniatura; fig.append(img); }
  else { fig.innerHTML = svgGlifo(ICONE[a.genere ?? 'altro'] ?? 'file', 64, 'url(#grad-cartolina)', 1.6); fig.classList.add('icona'); }
  const t = document.createElement('div'); t.className = 'nome'; t.textContent = dati.registrazione ? 'File ricevuto' : a.nome;
  const s = document.createElement('div'); s.className = 'da';
  s.textContent = a.genere === 'collegato' ? `${a.telefono} · ora vi riconoscete da soli` : `da ${a.telefono}${a.dimensione ? ` · ${a.dimensione}` : ''}`;
  el.append(fig, t, s);
  contenitore.append(el);
  // in fila lungo il bordo se ne arrivano tanti
  const u = L() * 0.5 + (cartoline.length % 3 - 1) * 70 + (Math.random() - 0.5) * 30;
  const v = nuovaMolla(-140); const scala = nuovaMolla(0.35);
  cartoline.push({ el, u, v, scala, eta: 0, durata: a.indice === a.quanti ? 3.4 : 1.6 });
  sciame.scoppio(u, 70);
  impulso = Math.max(impulso, 0.8);
  if (a.genere === 'collegato') suonoCollegato(); else suonoArrivo();
  onde.push({ u, eta: 0 });
  etichetta.classList.remove('vista');
}

// trascinamento vero di file (arriva solo quando il processo principale rende la finestra toccabile)
const haFile = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
const vicinoAlBordo = (x: number, y: number) => aBordo(lato(), W, H, x, y).v < ZONA_RILASCIO;
addEventListener('dragenter', (e) => { if (!haFile(e)) return; e.preventDefault(); fileSentito = true; sveglia(); });
addEventListener('dragover', (e) => {
  if (!haFile(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = vicinoAlBordo(e.clientX, e.clientY) ? 'copy' : 'none';
});
addEventListener('dragleave', (e) => { if (!e.relatedTarget && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= W || e.clientY >= H)) fileSentito = false; });
addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files ?? [])];
  if (!files.length || !vicinoAlBordo(e.clientX, e.clientY)) { fileSentito = false; return; }
  api.lanciati(files.map((f) => api.percorso(f)));
  // l'etichetta la decide la risposta del PC (parte subito / in attesa / nessun telefono)
  lancia(e.clientX, e.clientY, files.map((f) => f.name), false);
});

// ---------- PC → telefono ----------
interface DatiUscita {
  fase: 'nessuno' | 'accodato' | 'inizio' | 'avanzamento' | 'consegnato' | 'errore';
  nomi?: string[]; telefono?: string; subito?: boolean; avanzamento?: number; inAttesa: number; motivo?: string;
}
/** un file sta partendo verso il telefono: il bordo resta acceso e le particelle "escono" */
let inUscita = false;
const attesa = document.getElementById('attesa')!;
const nomeFile = (u: DatiUscita) => dati.registrazione || !u.nomi?.length ? 'Il file' : u.nomi.length > 1 ? `${u.nomi[0]} e altri ${u.nomi.length - 1}` : u.nomi[0];

api.suUscita((x) => {
  const u = x as DatiUscita;
  const centroU = L() * 0.5;
  if (u.fase === 'nessuno') mostraEtichetta('Nessun telefono collegato: ecco il QR per un telefono senza app', centroU, 4500, 'qr');
  else if (u.fase === 'accodato') mostraEtichetta(u.subito ? `${nomeFile(u)} → ${u.telefono}` : `${nomeFile(u)} ti aspetta: arriva quando apri Fionda su ${u.telefono}`, centroU, u.subito ? 2600 : 5000, u.subito ? 'su' : 'attesa');
  else if (u.fase === 'inizio' || u.fase === 'avanzamento') { inUscita = true; mostraEtichetta(`Invio a ${u.telefono} · ${Math.round((u.avanzamento ?? 0) * 100)}%`, centroU, 4000); }
  else if (u.fase === 'consegnato') {
    inUscita = false;
    suonoConsegnato();
    mostraEtichetta(`${nomeFile(u)} arrivato su ${u.telefono}`, centroU, 3200, 'spunta');
    impulso = 1; onde.push({ u: centroU, eta: 0 });
  } else if (u.fase === 'errore') { inUscita = false; if (u.motivo) mostraEtichetta(u.motivo, centroU, 4000); }
  // promemoria fisso dei file che aspettano il telefono
  attesa.innerHTML = svgGlifo('attesa', 14, '#bba8ff', 2);
  attesa.append(u.inAttesa === 1 ? '1 file aspetta il telefono' : `${u.inAttesa} file aspettano il telefono`);
  attesa.classList.toggle('vista', u.inAttesa > 0 && !inUscita);
  const p = aSchermo(L() - 40, 24);
  const r = attesa.getBoundingClientRect();
  attesa.style.left = `${Math.min(Math.max(8, p.x - r.width / 2), W - r.width - 8)}px`;
  attesa.style.top = `${Math.min(Math.max(8, p.y - r.height / 2), H - r.height - 8)}px`;
  sveglia();
});

// ---------- il lancio ----------
function lancia(x: number, y: number, nomi: string[], conEtichetta = true) {
  const p = aBordo(lato(), W, H, x, y);
  sfera = { u: p.u, v: Math.max(p.v, 14), vu: 0, vv: 160, eta: 0 }; // prima un piccolo "carica" all'indietro, poi parte
  fileSentito = false;
  // l'elastico scatta: parte teso e rimbalza
  tensione.valore = Math.max(tensione.valore, 1); tensione.velocita = 0;
  suonoLancio();
  const nome = dati.registrazione ? `${nomi.length} file` : nomi.length > 1 ? `${nomi[0]} e altri ${nomi.length - 1}` : nomi[0];
  if (conEtichetta) mostraEtichetta(nome, p.u);
  sveglia();
}

let timerEtichetta: number | undefined;
function mostraEtichetta(testo: string, u: number, durata = 2600, icona?: NomeGlifo) {
  etichetta.innerHTML = icona ? svgGlifo(icona, 16, 'currentColor', 2.2) : '';
  etichetta.append(testo);
  const r = etichetta.getBoundingClientRect();
  const v = 92;
  const p = aSchermo(Math.min(Math.max(u, 60), L() - 60), v);
  let x = p.x - r.width / 2, y = p.y - r.height / 2;
  if (lato() === 'destra') x = p.x - r.width; else if (lato() === 'sinistra') x = p.x;
  x = Math.min(Math.max(8, x), W - r.width - 8); y = Math.min(Math.max(8, y), H - r.height - 8);
  etichetta.style.left = `${x}px`; etichetta.style.top = `${y}px`;
  etichetta.classList.add('vista');
  clearTimeout(timerEtichetta);
  timerEtichetta = window.setTimeout(() => etichetta.classList.remove('vista'), durata);
}

// ---------- disegno ----------
/** Bagliore ellittico centrato in (u, v): `ru` lungo il lato, `rv` verso l'interno. */
function bagliore(colore: number, u: number, v: number, ru: number, rv: number, alfa: number) {
  if (alfa <= 0.002) return;
  const p = aSchermo(u, v);
  const [rx, ry] = verticale() ? [rv, ru] : [ru, rv];
  g.globalAlpha = Math.min(1, alfa);
  g.drawImage(sprite[colore], p.x - rx, p.y - ry, rx * 2, ry * 2);
}

function disegnaAura(I: number, uc: number) {
  if (I <= 0.003) return;
  const lungo = 240 + 420 * I;            // metà estensione lungo il lato
  const prof = 60 + 230 * I;              // quanto entra nello schermo
  const respiro = 1 + 0.06 * Math.sin(tempo * 2.1) * luceTelefono;
  // velo largo viola
  bagliore(0, uc, 0, lungo * 1.25 * respiro, prof * 1.3, 0.75 * I);
  // nuvole che si muovono piano (aurora): lavanda e ciano
  for (let k = 0; k < 4; k++) {
    const fase = tempo * (0.35 + k * 0.13) + k * 1.9;
    const u = uc + Math.sin(fase) * lungo * 0.5;
    const ru = lungo * (0.42 + 0.1 * Math.sin(fase * 1.3));
    bagliore(k % 2 ? 2 : 1, u, 0, ru, prof * (0.75 + 0.15 * Math.cos(fase)), 0.5 * I);
  }
  // cuore bianco
  bagliore(3, uc, 0, lungo * 0.4 * respiro, prof * 0.36, 0.9 * I);
  // filo di luce sul bordo
  const a = aSchermo(uc - lungo, 1.5), b = aSchermo(uc + lungo, 1.5);
  const lin = g.createLinearGradient(a.x, a.y, b.x, b.y);
  const bianco = dati.tema === 'chiaro' ? '91,59,255' : '255,255,255';
  lin.addColorStop(0, `rgba(${bianco},0)`); lin.addColorStop(0.5, `rgba(${bianco},${Math.min(1, 0.95 * I)})`); lin.addColorStop(1, `rgba(${bianco},0)`);
  g.globalAlpha = 1; g.strokeStyle = lin; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
}

function disegnaParticella(p: Particella) {
  const luce = Sciame.luce(p);
  if (luce <= 0.01) return;
  // le particelle risucchiate lasciano un filo: si vede che "vengono chiamate"
  if (p.tipo === 'richiamo' || p.tipo === 'scintilla') {
    const a = aSchermo(p.u, p.v), b = aSchermo(p.u - p.vu * 0.06, p.v - p.vv * 0.06);
    g.globalAlpha = luce * 0.55;
    g.strokeStyle = TAVOLOZZE[dati.tema][p.colore];
    g.lineWidth = p.dim * 0.9;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  bagliore(p.colore, p.u, p.v, p.dim * 4, p.dim * 4, luce * 0.9);
  bagliore(3, p.u, p.v, p.dim * 1.3, p.dim * 1.3, luce);
}

/** L'elastico della fionda: due fili dal bordo alla "tasca" dove sta il file. */
function disegnaElastico(I: number, uc: number) {
  if (I <= 0.01) return;
  const apertura = 120;
  const t = tensione.valore;
  // a riposo la tasca sta sul bordo; tesa, segue il file
  const tu = uc + (tasca.u - uc) * Math.max(-0.4, t);
  const tv = Math.max(-8, tasca.v * t);
  const ancore = [uc - apertura, uc + apertura];
  for (const passata of [{ w: 12, a: 0.25, c: 0 }, { w: 5, a: 0.45, c: 2 }, { w: 2.4, a: 1, c: 3 }]) {
    g.globalAlpha = passata.a * I;
    g.strokeStyle = TAVOLOZZE[dati.tema][passata.c];
    g.lineWidth = passata.w; g.lineCap = 'round';
    g.beginPath();
    const a0 = aSchermo(ancore[0], 0), c0 = aSchermo((ancore[0] + tu) / 2, tv * 0.55), m = aSchermo(tu, tv);
    const c1 = aSchermo((ancore[1] + tu) / 2, tv * 0.55), a1 = aSchermo(ancore[1], 0);
    g.moveTo(a0.x, a0.y); g.quadraticCurveTo(c0.x, c0.y, m.x, m.y); g.quadraticCurveTo(c1.x, c1.y, a1.x, a1.y);
    g.stroke();
  }
  // le due ancore sul bordo: piccoli punti luminosi
  for (const u of ancore) { bagliore(1, u, 0, 16, 16, 0.8 * I); bagliore(3, u, 0, 4, 4, I); }
  // il file nella tasca: una sfera che pulsa, più forte vicino al bordo
  if (!sfera && fileSentito) {
    const pul = 1 + 0.12 * Math.sin(tempo * 9);
    bagliore(0, tu, tv, 34 * pul, 34 * pul, 0.55 * I);
    bagliore(2, tu, tv, 16 * pul, 16 * pul, 0.75 * I);
    bagliore(3, tu, tv, 6, 6, I);
  }
}

function disegnaSfera() {
  if (!sfera) return;
  bagliore(0, sfera.u, sfera.v, 46, 46, 0.6);
  bagliore(2, sfera.u, sfera.v, 22, 22, 0.85);
  bagliore(3, sfera.u, sfera.v, 8, 8, 1);
}

// ---------- ciclo ----------
let vivo = false, ultimo = 0;
let statFotogrammi: number[] = [], statInizio = 0;

function sveglia() {
  if (vivo) return;
  vivo = true; ultimo = performance.now(); statInizio = ultimo; statFotogrammi = [];
  requestAnimationFrame(fotogramma);
}

function fotogramma(ora: number) {
  const dt = Math.min(0.05, Math.max(0.001, (ora - ultimo) / 1000));
  ultimo = ora; tempo += dt;
  statFotogrammi.push(dt);

  // obiettivi
  const vuoleTrascina = mouse.trascina ? (fileSentito ? 0.55 + 0.45 * mouse.forza : 0.3 * mouse.forza) : 0;
  luceTelefono = avvicina(luceTelefono, telefono.forza, dt, telefono.forza > luceTelefono ? 0.22 : 0.4);
  luceTrascina = avvicina(luceTrascina, vuoleTrascina, dt, 0.09);
  impulso = avvicina(impulso, 0, dt, 0.18);
  luceRicezione = avvicina(luceRicezione, inArrivo.size || inUscita ? 0.85 : 0, dt, 0.15);
  // file che parte verso il telefono: particelle risucchiate dal bordo (escono dallo schermo)
  if (inUscita) for (let i = 0; i < 2; i++) if (Math.random() < dt * 60) sciame.richiamo(L() * 0.5, 320, [40, 200]);
  if (inArrivo.size) for (let i = 0; i < 3; i++) if (Math.random() < dt * 60) sciame.ingresso(L() * 0.5, 360);

  // cartoline: escono dal bordo con un piccolo rimbalzo, restano, poi rientrano rimpicciolendo
  for (const c of cartoline) {
    c.eta += dt;
    const uscita = c.eta > c.durata;
    passoMolla(c.v, uscita ? 260 : 210, dt, 140, 0.55);
    passoMolla(c.scala, uscita ? 0 : 1, dt, uscita ? 90 : 160, uscita ? 1 : 0.6);
    const p = aSchermo(c.u, c.v.valore);
    const s = Math.max(0, c.scala.valore);
    c.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s}) rotate(${(1 - Math.min(1, s)) * -8}deg)`;
    c.el.style.opacity = String(Math.min(1, s * 1.4));
  }
  cartoline = cartoline.filter((c) => { const via = c.eta > c.durata + 0.9; if (via) c.el.remove(); return !via; });

  const m = aBordo(lato(), W, H, mouse.x, mouse.y);
  const uTelefono = L() * 0.5;
  const pesoTrascina = luceTrascina / Math.max(0.001, luceTrascina + luceTelefono * 0.6);
  const ucObiettivo = mouse.trascina || sfera ? (sfera ? sfera.u : m.u) : uTelefono * (1 - pesoTrascina) + centro.valore * pesoTrascina;
  if (!centroPronto) { centro.valore = ucObiettivo; centroPronto = true; }
  passoMolla(centro, ucObiettivo, dt, 90, 0.95);
  const uc = centro.valore;

  // l'elastico: teso mentre trascini un file, poi al rilascio scatta e rimbalza
  if (mouse.trascina && fileSentito) { tasca = { u: m.u, v: Math.max(0, m.v) }; passoMolla(tensione, 1, dt, 260, 0.9); }
  else passoMolla(tensione, 0, dt, 520, 0.16);

  // nascite
  accumulo += dt * (110 * luceTelefono + (fileSentito && mouse.trascina ? 70 : 0));
  while (accumulo >= 1) {
    accumulo -= 1;
    if (fileSentito && mouse.trascina && Math.random() < 0.55) sciame.orbita({ u: m.u, v: Math.max(0, m.v) });
    else if (luceTelefono > 0.02) sciame.richiamo(uc, 220 + 380 * luceTelefono, [50, 110 + 220 * luceTelefono]);
  }

  // la sfera lanciata: un attimo indietro (carica), poi via oltre il bordo, con la scia
  if (sfera) {
    sfera.eta += dt;
    if (sfera.eta < 0.09) { sfera.v += sfera.vv * dt; }
    else { sfera.vv -= 5200 * dt; if (sfera.vv > -200) sfera.vv = -200; sfera.v += sfera.vv * dt; }
    for (let i = 0; i < 4; i++) sciame.scia(sfera.u, sfera.v, sfera.vu, sfera.vv);
    if (sfera.v < -12) {
      sciame.scoppio(sfera.u, 110);
      impulso = 1;
      onde.push({ u: sfera.u, eta: 0 });
      sfera = null;
    }
  }

  sciame.passo(dt, { u: m.u, v: Math.max(0, m.v) });
  for (const a of sciame.arrivi) if (Math.random() < 0.35) lampi.push({ u: a.u, eta: 0, colore: a.colore });
  lampi = lampi.filter((l) => (l.eta += dt) < 0.3);
  onde = onde.filter((o) => (o.eta += dt) < 0.9);

  // disegno
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, tela.width, tela.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalCompositeOperation = dati.tema === 'chiaro' ? 'source-over' : 'lighter';

  const I = Math.min(1, luceTelefono * 0.9 + luceTrascina * 0.75 + impulso * 0.9 + luceRicezione * 0.8);
  disegnaAura(I, uc);
  for (const o of onde) {
    // l'onda del lancio corre lungo il bordo nei due versi
    const k = o.eta / 0.9, d = 40 + k * 620, a = (1 - k) * (1 - k);
    bagliore(2, o.u - d, 0, 90, 40, 0.8 * a); bagliore(2, o.u + d, 0, 90, 40, 0.8 * a);
    bagliore(3, o.u - d, 0, 26, 10, a); bagliore(3, o.u + d, 0, 26, 10, a);
  }
  for (const l of lampi) { const a = 1 - l.eta / 0.3; bagliore(l.colore, l.u, 0, 20, 10, 0.7 * a); }
  disegnaElastico(Math.max(luceTrascina * (fileSentito ? 1 : 0.4), Math.abs(tensione.valore) > 0.02 ? 0.9 : 0), uc);
  for (const p of sciame.particelle) disegnaParticella(p);
  disegnaSfera();
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

  // statistiche fps ogni 2 secondi mentre l'effetto è vivo
  if (ora - statInizio > 2000 && statFotogrammi.length > 10) {
    const fps = statFotogrammi.map((d) => 1 / d).sort((a, b) => a - b);
    const media = statFotogrammi.length / statFotogrammi.reduce((a, b) => a + b, 0);
    api.fps({ media, peggiore: fps[Math.floor(fps.length * 0.05)], fotogrammi: fps.length, particelle: sciame.particelle.length });
    statFotogrammi = []; statInizio = ora;
  }

  const fermo = I < 0.004 && luceTrascina < 0.004 && !sfera && !sciame.particelle.length && !lampi.length && !onde.length
    && Math.abs(tensione.valore) < 0.004 && Math.abs(tensione.velocita) < 0.01 && !mouse.trascina && telefono.forza === 0
    && !inArrivo.size && !inUscita && luceRicezione < 0.004 && !cartoline.length;
  if (fermo) {
    vivo = false;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, tela.width, tela.height);
    return;
  }
  requestAnimationFrame(fotogramma);
}

api.pronto();
