// SOLO per l'anteprima nel browser (expo web): finge il modulo nativo per vedere la grafica
// di ogni schermata senza fare una build. Si sceglie con ?schermata=… nell'indirizzo.
//   nuovo · cerco · avvicina · conferma · collegato · home · atterra · scanner · negato · spento
import type { FaseCollega, FaseRicevi, Ricevuto } from '../modules/fionda-ble';

type Ascoltatore = (x: any) => void;

export function schermataAnteprima(): string {
  try { return new URLSearchParams(window.location.search).get('schermata') ?? 'home'; } catch { return 'home'; }
}

export function moduloFinto() {
  const sch = schermataAnteprima();
  const ascolta: Record<string, Ascoltatore[]> = {};
  const emetti = (ev: string, x: unknown) => (ascolta[ev] ?? []).forEach((f) => f(x));
  const abbinato = ['home', 'atterra'].includes(sch);
  const ricevuti: Ricevuto[] = [
    { id: '1', nome: 'IMG_2041.HEIC', dove: 'foto', percorso: '', miniatura: '', pc: 'Il mio PC', quando: Date.now() - 60_000 },
    { id: '2', nome: 'Preventivo cucina.pdf', dove: 'file', percorso: '/Fionda/Preventivo cucina.pdf', miniatura: '', pc: 'Il mio PC', quando: Date.now() - 3_600_000 },
  ];
  return {
    abbinamento: () => (abbinato ? { pc: 'Il mio PC' } : null),
    controlla: async () => 'ok' as const,
    visibile: () => true,
    impostaVisibile: () => {},
    ricevuti: () => (sch === 'home' ? ricevuti : []),
    cartellaFile: () => '/Fionda',
    avviaAnnuncio: () => {}, fermaAnnuncio: () => {},
    dimentica: () => {},
    annullaCollega: () => {},
    abbina: async () => ({ pc: 'Il mio PC' }),
    fermaRicezione: () => {},
    avviaRicezione: () => {
      if (sch !== 'atterra') return;
      const base = { id: 'x', nome: 'Vacanze al mare.jpg', pc: 'Il mio PC' };
      setTimeout(() => emetti('onRicevi', { ...base, fase: 'inizio', dimensione: 2_400_000 } satisfies FaseRicevi), 300);
      [0.25, 0.5, 0.75].forEach((p, i) => setTimeout(() => emetti('onRicevi', { id: 'x', fase: 'avanzamento', avanzamento: p } satisfies FaseRicevi), 700 + i * 350));
      setTimeout(() => emetti('onRicevi', { ...base, fase: 'fine', dove: 'foto', percorso: '', miniatura: '', quando: Date.now() } satisfies FaseRicevi), 2000);
    },
    collegaVicino: () => new Promise<{ pc: string }>((ok) => {
      const fasi: Record<string, FaseCollega> = {
        cerco: { fase: 'cerco', trovati: 0 },
        avvicina: { fase: 'avvicina', pc: 'Il mio PC', livello: 0.55 },
        conferma: { fase: 'conferma', pc: 'Il mio PC', simboli: [2, 1, 21, 8] },
        collegato: { fase: 'collegato', pc: 'Il mio PC' },
      };
      setTimeout(() => emetti('onCollega', fasi[sch] ?? fasi.cerco), 200);
      if (sch === 'negato' || sch === 'spento') setTimeout(() => emetti('onStato', { bluetooth: sch }), 300);
      if (sch === 'collegato') setTimeout(() => ok({ pc: 'Il mio PC' }), 999_999);
    }),
    addListener: (ev: string, f: Ascoltatore) => {
      (ascolta[ev] ??= []).push(f);
      return { remove: () => { ascolta[ev] = (ascolta[ev] ?? []).filter((x) => x !== f); } };
    },
  };
}
