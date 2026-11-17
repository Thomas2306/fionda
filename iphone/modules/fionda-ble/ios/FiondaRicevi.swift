// FIONDA — ricevere dal PC (PC → telefono), con l'app APERTA.
//
// iPhone non può ascoltare la rete con l'app chiusa (e non usiamo server esterni né notifiche push):
// mentre l'app è aperta chiediamo al PC "c'è qualcosa per me?" con una richiesta lunga (il PC risponde
// appena lasci un file sul bordo). Se l'app era chiusa, i file ti aspettano sul PC e arrivano appena la apri.
//
// Dove finiscono: foto e video nel rullino (permesso "aggiungi foto", non vede le tue foto);
// tutto il resto in File → Sul mio iPhone → Fionda.
import AVFoundation
import Foundation
import ImageIO
import Photos
import UniformTypeIdentifiers

enum Ricevi {
  /// Ciclo di ricezione: gira finché il Task non viene cancellato (app in secondo piano).
  static func ciclo(avviso: @escaping ([String: Any]) -> Void) async {
    while !Task.isCancelled {
      guard let a = Archivio.leggi() else {
        try? await Task.sleep(nanoseconds: 2_000_000_000); continue
      }
      let rete = Rete(impronta: a.impronta)
      do {
        let host = try await rete.trova(a)
        while !Task.isCancelled {
          var r = rete.richiesta(host, a.porta, "/v1/coda?attesa=20", gettone: a.gettone)
          r.timeoutInterval = 30
          let (codice, j) = try await rete.json(r)
          if codice == 401 { throw ErroreFionda.nonAbbinato }
          guard codice == 200, let elenco = j["file"] as? [[String: Any]] else { throw ErroreFionda.rete("Il PC non risponde bene (\(codice)).") }
          for f in elenco {
            guard let id = f["id"] as? String, let nome = f["nome"] as? String else { continue }
            let dimensione = (f["dimensione"] as? NSNumber)?.int64Value ?? 0
            try await ricevi(rete: rete, a: a, host: host, id: id, nome: nome, dimensione: dimensione, avviso: avviso)
          }
        }
      } catch is CancellationError {
        rete.chiudi(); return
      } catch ErroreFionda.nonAbbinato {
        avviso(["fase": "errore", "messaggio": ErroreFionda.nonAbbinato.localizedDescription])
        rete.chiudi()
        try? await Task.sleep(nanoseconds: 15_000_000_000)
        continue
      } catch {
        // PC spento o rete cambiata: riproviamo con calma
      }
      rete.chiudi()
      try? await Task.sleep(nanoseconds: 2_500_000_000)
    }
  }

  private static func ricevi(rete: Rete, a: Abbinamento, host: String, id: String, nome: String, dimensione: Int64,
                             avviso: @escaping ([String: Any]) -> Void) async throws {
    avviso(["fase": "inizio", "id": id, "nome": nome, "dimensione": dimensione, "pc": a.pc])
    let q = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id
    var r = rete.richiesta(host, a.porta, "/v1/coda/file?id=\(q)", gettone: a.gettone)
    r.timeoutInterval = 60
    var ultimo = Date.distantPast
    let (temp, risposta) = try await rete.scarica(r) { p in
      let ora = Date()
      if ora.timeIntervalSince(ultimo) > 0.08 { ultimo = ora; avviso(["fase": "avanzamento", "id": id, "avanzamento": p]) }
    }
    defer { try? FileManager.default.removeItem(at: temp) }
    if risposta.statusCode == 404 || risposta.statusCode == 410 { avviso(["fase": "errore", "id": id, "messaggio": "Sul PC il file non c'è più."]); return }
    guard risposta.statusCode == 200 else { throw ErroreFionda.rete("Scaricamento non riuscito (\(risposta.statusCode)).") }

    let pulito = nomePulito(nome)
    let tipo = UTType(filenameExtension: (pulito as NSString).pathExtension)
    let miniatura = creaMiniatura(temp, tipo: tipo, id: id)
    var dove = "file"
    var percorso = ""
    if let t = tipo, t.conforms(to: .image) || t.conforms(to: .movie), await salvaNelRullino(temp, nome: pulito, video: t.conforms(to: .movie)) {
      dove = "foto"
    } else {
      percorso = try salvaInFile(temp, nome: pulito).path
    }
    // diciamo al PC che è arrivato (lo toglie dalla coda e fa l'animazione "arrivato")
    var ok = rete.richiesta(host, a.porta, "/v1/coda/ricevuto?id=\(q)", metodo: "POST", gettone: a.gettone)
    ok.timeoutInterval = 5
    _ = try? await rete.json(ok, corpo: Data("{}".utf8))
    let voce: [String: Any] = ["id": id, "nome": pulito, "dove": dove, "percorso": percorso, "miniatura": miniatura ?? "", "pc": a.pc, "quando": Date().timeIntervalSince1970 * 1000]
    Storico.aggiungi(voce)
    var fine = voce; fine["fase"] = "fine"
    avviso(fine)
  }

