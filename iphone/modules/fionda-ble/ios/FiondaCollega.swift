// FIONDA — collegarsi al PC AVVICINANDO il telefono (senza QR).
//
// 1. il telefono si annuncia via Bluetooth con un nome di sessione ("FP-1a2b");
// 2. cerca i PC con Fionda sulla rete di casa (Bonjour, _fionda._tcp: nome + impronta del certificato);
// 3. chiede a ciascuno di collegarsi: accetta solo il PC il cui Bluetooth sente PROPRIO questo telefono vicino;
// 4. telefono e PC mostrano gli stessi 4 simboli; tu premi "Collega" sul PC → il telefono riceve il gettone.
import Foundation

/// Trova i PC con Fionda sulla rete di casa.
final class CercaPC: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  struct PC { let nome: String; let impronta: String; let indirizzi: [String]; let porta: Int }

  private let browser = NetServiceBrowser()
  private var servizi: [NetService] = []
  private var trovati: [String: PC] = [:]
  private let lucchetto = NSLock()

  var elenco: [PC] { lucchetto.lock(); defer { lucchetto.unlock() }; return Array(trovati.values) }

  func avvia() {
    DispatchQueue.main.async {
      self.browser.delegate = self
      self.browser.searchForServices(ofType: "_fionda._tcp.", inDomain: "local.")
    }
  }

  func ferma() {
    DispatchQueue.main.async {
      self.browser.stop()
      self.servizi.forEach { $0.stop() }
      self.servizi.removeAll()
    }
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    servizi.append(service)
    service.delegate = self
    service.resolve(withTimeout: 6)
  }

  func netServiceDidResolveAddress(_ sender: NetService) {
    guard let txtDati = sender.txtRecordData() else { return }
    let txt = NetService.dictionary(fromTXTRecord: txtDati)
    guard let f = txt["f"].flatMap({ String(data: $0, encoding: .utf8) }), f.count == 64 else { return }
    let nome = txt["n"].flatMap { String(data: $0, encoding: .utf8) } ?? sender.name
    var ips: [String] = []
    for d in sender.addresses ?? [] {
      d.withUnsafeBytes { (grezzi: UnsafeRawBufferPointer) in
        guard let base = grezzi.baseAddress else { return }
        let sa = base.assumingMemoryBound(to: sockaddr.self)
        guard sa.pointee.sa_family == sa_family_t(AF_INET) else { return }
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        if getnameinfo(sa, socklen_t(d.count), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
          ips.append(String(cString: host))
        }
      }
    }
    guard !ips.isEmpty, sender.port > 0 else { return }
    lucchetto.lock()
    trovati[f] = PC(nome: nome, impronta: f, indirizzi: ips, porta: sender.port)
    lucchetto.unlock()
  }
}

enum Collega {
  static func casuale(_ n: Int) -> String {
    var b = [UInt8](repeating: 0, count: n)
    _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
    return Data(b).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }

  /**
   * Fa tutto il collegamento avvicinando. `avviso` riceve le fasi per l'animazione:
   *   ["fase": "cerco", "trovati": n]
   *   ["fase": "avvicina", "pc": nome, "livello": 0-1]
   *   ["fase": "conferma", "pc": nome, "simboli": [..4]]
   *   ["fase": "collegato", "pc": nome]
   * `annuncia(nome)` fa partire l'annuncio Bluetooth con quel nome.
   */
  static func avvicinando(nomeTelefono: String, annuncia: (String) -> Void, avviso: @escaping ([String: Any]) -> Void) async throws -> Abbinamento {
    let sessione = String(format: "%04x", UInt32.random(in: 0...0xffff))
    let nonce = casuale(18)
    annuncia("FP-\(sessione)")
    let cerca = CercaPC()
    cerca.avvia()
    defer { cerca.ferma() }
    let corpo = try JSONSerialization.data(withJSONObject: ["sessione": sessione, "nonce": nonce, "nome": nomeTelefono, "id": Archivio.idTelefono()])
    let fine = Date().addingTimeInterval(120)
    var scelto: (pc: CercaPC.PC, host: String)?
    var ultimoAvviso = ""

    while Date() < fine {
      try Task.checkCancellation()
      let pcs = cerca.elenco
      if scelto == nil {
        var livelloMax = 0.0, nomeVicino = ""
        for pc in pcs {
          let rete = Rete(impronta: pc.impronta)
          defer { rete.chiudi() }
          for h in pc.indirizzi {
            var r = rete.richiesta(h, pc.porta, "/v1/avvicina", metodo: "POST")
            r.timeoutInterval = 2.5
            guard let (codice, j) = try? await rete.json(r, corpo: corpo) else { continue }
            if codice == 200 && (j["stato"] as? String) == "attesa" {
              scelto = (pc, h)
              avviso(["fase": "conferma", "pc": pc.nome, "simboli": Rete.simboli(impronta: pc.impronta, nonce: nonce, sessione: sessione)])
              break
            }
            if codice == 409, let l = (j["livello"] as? NSNumber)?.doubleValue, l >= livelloMax { livelloMax = l; nomeVicino = pc.nome }
            break // l'indirizzo risponde: inutile provare gli altri
          }
          if scelto != nil { break }
        }
        if scelto == nil {
          let chiave = pcs.isEmpty ? "cerco" : "avvicina \(Int(livelloMax * 20))"
          if chiave != ultimoAvviso || !pcs.isEmpty {
            ultimoAvviso = chiave
            if pcs.isEmpty { avviso(["fase": "cerco", "trovati": 0]) }
            else { avviso(["fase": "avvicina", "pc": nomeVicino.isEmpty ? pcs[0].nome : nomeVicino, "livello": livelloMax]) }
          }
        }
      } else if let s = scelto {
        // aspettiamo il "Collega" sul PC
        let rete = Rete(impronta: s.pc.impronta)
        defer { rete.chiudi() }
        let q = "/v1/avvicina?sessione=\(sessione)&nonce=\(nonce)"
        var r = rete.richiesta(s.host, s.pc.porta, q)
        r.timeoutInterval = 3
        if let (codice, j) = try? await rete.json(r) {
          let stato = j["stato"] as? String ?? ""
          if codice == 200 && stato == "ok", let gettone = j["gettone"] as? String {
            let a = Abbinamento(pc: j["pc"] as? String ?? s.pc.nome, indirizzi: s.pc.indirizzi, porta: s.pc.porta, impronta: s.pc.impronta, gettone: gettone, ultimoIndirizzo: s.host)
            Archivio.salva(a)
            avviso(["fase": "collegato", "pc": a.pc])
            return a
          }
          if stato == "rifiutato" { throw ErroreFionda.rifiutato("Sul PC hanno premuto Rifiuta.") }
          if codice == 404 { throw ErroreFionda.rifiutato("La richiesta è scaduta: riprova avvicinando il telefono.") }
        }
      }
      try await Task.sleep(nanoseconds: 450_000_000)
    }
    throw ErroreFionda.rete("Nessun PC vicino trovato. Fionda è aperta sul PC ed è \"visibile ai telefoni vicini\"? Stessa rete Wi‑Fi?")
  }
}
