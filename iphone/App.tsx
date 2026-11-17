// FIONDA — app iPhone: collegamento col PC (avvicinando o col QR), ricezione dal PC con l'app aperta,
// istruzioni. L'invio dal telefono parte dal pannello Condividi (targets/condividi).
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { FiondaBle, type FaseCollega, type FaseRicevi, type Ricevuto } from './modules/fionda-ble';
import { Glifo, GlifoLuce, Scintilla, Simbolo } from './ui/Icona';
import { Sfondo } from './ui/Sfondo';
import { moduloFinto, schermataAnteprima } from './ui/finto';
import type { NomeGlifo } from './ui/icone';

// sul telefono il modulo vero; nel browser (anteprima della grafica) uno finto
const Nativo = FiondaBle ?? (Platform.OS === 'web' ? (moduloFinto() as unknown as NonNullable<typeof FiondaBle>) : null);

const C = {
  notte: '#07070f', carta: 'rgba(22,19,48,0.78)', bordo: 'rgba(187,168,255,0.16)', viola: '#7b5cff',
  lavanda: '#bba8ff', ciano: '#5ce1ff', testo: '#f2efff', tenue: '#9a95c4', rosso: '#ff7a8a', verde: '#5be3a0',
};

type Collegamento = 'controllo' | 'ok' | 'non abbinato' | 'non trovato' | 'nessuno';

