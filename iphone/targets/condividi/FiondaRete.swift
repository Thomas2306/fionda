// FIONDA — rete di casa tra telefono e PC (copia identica in targets/condividi/FiondaRete.swift: tenerle uguali).
//
// - Abbinamento: il QR del PC contiene indirizzi, porta, un codice usa-e-getta e l'IMPRONTA del certificato del PC.
//   Ci colleghiamo SOLO a un server con quell'impronta: nessuno sulla stessa rete può fingersi il tuo PC.
// - Il gettone personale ricevuto all'abbinamento sta nel contenitore condiviso (App Group) tra app ed estensione.
import CryptoKit
import Foundation
import UIKit

struct Abbinamento: Codable {
  var pc: String
  var indirizzi: [String]
  var porta: Int
  var impronta: String
  var gettone: String
  var ultimoIndirizzo: String?
}

enum ErroreFionda: LocalizedError {
  case qrNonValido, nonAbbinato, pcNonTrovato(String), rifiutato(String), rete(String)
  var errorDescription: String? {
    switch self {
    case .qrNonValido: return "Questo non è un codice di Fionda."
    case .nonAbbinato: return "Il PC non riconosce più questo telefono: abbinalo di nuovo dall'app Fionda."
    case .pcNonTrovato(let pc): return "Non trovo \(pc). Telefono e PC sono sulla stessa rete Wi‑Fi? Fionda è aperta sul PC? Controlla anche Impostazioni → Fionda → Rete locale."
    case .rifiutato(let m): return m
    case .rete(let m): return m
    }
  }
}

enum Archivio {
  static let gruppo = "group.com.thomasbreack.fionda"
  private static let chiave = "abbinamento"
  private static var difesa: UserDefaults { UserDefaults(suiteName: gruppo) ?? .standard }

  static func leggi() -> Abbinamento? {
    guard let d = difesa.data(forKey: chiave) else { return nil }
    return try? JSONDecoder().decode(Abbinamento.self, from: d)
  }
  static func salva(_ a: Abbinamento) {
    if let d = try? JSONEncoder().encode(a) { difesa.set(d, forKey: chiave) }
  }
  static func dimentica() { difesa.removeObject(forKey: chiave) }

  /// "Visibile ai dispositivi vicini": l'app cerca da sola i PC vicini per collegarsi avvicinando (di serie sì).
  static var visibile: Bool {
    get { difesa.object(forKey: "visibile") as? Bool ?? true }
    set { difesa.set(newValue, forKey: "visibile") }
  }

  /** Id stabile di questo telefono (non personale): serve al PC per riconoscerlo se lo riabbini. */
  static func idTelefono() -> String {
    if let id = difesa.string(forKey: "id") { return id }
    let id = UUID().uuidString
    difesa.set(id, forKey: "id")
    return id
  }
}

/// Un collegamento HTTPS che si fida solo del certificato con l'impronta giusta.
final class Rete: NSObject, URLSessionDelegate, URLSessionTaskDelegate {
  let impronta: String
  private var sessione: URLSession!
  private var progressi: [Int: (Double) -> Void] = [:]
  private let coda = DispatchQueue(label: "fionda.rete")

  init(impronta: String) {
    self.impronta = impronta.lowercased()
    super.init()
    let c = URLSessionConfiguration.ephemeral
    c.timeoutIntervalForRequest = 4
    c.timeoutIntervalForResource = 60 * 60
    c.waitsForConnectivity = false
    sessione = URLSession(configuration: c, delegate: self, delegateQueue: nil)
  }

  func chiudi() { sessione.invalidateAndCancel() }

  // MARK: certificato

  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let trust = challenge.protectionSpace.serverTrust else {
      completionHandler(.performDefaultHandling, nil); return
    }
    guard let catena = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let primo = catena.first else {
      completionHandler(.cancelAuthenticationChallenge, nil); return
    }
    let der = SecCertificateCopyData(primo) as Data
    let hex = SHA256.hash(data: der).map { String(format: "%02x", $0) }.joined()
    if hex == impronta {
      completionHandler(.useCredential, URLCredential(trust: trust))
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                  totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
    guard totalBytesExpectedToSend > 0 else { return }
    let f = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
    let cb = coda.sync { progressi[task.taskIdentifier] }
    cb?(f)
  }

