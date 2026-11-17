// Estensione "Fionda" nel pannello Condividi (fase 2: si fa sentire via Bluetooth e manda i file al PC abbinato).
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'share',
  name: 'condividi',
  displayName: 'Fionda',
  icon: '../../assets/icon.png',
  frameworks: ['CoreBluetooth', 'CryptoKit', 'ImageIO', 'UniformTypeIdentifiers'],
  deploymentTarget: '15.1',
  bundleIdentifier: '.condividi',
  // App Group: l'estensione legge l'abbinamento col PC salvato dall'app
  entitlements: { 'com.apple.security.application-groups': ['group.com.thomasbreack.fionda'] },
};