export default function App() {
  const [pc, setPc] = useState<string | null>(() => Nativo?.abbinamento()?.pc ?? null);
  const [collegamento, setCollegamento] = useState<Collegamento>('controllo');
  const [scanner, setScanner] = useState(() => Platform.OS === 'web' && schermataAnteprima() === 'scanner');
  const [annuncio, setAnnuncio] = useState(false);
  const [visibile, setVisibile] = useState(() => Nativo?.visibile() ?? true);
  const [ricevuti, setRicevuti] = useState<Ricevuto[]>(() => Nativo?.ricevuti() ?? []);
  const cambiaVisibile = (v: boolean) => { setVisibile(v); Nativo?.impostaVisibile(v); };

  const controlla = useCallback(async () => {
    if (!Nativo) return;
    const a = Nativo.abbinamento();
    setPc(a?.pc ?? null);
    if (!a) return setCollegamento('nessuno');
    setCollegamento('controllo');
    setCollegamento(await Nativo.controlla());
  }, []);

  useEffect(() => {
    controlla();
    const s = AppState.addEventListener('change', (st) => { if (st === 'active') controlla(); });
    return () => s.remove();
  }, [controlla]);

  // l'app aperta "si fa sentire" dal PC (per vedere il bordo che si accende)
  useEffect(() => {
    if (!Nativo) return;
    if (annuncio) Nativo.avviaAnnuncio('FIONDA'); else Nativo.fermaAnnuncio();
    return () => Nativo?.fermaAnnuncio();
  }, [annuncio]);

  // PC → telefono: con l'app aperta riceviamo i file in attesa sul PC; in secondo piano ci fermiamo
  useEffect(() => {
    if (!Nativo || !pc) return;
    const accendi = (st: string) => { if (st === 'active') Nativo?.avviaRicezione(); else Nativo?.fermaRicezione(); };
    accendi(AppState.currentState);
    const s = AppState.addEventListener('change', accendi);
    const r = Nativo.addListener('onRicevi', (e) => { if (e.fase === 'fine') setRicevuti(Nativo?.ricevuti() ?? []); });
    return () => { s.remove(); r.remove(); Nativo?.fermaRicezione(); };
  }, [pc]);

  const abbinato = (nome: string) => {
    setScanner(false);
    setPc(nome);
    setCollegamento('ok');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={s.tutto}>
      <StatusBar style="light" />
      <Sfondo />
      <ScrollView contentContainerStyle={s.scorre} showsVerticalScrollIndicator={false}>
        <Testa />
        {!Nativo && <Text style={s.errore}>Modulo nativo assente: serve la build vera, non Expo Go.</Text>}

        {!pc ? (
          <>
            {visibile && !scanner ? <Avvicina onFatto={abbinato} />
              : <Carta><Text style={s.grande}>Collega il tuo PC</Text>
                  <Text style={s.passo}>Accendi <Text style={s.forte}>Visibile ai dispositivi vicini</Text> qui sotto e avvicina il telefono al PC, oppure usa il codice QR.</Text></Carta>}
            <Bottone secondario icona="qr" testo="Usa il codice QR del PC" onPress={() => setScanner(true)} />
          </>
        ) : (
          <>
            <CartaCollegamento pc={pc} stato={collegamento} onRiabbina={() => setScanner(true)} />

            <Carta>
              <Etichetta>DAL TELEFONO AL PC</Etichetta>
              <Passo icona="condividi" titolo="Condividi → Fionda" testo="Da Foto, File o Safari, come fai con le altre app." />
              <Passo icona="onde" titolo="Avvicina il telefono al PC" testo="Il bordo dello schermo si accende e il file vola." />
              <Etichetta stile={{ marginTop: 18 }}>DAL PC AL TELEFONO</Etichetta>
              <Passo icona="destra" titolo="Trascina un file sul bordo del PC" testo="Con Fionda aperta arriva subito. Se è chiusa, ti aspetta e arriva appena la apri." />
            </Carta>

            {ricevuti.length > 0 && (
              <Carta>
                <Etichetta>RICEVUTI DAL PC</Etichetta>
                {ricevuti.slice(0, 4).map((v) => (
                  <Pressable key={v.id} style={({ pressed }) => [s.ricevuto, pressed && { opacity: 0.6 }]} onPress={() => apri(v)}>
                    {v.miniatura ? <Image source={{ uri: v.miniatura }} style={s.miniatura} />
                      : <Piastrella icona={v.dove === 'foto' ? 'foto' : 'file'} dim={44} />}
                    <View style={{ flex: 1 }}>
                      <Text style={s.ricevutoNome} numberOfLines={1}>{v.nome}</Text>
                      <Text style={s.tenue}>{v.dove === 'foto' ? 'Nel rullino di Foto' : 'In File → Fionda'}</Text>
                    </View>
                    <Glifo nome="destra" dim={18} colore={C.tenue} />
                  </Pressable>
                ))}
              </Carta>
            )}

            <ProvaBordo attiva={annuncio} onPress={() => setAnnuncio(!annuncio)} />
          </>
        )}

        <Carta stile={s.impostazione}>
          <Piastrella icona="onde" dim={40} />
          <View style={{ flex: 1 }}>
            <Text style={s.impostazioneTitolo}>Visibile ai dispositivi vicini</Text>
            <Text style={s.tenue}>Ti colleghi a un PC nuovo avvicinando il telefono.</Text>
          </View>
          <Switch value={visibile} onValueChange={cambiaVisibile} trackColor={{ true: C.viola, false: '#2a2650' }} thumbColor="#ffffff" ios_backgroundColor="#2a2650" />
        </Carta>

        {pc && (
          <Pressable onPress={() => { Nativo?.dimentica(); setPc(null); setCollegamento('nessuno'); }} style={s.link}>
            <Text style={s.linkTesto}>Dimentica questo PC</Text>
          </Pressable>
        )}
      </ScrollView>

      {pc && <Atterraggio />}

      <Modal visible={scanner} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setScanner(false)}>
        <Scanner onFatto={abbinato} onChiudi={() => setScanner(false)} />
      </Modal>
    </View>
  );
}

// ---------- pezzi riusati ----------

function Testa() {
  return (
    <View style={s.testa}>
      <View style={s.logo}><Image source={require('./assets/icon.png')} style={s.logoImmagine} /></View>
      <View>
        <Text style={s.titolo}>FIONDA</Text>
        <Text style={s.sottotitolo}>File tra telefono e PC, senza cavi</Text>
      </View>
    </View>
  );
}

function Carta({ children, stile }: { children: ReactNode; stile?: object }) {
  return <View style={[s.carta, stile]}>{children}</View>;
}

function Etichetta({ children, stile }: { children: ReactNode; stile?: object }) {
  return <Text style={[s.piccolo, stile]}>{children}</Text>;
}

