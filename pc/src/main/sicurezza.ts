import { createHash, X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface Certificato { chiave: string; cert: string; impronta: string }

/**
 * Certificato del PC per il collegamento cifrato (HTTPS) sulla rete di casa.
 * Creato una volta sola e salvato nella cartella dati dell'app. Il telefono lo riconosce dall'impronta
 * che ha letto nel QR: niente autorità esterne, niente internet (come LocalSend).
 */
export async function certificato(): Promise<Certificato> {
  const file = path.join(app.getPath('userData'), 'certificato.json');
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (c.chiave && c.cert) return { chiave: c.chiave, cert: c.cert, impronta: improntaCert(c.cert) };
  } catch { /* primo avvio */ }
  const selfsigned = await import('selfsigned');
  const gen = (selfsigned.default ?? selfsigned).generate;
  const r = await Promise.resolve(gen([{ name: 'commonName', value: 'Fionda' }], { notAfterDate: new Date(Date.now() + 3650 * 86400_000), keySize: 2048, algorithm: 'sha256' }));
  const c = { chiave: r.private as string, cert: r.cert as string };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(c), { mode: 0o600 });
  return { ...c, impronta: improntaCert(c.cert) };
}

/** SHA-256 del certificato (DER), in esadecimale minuscolo: lo stesso conto che fa l'iPhone. */
export function improntaCert(pem: string): string {
  const der = new X509Certificate(pem).raw;
  return createHash('sha256').update(der).digest('hex');
}