  static func nomePulito(_ n: String) -> String {
    var s = (n as NSString).lastPathComponent.replacingOccurrences(of: ":", with: "_")
    if s.hasPrefix(".") { s = "_" + s }
    return s.isEmpty ? "file" : s
  }

  /// Foto e video nel rullino. Permesso "solo aggiungere": Fionda non vede le tue foto.
  private static func salvaNelRullino(_ url: URL, nome: String, video: Bool) async -> Bool {
    let stato = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard stato == .authorized || stato == .limited else { return false }
    // Foto vuole l'estensione giusta nel nome del file
    let copia = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension((nome as NSString).pathExtension)
    guard (try? FileManager.default.copyItem(at: url, to: copia)) != nil else { return false }
    defer { try? FileManager.default.removeItem(at: copia) }
    do {
      try await PHPhotoLibrary.shared().performChanges {
        let r = PHAssetCreationRequest.forAsset()
        let o = PHAssetResourceCreationOptions()
        o.originalFilename = nome
        r.addResource(with: video ? .video : .photo, fileURL: copia, options: o)
      }
      return true
    } catch {
      return false // formato che Foto non accetta: finisce in File
    }
  }

  /// Cartella "Fionda" visibile nell'app File (Sul mio iPhone → Fionda).
  static func cartella() -> URL {
    let c = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Fionda", isDirectory: true)
    try? FileManager.default.createDirectory(at: c, withIntermediateDirectories: true)
    return c
  }

  private static func salvaInFile(_ url: URL, nome: String) throws -> URL {
    let c = cartella()
    var dest = c.appendingPathComponent(nome)
    let base = (nome as NSString).deletingPathExtension, est = (nome as NSString).pathExtension
    var i = 1
    while FileManager.default.fileExists(atPath: dest.path) {
      dest = c.appendingPathComponent(est.isEmpty ? "\(base) (\(i))" : "\(base) (\(i)).\(est)")
      i += 1
    }
    try FileManager.default.copyItem(at: url, to: dest)
    return dest
  }

  /// Miniatura piccola (per l'animazione e la lista "Ricevuti"), in cache.
  private static func creaMiniatura(_ url: URL, tipo: UTType?, id: String) -> String? {
    var cg: CGImage?
    if let t = tipo, t.conforms(to: .movie) {
      let g = AVAssetImageGenerator(asset: AVURLAsset(url: url))
      g.appliesPreferredTrackTransform = true
      g.maximumSize = CGSize(width: 500, height: 500)
      cg = try? g.copyCGImage(at: .zero, actualTime: nil)
    } else if let src = CGImageSourceCreateWithURL(url as CFURL, nil) {
      cg = CGImageSourceCreateThumbnailAtIndex(src, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 500,
      ] as CFDictionary)
    }
    guard let img = cg else { return nil }
    let c = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("fionda-miniature", isDirectory: true)
    try? FileManager.default.createDirectory(at: c, withIntermediateDirectories: true)
    let dest = c.appendingPathComponent("\(id).jpg")
    guard let d = CGImageDestinationCreateWithURL(dest as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(d, img, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
    return CGImageDestinationFinalize(d) ? dest.absoluteString : nil
  }
}

/// Gli ultimi file ricevuti (per la lista nell'app).
enum Storico {
  private static let chiave = "ricevuti"
  static func elenco() -> [[String: Any]] {
    (UserDefaults.standard.array(forKey: chiave) as? [[String: Any]]) ?? []
  }
  static func aggiungi(_ v: [String: Any]) {
    var l = elenco()
    l.insert(v, at: 0)
    UserDefaults.standard.set(Array(l.prefix(30)), forKey: chiave)
  }
}