/** Quadratino con l'icona a gradiente. */
function Piastrella({ icona, dim = 40 }: { icona: NomeGlifo; dim?: number }) {
  return (
    <View style={[s.piastrella, { width: dim, height: dim, borderRadius: dim * 0.3 }]}>
      <GlifoLuce nome={icona} dim={dim * 0.52} />
    </View>
  );
}

function Passo({ icona, titolo, testo }: { icona: NomeGlifo; titolo: string; testo: string }) {
  return (
    <View style={s.passoRiga}>
      <Piastrella icona={icona} dim={42} />
      <View style={{ flex: 1 }}>
        <Text style={s.passoTitolo}>{titolo}</Text>
        <Text style={s.tenue}>{testo}</Text>
      </View>
    </View>
  );
}

function Bottone({ testo, icona, onPress, secondario }: { testo: string; icona?: NomeGlifo; onPress: () => void; secondario?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [secondario ? s.secondo : s.primo, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}>
      {icona && <Glifo nome={icona} dim={19} colore={secondario ? C.lavanda : '#fff'} tratto={2} />}
      <Text style={secondario ? s.secondoTesto : s.primoTesto}>{testo}</Text>
    </Pressable>
  );
}

/** Apre dove è finito un file ricevuto: Foto oppure la cartella Fionda nell'app File. */
function apri(v: { dove: string; percorso: string }) {
  if (v.dove === 'foto') Linking.openURL('photos-redirect://').catch(() => {});
  else Linking.openURL('shareddocuments://' + encodeURI(v.percorso || Nativo?.cartellaFile() || '')).catch(() => {});
}

// ---------- telefono e PC collegati ----------

function CartaCollegamento({ pc, stato, onRiabbina }: { pc: string; stato: Collegamento; onRiabbina: () => void }) {
  const flusso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(flusso, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [flusso]);
  const vivo = stato === 'ok';
  return (
    <Carta>
      <View style={s.coppia}>
        <Piastrella icona="telefono" dim={58} />
        <View style={s.filo}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Animated.View key={i} style={[s.punto, {
              backgroundColor: vivo ? C.ciano : C.tenue,
              opacity: vivo ? flusso.interpolate({ inputRange: [0, (i + 0.5) / 5, 1], outputRange: [0.2, 1, 0.2] }) : 0.25,
              transform: [{ scale: vivo ? flusso.interpolate({ inputRange: [0, (i + 0.5) / 5, 1], outputRange: [0.8, 1.35, 0.8] }) : 1 }],
            }]} />
          ))}
        </View>
        <Piastrella icona="pc" dim={58} />
      </View>
      <Text style={[s.piccolo, { textAlign: 'center', marginTop: 16 }]}>COLLEGATO A</Text>
      <Text style={[s.grande, { textAlign: 'center' }]} numberOfLines={1}>{pc}</Text>
      <View style={{ alignItems: 'center' }}><StatoPC stato={stato} /></View>
      {stato === 'non trovato' && (
        <>
          <Text style={[s.tenue, { textAlign: 'center', marginTop: 10 }]}>Fionda è aperta sul PC, sulla stessa rete Wi‑Fi? Controlla anche Impostazioni → Fionda → Rete locale.</Text>
          <Bottone secondario testo="Apri Impostazioni" onPress={() => Linking.openSettings()} />
        </>
      )}
      {stato === 'non abbinato' && <Bottone testo="Collega di nuovo" icona="qr" onPress={onRiabbina} />}
    </Carta>
  );
}

function StatoPC({ stato }: { stato: Collegamento }) {
  if (stato === 'controllo') return <View style={s.pillola}><ActivityIndicator size="small" color={C.lavanda} /><Text style={s.pillolaTesto}>Cerco il PC sulla rete…</Text></View>;
  if (stato === 'ok') return <View style={s.pillola}><View style={[s.pallino, { backgroundColor: C.verde, shadowColor: C.verde }]} /><Text style={s.pillolaTesto}>Raggiungibile adesso</Text></View>;
  if (stato === 'non abbinato') return <Text style={s.errore}>Il PC non riconosce più questo telefono.</Text>;
  return <View style={s.pillola}><View style={[s.pallino, { backgroundColor: C.rosso, shadowColor: C.rosso }]} /><Text style={s.pillolaTesto}>Non lo trovo</Text></View>;
}

