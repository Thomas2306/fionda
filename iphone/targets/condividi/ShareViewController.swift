import CoreBluetooth
import ImageIO
import UIKit
import UniformTypeIdentifiers

// FIONDA — pannello Condividi.
// 1. prepara i file scelti (foto, video, documenti, link, testo);
// 2. si fa sentire via Bluetooth ("FIONDA-C") e trova il PC abbinato sulla rete di casa;
// 3. aspetta che il PC senta il telefono VICINO (o il tasto "Invia subito");
// 4. manda tutto, con la foto che "parte" verso l'alto, vibrazione e chiusura automatica.
/// Cartella temporanea dei file da inviare (funzione libera: la usano anche le callback in background).
private func cartellaInvio() -> URL {
  let c = FileManager.default.temporaryDirectory.appendingPathComponent("fionda-invio", isDirectory: true)
  try? FileManager.default.createDirectory(at: c, withIntermediateDirectories: true)
  return c
}

class ShareViewController: UIViewController, CBPeripheralManagerDelegate {
  static let servizio = CBUUID(string: "F10DA000-5A1E-4C6B-9E3A-2D7F00F10DA1")

  private enum Elemento { case file(URL, String), testo(String) }

  private var periferica: CBPeripheralManager?
  private var elementi: [Elemento] = []
  private var rete: Rete?
  private var abbinamento: Abbinamento?
  private var host: String?
  private var inviando = false
  private var lavoro: Task<Void, Never>?
  private var battiti: Task<Void, Never>?
  /** Bluetooth negato o spento: il messaggio da mostrare al posto del conteggio dei file */
  private var avvisoBluetooth: String?
  /** 0-1: quanto il PC "sente" vicino il telefono (cresce avvicinandosi) */
  private var livello = 0.0
  private let scintille = CAEmitterLayer()

  // interfaccia
  private let titolo = UILabel()
  private let messaggio = UILabel()
  private let anteprima = UIImageView()
  private let alone = UIView()
  private let barra = UIProgressView(progressViewStyle: .bar)
  private let luceSfondo = CAGradientLayer()
  private let luceAlone = CAGradientLayer()
  private let tacche = UIStackView()
  private let spunta = UIImageView()
  private let subito = UIButton(type: .system)
  private let annulla = UIButton(type: .system)
  private let viola = UIColor(red: 0.48, green: 0.36, blue: 1, alpha: 1)
  private let lavanda = UIColor(red: 0.73, green: 0.66, blue: 1, alpha: 1)

  override func viewDidLoad() {
    super.viewDidLoad()
    costruisci()
    guard let a = Archivio.leggi() else {
      mostra("Prima collega il PC", "Apri l'app Fionda e inquadra il codice QR che vedi sul computer.", fine: true)
      return
    }
    abbinamento = a
    rete = Rete(impronta: a.impronta)
    titolo.text = a.pc
    mostra(a.pc, "Preparo i file…")
    periferica = CBPeripheralManager(delegate: self, queue: nil)
    lavoro = Task { await self.avvia(a) }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    scintille.frame = view.bounds
    luceSfondo.frame = view.bounds
    luceAlone.frame = alone.bounds
    scintille.emitterPosition = CGPoint(x: view.bounds.midX, y: view.bounds.maxY + 10)
    scintille.emitterSize = CGSize(width: view.bounds.width * 1.2, height: 1)
  }

  // MARK: flusso

  private func avvia(_ a: Abbinamento) async {
    elementi = await prepara()
    if elementi.isEmpty { mostra(a.pc, "Non riesco a leggere quello che hai scelto.", fine: true); return }
    await mettiAnteprima()
    mostra(a.pc, "Cerco il PC sulla rete…")
    do {
      host = try await rete!.trova(a)
    } catch {
      mostra(a.pc, error.localizedDescription, fine: true); return
    }
    mostra(a.pc, "Avvicina il telefono al PC", sotto: avvisoBluetooth ?? quantiTesto())
    subito.isHidden = false
    battiti = Task { await self.battito() }
    // aspetta che il PC senta il telefono vicino (Bluetooth): luce, scintille e vibrazione crescono avvicinandosi
    while !Task.isCancelled && !inviando {
      let v = await rete!.vicino(a, host: host!)
      livello = v.livello
      aggiornaVicinanza()
      if v.stato == "VICINO" { await invia(); return }
      try? await Task.sleep(nanoseconds: 200_000_000)
    }
  }