  // MARK: chiamate

  func richiesta(_ host: String, _ porta: Int, _ percorso: String, metodo: String = "GET", gettone: String? = nil) -> URLRequest {
    var r = URLRequest(url: URL(string: "https://\(host):\(porta)\(percorso)")!)
    r.httpMethod = metodo
    if let g = gettone { r.setValue("Bearer \(g)", forHTTPHeaderField: "Authorization") }
    return r
  }

  func json(_ r: URLRequest, corpo: Data? = nil) async throws -> (Int, [String: Any]) {
    var r = r
    if let c = corpo { r.httpBody = c; r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    let (dati, risposta) = try await sessione.data(for: r)
    let codice = (risposta as? HTTPURLResponse)?.statusCode ?? 0
    let j = (try? JSONSerialization.jsonObject(with: dati)) as? [String: Any] ?? [:]
    return (codice, j)
  }

  /// Prova tutti gli indirizzi insieme (l'ultimo che ha funzionato per primo) e restituisce quello che risponde.
  func trova(_ a: Abbinamento) async throws -> String {
    var candidati = a.indirizzi
    if let u = a.ultimoIndirizzo { candidati.removeAll { $0 == u }; candidati.insert(u, at: 0) }
    var nonAbbinato = false
    let trovato: String? = await withTaskGroup(of: (String, Int).self) { gruppo in
      for h in candidati {
        gruppo.addTask {
          var r = self.richiesta(h, a.porta, "/v1/ciao", gettone: a.gettone)
          r.timeoutInterval = 3
          let codice = (try? await self.json(r).0) ?? 0
          return (h, codice)
        }
      }
      for await (h, codice) in gruppo {
        if codice == 200 { gruppo.cancelAll(); return h }
        if codice == 401 { nonAbbinato = true }
      }
      return nil
    }
    if let h = trovato {
      var b = a; b.ultimoIndirizzo = h; Archivio.salva(b)
      return h
    }
    if nonAbbinato { throw ErroreFionda.nonAbbinato }
    throw ErroreFionda.pcNonTrovato(a.pc)
  }

  /// Il PC sente il telefono via Bluetooth? stato "VICINO" / "LONTANO" / "PERSO" e livello 0-1 (cresce avvicinandosi).
  func vicino(_ a: Abbinamento, host: String) async -> (stato: String, livello: Double) {
    var r = richiesta(host, a.porta, "/v1/vicino", gettone: a.gettone)
    r.timeoutInterval = 2
    guard let (codice, j) = try? await json(r), codice == 200 else { return ("?", 0) }
    return (j["stato"] as? String ?? "?", (j["livello"] as? NSNumber)?.doubleValue ?? 0)
  }

  func inviaTesto(_ a: Abbinamento, host: String, testo: String) async throws {
    var r = richiesta(host, a.porta, "/v1/testo", metodo: "POST", gettone: a.gettone)
    r.httpBody = testo.data(using: .utf8)
    r.setValue("text/plain; charset=utf-8", forHTTPHeaderField: "Content-Type")
    let (codice, j) = try await json(r)
    if codice == 401 { throw ErroreFionda.nonAbbinato }
    if codice != 200 { throw ErroreFionda.rifiutato(j["errore"] as? String ?? "Il PC ha rifiutato il testo (\(codice)).") }
  }

  func inviaFile(_ a: Abbinamento, host: String, file: URL, nome: String, indice: Int, quanti: Int,
                 progresso: @escaping (Double) -> Void) async throws {
    var r = richiesta(host, a.porta, "/v1/file", metodo: "POST", gettone: a.gettone)
    r.timeoutInterval = 60
    r.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
    r.setValue(nome.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "file", forHTTPHeaderField: "X-Fionda-Nome")
    r.setValue(String(indice), forHTTPHeaderField: "X-Fionda-Indice")
    r.setValue(String(quanti), forHTTPHeaderField: "X-Fionda-Quanti")
    let (dati, risposta): (Data, URLResponse) = try await withCheckedThrowingContinuation { cont in
      let t = sessione.uploadTask(with: r, fromFile: file) { d, resp, err in
        if let e = err { cont.resume(throwing: ErroreFionda.rete(e.localizedDescription)) }
        else { cont.resume(returning: (d ?? Data(), resp ?? URLResponse())) }
      }
      coda.sync { progressi[t.taskIdentifier] = progresso }
      t.resume()
    }
    let codice = (risposta as? HTTPURLResponse)?.statusCode ?? 0
    if codice == 401 { throw ErroreFionda.nonAbbinato }
    if codice != 200 {
      let j = (try? JSONSerialization.jsonObject(with: dati)) as? [String: Any]
      throw ErroreFionda.rifiutato(j?["errore"] as? String ?? "Il PC ha rifiutato il file (\(codice)).")
    }
    progresso(1)
  }

  /// Scarica un file (PC → telefono) in una cartella temporanea nostra, con l'avanzamento 0-1.
  func scarica(_ r: URLRequest, progresso: @escaping (Double) -> Void) async throws -> (URL, HTTPURLResponse) {
    var osservatore: NSKeyValueObservation?
    defer { osservatore?.invalidate() }
    return try await withCheckedThrowingContinuation { cont in
      let t = sessione.downloadTask(with: r) { url, risposta, errore in
        if let e = errore { cont.resume(throwing: ErroreFionda.rete(e.localizedDescription)); return }
        guard let u = url, let h = risposta as? HTTPURLResponse else { cont.resume(throwing: ErroreFionda.rete("Risposta vuota dal PC.")); return }
        // il file scaricato vale solo dentro questa chiamata: lo spostiamo subito
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("fionda-arrivo-\(UUID().uuidString)")
        do { try FileManager.default.moveItem(at: u, to: dest); cont.resume(returning: (dest, h)) }
        catch { cont.resume(throwing: error) }
      }
      osservatore = t.progress.observe(\.fractionCompleted) { p, _ in progresso(p.fractionCompleted) }
      t.resume()
    }
  }

  // MARK: simboli del collegamento avvicinando (stesso calcolo del PC: core/abbinamento.ts)

  /// 4 numeri da 0 a 31: l'app li disegna come forme (ui/icone.ts, uguale al PC).
  /// Prova: impronta "ab"×32, nonce "nonce123", sessione "1a2b" → [2, 1, 21, 8] (come nel test del PC).
  static func simboli(impronta: String, nonce: String, sessione: String) -> [Int] {
    let h = Array(SHA256.hash(data: Data("\(impronta.lowercased())|\(nonce)|\(sessione)".utf8)))
    return (0..<4).map { Int(h[$0]) % 32 }
  }

  // MARK: abbinamento

  /// Legge il QR del PC, si presenta con il codice usa-e-getta e salva l'abbinamento.
  static func abbina(qr: String, nomeTelefono: String) async throws -> Abbinamento {
    let prefisso = "FIONDA1:"
    guard qr.hasPrefix(prefisso) else { throw ErroreFionda.qrNonValido }
    var b64 = String(qr.dropFirst(prefisso.count)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while b64.count % 4 != 0 { b64 += "=" }
    guard let d = Data(base64Encoded: b64),
          let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
          let pc = j["n"] as? String, let indirizzi = j["h"] as? [String], let porta = j["p"] as? Int,
          let codice = j["c"] as? String, let impronta = j["f"] as? String else { throw ErroreFionda.qrNonValido }
    let rete = Rete(impronta: impronta)
    defer { rete.chiudi() }
    let corpo = try JSONSerialization.data(withJSONObject: ["codice": codice, "nome": nomeTelefono, "id": Archivio.idTelefono()])
    var ultimoErrore: Error = ErroreFionda.pcNonTrovato(pc)
    for h in indirizzi {
      do {
        var r = rete.richiesta(h, porta, "/v1/abbina", metodo: "POST")
        r.timeoutInterval = 4
        let (stato, risposta) = try await rete.json(r, corpo: corpo)
        if stato == 200, let gettone = risposta["gettone"] as? String {
          let a = Abbinamento(pc: risposta["pc"] as? String ?? pc, indirizzi: indirizzi, porta: porta, impronta: impronta, gettone: gettone, ultimoIndirizzo: h)
          Archivio.salva(a)
          return a
        }
        ultimoErrore = ErroreFionda.rifiutato(risposta["errore"] as? String ?? "Il PC ha detto di no (\(stato)).")
        if stato == 403 { break }
      } catch {
        // indirizzo non raggiungibile: proviamo il prossimo
      }
    }
    throw ultimoErrore
  }
}