/** "Prova il bordo": il telefono si annuncia via Bluetooth e il bordo del PC si accende avvicinandolo. */
function ProvaBordo({ attiva, onPress }: { attiva: boolean; onPress: () => void }) {
  const onda = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!attiva) { onda.stopAnimation(); onda.setValue(0); return; }
    const giro = Animated.loop(Animated.timing(onda, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    giro.start();
    return () => giro.stop();
  }, [attiva, onda]);
  return (
    <Pressable onPress={onPress} style={[s.prova, attiva && s.provaAttiva]}>
      <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[s.provaOnda, { opacity: onda.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: onda.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] }]} />
        <Glifo nome="onde" dim={22} colore={attiva ? '#fff' : C.lavanda} tratto={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.passoTitolo}>{attiva ? 'Mi sto facendo sentire' : 'Prova il bordo'}</Text>
        <Text style={s.tenue}>{attiva ? 'Avvicina il telefono al PC: il bordo si accende.' : 'Il bordo del PC si accende avvicinando il telefono.'}</Text>
      </View>
    </Pressable>
  );
}

// ---------- collegarsi avvicinando ----------

/**
 * Cerchi di luce che pulsano sempre più forte, tacche del segnale, vibrazioni sempre più fitte,
 * poi i 4 simboli da confrontare col PC, poi il "collegati" con una vibrazione di festa.
 */