  private func invia() async {
    guard !inviando, let a = abbinamento, let h = host, let r = rete else { return }
    inviando = true
    battiti?.cancel()
    subito.isHidden = true
    UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    lancio()
    barra.isHidden = false
    let quanti = elementi.count
    do {
      for (i, e) in elementi.enumerated() {
        switch e {
        case .testo(let t):
          mostra(a.pc, "Invio…")
          try await r.inviaTesto(a, host: h, testo: t)
        case .file(let url, let nome):
          mostra(a.pc, quanti > 1 ? "Invio \(i + 1) di \(quanti)…" : "Invio…", sotto: nome)
          try await r.inviaFile(a, host: h, file: url, nome: nome, indice: i + 1, quanti: quanti) { f in
            DispatchQueue.main.async { self.barra.setProgress(Float((Double(i) + f) / Double(quanti)), animated: true) }
          }
        }
      }
      UINotificationFeedbackGenerator().notificationOccurred(.success)
      barra.setProgress(1, animated: true)
      mostra("Fatto", quanti > 1 ? "\(quanti) elementi inviati a \(a.pc)" : "Inviato a \(a.pc)")
      tacche.isHidden = true
      UIView.animate(withDuration: 0.5, delay: 0, usingSpringWithDamping: 0.55, initialSpringVelocity: 0.8) {
        self.spunta.alpha = 1
        self.spunta.transform = .identity
      }
      try? await Task.sleep(nanoseconds: 1_300_000_000)
      chiudi()
    } catch {
      UINotificationFeedbackGenerator().notificationOccurred(.error)
      mostra(a.pc, error.localizedDescription, fine: true)
    }
  }

  // MARK: file scelti

  private func prepara() async -> [Elemento] {
    let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
    var lista: [Elemento] = []
    var n = 0
    for item in items {
      for p in item.attachments ?? [] {
        n += 1
        if let e = await leggi(p, n: n) { lista.append(e) }
      }
    }
    return lista
  }

