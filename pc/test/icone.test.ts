import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORME, GLIFI, simbolo } from '../src/core/icone';

describe('icone', () => {
  it('PC e iPhone usano lo STESSO file di icone (stessi simboli sui due schermi)', () => {
    const pc = fs.readFileSync(path.join(__dirname, '../src/core/icone.ts'), 'utf8');
    const iphone = fs.readFileSync(path.join(__dirname, '../../iphone/ui/icone.ts'), 'utf8');
    expect(iphone).toBe(pc);
  });
  it('32 simboli tutti diversi', () => {
    expect(FORME).toHaveLength(16);
    const nomi = new Set(Array.from({ length: 32 }, (_, i) => simbolo(i).nome));
    expect(nomi.size).toBe(32);
  });
  it('niente emoji nelle icone', () => {
    const tutto = JSON.stringify({ GLIFI, FORME });
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(tutto)).toBe(false);
  });
});
