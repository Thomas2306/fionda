/**
 * Suoni di Fionda, sintetizzati al momento (niente file audio, niente suoni di altri):
 * - lancio: l'elastico che scatta (nota che scende) + un soffio che sale;
 * - arrivo: due note cristalline + una scintilla acuta;
 * - collegato: tre note che salgono;
 * - consegnato: un "tic" morbido.
 * Volume basso: devono accompagnare, non disturbare.
 */
let ctx: AudioContext | undefined;
let attivi = true;

export function impostaSuoni(si: boolean) { attivi = si; }

function audio(): AudioContext | undefined {
  if (!attivi) return undefined;
  try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch { return undefined; }
}

function nota(c: AudioContext, freq: number, quando: number, durata: number, volume: number, tipo: OscillatorType = 'sine', scendeA?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, quando);
  if (scendeA) o.frequency.exponentialRampToValueAtTime(scendeA, quando + durata * 0.8);
  g.gain.setValueAtTime(0.0001, quando);
  g.gain.exponentialRampToValueAtTime(volume, quando + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + durata);
  o.connect(g).connect(c.destination);
  o.start(quando); o.stop(quando + durata + 0.05);
}

function soffio(c: AudioContext, quando: number, durata: number, da: number, a: number, volume: number) {
  const n = Math.floor(c.sampleRate * durata);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(da, quando); f.frequency.exponentialRampToValueAtTime(a, quando + durata);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, quando);
  g.gain.exponentialRampToValueAtTime(volume, quando + durata * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + durata);
  s.connect(f).connect(g).connect(c.destination);
  s.start(quando); s.stop(quando + durata);
}

export function suonoLancio() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  nota(c, 220, t, 0.18, 0.12, 'triangle', 90);  // l'elastico che scatta
  soffio(c, t + 0.04, 0.42, 500, 5200, 0.09);    // il file che vola via
}

export function suonoArrivo() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  soffio(c, t, 0.3, 4500, 700, 0.05);            // arriva dal bordo
  nota(c, 1318.5, t + 0.16, 0.9, 0.07);          // mi
  nota(c, 1975.5, t + 0.26, 1.1, 0.055);         // si
  nota(c, 3951, t + 0.3, 0.4, 0.02);             // scintilla
}

export function suonoCollegato() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  [659.3, 880, 1318.5].forEach((f, i) => nota(c, f, t + i * 0.11, 0.7, 0.065));
}

export function suonoConsegnato() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  nota(c, 1568, t, 0.5, 0.05);
  nota(c, 2349, t + 0.07, 0.6, 0.04);
}
