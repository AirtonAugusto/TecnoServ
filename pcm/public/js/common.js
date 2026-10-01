'use strict';
const STATUS = {
  concluida: { nome: 'Concluída', cor: 'v' }, iniciada: { nome: 'Iniciada', cor: 'a' },
  pendente: { nome: 'Pendente', cor: 'r' }, extra: { nome: 'Extra', cor: 'z' },
};
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtData = s => s ? s.split('-').reverse().slice(0, 2).join('/') : '';
const fmtDataCompleta = s => s.split('-').reverse().join('/');
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaSem = s => DIAS[new Date(s + 'T00:00:00Z').getUTCDay()];

async function api(metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url.startsWith('/api/gestao')) { pedirLogin(); throw new Error('Login necessário'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
function toast(msg, erro) {
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 5000 : 2500);
}
function modal(html) {
  const o = document.createElement('div');
  o.className = 'overlay'; o.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(o);
  o.fechar = () => o.remove();
  return o;
}

// ---------- Área da gestão: navegação + login ----------
function cabecalhoGestao(ativa) {
  const links = [['dashboard.html', 'Aderência'], ['calendario.html', 'Programação'], ['cadastros.html', 'Cadastros']];
  const h = document.createElement('header'); h.className = 'top';
  h.innerHTML = `<a class="marca" href="/"><img src="img/logo-anglo.png" alt="AngloGold Ashanti"></a><h1>ADM · Informe de Turno</h1><nav>${links.map(([u, n]) => `<a href="${u}" class="${u === ativa ? 'on' : ''}">${n}</a>`).join('')}<a href="/">Início</a></nav><button id="sair" class="peq">Sair</button>`;
  document.body.prepend(h);
  const f = document.createElement('footer'); f.className = 'assinatura'; f.innerHTML = 'Desenvolvido por <b>Airton C. M. Augusto</b>'; document.body.append(f);
  $('#sair').onclick = async () => { await api('POST', '/api/auth/logout'); location.reload(); };
}
function pedirLogin() {
  if ($('#login-ov')) return;
  const o = modal(`<h2>Acesso restrito — ADM</h2><form id="lf"><label>Senha</label><input type="password" id="senha" autocomplete="current-password" autofocus><p class="mut" id="lerro" style="color:var(--vermelho)"></p><div class="acoes"><a class="btn" href="/">Voltar ao início</a><button class="pri">Entrar</button></div></form>`);
  o.id = 'login-ov';
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try { await api('POST', '/api/auth/login', { senha: $('#senha').value }); location.reload(); }
    catch (err) { $('#lerro').textContent = err.message; }
  };
}
async function iniciarGestao(pagina, aoAutenticar) {
  cabecalhoGestao(pagina);
  const { autenticado } = await api('GET', '/api/auth/status');
  if (!autenticado) return pedirLogin();
  aoAutenticar();
}
