/**
 * File che il PC deve consegnare al telefono (PC → telefono).
 * iPhone non può ricevere con l'app chiusa (niente server esterni, niente notifiche push):
 * il file resta qui IN ATTESA e parte appena apri Fionda sul telefono. Puro: si prova con Vitest.
 */
export interface FileInUscita {
  id: string;
  telefonoId: string;
  percorso: string;
  nome: string;
  dimensione: number;
  creato: number;
}

/** dopo una settimana un file mai ritirato si dimentica (il file sul PC resta dov'è) */
export const SCADENZA_MS = 7 * 24 * 3600 * 1000;

export class CodaUscita {
  constructor(public voci: FileInUscita[] = []) {}

  aggiungi(v: FileInUscita) { this.voci.push(v); }

  perTelefono(telefonoId: string, ora = Date.now()): FileInUscita[] {
    this.pulisci(ora);
    return this.voci.filter((v) => v.telefonoId === telefonoId);
  }

  trova(telefonoId: string, id: string): FileInUscita | undefined {
    return this.voci.find((v) => v.id === id && v.telefonoId === telefonoId);
  }

  togli(telefonoId: string, id: string): FileInUscita | undefined {
    const i = this.voci.findIndex((v) => v.id === id && v.telefonoId === telefonoId);
    return i < 0 ? undefined : this.voci.splice(i, 1)[0];
  }

  /** il telefono è stato rimosso: i suoi file non partono più */
  dimenticaTelefono(telefonoId: string) { this.voci = this.voci.filter((v) => v.telefonoId !== telefonoId); }

  svuota() { this.voci = []; }

  pulisci(ora = Date.now()) { this.voci = this.voci.filter((v) => ora - v.creato < SCADENZA_MS); }

  get quanti() { return this.voci.length; }
}

export interface TelefonoNoto { id: string; nome: string; ultimoContatto?: number }

/**
 * A quale telefono mandare il file lasciato sul bordo:
 * 1. quello con l'app aperta adesso (ha chiesto la coda negli ultimi 30 s);
 * 2. altrimenti quello sentito più di recente.
 */
export function telefonoDestinatario(telefoni: TelefonoNoto[], aperti: Map<string, number>, ora = Date.now()): TelefonoNoto | undefined {
  const apertiOra = telefoni.filter((t) => ora - (aperti.get(t.id) ?? 0) < 30_000);
  if (apertiOra.length) return apertiOra.sort((a, b) => (aperti.get(b.id) ?? 0) - (aperti.get(a.id) ?? 0))[0];
  return [...telefoni].sort((a, b) => (b.ultimoContatto ?? 0) - (a.ultimoContatto ?? 0))[0];
}