function Avvicina({ onFatto }: { onFatto: (pc: string) => void }) {
  const [fase, setFase] = useState<FaseCollega | { fase: 'errore'; messaggio: string }>({ fase: 'cerco', trovati: 0 });
  const [giro, setGiro] = useState(0);
  const livello = useRef(new Animated.Value(0)).current;
  const livelloOra = useRef(0);
  const [tacche, setTacche] = useState(0);
  const onda = useRef(new Animated.Value(0)).current;
  const simboli = useRef(new Animated.Value(0)).current;
  /** Bluetooth del telefono: se è negato o spento lo diciamo subito (senza, "avvicina" non può funzionare) */
  const [bluetooth, setBluetooth] = useState<string | undefined>();
  /** dopo 20 secondi senza trovare il PC, suggeriamo di controllare il permesso Rete locale */
  const [lento, setLento] = useState(false);

  useEffect(() => {
    if (!Nativo) return;
    const s = Nativo.addListener('onStato', (st) => { if (st.bluetooth) setBluetooth(st.bluetooth); });
    return () => s.remove();
  }, []);

  useEffect(() => {
    setLento(false);
    if (fase.fase !== 'cerco') return;
    const t = setTimeout(() => setLento(true), 20_000);
    return () => clearTimeout(t);
  }, [fase.fase, giro]);

  useEffect(() => {
    if (!Nativo) return;
    let vivo = true;
    const sub = Nativo.addListener('onCollega', (f) => {
      if (!vivo) return;
      setFase(f);
      const l = f.fase === 'avvicina' ? f.livello : f.fase === 'conferma' || f.fase === 'collegato' ? 1 : 0;
      livelloOra.current = l;
      setTacche(Math.round(l * 5));
      Animated.timing(livello, { toValue: l, duration: 300, useNativeDriver: true }).start();
      if (f.fase === 'conferma') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        simboli.setValue(0);
        Animated.spring(simboli, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
      }
    });
    Nativo.collegaVicino()
      .then((r) => { if (!vivo) return; Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setTimeout(() => onFatto(r.pc), 1100); })
      .catch((e) => { if (vivo) setFase({ fase: 'errore', messaggio: (e as Error).message }); });
    return () => { vivo = false; sub.remove(); Nativo?.annullaCollega(); };
  }, [giro]);

  useEffect(() => {
    const a = Animated.loop(Animated.timing(onda, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [onda]);

  // vibrazioni come un contatore Geiger: fitte e decise vicino al PC
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let fermo = false;
    const batti = () => {
      if (fermo) return;
      const l = livelloOra.current;
      if (fase.fase === 'avvicina' && l > 0.05) Haptics.impactAsync(l > 0.65 ? Haptics.ImpactFeedbackStyle.Rigid : Haptics.ImpactFeedbackStyle.Light);
      t = setTimeout(batti, Math.max(90, 800 - 680 * l));
    };
    batti();
    return () => { fermo = true; clearTimeout(t); };
  }, [fase.fase]);

  const anello = (ritardo: number) => {
    const v = Animated.modulo(Animated.add(onda, ritardo), 1);
    return {
      opacity: Animated.multiply(v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), livello.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] })),
      transform: [{ scale: Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }), livello.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] })) }],
    };
  };

  const titolo = fase.fase === 'cerco' ? 'Cerco il tuo PC'
    : fase.fase === 'avvicina' ? 'Avvicina il telefono al PC'
    : fase.fase === 'conferma' ? 'Gli stessi simboli sul PC?'
    : fase.fase === 'collegato' ? 'Collegati' : 'Non ci siamo riusciti';
  const sotto = fase.fase === 'cerco' ? 'Fionda deve essere aperta sul PC, sulla stessa rete di casa.'
    : fase.fase === 'avvicina' ? `Trovato ${fase.pc}. Avvicinati finché non compaiono i simboli.`
    : fase.fase === 'conferma' ? `Se su ${fase.pc} vedi gli stessi, premi Collega lì.`
    : fase.fase === 'collegato' ? `Da adesso ${fase.pc} ti riconosce da solo.` : fase.messaggio;
  const fatto = fase.fase === 'collegato';
  // permessi: hanno la precedenza sul resto, perché senza non si va avanti
  const permesso = bluetooth === 'negato'
    ? { titolo: 'Serve il Bluetooth', testo: 'Fionda lo usa solo per capire quando il telefono è vicino al PC. Attivalo in Impostazioni → Fionda → Bluetooth, oppure usa il codice QR.', impostazioni: true }
    : bluetooth === 'spento'
      ? { titolo: 'Il Bluetooth è spento', testo: 'Accendilo dal Centro di controllo, poi avvicina il telefono al PC. Oppure usa il codice QR.', impostazioni: false }
      : lento && fase.fase === 'cerco'
        ? { titolo: 'Non trovo il tuo PC', testo: 'Fionda è aperta sul PC, sulla stessa rete Wi‑Fi? Controlla anche che sia attivo Impostazioni → Fionda → Rete locale.', impostazioni: true }
        : null;

  return (
    <Carta stile={{ alignItems: 'center', paddingVertical: 26 }}>
      <View style={s.radar}>
        <Svg width={240} height={240} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="alone" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={fatto ? '#5be3a0' : '#7b5cff'} stopOpacity="0.55" />
              <Stop offset="1" stopColor="#07070f" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="120" cy="120" r="120" fill="url(#alone)" />
        </Svg>
        {[0, 0.33, 0.66].map((r) => <Animated.View key={r} style={[s.anello, anello(r)]} />)}
        <Animated.View style={[s.cuore, fatto && s.cuoreFatto, { transform: [{ scale: livello.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }]}>
          <Glifo nome={fatto ? 'spunta' : 'telefono'} dim={36} colore="#fff" tratto={2.2} />
        </Animated.View>
      </View>

      {fase.fase === 'conferma' ? (
        <View style={s.simboli}>
          {fase.simboli.map((n, i) => (
            <Animated.View key={i} style={[s.simbolo, { opacity: simboli, transform: [{ scale: simboli.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { translateY: simboli.interpolate({ inputRange: [0, 1], outputRange: [-14 * (i + 1), 0] }) }] }]}>
              <Simbolo n={n} dim={34} />
            </Animated.View>
          ))}
        </View>
      ) : (
        // tacche del segnale: si riempiono avvicinando il telefono
        <View style={s.tacche}>
          {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[s.tacca, { height: 8 + i * 5 }, i < tacche && s.taccaPiena]} />)}
        </View>
      )}
      <Text style={[s.grande, { textAlign: 'center', marginTop: 14 }]}>{permesso?.titolo ?? titolo}</Text>
      <Text style={[s.tenue, { textAlign: 'center', paddingHorizontal: 6 }]}>{permesso?.testo ?? sotto}</Text>
      {permesso?.impostazioni && <Bottone testo="Apri Impostazioni" onPress={() => Linking.openSettings()} />}
      {fase.fase === 'errore' && <Bottone testo="Riprova" onPress={() => { setFase({ fase: 'cerco', trovati: 0 }); setGiro((g) => g + 1); }} />}
    </Carta>
  );
}

