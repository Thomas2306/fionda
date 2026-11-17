/**
 * Abbinamento telefono ↔ PC con un QR, senza internet e senza account.
 *
 * Il QR contiene: nome del PC, indirizzi sulla rete di casa, porta, un codice usa-e-getta (5 minuti)
 * e l'impronta del certificato del PC. Il telefono si collega SOLO a un server con quell'impronta
 * (così nessuno sulla stessa rete può fingersi il tuo PC), manda il codice e riceve un gettone personale.
 * Sul PC teniamo solo l'impronta (hash) del gettone, mai il gettone in chiaro.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const VERSIONE_PROTOCOLLO = 1;
export const PREFISSO_QR = 'FIONDA1:';
export const DURATA_CODICE_MS = 5 * 60 * 1000;

export interface DatiQR {
  /** versione del protocollo */
  v: number;
  /** nome del PC */
  n: string;
  /** indirizzi IPv4 sulla rete di casa */
  h: string[];
  /** porta */
  p: number;
  /** codice usa-e-getta */
  c: string;
  /** impronta SHA-256 del certificato (esadecimale) */
  f: string;
}

export interface TelefonoAbbinato {
  id: string;
  nome: string;
  /** sha256 del gettone */
  impronta: string;
  aggiunto: number;
  ultimoContatto?: number;
}

/** Testo del QR: corto (QR più semplice da inquadrare) e riconoscibile. */
export function codificaQR(d: DatiQR): string {
  return PREFISSO_QR + Buffer.from(JSON.stringify(d), 'utf8').toString('base64url');
}

export function decodificaQR(testo: string): DatiQR | null {
  if (!testo.startsWith(PREFISSO_QR)) return null;
  try {
    const d = JSON.parse(Buffer.from(testo.slice(PREFISSO_QR.length), 'base64url').toString('utf8'));
    if (typeof d?.n !== 'string' || !Array.isArray(d.h) || typeof d.p !== 'number' || typeof d.c !== 'string' || typeof d.f !== 'string') return null;
    return d as DatiQR;
  } catch { return null; }
}

/**
 * Collegamento AVVICINANDO (senza QR): telefono e PC mostrano gli stessi 4 simboli (forme disegnate, core/icone.ts), calcolati da
 * impronta del certificato + numeri del telefono. Se qualcuno sulla rete si fingesse il PC, i simboli
 * sul telefono sarebbero diversi da quelli sul PC. La stessa lista e lo stesso calcolo stanno in Swift.
 */
/** quanti simboli diversi (16 forme × 2 colori: vedi core/icone.ts) */
export const QUANTI_SIMBOLI = 32;

export function simboliCollegamento(improntaCert: string, nonce: string, sessione: string): number[] {
  const h = createHash('sha256').update(`${improntaCert.toLowerCase()}|${nonce}|${sessione}`, 'utf8').digest();
  return [0, 1, 2, 3].map((i) => h[i] % QUANTI_SIMBOLI);
}

/** Nome Bluetooth con cui il telefono si annuncia mentre cerca di collegarsi: "FP-" + 4 cifre esadecimali. */
export function nomeSessione(sessione: string) { return `FP-${sessione}`; }
export function sessioneValida(s: unknown): s is string { return typeof s === 'string' && /^[0-9a-f]{4}$/.test(s); }

export function nuovoCodice(): string { return randomBytes(12).toString('base64url'); }
export function nuovoGettone(): string { return randomBytes(32).toString('base64url'); }
export function impronta(gettone: string): string { return createHash('sha256').update(gettone, 'utf8').digest('hex'); }

/** Confronto a tempo costante (non si indovina il gettone misurando i tempi di risposta). */
export function stessoTesto(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8'), y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cerca il telefono a cui appartiene il gettone. */
export function telefonoDaGettone(telefoni: TelefonoAbbinato[], gettone: string | undefined): TelefonoAbbinato | undefined {
  if (!gettone) return undefined;
  const h = impronta(gettone);
  return telefoni.find((t) => stessoTesto(t.impronta, h));
}

export interface CodiceAttivo { codice: string; scade: number }

export function codiceValido(attivo: CodiceAttivo | undefined, codice: unknown, ora: number): boolean {
  return !!attivo && typeof codice === 'string' && ora < attivo.scade && stessoTesto(attivo.codice, codice);
}

/**
 * Indirizzi da mettere nel QR: IPv4 non interni, prima le reti di casa (192.168, 10, 172.16-31),
 * niente indirizzi "di emergenza" (169.254) né quelli delle VPN tipo Tailscale (100.64-127).
 */
export function indirizziDiCasa(interfacce: Record<string, { address: string; family: string | number; internal: boolean }[] | undefined>): string[] {
  const tutti: string[] = [];
  // schede di rete finte (macchine virtuali, WSL, Docker, VPN): il telefono non le raggiunge mai
  const virtuale = /virtualbox|vmware|vethernet|hyper-v|wsl|docker|vbox|tailscale|zerotier|loopback|utun|bridge/i;
  for (const [nome, lista] of Object.entries(interfacce)) for (const i of virtuale.test(nome) ? [] : lista ?? []) {
    const v4 = i.family === 'IPv4' || i.family === 4;
    if (!v4 || i.internal) continue;
    const [a, b] = i.address.split('.').map(Number);
    if (a === 169 && b === 254) continue;
    if (a === 100 && b >= 64 && b <= 127) continue;
    tutti.push(i.address);
  }
  const casa = (ip: string) => { const [a, b] = ip.split('.').map(Number); return a === 192 && b === 168 ? 0 : a === 10 ? 1 : a === 172 && b >= 16 && b <= 31 ? 2 : 3; };
  return [...new Set(tutti)].sort((x, y) => casa(x) - casa(y)).slice(0, 4);
}
