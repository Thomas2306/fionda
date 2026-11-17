# Sicurezza

Fionda passa file tra telefono e computer sulla rete di casa, quindi la sicurezza conta.

## Come è fatta
- Collegamento **HTTPS** sulla rete locale; il telefono accetta **solo il certificato del PC abbinato** (impronta letta dal QR o confermata coi 4 simboli).
- Il codice del QR vale **5 minuti e una volta sola**; dopo 5 tentativi sbagliati cambia.
- Collegamento avvicinando: accettato solo se il Bluetooth del PC sente **quel telefono** vicino, e serve comunque il clic su *Collega*.
- Sul PC resta solo l'**impronta** (hash) del gettone di ogni telefono.
- Nomi dei file ripuliti (niente `..\`, nomi vietati di Windows) e mai sovrascritti.
- La modalità *Senza app* usa un indirizzo segreto, è accesa solo con la sua finestra aperta e al massimo 15 minuti.

## Segnalare un problema di sicurezza
Per favore **non** aprire una Issue pubblica. Usa la funzione **"Report a vulnerability"** nella scheda *Security* del repository (segnalazione privata). Rispondo il prima possibile.
