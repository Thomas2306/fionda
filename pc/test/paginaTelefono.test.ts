import { describe, expect, it } from 'vitest';
import { escapeHtml, paginaTelefono } from '../src/core/paginaTelefono';

describe('pagina senza app', () => {
  it('niente HTML iniettato dai nomi dei file o del PC', () => {
    const p = paginaTelefono({ pc: '<b>PC</b>', base: '/t/abc', file: [{ id: '1', nome: '"><script>alert(1)</script>.jpg', dimensione: 10 }] });
    expect(p).not.toContain('<script>alert(1)');
    expect(p).toContain('&lt;b&gt;PC&lt;/b&gt;');
    expect(escapeHtml(`a&'"`)).toBe('a&amp;&#39;&quot;');
  });
  it('mostra i file da scaricare con il percorso giusto', () => {
    const p = paginaTelefono({ pc: 'PC', base: '/t/abc', file: [{ id: 'x 1', nome: 'foto.jpg', dimensione: 2048 }] });
    expect(p).toContain('href="/t/abc/f/x%201"');
    expect(p).toContain('2,0 KB');
  });
  it('senza file lo dice', () => {
    expect(paginaTelefono({ pc: 'PC', base: '/t/a', file: [] })).toContain('non ha ancora scelto');
  });
});