  private func leggi(_ p: NSItemProvider, n: Int) async -> Elemento? {
    // link (non file) → testo
    if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) && !p.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
       let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) as? URL, !u.isFileURL {
      return .testo(u.absoluteString)
    }
    // il formato originale del file (HEIC, MOV, PDF...), non una copia ricompressa
    let tipi = p.registeredTypeIdentifiers.compactMap { UTType($0) }
    if let tipo = tipi.first(where: { $0.conforms(to: .movie) || $0.conforms(to: .image) || ($0.conforms(to: .data) && !$0.conforms(to: .plainText)) }),
       let url = await copia(p, tipo: tipo, n: n) {
      return .file(url, url.lastPathComponent)
    }
    if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
       let t = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) as? String {
      return .testo(t)
    }
    // ultima spiaggia: un'immagine in memoria (alcune app la passano così)
    if p.hasItemConformingToTypeIdentifier(UTType.image.identifier),
       let img = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) as? UIImage,
       let dati = img.jpegData(compressionQuality: 0.92) {
      let url = cartellaInvio().appendingPathComponent("immagine-\(n).jpg")
      if (try? dati.write(to: url)) != nil { return .file(url, url.lastPathComponent) }
    }
    return nil
  }

  /// Copia il file in una cartella nostra (quello fornito vale solo dentro la callback).
  private func copia(_ p: NSItemProvider, tipo: UTType, n: Int) async -> URL? {
    await withCheckedContinuation { cont in
      _ = p.loadFileRepresentation(forTypeIdentifier: tipo.identifier) { url, _ in
        guard let url = url else { cont.resume(returning: nil); return }
        var nome = p.suggestedName ?? url.deletingPathExtension().lastPathComponent
        if nome.isEmpty { nome = "file-\(n)" }
        let est = url.pathExtension.isEmpty ? (tipo.preferredFilenameExtension ?? "") : url.pathExtension
        if !est.isEmpty && !nome.lowercased().hasSuffix("." + est.lowercased()) { nome += "." + est }
        let dest = cartellaInvio().appendingPathComponent(nome)
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.copyItem(at: url, to: dest); cont.resume(returning: dest) }
        catch { cont.resume(returning: nil) }
      }
    }
  }

  private func quantiTesto() -> String {
    let f = elementi.filter { if case .file = $0 { return true } else { return false } }.count
    let t = elementi.count - f
    var parti: [String] = []
    if f > 0 { parti.append(f == 1 ? "1 file" : "\(f) file") }
    if t > 0 { parti.append(t == 1 ? "1 testo" : "\(t) testi") }
    return parti.joined(separator: " e ") + " pronti · si accende il bordo del PC"
  }

  /// Miniatura leggera della prima foto (senza caricare in memoria l'immagine intera).
  private func mettiAnteprima() async {
    for e in elementi {
      guard case .file(let url, _) = e,
            let src = CGImageSourceCreateWithURL(url as CFURL, nil),
            let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: 600,
            ] as CFDictionary) else { continue }
      anteprima.image = UIImage(cgImage: cg)
      anteprima.contentMode = .scaleAspectFill
      return
    }
    let soloTesto = elementi.allSatisfy { if case .testo = $0 { return true } else { return false } }
    anteprima.image = Glifi.immagine(soloTesto ? .link : .file, lato: 76)
    anteprima.contentMode = .center
  }

  // MARK: Bluetooth

  func peripheralManagerDidUpdateState(_ p: CBPeripheralManager) {
    // senza Bluetooth il PC non può sentire il telefono: lo diciamo, e "Invia subito" funziona comunque
    switch p.state {
    case .unauthorized: avvisoBluetooth = "Bluetooth negato per Fionda (Impostazioni → Fionda): premi Invia subito."
    case .poweredOff: avvisoBluetooth = "Bluetooth spento: premi Invia subito, oppure accendilo dal Centro di controllo."
    default: avvisoBluetooth = nil
    }
    if let a = abbinamento, host != nil, !inviando, let avviso = avvisoBluetooth {
      mostra(a.pc, "Avvicina il telefono al PC", sotto: avviso)
    }
    guard p.state == .poweredOn else { return }
    p.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [ShareViewController.servizio],
      CBAdvertisementDataLocalNameKey: "FIONDA-C",
    ])
  }

  // MARK: interfaccia

  private func costruisci() {
    view.backgroundColor = UIColor(red: 0.03, green: 0.03, blue: 0.06, alpha: 1)
    // luce viola in alto a sinistra e ciano in basso, come nell'app
    luceSfondo.type = .radial
    luceSfondo.colors = [UIColor(red: 0.36, green: 0.23, blue: 1, alpha: 0.5).cgColor, UIColor.clear.cgColor]
    luceSfondo.startPoint = CGPoint(x: 0.2, y: 0.05)
    luceSfondo.endPoint = CGPoint(x: 1.1, y: 0.75)
    view.layer.insertSublayer(luceSfondo, at: 0)
    titolo.font = .systemFont(ofSize: 15, weight: .bold)
    titolo.textColor = lavanda
    titolo.textAlignment = .center
    messaggio.font = .systemFont(ofSize: 22, weight: .heavy)
    messaggio.textColor = .white
    messaggio.numberOfLines = 0
    messaggio.textAlignment = .center

    alone.backgroundColor = .clear
    alone.alpha = 0.35
    luceAlone.type = .radial
    luceAlone.colors = [viola.cgColor, viola.withAlphaComponent(0.35).cgColor, UIColor.clear.cgColor]
    luceAlone.locations = [0, 0.45, 1]
    luceAlone.startPoint = CGPoint(x: 0.5, y: 0.5)
    luceAlone.endPoint = CGPoint(x: 1, y: 1)
    alone.layer.addSublayer(luceAlone)

    tacche.axis = .horizontal
    tacche.alignment = .bottom
    tacche.spacing = 5
    for i in 0..<5 {
      let b = UIView()
      b.backgroundColor = lavanda.withAlphaComponent(0.18)
      b.layer.cornerRadius = 3
      b.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([b.widthAnchor.constraint(equalToConstant: 7), b.heightAnchor.constraint(equalToConstant: CGFloat(8 + i * 5))])
      tacche.addArrangedSubview(b)
    }
    tacche.isHidden = true

    spunta.image = Glifi.immagine(.spunta, lato: 46, colore: .white, tratto: 2.6)
    spunta.contentMode = .center
    spunta.backgroundColor = UIColor(red: 0.18, green: 0.75, blue: 0.51, alpha: 1)
    spunta.layer.cornerRadius = 40
    spunta.alpha = 0
    spunta.transform = CGAffineTransform(scaleX: 0.3, y: 0.3)
    anteprima.layer.cornerRadius = 26
    anteprima.clipsToBounds = true
    anteprima.backgroundColor = UIColor(red: 0.12, green: 0.1, blue: 0.27, alpha: 1)
    anteprima.tintColor = lavanda
    anteprima.layer.borderWidth = 1
    anteprima.layer.borderColor = lavanda.withAlphaComponent(0.4).cgColor

    barra.progressTintColor = lavanda
    barra.trackTintColor = UIColor.white.withAlphaComponent(0.1)
    barra.isHidden = true
    barra.layer.cornerRadius = 3
    barra.clipsToBounds = true

    var c = UIButton.Configuration.filled()
    c.baseBackgroundColor = viola
    c.cornerStyle = .capsule
    c.image = Glifi.immagine(.su, lato: 18, colore: .white, tratto: 2.2)
    c.imagePadding = 8
    c.attributedTitle = AttributedString("Invia subito", attributes: AttributeContainer([.font: UIFont.systemFont(ofSize: 17, weight: .bold)]))
    c.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 26, bottom: 14, trailing: 26)
    subito.configuration = c
    subito.isHidden = true
    subito.addAction(UIAction { [weak self] _ in Task { await self?.invia() } }, for: .touchUpInside)

    annulla.setTitle("Annulla", for: .normal)
    annulla.tintColor = UIColor(white: 0.7, alpha: 1)
    annulla.addAction(UIAction { [weak self] _ in self?.chiudi() }, for: .touchUpInside)

    preparaScintille()
    for v in [alone, anteprima, spunta, tacche, titolo, messaggio, barra, subito, annulla] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
    let g = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      anteprima.centerXAnchor.constraint(equalTo: g.centerXAnchor),
      anteprima.centerYAnchor.constraint(equalTo: g.centerYAnchor, constant: -110),
      anteprima.widthAnchor.constraint(equalToConstant: 170),
      anteprima.heightAnchor.constraint(equalToConstant: 170),
      alone.centerXAnchor.constraint(equalTo: anteprima.centerXAnchor),
      alone.centerYAnchor.constraint(equalTo: anteprima.centerYAnchor),
      alone.widthAnchor.constraint(equalToConstant: 220),
      alone.heightAnchor.constraint(equalToConstant: 220),
      spunta.centerXAnchor.constraint(equalTo: anteprima.centerXAnchor),
      spunta.centerYAnchor.constraint(equalTo: anteprima.centerYAnchor),
      spunta.widthAnchor.constraint(equalToConstant: 80),
      spunta.heightAnchor.constraint(equalToConstant: 80),
      tacche.topAnchor.constraint(equalTo: anteprima.bottomAnchor, constant: 22),
      tacche.centerXAnchor.constraint(equalTo: g.centerXAnchor),
      titolo.topAnchor.constraint(equalTo: anteprima.bottomAnchor, constant: 62),
      titolo.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 24),
      titolo.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -24),
      messaggio.topAnchor.constraint(equalTo: titolo.bottomAnchor, constant: 8),
      messaggio.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 24),
      messaggio.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -24),
      barra.topAnchor.constraint(equalTo: messaggio.bottomAnchor, constant: 22),
      barra.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 48),
      barra.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -48),
      barra.heightAnchor.constraint(equalToConstant: 6),
      subito.topAnchor.constraint(equalTo: messaggio.bottomAnchor, constant: 26),
      subito.centerXAnchor.constraint(equalTo: g.centerXAnchor),
      annulla.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -18),
      annulla.centerXAnchor.constraint(equalTo: g.centerXAnchor),
    ])
  }

  private func mostra(_ t: String, _ m: String, sotto: String? = nil, fine: Bool = false) {
    DispatchQueue.main.async {
      self.titolo.text = t
      let testo = NSMutableAttributedString(string: m)
      if let s = sotto {
        testo.append(NSAttributedString(string: "\n" + s, attributes: [.font: UIFont.systemFont(ofSize: 15, weight: .regular), .foregroundColor: UIColor(white: 0.65, alpha: 1)]))
      }
      self.messaggio.attributedText = testo
      if fine {
        self.subito.isHidden = true
        self.annulla.setTitle("Chiudi", for: .normal)
        self.alone.layer.removeAllAnimations()
        self.alone.alpha = 0.12
      }
    }
  }

  /// Luce e scintille seguono la vicinanza: più sei vicino al PC, più l'alone cresce e le scintille salgono fitte.
  private func aggiornaVicinanza() {
    let l = CGFloat(livello)
    UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]) {
      self.alone.transform = CGAffineTransform(scaleX: 1 + 0.9 * l, y: 1 + 0.9 * l)
      self.alone.alpha = 0.18 + 0.5 * l
      self.anteprima.transform = CGAffineTransform(translationX: 0, y: -16 * l)
    }
    scintille.birthRate = Float(3 + 70 * l)
    tacche.isHidden = false
    for (i, b) in tacche.arrangedSubviews.enumerated() {
      let piena = Double(i) < livello * 5 - 0.01
      b.backgroundColor = piena ? UIColor(red: 0.36, green: 0.88, blue: 1, alpha: 1) : lavanda.withAlphaComponent(0.18)
      b.layer.shadowColor = UIColor(red: 0.36, green: 0.88, blue: 1, alpha: 1).cgColor
      b.layer.shadowOpacity = piena ? 0.9 : 0
      b.layer.shadowRadius = 5
      b.layer.shadowOffset = .zero
    }
    scintille.velocity = Float(1 + 1.4 * l)
  }

  /// Battiti di vibrazione: lenti e leggeri da lontano, fitti e decisi vicino al PC (come un contatore Geiger).
  private func battito() async {
    let leggero = UIImpactFeedbackGenerator(style: .light)
    let deciso = UIImpactFeedbackGenerator(style: .rigid)
    leggero.prepare(); deciso.prepare()
    while !Task.isCancelled && !inviando {
      let l = livello
      if l > 0.05 { (l > 0.65 ? deciso : leggero).impactOccurred(intensity: CGFloat(0.35 + 0.65 * l)) }
      let pausa = max(0.09, 0.8 - 0.68 * l)
      try? await Task.sleep(nanoseconds: UInt64(pausa * 1_000_000_000))
    }
  }

  /// Le scintille: puntini lavanda e ciano che salgono verso il bordo alto del telefono (verso il PC).
  private func preparaScintille() {
    let punto = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { c in
      let colori = [UIColor.white.cgColor, UIColor.white.withAlphaComponent(0).cgColor] as CFArray
      let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colori, locations: [0, 1])!
      c.cgContext.drawRadialGradient(g, startCenter: CGPoint(x: 12, y: 12), startRadius: 0, endCenter: CGPoint(x: 12, y: 12), endRadius: 12, options: [])
    }.cgImage
    scintille.emitterShape = .line
    scintille.renderMode = .additive
    scintille.birthRate = 0
    scintille.emitterCells = [lavanda, UIColor(red: 0.36, green: 0.88, blue: 1, alpha: 1), UIColor.white].map { (col: UIColor) -> CAEmitterCell in
      let c = CAEmitterCell()
      c.contents = punto
      c.color = col.cgColor
      c.birthRate = 1
      c.lifetime = 2.6
      c.velocity = 240
      c.velocityRange = 120
      c.yAcceleration = -220
      c.emissionLongitude = -.pi / 2
      c.emissionRange = .pi / 10
      c.scale = 0.28
      c.scaleRange = 0.18
      c.alphaSpeed = -0.35
      return c
    }
    view.layer.insertSublayer(scintille, at: 0)
  }

  /// La foto "parte": si carica un attimo all'indietro, poi vola verso l'alto rimpicciolendo.
  private func lancio() {
    DispatchQueue.main.async {
      self.alone.layer.removeAllAnimations()
      // scoppio di scintille verso l'alto, poi si calmano
      self.scintille.birthRate = 160
      self.scintille.velocity = 4
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { self.scintille.birthRate = 0 }
      UIView.animate(withDuration: 0.14, animations: {
        self.anteprima.transform = CGAffineTransform(translationX: 0, y: 18).scaledBy(x: 0.94, y: 0.94)
      }, completion: { _ in
        UIView.animate(withDuration: 0.55, delay: 0, options: [.curveEaseIn]) {
          self.anteprima.transform = CGAffineTransform(translationX: 0, y: -self.view.bounds.height * 0.7).scaledBy(x: 0.25, y: 0.25)
          self.anteprima.alpha = 0
          self.alone.transform = CGAffineTransform(scaleX: 2.2, y: 2.2)
          self.alone.alpha = 0
        }
      })
    }
  }

  private func chiudi() {
    lavoro?.cancel()
    battiti?.cancel()
    periferica?.stopAdvertising()
    rete?.chiudi()
    try? FileManager.default.removeItem(at: cartellaInvio())
    DispatchQueue.main.async { self.extensionContext?.completeRequest(returningItems: nil) }
  }
}

