'use strict';
/* ===== Rotas, partida e aplicativo instalável ===== */
const app = $('#app');
const ROTAS_ADM = { aderencia: Dash, programacao: Prog, relatorios: Rel, cadastros: Cad };

// ir('login', 'campo'|'pcm') | ir('apontamento') | ir('aderencia'|'programacao'|'relatorios'|'cadastros')
function ir(rota, perfil) {
  if (perfil) ls.set('pcm_perfil', perfil);
  const alvo = '#' + rota;
  if (location.hash !== alvo) { location.hash = alvo; return; } // dispara 'hashchange'
  desenharRota();
}

function desenharRota() {
  const rota = (location.hash || '#login').slice(1);
  document.querySelectorAll('.modal-ov').forEach(o => o.remove());
  window.scrollTo(0, 0);
  if (rota === 'apontamento') {
    if (!Sessao.colab()) return ir('login', 'campo');
    document.title = APP.nome + ' — Apontamento'; return Op.mount();
  }
  if (ROTAS_ADM[rota]) {
    if (!Sessao.gestao()) return ir('login', 'pcm');
    document.title = APP.nome + ' — ' + rota.charAt(0).toUpperCase() + rota.slice(1);
    return ROTAS_ADM[rota].mount();
  }
  document.title = APP.nome + ' — AngloGold Ashanti';
  Login.mount(Login.perfilSalvo());
}

window.addEventListener('hashchange', desenharRota);

// Aplicativo instalável: ícone na tela inicial e abertura rápida.
[['manifest', 'manifest.json'], ['apple-touch-icon', 'icon-192.png']].forEach(([rel, href]) => { const l = document.createElement('link'); l.rel = rel; l.href = href; document.head.appendChild(l); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

desenharRota();
