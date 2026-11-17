/**
 * Molla smorzata: fa arrivare un valore al suo obiettivo in modo morbido, con un piccolo rimbalzo se serve.
 * Indipendente dagli fps: con dt grande fa più passi piccoli (niente esplosioni se un fotogramma tarda).
 */
export interface Molla { valore: number; velocita: number }

export function nuovaMolla(valore = 0): Molla { return { valore, velocita: 0 }; }

/**
 * @param rigidita quanto tira verso l'obiettivo (più alto = più veloce)
 * @param smorzamento quanto frena (rapporto 1 = arriva senza rimbalzo; <1 rimbalza)
 */
export function passoMolla(m: Molla, obiettivo: number, dt: number, rigidita = 120, smorzamento = 1): Molla {
  const passi = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / passi;
  const c = 2 * smorzamento * Math.sqrt(rigidita);
  let { valore, velocita } = m;
  for (let i = 0; i < passi; i++) {
    const a = rigidita * (obiettivo - valore) - c * velocita;
    velocita += a * h;
    valore += velocita * h;
  }
  m.valore = valore; m.velocita = velocita;
  return m;
}

/** Avvicinamento esponenziale indipendente dagli fps (metà strada ogni `mezzaVita` secondi). */
export function avvicina(attuale: number, obiettivo: number, dt: number, mezzaVita = 0.12) {
  return obiettivo + (attuale - obiettivo) * Math.pow(0.5, dt / mezzaVita);
}
