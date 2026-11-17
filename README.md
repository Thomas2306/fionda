<p align="center"><img src="docs/brand/fionda-scritta-scura.png" alt="FIONDA" width="720"></p>

Mandi file tra **iPhone e computer** con un gesto: **avvicini il telefono**, il bordo dello schermo si accende e il file vola. Funziona sulla rete di casa: niente internet, niente account, niente cavi.

*Fling files between your iPhone and your computer: bring the phone close, the screen edge lights up and the file flies across. Local network only — no internet, no accounts. Windows first, macOS and Linux to be tested. Source available, free for non-commercial use.*

## Cosa fa
- **Dal telefono al PC**: su una foto, un video, un file o un link premi **Condividi → Fionda** e avvicina il telefono al PC. Sul bordo dello schermo si accende un'aura con particelle che "chiamano" il file, poi la cartolina con l'anteprima esce dal bordo. I file finiscono in `Download\Fionda`; testo e link negli appunti.
- **Dal PC al telefono**: trascini un file sul bordo dello schermo, si tende **l'elastico della fionda** e il file parte. Con l'app aperta arriva subito (foto e video nel rullino, il resto in File → Fionda); se l'app è chiusa ti aspetta e arriva appena la apri.
- **Collegamento avvicinando**: la prima volta avvicini il telefono al PC, su tutti e due compaiono **gli stessi 4 simboli** e premi *Collega*. Oppure col **codice QR**. Il collegamento vale finché non lo togli.
- **Il bordo giusto**: si accende il lato dello schermo più vicino al mouse, anche con più monitor (oppure un lato fisso, dal menu).
- **Senza app**: per un telefono che non ha Fionda, il PC mostra un QR: lo inquadri con la fotocamera e da Safari scarichi o mandi file (solo finché la finestra è aperta, al massimo 15 minuti).
- **Rifiniture**: suoni leggeri, vibrazioni sul telefono che crescono avvicinandosi, foto HEIC convertite in JPG, cronologia con *Apri / Mostra nella cartella*, modalità registrazione (nasconde i nomi dei file nei video), chiaro / scuro.

## Sicurezza, in breve
- Tutto passa sulla **rete di casa**, cifrato (HTTPS). Il telefono si fida **solo del certificato del tuo PC**, letto dal QR o confermato coi simboli: nessuno sulla stessa rete può fingersi il tuo PC.
- Per collegarsi avvicinando il Bluetooth del PC deve sentire **proprio quel telefono vicino**, e devi comunque premere *Collega*.
- Il PC tiene solo l'**impronta** del gettone di ogni telefono; i telefoni si tolgono con un clic.
- Il Bluetooth serve **solo a misurare la distanza**: i file non passano da lì. Fionda non accende e non cambia mai Bluetooth, rete o firewall: se serve un permesso, te lo chiede il sistema.

## Scaricare
### Programma per il PC
Nella pagina delle Release scegli il file del tuo sistema:
- **Windows**: `fionda-…-win-x64.exe`
- **macOS**: `fionda-…-mac-arm64.dmg` (Apple Silicon) o `…-mac-x64.dmg` (Intel). Non firmato: la prima volta clic destro → Apri.
- **Linux**: `…-linux-x86_64.AppImage` o `…-linux-amd64.deb`

macOS e Linux sono **da provare**: segnala pure i problemi nelle Issues.

**"Windows ha protetto il PC"**: il programma non è ancora firmato con un certificato a pagamento, quindi Windows avvisa le prime volte. Clic su **Ulteriori informazioni → Esegui comunque**. Il codice è tutto qui, pubblico, e lo puoi costruire da solo (sotto).

Alla prima apertura Windows chiede il permesso del **Firewall** per la rete: scegli **reti private** (quella di casa). Serve perché il telefono possa mandarti i file.

### App per iPhone
**Fionda** sull'App Store (gratis). Serve iOS 15.1 o più recente.

## Requisiti
- PC con **Bluetooth** (per "avvicina"; senza Bluetooth funziona tutto tranne l'effetto di vicinanza e il collegamento avvicinando: usa il QR).
- Telefono e PC sulla **stessa rete Wi‑Fi** di casa (le reti "ospiti" spesso isolano i dispositivi).

## Come funziona (per chi è curioso)
- PC: Electron + TypeScript. Una fascia trasparente lungo il bordo dello schermo, sempre sopra, che lascia passare i clic e si "sveglia" solo quando trascini un file. L'effetto è disegnato a 60 fps.
- Il telefono si annuncia via Bluetooth Low Energy; il PC misura la forza del segnale (con media e isteresi, per non lampeggiare).
- I file viaggiano su HTTPS nella rete locale; il PC si annuncia con Bonjour (`_fionda._tcp`).
- iPhone: Expo + moduli nativi in Swift (estensione Condividi, Bluetooth, rete).
- Tutte le differenze tra Windows, Mac e Linux stanno in un file: `pc/src/core/piattaforma.ts`.

## Contribuire
Segnalazioni e idee nelle **Issues**; per le modifiche vedi [CONTRIBUTING.md](CONTRIBUTING.md). Problemi di sicurezza: [SECURITY.md](SECURITY.md).

## Sviluppo
```bash
cd pc
npm install
npm run dev              # programma in sviluppo
npm test                 # test (Vitest)
npm run pacchetto:win    # installer Windows in pc/dist
```
L'app iPhone è in `iphone/` (Expo SDK 54; si compila con EAS perché ha codice nativo). Per vedere la grafica nel browser: `cd iphone && npx expo start --web`, poi `?schermata=home|avvicina|conferma|collegato|atterra|scanner`.

## Cosa esiste già
Ci sono ottimi progetti liberi per mandare file in rete locale, come **LocalSend** e **PairDrop**: Fionda prende da loro le idee buone (rete locale, certificato riconosciuto, QR) e aggiunge l'esperienza "avvicina e il file vola".

## Licenza
**PolyForm Noncommercial 1.0.0** — vedi [LICENSE.md](LICENSE.md).

In parole semplici: puoi **usare, studiare, modificare e condividere** Fionda gratis per uso personale, per studio, per hobby, in scuole, enti di ricerca e associazioni non profit. **Non** puoi usarla o rivenderla per scopi commerciali. Per un uso commerciale scrivimi aprendo una Issue.

*License: PolyForm Noncommercial 1.0.0 — free for personal, hobby, educational and non-profit use; commercial use is not allowed without permission.*
