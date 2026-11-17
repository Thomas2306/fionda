/**
 * Differenze tra Windows, Mac e Linux in un posto solo (come AGENT TOWER).
 * Puro (niente Electron): lo usano sia il processo principale sia l'interfaccia.
 */
export type Sistema = 'win32' | 'darwin' | 'linux';

export function sistema(p: string): Sistema {
  return p === 'darwin' ? 'darwin' : p === 'win32' ? 'win32' : 'linux';
}

export interface Capacita {
  /**
   * Come capiamo che stai trascinando qualcosa verso il bordo:
   * - 'tasto': leggiamo il tasto del mouse dal sistema (Windows) → la finestra si "sveglia" solo durante il trascinamento;
   * - 'striscia': una striscia sottilissima sul bordo resta sempre toccabile (Mac/Linux, da provare).
   */
  rilevaTrascinamento: 'tasto' | 'striscia';
  /** il desktop sa disegnare finestre trasparenti (su Linux dipende dal desktop: se no, effetto più semplice) */
  trasparenza: 'si' | 'dipende';
  /** il Bluetooth chiede un permesso al sistema la prima volta */
  permessoBluetooth: boolean;
}

export function capacita(s: Sistema): Capacita {
  if (s === 'win32') return { rilevaTrascinamento: 'tasto', trasparenza: 'si', permessoBluetooth: false };
  if (s === 'darwin') return { rilevaTrascinamento: 'striscia', trasparenza: 'si', permessoBluetooth: true };
  return { rilevaTrascinamento: 'striscia', trasparenza: 'dipende', permessoBluetooth: false };
}

/** Parole che cambiano da sistema a sistema. */
export function parole(s: Sistema) {
  const mac = s === 'darwin';
  return {
    sistema: mac ? 'macOS' : s === 'win32' ? 'Windows' : 'Linux',
    doveIcona: mac ? 'nella barra in alto' : s === 'win32' ? 'vicino all’orologio' : 'nella barra di sistema',
    impostazioniBluetooth: mac
      ? 'Impostazioni di Sistema → Bluetooth'
      : s === 'win32' ? 'Impostazioni → Bluetooth e dispositivi' : 'le impostazioni Bluetooth del desktop',
    esplora: mac ? 'Finder' : s === 'win32' ? 'Esplora file' : 'il gestore dei file',
  };
}
