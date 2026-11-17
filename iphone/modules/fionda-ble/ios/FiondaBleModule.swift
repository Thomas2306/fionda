import CoreBluetooth
import ExpoModulesCore
import UIKit

// Modulo nativo di Fionda: Bluetooth (annuncio/scansione), abbinamento col PC (QR o avvicinando).
// - Annuncio: il telefono "si fa sentire" con il servizio Fionda + un nome corto. Il PC misura la forza del segnale.
// - Scansione (piano B): il telefono ascolta il PC che si fa sentire, e misura lui la forza del segnale.
public class FiondaBleModule: Module {
  static let servizio = CBUUID(string: "F10DA000-5A1E-4C6B-9E3A-2D7F00F10DA1")

  private var periferica: CBPeripheralManager?
  private var centrale: CBCentralManager?
  private var delegato: Delegato?
  private var nomeDaAnnunciare: String?
  private var scansioneVoluta = false
  private var collegamento: Task<Abbinamento, Error>?
  private var ricezione: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("FiondaBle")
    Events("onStato", "onVisto", "onCollega", "onRicevi")

    OnCreate {
      self.delegato = Delegato(modulo: self)
    }

    Function("servizio") { () -> String in
      FiondaBleModule.servizio.uuidString
    }

    // nome: max ~8 caratteri, così sta nel pacchetto insieme all'UUID a 128 bit
    Function("avviaAnnuncio") { (nome: String) in
      self.annuncia(nome)
    }

    Function("fermaAnnuncio") {
      self.nomeDaAnnunciare = nil
      self.periferica?.stopAdvertising()
      self.manda("onStato", ["annuncio": "fermo"])
    }

    Function("avviaScansione") {
      self.scansioneVoluta = true
      if self.centrale == nil {
        self.centrale = CBCentralManager(delegate: self.delegato, queue: nil)
      } else {
        self.scansionaSePronto()
      }
    }

    Function("fermaScansione") {
      self.scansioneVoluta = false
      self.centrale?.stopScan()
      self.ricezione?.cancel()
    }

    // --- abbinamento con il PC (fase 2) ---

    /// Testo letto dal QR del PC → si presenta al PC e salva l'abbinamento (condiviso con il pannello Condividi).
    AsyncFunction("abbina") { (qr: String) async throws -> [String: Any] in
      let nome = await MainActor.run { UIDevice.current.name }
      let a = try await Rete.abbina(qr: qr, nomeTelefono: nome)
      return ["pc": a.pc]
    }

    Function("abbinamento") { () -> [String: Any]? in
      guard let a = Archivio.leggi() else { return nil }
      return ["pc": a.pc]
    }

    /// Il PC abbinato risponde? ("ok" / "non abbinato" / "non trovato")
    AsyncFunction("controlla") { () async -> String in
      guard let a = Archivio.leggi() else { return "nessuno" }
      let rete = Rete(impronta: a.impronta)
      defer { rete.chiudi() }
      do { _ = try await rete.trova(a); return "ok" }
      catch ErroreFionda.nonAbbinato { return "non abbinato" }
      catch { return "non trovato" }
    }

    Function("dimentica") {
      Archivio.dimentica()
    }

    // --- collegarsi AVVICINANDO il telefono (senza QR) ---

    /// Cerca i PC vicini e si collega dopo il "Collega" sul PC. Eventi "onCollega" per l'animazione.
    AsyncFunction("collegaVicino") { () async throws -> [String: Any] in
      self.collegamento?.cancel()
      let nome = await MainActor.run { UIDevice.current.name }
      let precedente = self.nomeDaAnnunciare
      let t = Task {
        try await Collega.avvicinando(
          nomeTelefono: nome,
          annuncia: { n in DispatchQueue.main.async { self.annuncia(n) } },
          avviso: { self.manda("onCollega", $0) })
      }
      self.collegamento = t
      defer {
        DispatchQueue.main.async {
          if let p = precedente { self.annuncia(p) } else { self.nomeDaAnnunciare = nil; self.periferica?.stopAdvertising() }
        }
      }
      let a = try await t.value
      return ["pc": a.pc]
    }

    Function("annullaCollega") {
      self.collegamento?.cancel()
      self.collegamento = nil
    }

    // --- ricevere dal PC (PC → telefono), solo con l'app aperta ---

    /// Da chiamare quando l'app torna in primo piano: chiede al PC i file in attesa e resta in ascolto.
    Function("avviaRicezione") {
      if self.ricezione != nil { return }
      self.ricezione = Task { await Ricevi.ciclo(avviso: { self.manda("onRicevi", $0) }) }
    }

    Function("fermaRicezione") {
      self.ricezione?.cancel()
      self.ricezione = nil
    }

    Function("ricevuti") { () -> [[String: Any]] in Storico.elenco() }

    /// Percorso della cartella Fionda nell'app File (per aprirla con shareddocuments://).
    Function("cartellaFile") { () -> String in Ricevi.cartella().path }

    Function("visibile") { () -> Bool in Archivio.visibile }
    Function("impostaVisibile") { (v: Bool) in Archivio.visibile = v }

    OnDestroy {
      self.periferica?.stopAdvertising()
      self.centrale?.stopScan()
    }
  }

  func manda(_ evento: String, _ dati: [String: Any]) {
    sendEvent(evento, dati)
  }

  /// Annuncio Bluetooth con questo nome (max ~8 caratteri: sta nel pacchetto insieme all'UUID a 128 bit).
  func annuncia(_ nome: String) {
    nomeDaAnnunciare = nome
    if periferica == nil {
      // il permesso Bluetooth lo chiede iOS la prima volta qui
      periferica = CBPeripheralManager(delegate: delegato, queue: nil)
    } else {
      annunciaSePronto()
    }
  }

  func annunciaSePronto() {
    guard let p = periferica else { return }
    manda("onStato", ["bluetooth": FiondaBleModule.testo(p.state)])
    guard p.state == .poweredOn, let nome = nomeDaAnnunciare else { return }
    p.stopAdvertising()
    p.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [FiondaBleModule.servizio],
      CBAdvertisementDataLocalNameKey: nome,
    ])
  }

  func scansionaSePronto() {
    guard let c = centrale else { return }
    manda("onStato", ["bluetoothScansione": FiondaBleModule.testo(c.state)])
    guard c.state == .poweredOn, scansioneVoluta else { return }
    c.scanForPeripherals(withServices: [FiondaBleModule.servizio], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
  }

  static func testo(_ s: CBManagerState) -> String {
    switch s {
    case .poweredOn: return "acceso"
    case .poweredOff: return "spento"
    case .unauthorized: return "negato"
    case .unsupported: return "non supportato"
    case .resetting: return "riavvio"
    default: return "sconosciuto"
    }
  }

  class Delegato: NSObject, CBPeripheralManagerDelegate, CBCentralManagerDelegate {
    weak var modulo: FiondaBleModule?
    init(modulo: FiondaBleModule) { self.modulo = modulo }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
      modulo?.annunciaSePronto()
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
      if let e = error {
        modulo?.manda("onStato", ["annuncio": "errore", "errore": e.localizedDescription])
      } else {
        modulo?.manda("onStato", ["annuncio": "attivo"])
      }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
      modulo?.scansionaSePronto()
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
      let nome = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? ""
      modulo?.manda("onVisto", ["id": peripheral.identifier.uuidString, "nome": nome, "rssi": RSSI.intValue])
    }
  }
}
