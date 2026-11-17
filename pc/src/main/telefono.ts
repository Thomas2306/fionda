import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { creaVicinanza, forzaDaSegnale, livelloDaSegnale, type StatoTelefono } from '../core/vicinanza';

const richiedi = createRequire(__filename);

/** Servizio Bluetooth con cui l'app e il pannello Condividi di Fionda "si fanno sentire". */
export const SERVIZIO = 'f10da0005a1e4c6b9e3a2d7f00f10da1';

export type StatoBluetooth = 'acceso' | 'spento' | 'non autorizzato' | 'non disponibile' | 'in avvio';

export interface Telefono {
  stato: StatoTelefono;
  /** 0-1 per disegnare il bordo (solo da VICINO) */
  forza: number;
  /** 0-1 continuo, anche da lontano: per far crescere vibrazione e luce sul telefono mentre si avvicina */
  livello: number;
  nome: string;
  media: number | null;
}

interface Dispositivo { nome: string; v: ReturnType<typeof creaVicinanza>; visto: number }

/**
 * Ascolta il Bluetooth e tiene un filtro VICINO/LONTANO per ogni telefono con Fionda aperta.
 * Eventi: 'telefono' (il più vicino), 'bluetooth' (StatoBluetooth).
 * Non accende né cambia mai il Bluetooth del sistema: se è spento lo dice e basta.
 */
export class Ascoltatore extends EventEmitter {
  private dispositivi = new Map<string, Dispositivo>();
  private timer?: NodeJS.Timeout;
  private ultimo = '';
  private noble: any;
  bluetooth: StatoBluetooth = 'in avvio';
  attuale: Telefono = { stato: 'PERSO', forza: 0, livello: 0, nome: '', media: null };

  avvia() {
    try {
      this.noble = richiedi('@stoprocent/noble');
    } catch (e) {
      console.warn('[bluetooth] libreria non disponibile:', (e as Error).message);
      this.cambiaBluetooth('non disponibile');
      return;
    }
    this.noble.on('stateChange', async (s: string) => {
      this.cambiaBluetooth(s === 'poweredOn' ? 'acceso' : s === 'poweredOff' ? 'spento' : s === 'unauthorized' ? 'non autorizzato' : s === 'unsupported' ? 'non disponibile' : 'in avvio');
      if (s === 'poweredOn') {
        try { await this.noble.startScanningAsync([], true); } catch (e) { console.warn('[bluetooth] scansione:', (e as Error).message); }
      }
    });
    this.noble.on('discover', (p: any) => {
      const a = p.advertisement || {};
      const srv: string[] = (a.serviceUuids || []).map((s: string) => s.replace(/-/g, '').toLowerCase());
      const nome: string = a.localName || '';
      if (!srv.includes(SERVIZIO) && !nome.startsWith('FIONDA') && !nome.startsWith('FP-')) return;
      let d = this.dispositivi.get(p.id);
      if (!d) { d = { nome, v: creaVicinanza(), visto: 0 }; this.dispositivi.set(p.id, d); }
      if (nome) d.nome = nome;
      d.visto = Date.now();
      d.v.pacchetto(p.rssi, d.visto);
    });
    this.timer = setInterval(() => this.emetti(), 100);
  }

  /** Stato del dispositivo che si annuncia con questo nome (es. "FP-1a2b" durante il collegamento). */
  statoDi(nome: string): { stato: StatoTelefono; livello: number } {
    for (const d of this.dispositivi.values()) if (d.nome === nome) return { stato: d.v.tick(Date.now()), livello: livelloDaSegnale(d.v.media, d.v.stato) };
    return { stato: 'PERSO', livello: 0 };
  }

  private cambiaBluetooth(s: StatoBluetooth) {
    if (s === this.bluetooth) return;
    this.bluetooth = s;
    console.log('[bluetooth]', s);
    this.emit('bluetooth', s);
  }

  private emetti() {
    const ora = Date.now();
    let migliore: Dispositivo | undefined;
    for (const [id, d] of this.dispositivi) {
      const s = d.v.tick(ora);
      if (s === 'PERSO') { if (ora - d.visto > 60_000) this.dispositivi.delete(id); continue; }
      if (!migliore || (d.v.media ?? -999) > (migliore.v.media ?? -999)) migliore = d;
    }
    const stato: StatoTelefono = migliore?.v.stato ?? 'PERSO';
    const media = migliore?.v.media ?? null;
    const t: Telefono = { stato, forza: forzaDaSegnale(media, stato), livello: livelloDaSegnale(media, stato), nome: migliore?.nome ?? '', media };
    this.attuale = t;
    const chiave = `${t.stato}|${t.forza.toFixed(2)}|${t.livello.toFixed(2)}|${t.nome}`;
    if (chiave === this.ultimo) return;
    if (!this.ultimo.startsWith(t.stato + '|')) console.log(`[telefono] ${t.stato}${t.nome ? ` (${t.nome})` : ''}${t.media !== null ? ` media ${t.media.toFixed(1)} dBm` : ''}`);
    this.ultimo = chiave;
    this.emit('telefono', t);
  }

  ferma() {
    if (this.timer) clearInterval(this.timer);
    try { this.noble?.stopScanning(); } catch {}
  }
}
