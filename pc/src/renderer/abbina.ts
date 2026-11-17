import type { ApiFionda } from '../preload';
import { svgGlifo } from '../core/icone';
import icona from '../../risorse/icona.png';

declare global { interface Window { fionda: ApiFionda } }
const api = window.fionda;

interface StatoAbbina {
  qr: string;               // immagine data:
  scade: number;
  indirizzi: string[];
  porta: number;
  telefoni: { id: string; nome: string; aggiunto: number; ultimoContatto?: number }[];
  appenaAbbinato?: string;  // nome del telefono appena abbinato
  errore?: string;
}

const $ = (id: string) => document.getElementById(id)!;
let stato: StatoAbbina | undefined;

function quando(t?: number) {
  if (!t) return 'mai';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'adesso';
  if (s < 3600) return `${Math.round(s / 60)} min fa`;
  if (s < 86400) return `${Math.round(s / 3600)} ore fa`;
  return new Date(t).toLocaleDateString('it-IT');
}

function disegna() {
  if (!stato) return;
  ($('qr') as HTMLImageElement).src = stato.qr;
  $('indirizzi').textContent = stato.errore ?? `Questo PC: ${stato.indirizzi.join(', ') || 'nessuna rete trovata'} · porta ${stato.porta}`;
  const ok = $('ok');
  if (stato.appenaAbbinato) {
    ok.innerHTML = `<div class="spunta">${svgGlifo('spunta', 44, '#fff', 2.6)}</div>`;
    const nome = document.createElement('div'); nome.textContent = `${stato.appenaAbbinato} collegato`; ok.append(nome);
    ok.classList.add('visto'); $('riquadro').classList.add('fatto');
  } else { ok.classList.remove('visto'); $('riquadro').classList.remove('fatto'); }
  const lista = $('telefoni');
  lista.replaceChildren();
  if (!stato.telefoni.length) {
    const d = document.createElement('div'); d.className = 'tenue'; d.textContent = 'Ancora nessuno.'; lista.append(d);
  }
  for (const t of stato.telefoni) {
    const r = document.createElement('div'); r.className = 'riga';
    const ic = document.createElement('div'); ic.className = 'iconaRiga'; ic.innerHTML = svgGlifo('telefono', 20, 'currentColor', 1.8);
    const s = document.createElement('div'); s.style.flex = '1';
    s.innerHTML = '<b></b><div class="tenue" style="font-size:12.5px"></div>';
    s.querySelector('b')!.textContent = t.nome;
    s.querySelector('div')!.textContent = `ultimo contatto: ${quando(t.ultimoContatto)}`;
    const b = document.createElement('button'); b.textContent = 'Rimuovi';
    b.onclick = () => { if (confirm(`Rimuovere ${t.nome}? Non potrà più mandare file finché non lo abbini di nuovo.`)) api.rimuoviTelefono(t.id); };
    r.append(ic, s, b); lista.append(r);
  }
}

setInterval(() => {
  if (!stato) return;
  const s = Math.max(0, Math.round((stato.scade - Date.now()) / 1000));
  $('scade').textContent = s > 0 ? `Il codice cambia tra ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Codice scaduto';
  if (s === 0) api.nuovoQR();
}, 500);

$('logo').innerHTML = `<img src="${icona}" alt="" width="46" height="46">`;
document.querySelectorAll<HTMLElement>('[data-icona]').forEach((el) => { el.innerHTML = svgGlifo(el.dataset.icona as any, el.classList.contains('ic') ? 20 : 15, 'currentColor', 1.9); });
$('nuovo').onclick = () => api.nuovoQR();
$('cartella').onclick = () => api.apriCartella();
api.suAbbina((s) => { stato = s as StatoAbbina; disegna(); });
api.abbinaPronta();
