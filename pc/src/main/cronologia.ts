import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, nativeImage, shell } from 'electron';
import { Cronologia, type VoceCronologia } from '../core/cronologia';

/**
 * Cronologia dei file passati (salvata in %APPDATA%\fionda\cronologia.json) e la sua finestrella:
 * elenco per giorno, miniature, Apri / Mostra nella cartella / Copia di nuovo.
 */
export class ArchivioCronologia {
  cronologia = new Cronologia(this.leggi());
  private finestra?: BrowserWindow;
  private miniature = new Map<string, string>();

  constructor(private preload: string, private pagina: (f: BrowserWindow, nome: string) => void,
              private icona: string, private registrazione: () => boolean, private cartella: () => string) {
    ipcMain.on('cronologia:pronta', () => this.invia());
    ipcMain.handle('cronologia:miniatura', (_e, id: unknown) => this.miniatura(String(id)));
    ipcMain.on('cronologia:apri', (_e, id: unknown, modo: unknown) => this.apri(String(id), String(modo)));
    ipcMain.on('cronologia:svuota', () => { this.cronologia.svuota(); this.salva(); this.invia(); });
    ipcMain.on('cronologia:cartella', () => shell.openPath(this.cartella()));
  }

  private file() { return path.join(app.getPath('userData'), 'cronologia.json'); }
  private leggi(): VoceCronologia[] { try { return JSON.parse(fs.readFileSync(this.file(), 'utf8')); } catch { return []; } }
  private salva() { try { fs.writeFileSync(this.file(), JSON.stringify(this.cronologia.voci)); } catch { /* pazienza */ } }

  aggiungi(v: VoceCronologia) {
    this.cronologia.aggiungi(v);
    this.salva();
    this.invia();
  }

  private invia() {
    if (!this.finestra || this.finestra.isDestroyed()) return;
    const nascondi = this.registrazione();
    this.finestra.webContents.send('cronologia', {
      gruppi: this.cronologia.perGiorno().map((g) => ({
        giorno: g.giorno,
        voci: g.voci.map((v) => ({
          ...v,
          nome: nascondi ? (v.verso === 'arrivato' ? 'File ricevuto' : 'File mandato') : v.nome,
          testo: nascondi ? undefined : v.testo,
          esiste: !v.percorso || fs.existsSync(v.percorso),
        })),
      })),
      vuota: !this.cronologia.voci.length,
      cartella: nascondi ? 'Download\\Fionda' : this.cartella(),
    });
  }

  private async miniatura(id: string): Promise<string | null> {
    if (this.registrazione()) return null;
    if (this.miniature.has(id)) return this.miniature.get(id)!;
    const v = this.cronologia.voci.find((x) => x.id === id);
    if (!v?.percorso || (v.genere !== 'immagine' && v.genere !== 'video') || !fs.existsSync(v.percorso)) return null;
    try {
      const m = (await nativeImage.createThumbnailFromPath(v.percorso, { width: 120, height: 120 })).toDataURL();
      this.miniature.set(id, m);
      return m;
    } catch { return null; }
  }

  private apri(id: string, modo: string) {
    const v = this.cronologia.voci.find((x) => x.id === id);
    if (!v) return;
    if (modo === 'copia' && v.testo) { clipboard.writeText(v.testo); return; }
    if (!v.percorso || !fs.existsSync(v.percorso)) return;
    if (modo === 'cartella') shell.showItemInFolder(v.percorso); else shell.openPath(v.percorso);
  }

  apriFinestra() {
    if (this.finestra && !this.finestra.isDestroyed()) { this.finestra.show(); this.finestra.focus(); return; }
    this.finestra = new BrowserWindow({
      width: 460, height: 640, minWidth: 380, minHeight: 420, title: 'Fionda — cronologia', show: false,
      backgroundColor: '#0b0a18', autoHideMenuBar: true, icon: this.icona,
      webPreferences: { preload: this.preload, sandbox: false, contextIsolation: true, nodeIntegration: false },
    });
    this.finestra.once('ready-to-show', () => this.finestra?.show());
    this.finestra.on('closed', () => { this.finestra = undefined; });
    this.pagina(this.finestra, 'cronologia');
  }
}
