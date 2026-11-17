import { createRequire } from 'node:module';
import type { Sistema } from '../core/piattaforma';

const richiedi = createRequire(__filename);

/**
 * Il tasto sinistro del mouse è giù? Solo Windows (GetAsyncKeyState, via koffi).
 * Restituisce null dove non sappiamo leggerlo: lì si usa la "striscia" sul bordo.
 * Funziona anche durante un trascinamento di file (quando Electron non riceve eventi del mouse).
 */
export function lettoreTasto(s: Sistema): () => boolean | null {
  if (s !== 'win32') return () => null;
  try {
    const koffi = richiedi('koffi');
    const user32 = koffi.load('user32.dll');
    const GetAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)');
    // VK_LBUTTON segue il tasto primario anche con i tasti invertiti
    return () => (GetAsyncKeyState(0x01) & 0x8000) !== 0;
  } catch (e) {
    console.warn('[mouse] koffi non disponibile, uso la striscia:', (e as Error).message);
    return () => null;
  }
}
