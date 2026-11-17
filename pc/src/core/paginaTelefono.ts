/**
 * La pagina che si apre in Safari nella modalità "senza app" (riserva): il telefono non ha Fionda,
 * inquadra un QR e da qui scarica i file del PC o manda le sue foto al PC. Puro: si prova con Vitest.
 */
import { GLIFI, SCINTILLA, type NomeGlifo } from './icone';
import { dimensione, genere } from './nomi';

export interface FileCondiviso { id: string; nome: string; dimensione: number }

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const ico = (n: NomeGlifo, dim = 22, colore = 'currentColor') =>
  `<svg width="${dim}" height="${dim}" viewBox="0 0 24 24" fill="none" stroke="${colore}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${GLIFI[n]}"/></svg>`;

export function paginaTelefono(o: { pc: string; base: string; file: FileCondiviso[] }): string {
  const righe = o.file.map((f) => {
    const g = genere(f.nome);
    const icona: NomeGlifo = g === 'immagine' ? 'foto' : g === 'video' ? 'video' : 'file';
    return `<a class="riga" href="${o.base}/f/${encodeURIComponent(f.id)}" download="${escapeHtml(f.nome)}">
      <span class="ic">${ico(icona)}</span><span class="t"><b>${escapeHtml(f.nome)}</b><small>${dimensione(f.dimensione)}</small></span>
      <span class="giu">${ico('su', 20)}</span></a>`;
  }).join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>Fionda · ${escapeHtml(o.pc)}</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;color:#f2efff;font:16px/1.45 -apple-system,system-ui,sans-serif;
background:radial-gradient(90% 50% at 10% 0%,rgba(91,59,255,.55),transparent 70%),radial-gradient(70% 40% at 100% 100%,rgba(20,169,222,.28),transparent 70%),#07070f;padding:28px 18px 40px}
.testa{display:flex;align-items:center;gap:12px;margin-bottom:22px}.logo{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#7b5cff;box-shadow:0 8px 24px -6px #7b5cff}
h1{font-size:22px;margin:0;letter-spacing:5px}.sotto{color:#9a95c4;font-size:13.5px}
.carta{background:rgba(22,19,48,.78);border:1px solid rgba(187,168,255,.16);border-radius:22px;padding:16px;margin-bottom:14px}
h2{font-size:11.5px;letter-spacing:1.6px;color:#9a95c4;margin:0 0 10px;font-weight:800}
.riga{display:flex;align-items:center;gap:12px;padding:10px 4px;color:inherit;text-decoration:none;border-top:1px solid rgba(187,168,255,.1)}
.riga:first-of-type{border-top:0}.ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:#bba8ff;background:rgba(123,92,255,.16);flex:none}
.t{flex:1;min-width:0;display:flex;flex-direction:column}.t b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t small{color:#9a95c4}
.giu{color:#5ce1ff;transform:rotate(180deg);display:grid}
.manda{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;border-radius:16px;border:0;background:#7b5cff;color:#fff;font:700 17px inherit;box-shadow:0 10px 26px -10px #7b5cff}
.vuoto{color:#9a95c4;font-size:14px}#stato{margin-top:12px;color:#9a95c4;font-size:14px;min-height:20px}
.barra{height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:10px;display:none}.barra i{display:block;height:100%;width:0;background:#5ce1ff;transition:width .15s}
.nota{color:#6f6a99;font-size:12.5px;text-align:center;margin-top:18px}
</style></head><body>
<div class="testa"><div class="logo"><svg width="24" height="24" viewBox="0 0 24 24"><path d="${SCINTILLA}" fill="#fff"/></svg></div>
<div><h1>FIONDA</h1><div class="sotto">Collegato a ${escapeHtml(o.pc)} · senza app</div></div></div>
<div class="carta"><h2>DAL PC AL TELEFONO</h2>${righe || '<div class="vuoto">Il PC non ha ancora scelto file da mandarti.</div>'}</div>
<div class="carta"><h2>DAL TELEFONO AL PC</h2>
<label class="manda">${ico('su', 22, '#fff')} Scegli foto o file<input id="scegli" type="file" multiple hidden></label>
<div class="barra" id="barra"><i></i></div><div id="stato"></div></div>
<div class="nota">Funziona finché sul PC è aperta la finestra "Senza app". Con l'app Fionda è tutto più veloce e c'è l'effetto sul bordo.</div>
<script>
const stato=document.getElementById('stato'),barra=document.getElementById('barra'),riemp=barra.firstElementChild;
document.getElementById('scegli').addEventListener('change',async(e)=>{
  const files=[...e.target.files];if(!files.length)return;barra.style.display='block';
  for(let i=0;i<files.length;i++){const f=files[i];
    stato.textContent=(files.length>1?(i+1)+' di '+files.length+' · ':'')+'Invio '+f.name+'…';
    const ok=await new Promise((fatto)=>{const x=new XMLHttpRequest();x.open('POST','${o.base}/su?nome='+encodeURIComponent(f.name));
      x.upload.onprogress=(p)=>{if(p.lengthComputable)riemp.style.width=((i+p.loaded/p.total)/files.length*100)+'%'};
      x.onload=()=>fatto(x.status===200);x.onerror=()=>fatto(false);x.send(f);});
    if(!ok){stato.textContent='Invio non riuscito: la finestra sul PC è ancora aperta?';return;}}
  riemp.style.width='100%';stato.textContent=files.length>1?files.length+' file arrivati sul PC':'Arrivato sul PC';e.target.value='';
});
</script></body></html>`;
}
