import type { ApiFionda } from '../preload';
import { simbolo, svgGlifo, svgSimbolo } from '../core/icone';

declare global { interface Window { fionda: ApiFionda } }
const api = window.fionda;
const $ = (id: string) => document.getElementById(id)!;

api.suRichiesta((x) => {
  const d = x as { nome: string; simboli: number[]; pc: string } | null;
  if (!d) return;
  $('titolo').textContent = `${d.nome} vuole collegarsi`;
  const s = $('simboli');
  s.replaceChildren(...d.simboli.map((n) => { const el = document.createElement('span'); el.innerHTML = svgSimbolo(n, 38); el.title = simbolo(n).nome; return el; }));
});

$('icTelefono').innerHTML = svgGlifo('telefono', 26, '#fff', 1.9);
$('icPc').innerHTML = svgGlifo('pc', 26, '#fff', 1.9);

$('si').onclick = () => {
  $('carta').classList.add('fatto');
  $('sotto').textContent = 'Collegato! Da adesso il telefono riconosce questo PC da solo.';
  api.rispondiRichiesta(true);
};
$('no').onclick = () => api.rispondiRichiesta(false);
addEventListener('keydown', (e) => { if (e.key === 'Escape') api.rispondiRichiesta(false); });
api.richiestaPronta();