/// Le nostre icone, disegnate a mano con gli stessi tracciati dell'app (ui/icone.ts). Niente simboli di sistema.
enum Glifi {
  enum Nome { case file, link, spunta, su }

  static func immagine(_ n: Nome, lato: CGFloat, colore: UIColor = UIColor(red: 0.73, green: 0.66, blue: 1, alpha: 1), tratto: CGFloat = 1.8) -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: lato, height: lato)).image { c in
      let k = lato / 24
      c.cgContext.scaleBy(x: k, y: k)
      let p = UIBezierPath()
      switch n {
      case .file:
        p.move(to: CGPoint(x: 7.5, y: 2.5)); p.addLine(to: CGPoint(x: 13.5, y: 2.5)); p.addLine(to: CGPoint(x: 18.5, y: 7.5))
        p.addLine(to: CGPoint(x: 18.5, y: 20.5)); p.addQuadCurve(to: CGPoint(x: 17.5, y: 21.5), controlPoint: CGPoint(x: 18.5, y: 21.5))
        p.addLine(to: CGPoint(x: 6.5, y: 21.5)); p.addQuadCurve(to: CGPoint(x: 5.5, y: 20.5), controlPoint: CGPoint(x: 5.5, y: 21.5))
        p.addLine(to: CGPoint(x: 5.5, y: 3.5)); p.addQuadCurve(to: CGPoint(x: 6.5, y: 2.5), controlPoint: CGPoint(x: 5.5, y: 2.5)); p.close()
        p.move(to: CGPoint(x: 13.5, y: 2.5)); p.addLine(to: CGPoint(x: 13.5, y: 7.5)); p.addLine(to: CGPoint(x: 18.5, y: 7.5))
      case .link:
        for x in [3.2, 9.8] {
          let anello = UIBezierPath(roundedRect: CGRect(x: x, y: 9, width: 11, height: 6), cornerRadius: 3)
          anello.apply(CGAffineTransform(translationX: -12, y: -12).concatenating(CGAffineTransform(rotationAngle: -.pi / 4)).concatenating(CGAffineTransform(translationX: 12, y: 12)))
          p.append(anello)
        }
      case .spunta:
        p.move(to: CGPoint(x: 5, y: 12.5)); p.addLine(to: CGPoint(x: 9.5, y: 17)); p.addLine(to: CGPoint(x: 19, y: 7.5))
      case .su:
        p.move(to: CGPoint(x: 12, y: 20)); p.addLine(to: CGPoint(x: 12, y: 5))
        p.move(to: CGPoint(x: 6, y: 11)); p.addLine(to: CGPoint(x: 12, y: 5)); p.addLine(to: CGPoint(x: 18, y: 11))
      }
      p.lineWidth = tratto
      p.lineCapStyle = .round
      p.lineJoinStyle = .round
      colore.setStroke()
      p.stroke()
    }
  }
}
