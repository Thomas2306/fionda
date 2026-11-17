import { describe, expect, it } from 'vitest';
import { codiceValido, codificaQR, decodificaQR, impronta, indirizziDiCasa, nuovoGettone, sessioneValida, simboliCollegamento, telefonoDaGettone, type DatiQR } from '../src/core/abbinamento';
import { dimensione, genere, nomeLibero, nomeSicuro } from '../src/core/nomi';

const qr: DatiQR = { v: 1, n: 'Il mio PC', h: ['192.168.1.25'], p: 47313, c: 'abc', f: 'ff'.repeat(32) };

describe('QR', () => {
  it('andata e ritorno', () => {
    const t = codificaQR(qr);
    expect(t.startsWith('FIONDA1:')).toBe(true);
    expect(decodificaQR(t)).toEqual(qr);
  });
  it('rifiuta QR che non sono di Fionda o rotti', () => {
    expect(decodificaQR('https://example.com')).toBeNull();
    expect(decodificaQR('FIONDA1:%%%')).toBeNull();
    expect(decodificaQR('FIONDA1:' + Buffer.from('{"n":1}').toString('base64url'))).toBeNull();
  });
});

describe('gettoni e codici', () => {
  it('riconosce il telefono giusto dal gettone, mai uno sbagliato', () => {
    const g1 = nuovoGettone(), g2 = nuovoGettone();
    const telefoni = [{ id: 'a', nome: 'iPhone', impronta: impronta(g1), aggiunto: 0 }];
    expect(telefonoDaGettone(telefoni, g1)?.id).toBe('a');
    expect(telefonoDaGettone(telefoni, g2)).toBeUndefined();
    expect(telefonoDaGettone(telefoni, undefined)).toBeUndefined();
  });
  it('il codice del QR vale 5 minuti e solo se uguale', () => {
    const a = { codice: 'xyz', scade: 1000 };
    expect(codiceValido(a, 'xyz', 999)).toBe(true);
    expect(codiceValido(a, 'xyz', 1000)).toBe(false);
    expect(codiceValido(a, 'xy', 10)).toBe(false);
    expect(codiceValido(undefined, 'xyz', 10)).toBe(false);
    expect(codiceValido(a, 42, 10)).toBe(false);
  });
});

describe('simboli del collegamento avvicinando', () => {
  it('stessi dati → stessi 4 simboli; impronta diversa (PC finto) → simboli diversi', () => {
    const a = simboliCollegamento('ab'.repeat(32), 'nonce123', '1a2b');
    expect(a).toHaveLength(4);
    expect(simboliCollegamento('AB'.repeat(32), 'nonce123', '1a2b')).toEqual(a);
    expect(simboliCollegamento('cd'.repeat(32), 'nonce123', '1a2b')).not.toEqual(a);
  });
  it('valore di riferimento (lo stesso deve uscire in Swift)', () => {
    // sha256("abab…ab|nonce123|1a2b") → primi 4 byte modulo 32 (lo stesso valore è scritto in FiondaRete.swift)
    expect(simboliCollegamento('ab'.repeat(32), 'nonce123', '1a2b')).toEqual([2, 1, 21, 8]);
    for (const n of simboliCollegamento('cd'.repeat(32), 'x', 'ffff')) expect(n).toBeGreaterThanOrEqual(0);
  });
  it('sessione: solo 4 cifre esadecimali', () => {
    expect(sessioneValida('1a2b')).toBe(true);
    expect(sessioneValida('1A2B')).toBe(false);
    expect(sessioneValida('12345')).toBe(false);
    expect(sessioneValida(12)).toBe(false);
  });
});

describe('indirizzi di casa', () => {
  it('prima la rete di casa, niente Tailscale né 169.254 né interni', () => {
    const r = indirizziDiCasa({
      Tailscale: [{ address: '100.101.1.2', family: 'IPv4', internal: false }],
      Ethernet: [{ address: '192.168.1.25', family: 'IPv4', internal: false }, { address: 'fe80::1', family: 'IPv6', internal: false }],
      Strano: [{ address: '169.254.3.3', family: 'IPv4', internal: false }],
      Docker: [{ address: '172.17.0.1', family: 4, internal: false }],
      Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    });
    expect(r).toEqual(['192.168.1.25']);
    const pc = indirizziDiCasa({
      'Ethernet': [{ address: '192.168.1.25', family: 'IPv4', internal: false }],
      'Ethernet 2': [{ address: '10.0.0.4', family: 'IPv4', internal: false }],
      'VirtualBox Host-Only Network': [{ address: '192.168.56.1', family: 'IPv4', internal: false }],
      'vEthernet (WSL)': [{ address: '192.168.240.1', family: 'IPv4', internal: false }],
    });
    expect(pc).toEqual(['192.168.1.25', '10.0.0.4']);
  });
});

describe('nomi dei file', () => {
  it('toglie i percorsi e i trucchi', () => {
    expect(nomeSicuro('..\\..\\Windows\\system32\\evil.dll')).toBe('evil.dll');
    expect(nomeSicuro('../../.bashrc')).toBe('bashrc');
    expect(nomeSicuro('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
    expect(nomeSicuro('CON.txt')).toBe('_CON.txt');
    expect(nomeSicuro('foto. ')).toBe('foto');
    expect(nomeSicuro('')).toBe('file');
    expect(nomeSicuro('x'.repeat(300) + '.jpeg').length).toBe(150);
    expect(nomeSicuro('x'.repeat(300) + '.jpeg').endsWith('.jpeg')).toBe(true);
  });
  it('non sovrascrive mai', () => {
    const ci = new Set(['foto.jpg', 'foto (1).jpg']);
    expect(nomeLibero('foto.jpg', (n) => ci.has(n))).toBe('foto (2).jpg');
    expect(nomeLibero('nuovo.jpg', (n) => ci.has(n))).toBe('nuovo.jpg');
    expect(nomeLibero('senza', () => false)).toBe('senza');
  });
  it('genere e dimensione', () => {
    expect(genere('IMG_0001.HEIC')).toBe('immagine');
    expect(genere('clip.MOV')).toBe('video');
    expect(genere('doc.pdf')).toBe('altro');
    expect(dimensione(1536)).toBe('1,5 KB');
    expect(dimensione(5 * 1024 * 1024 * 1024)).toBe('5,0 GB');
  });
});
