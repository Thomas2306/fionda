import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export type Stato = {
  bluetooth?: string;
  bluetoothScansione?: string;
  annuncio?: 'attivo' | 'fermo' | 'errore';
  errore?: string;
};
export type Visto = { id: string; nome: string; rssi: number };
export type Ricevuto = { id: string; nome: string; dove: 'foto' | 'file'; percorso: string; miniatura: string; pc: string; quando: number };
export type FaseRicevi =
  | { fase: 'inizio'; id: string; nome: string; dimensione: number; pc: string }
  | { fase: 'avanzamento'; id: string; avanzamento: number }
  | ({ fase: 'fine' } & Ricevuto)
  | { fase: 'errore'; id?: string; messaggio: string };
export type FaseCollega =
  | { fase: 'cerco'; trovati: number }
  | { fase: 'avvicina'; pc: string; livello: number }
  | { fase: 'conferma'; pc: string; simboli: number[] }
  | { fase: 'collegato'; pc: string };

type Native = {
  servizio(): string;
  avviaAnnuncio(nome: string): void;
  fermaAnnuncio(): void;
  avviaScansione(): void;
  fermaScansione(): void;
  /** testo del QR del PC → abbina e salva (lo vede anche il pannello Condividi) */
  abbina(qr: string): Promise<{ pc: string }>;
  abbinamento(): { pc: string } | null;
  controlla(): Promise<'ok' | 'non abbinato' | 'non trovato' | 'nessuno'>;
  dimentica(): void;
  /** collegarsi avvicinando il telefono al PC (senza QR): eventi onCollega per l'animazione */
  collegaVicino(): Promise<{ pc: string }>;
  annullaCollega(): void;
  /** PC → telefono: con l'app aperta riceve i file in attesa (eventi onRicevi) */
  avviaRicezione(): void;
  fermaRicezione(): void;
  ricevuti(): Ricevuto[];
  cartellaFile(): string;
  visibile(): boolean;
  impostaVisibile(v: boolean): void;
  addListener(evento: 'onStato', cb: (s: Stato) => void): EventSubscription;
  addListener(evento: 'onVisto', cb: (v: Visto) => void): EventSubscription;
  addListener(evento: 'onCollega', cb: (f: FaseCollega) => void): EventSubscription;
  addListener(evento: 'onRicevi', cb: (f: FaseRicevi) => void): EventSubscription;
};

// null nel browser o in Expo Go: il modulo esiste solo nella build vera
export const FiondaBle = requireOptionalNativeModule<Native>('FiondaBle');