// ---------- PC → telefono: il file atterra ----------

/**
 * Il file "atterra": la cartolina cade dall'alto (dal PC) con la barra che sale, poi rimbalzo,
 * scoppio di scintille e vibrazione forte. Tocca la cartolina per aprirlo.
 */
function Atterraggio() {
  type A = { id: string; nome: string; pc: string; fine?: Ricevuto };
  const [a, setA] = useState<A | null>(null);
  const caduta = useRef(new Animated.Value(0)).current;
  const scoppio = useRef(new Animated.Value(0)).current;
  const barra = useRef(new Animated.Value(0)).current;
  const quarto = useRef(0);
  const via = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!Nativo) return;
    const sub = Nativo.addListener('onRicevi', (e: FaseRicevi) => {
      if (e.fase === 'inizio') {
        clearTimeout(via.current);
        quarto.current = 0;
        setA({ id: e.id, nome: e.nome, pc: e.pc });
        caduta.setValue(0); scoppio.setValue(0); barra.setValue(0);
        Animated.spring(caduta, { toValue: 0.55, friction: 7, tension: 40, useNativeDriver: true }).start();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (e.fase === 'avanzamento') {
        Animated.timing(barra, { toValue: e.avanzamento, duration: 120, useNativeDriver: false }).start();
        const q = Math.floor(e.avanzamento * 4);
        if (q > quarto.current) { quarto.current = q; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
      } else if (e.fase === 'fine') {
        setA((p) => ({ id: e.id, nome: e.nome, pc: e.pc, ...(p ?? {}), fine: e }));
        barra.setValue(1);
        Animated.parallel([
          Animated.spring(caduta, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
          Animated.timing(scoppio, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 160);
        via.current = setTimeout(() => setA(null), Platform.OS === 'web' ? 60_000 : 4200);
      } else if (e.fase === 'errore') {
        setA(null);
      }
    });
    return () => { sub.remove(); clearTimeout(via.current); };
  }, []);

  if (!a) return null;
  const y = caduta.interpolate({ inputRange: [0, 0.55, 1], outputRange: [-560, -40, 0] });
  const scala = caduta.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.35, 0.85, 1] });
  const genere: NomeGlifo = /\.(mov|mp4|m4v)$/i.test(a.nome) ? 'video' : /\.(jpe?g|png|heic|heif|gif|webp)$/i.test(a.nome) ? 'foto' : 'file';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={s.velo} pointerEvents="none" />
      {Array.from({ length: 16 }).map((_, i) => {
        const ang = (i / 16) * Math.PI * 2;
        const lontano = 130 + (i % 3) * 40;
        return (
          <Animated.View key={i} pointerEvents="none" style={[s.scintillaArrivo, {
            opacity: scoppio.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: scoppio.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * lontano] }) },
              { translateY: scoppio.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(ang) * lontano] }) },
              { rotate: scoppio.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 180}deg`] }) },
            ],
          }]}>
            <Scintilla dim={i % 3 === 0 ? 16 : 11} colore={i % 3 === 0 ? C.ciano : i % 3 === 1 ? C.lavanda : '#fff'} />
          </Animated.View>
        );
      })}
      <Animated.View style={[s.atterra, { transform: [{ translateY: y }, { scale: scala }] }]}>
        <Pressable onPress={() => a.fine && apri(a.fine)}>
          {a.fine?.miniatura ? <Image source={{ uri: a.fine.miniatura }} style={s.atterraFoto} />
            : <View style={[s.atterraFoto, s.centro]}><GlifoLuce nome={genere} dim={72} tratto={1.5} /></View>}
          <Text style={s.ricevutoNome} numberOfLines={1}>{a.nome}</Text>
          <View style={[s.passoRiga, { marginTop: 4 }]}>
            {a.fine && <Glifo nome="spunta" dim={16} colore={C.verde} tratto={2.4} />}
            <Text style={s.tenue}>{a.fine ? (a.fine.dove === 'foto' ? `Da ${a.pc} · nel rullino` : `Da ${a.pc} · in File → Fionda`) : `Arriva da ${a.pc}…`}</Text>
          </View>
          {!a.fine && (
            <View style={s.binario}>
              <Animated.View style={[s.barraArrivo, { width: barra.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ---------- QR ----------

function Scanner({ onFatto, onChiudi }: { onFatto: (pc: string) => void; onChiudi: () => void }) {
  const [permesso, chiedi] = useCameraPermissions();
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const occupato = useRef(false);
  const linea = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(linea, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(linea, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [linea]);

  const letto = async ({ data }: { data: string }) => {
    if (occupato.current || !Nativo) return;
    if (!data.startsWith('FIONDA1:')) { setErrore('Questo non è un codice di Fionda.'); return; }
    occupato.current = true; setLavoro(true); setErrore(null);
    try {
      const r = await Nativo.abbina(data);
      onFatto(r.pc);
    } catch (e) {
      setErrore((e as Error).message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => { occupato.current = false; }, 1500);
    } finally { setLavoro(false); }
  };

  const consentito = permesso?.granted || Platform.OS === 'web';
  return (
    <View style={s.scanner}>
      {permesso?.granted ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={letto} />
      ) : Platform.OS === 'web' ? <Sfondo /> : (
        <View style={{ padding: 20, marginTop: 140 }}>
          <Carta>
            <Piastrella icona="qr" dim={52} />
            <Text style={[s.grande, { marginTop: 14 }]}>Serve la fotocamera</Text>
            <Text style={s.passo}>Solo per leggere il codice QR sul PC. Nessuna foto viene salvata o inviata.</Text>
            {permesso && !permesso.canAskAgain
              ? <>
                  <Text style={[s.tenue, { marginTop: 8 }]}>L'avevi negata: attivala in Impostazioni → Fionda → Fotocamera. Oppure collegati avvicinando il telefono al PC.</Text>
                  <Bottone testo="Apri Impostazioni" onPress={() => Linking.openSettings()} />
                </>
              : <Bottone testo="Consenti" onPress={chiedi} />}
          </Carta>
        </View>
      )}
      {consentito && (
        <View style={s.mirino} pointerEvents="none">
          {(['tl', 'tr', 'bl', 'br'] as const).map((k) => <View key={k} style={[s.angolo, s[k]]} />)}
          <Animated.View style={[s.lineaScan, { transform: [{ translateY: linea.interpolate({ inputRange: [0, 1], outputRange: [8, 232] }) }] }]} />
        </View>
      )}
      <View style={s.scannerPiede}>
        {lavoro ? <View style={s.pillola}><ActivityIndicator color="#fff" /><Text style={s.pillolaTesto}>Mi collego al PC…</Text></View>
          : errore ? <Text style={[s.errore, { fontSize: 15 }]}>{errore}</Text>
          : <Text style={s.bianco}>Inquadra il codice QR che vedi sul PC</Text>}
        <Pressable onPress={onChiudi} style={s.chiudi}><Glifo nome="chiudi" dim={20} colore="#fff" tratto={2.2} /></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tutto: { flex: 1, backgroundColor: C.notte },
  scorre: { paddingTop: 66, paddingHorizontal: 18, paddingBottom: 40 },
  testa: { flexDirection: 'row', alignItems: 'center', marginBottom: 22, gap: 14 },
  logo: { width: 50, height: 50, borderRadius: 15, overflow: 'hidden', backgroundColor: C.notte, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.viola, shadowOpacity: 0.9, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  logoImmagine: { width: 50, height: 50 },
  titolo: { color: C.testo, fontSize: 26, fontWeight: '800', letterSpacing: 7 },
  sottotitolo: { color: C.tenue, fontSize: 13, marginTop: 1 },
  carta: { backgroundColor: C.carta, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C.bordo, marginBottom: 14 },
  piccolo: { color: C.tenue, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6 },
  grande: { color: C.testo, fontSize: 23, fontWeight: '800', marginBottom: 6 },
  passo: { color: C.testo, fontSize: 15.5, lineHeight: 22, marginTop: 6 },
  forte: { fontWeight: '700', color: C.lavanda },
  tenue: { color: C.tenue, fontSize: 14, lineHeight: 19, flexShrink: 1 },
  piastrella: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(123,92,255,0.16)', borderWidth: 1, borderColor: 'rgba(187,168,255,0.22)' },
  passoRiga: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  passoTitolo: { color: C.testo, fontWeight: '700', fontSize: 15.5, marginBottom: 1 },
  coppia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 4 },
  filo: { flexDirection: 'row', gap: 7 },
  punto: { width: 7, height: 7, borderRadius: 4 },
  pillola: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.bordo, marginTop: 6 },
  pillolaTesto: { color: C.testo, fontSize: 13.5 },
  pallino: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  primo: { flexDirection: 'row', gap: 9, backgroundColor: C.viola, borderRadius: 16, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 16, alignSelf: 'stretch',
    shadowColor: C.viola, shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primoTesto: { color: '#fff', fontSize: 16.5, fontWeight: '700' },
  secondo: { flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 16, backgroundColor: C.carta, borderWidth: 1, borderColor: C.bordo, marginBottom: 14 },
  secondoTesto: { color: C.lavanda, fontWeight: '700', fontSize: 15 },
  errore: { color: C.rosso, marginTop: 8, textAlign: 'center' },
  link: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  linkTesto: { color: C.tenue, textDecorationLine: 'underline' },
  ricevuto: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  ricevutoNome: { color: C.testo, fontWeight: '700', fontSize: 15.5, marginTop: 2 },
  miniatura: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1d1840' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  prova: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 22, backgroundColor: C.carta, borderWidth: 1, borderColor: C.bordo, marginBottom: 14 },
  provaAttiva: { backgroundColor: 'rgba(91,59,255,0.45)', borderColor: C.lavanda },
  provaOnda: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: C.viola },
  impostazione: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  impostazioneTitolo: { color: C.testo, fontWeight: '700', fontSize: 15, marginBottom: 2 },
  radar: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  anello: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 1.5, borderColor: C.lavanda, backgroundColor: 'rgba(123,92,255,0.12)' },
  cuore: { width: 92, height: 92, borderRadius: 46, backgroundColor: C.viola, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: C.ciano, shadowOpacity: 0.8, shadowRadius: 26, shadowOffset: { width: 0, height: 0 } },
  cuoreFatto: { backgroundColor: '#2fbf83', shadowColor: C.verde },
  tacche: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 30 },
  tacca: { width: 7, borderRadius: 3, backgroundColor: 'rgba(187,168,255,0.18)' },
  taccaPiena: { backgroundColor: C.ciano, shadowColor: C.ciano, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  simboli: { flexDirection: 'row', gap: 10, marginTop: 2 },
  simbolo: { width: 60, height: 60, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.bordo, alignItems: 'center', justifyContent: 'center' },
  velo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,7,15,0.62)' },
  scintillaArrivo: { position: 'absolute', top: '42%', left: '50%', marginLeft: -6 },
  atterra: { position: 'absolute', top: '20%', alignSelf: 'center', width: 270, padding: 12, borderRadius: 28, backgroundColor: '#15122e', borderWidth: 1, borderColor: 'rgba(187,168,255,0.5)',
    shadowColor: C.viola, shadowOpacity: 0.9, shadowRadius: 34, shadowOffset: { width: 0, height: 12 } },
  atterraFoto: { width: '100%', height: 210, borderRadius: 20, backgroundColor: '#1d1840', marginBottom: 6 },
  binario: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 12, overflow: 'hidden' },
  barraArrivo: { height: 6, borderRadius: 3, backgroundColor: C.ciano },
  scanner: { flex: 1, backgroundColor: '#000' },
  mirino: { position: 'absolute', alignSelf: 'center', top: '26%', width: 250, height: 250 },
  angolo: { position: 'absolute', width: 44, height: 44, borderColor: C.lavanda },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 22 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 22 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 22 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 22 },
  lineaScan: { position: 'absolute', left: 14, right: 14, height: 2, borderRadius: 1, backgroundColor: C.ciano, shadowColor: C.ciano, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  scannerPiede: { position: 'absolute', bottom: 56, left: 24, right: 24, alignItems: 'center' },
  chiudi: { marginTop: 20, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  bianco: { color: '#fff', fontSize: 16, textAlign: 'center' },
});
