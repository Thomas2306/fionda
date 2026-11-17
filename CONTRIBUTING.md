# Contribuire a Fionda

Grazie se vuoi dare una mano!

## Segnalare un problema o un'idea
Apri una **Issue** e scegli il modello "Problema" o "Idea". Per un problema scrivi:
- sistema del computer (Windows / macOS / Linux, versione) e versione di Fionda;
- modello di iPhone e versione di iOS;
- cosa hai fatto, cosa ti aspettavi e cosa è successo;
- se puoi, il registro: avvia Fionda dal terminale (`cd pc && npx electron .`) e copia le righe che iniziano con `[`.

macOS e Linux sono **da provare**: ogni segnalazione da lì è preziosa.

## Proporre una modifica
1. Fai un fork e un ramo con un nome chiaro.
2. Programma per il PC:
   ```bash
   cd pc
   npm install
   npm test          # tutti i test devono passare
   npx tsc -p .      # nessun errore di tipi
   ```
3. Le differenze tra Windows, Mac e Linux stanno solo in `pc/src/core/piattaforma.ts`.
4. La logica pura va in `pc/src/core` con un test in `pc/test`.
5. Le icone sono in **un solo file**, uguale su PC e iPhone (`pc/src/core/icone.ts` = `iphone/ui/icone.ts`): se lo cambi, copialo in tutti e due i posti (un test lo controlla). Niente emoji nell'interfaccia.
6. App iPhone: la grafica si prova nel browser con `cd iphone && npx expo start --web` (`?schermata=home|avvicina|conferma|collegato|atterra|scanner|negato`); il codice nativo (Swift) si compila con EAS.
7. Apri una Pull Request spiegando cosa cambia e perché.

## Regole
- Niente dati che escono dalla rete di casa, niente account, niente statistiche.
- Fionda non cambia mai da sola Bluetooth, rete o firewall: se serve un permesso lo chiede il sistema.
- Contribuendo accetti che il tuo codice sia distribuito con la stessa licenza del progetto ([LICENSE.md](LICENSE.md)).
