import type { ApiFionda } from '../preload';
import type { VoceCronologia } from '../core/cronologia';
import { dimensione } from '../core/nomi';
import { svgGlifo, type NomeGlifo } from '../core/icone';

declare global { interface Window { fionda: ApiFionda } }
const api = window.fionda;
const $ = (id: string) => document.getElementById(id)!;

type Voce = VoceCronologia & { esiste: boolean };
const ICONA: Record<string, NomeGlifo> = { immagine: 'foto', video: 'video', testo: 'link', altro: 'file', collegato: 'telefono' };

function bottone(icona: NomeGlifo, titolo: string, clic: () => void, testo = '') {
  const b = document.createElement('button');
  b.title = titolo;
  b.innerHTML = svgGlifo(icona, 16, 'currentColor', 2);
  if (testo) b.append(testo);
  b.onclick = clic;
  return b;
}

function riga(v: Voce) {
  const r = document.createElement('div');
  r.className = 'voce' + (v.esiste ? '' : ' manca');
  const fig = document.createElement('div');
  fig.className = 'fig';
  fig.innerHTML = svgGlifo(ICONA[v.genere] ?? 'file', 22, 'currentColor', 1.7);
  if (v.genere === 'immagine' || v.genere === 'video') {
    api.miniatura(v.id).then((m) => { if (m) { fig.innerHTML = ''; const i = document.createElement('img'); i.src = m; fig.append(i); } });
  }
  const t = document.createElement('div'); t.className = 'testo';
  const n = document.createElement('div'); n.className = 'nome'; n.textContent = v.nome;
  const info = document.createElement('div'); info.className = 'info';
  const ora = new Date(v.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  info.innerHTML = svgGlifo(v.verso === 'arrivato' ? 'telefono' : 'pc', 13, 'currentColor', 2);
  info.append(v.genere === 'collegato' ? `${v.telefono} collegato · ${ora}`
    : `${v.verso === 'arrivato' ? `da ${v.telefono}` : `a ${v.telefono}`} · ${ora}${v.dimensione ? ` · ${dimensione(v.dimensione)}` : ''}${v.esiste ? '' : ' · non c\'è più'}`);
  t.append(n, info);
  const az = document.createElement('div'); az.className = 'azioni';
  if (v.testo) az.append(bottone('link', 'Copia di nuovo negli appunti', () => api.apriVoce(v.id, 'copia'), 'Copia'));
  else if (v.percorso && v.esiste) {
    az.append(bottone('file', 'Apri', () => api.apriVoce(v.id, 'apri')));
    az.append(bottone('cartella', 'Mostra nella cartella', () => api.apriVoce(v.id, 'cartella')));
  }
  r.append(fig, t, az);
  return r;
}

api.suCronologia((x) => {
  const d = x as { gruppi: { giorno: string; voci: Voce[] }[]; vuota: boolean; cartella: string };
  const el = $('elenco');
  el.replaceChildren();
  $('svuota').style.display = d.vuota ? 'none' : '';
  if (d.vuota) {
    el.innerHTML = `<div class="vuota"><div class="grande">${svgGlifo('attesa', 36, 'currentColor', 1.6)}</div>Ancora niente.<br>I file che arrivano o mandi compaiono qui.</div>`;
    return;
  }
  for (const g of d.gruppi) {
    const h = document.createElement('h2'); h.textContent = g.giorno;
    el.append(h, ...g.voci.map(riga));
  }
});

$('cartella').innerHTML = svgGlifo('cartella', 16, 'currentColor', 2);
$('cartella').append('Download\\Fionda');
$('cartella').onclick = () => api.cartellaCronologia();
$('svuota').onclick = () => { if (confirm('Svuotare la cronologia? I file restano dove sono.')) api.svuotaCronologia(); };
api.cronologiaPronta();
