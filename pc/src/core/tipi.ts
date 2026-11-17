import type { Lato } from './bordo';
import type { StatoTelefono } from './vicinanza';

/** Quello che il processo principale manda all'interfaccia del bordo. */
export interface DatiBordo {
  lato: Lato;
  /** dimensioni della fascia (finestra) */
  larghezza: number; altezza: number;
  tema: 'chiaro' | 'scuro';
  registrazione: boolean;
  /** suoni leggeri al lancio e all'arrivo */
  suoni: boolean;
}

export interface DatiMouse {
  /** cursore in coordinate della finestra */
  x: number; y: number;
  trascina: boolean;
  /** 0-1, quanto sei vicino al bordo durante un trascinamento */
  forza: number;
  /** solo demo: fa finta che sia già arrivato un file (dal vero lo dice dragenter) */
  file?: boolean;
}

export interface DatiTelefono {
  stato: StatoTelefono;
  /** 0-1, quanto accendere il bordo */
  forza: number;
  nome: string;
}

/** Scene della demo (menu "Prova l'effetto" e modalità FIONDA_DEMO per i video). */
export type ScenaDemo = 'telefono' | 'trascina' | 'arrivo' | 'tutto';
