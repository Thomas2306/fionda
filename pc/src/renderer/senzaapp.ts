import type { ApiFionda } from '../preload';
import { svgGlifo, type NomeGlifo } from '../core/icone';
import { dimensione, genere } from '../core/nomi';

declare global { interface Window { fionda: ApiFionda } }
const api = window.fionda;
const $ = (id: string) => document.getElementById(id)!;
let scade = 0;

api.suSenzaApp((x) => {
  const d = x as { qr: string; url: string; scade: number; file: { id: string; nome: string; dimensione: number }[] };
  ($('qr') as HTMLImageElement).src = d.qr;
  scade = d.scade;
  const el = $('elenco');
  el.replaceChildren(...d.file.map((f) => {
    const g = genere(f.nome);
    const icona: NomeGlifo = g === 'immagine' ? 'foto' : g === 'video' ? 'video' : 'file';
    const r = document.createElement('div'); r.className = 'riga';
    const ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = svgGlifo(icona, 18, 'currentColor', 1.9);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = `${f.nome} · ${dimensione(f.dimensione)}`;
    const x = document.createElement('button'); x.className = 'x'; x.title = 'Togli'; x.innerHTML = svgGlifo('chiudi', 14, 'currentColor', 2.2);
    x.onclick = () => api.togliSenzaApp(f.id);
    r.append(ic, n, x);
    return r;
  }));
});

setInterval(() => {
  const s = Math.max(0, Math.round((scade - Date.now()) / 1000));
  $('scade').textContent = s ? `Si spegne da sola tra ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
}, 500);

$('logo').innerHTML = svgGlifo('qr', 24, '#fff', 2);
$('scudo').innerHTML = svgGlifo('scudo', 15, 'currentColor', 1.9);
$('scegli').innerHTML = svgGlifo('file', 16, '#fff', 2);
$('scegli').append('Scegli file');
$('scegli').onclick = () => api.scegliSenzaApp();

const zona = $('zona');
addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('sopra'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) zona.classList.remove('sopra'); });
addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove('sopra');
  const p = [...(e.dataTransfer?.files ?? [])].map((f) => api.percorso(f)).filter(Boolean);
  if (p.length) api.aggiungiSenzaApp(p);
});
api.senzaAppPronta();
