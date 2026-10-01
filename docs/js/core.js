'use strict';
/* ===== Núcleo: configuração, chamadas ao servidor e utilidades ===== */

// Endereço da API (Apps Script publicado como App da Web).
const API_URL = 'https://script.google.com/macros/s/AKfycbycutUqtHnSs8l2U20bnvXI8adnwrhnOfvA2itqfAX9EwVQ8cOKkGgVkU1hratxBuMYdg/exec';

// Textos da marca (edite aqui para trocar nomes em todas as telas)
const APP = {
  nome: 'Informe de Turno',
  area: 'PCM Alta Tensão',
  equipes: 'AGA · Cardozo · SM&A',
  lema: 'Gestão de OS, aderência e programação',
  supervisor: 'Poderoso',
  descricao: 'Apontamento do turno em campo, aderência por equipe e programação das próximas 3 semanas no mesmo lugar.',
};
const AUTOR = 'Airton C. M. Augusto';
const assinatura = (cls = '') => `<div class="assinatura ${cls}">Desenvolvido por <b>${esc(AUTOR)}</b></div>`;
const TURNOS = ['Turno A', 'Turno B', 'Turno C', 'Administrativo'];
const LETRAS = ['A', 'B', 'C'];

// Grupos de colaboradores: as letras (A, B, C) rodam turno; ADM não.
const GRUPOS = [['A', 'Turno A'], ['B', 'Turno B'], ['C', 'Turno C'], ['ADM', 'ADM'], ['?', 'Sem letra']];
const grupoDe = c => (c.regime === 'ADM' ? 'ADM' : (LETRAS.includes(c.letra) ? c.letra : '?'));
const rotuloGrupo = k => (GRUPOS.find(g => g[0] === k) || GRUPOS[4])[1];
const rotuloTurno = c => (c.regime === 'ADM' ? 'ADM' : (c.letra ? 'Turno ' + c.letra : 'Turno'));

// Piadas internas para quando alguém esquece de preencher (troque o apelido em APP.supervisor)
const FRASES_MALHA = [
  () => 'Vai esquecer de preencher algo? Vai cair na malha fina! 🕵️',
  () => `Esqueceu de preencher, hein? O ${APP.supervisor} está de olho 👀`,
  () => `Deixou passar... o ${APP.supervisor} vê tudo, viu? 👀`,
  () => 'Campo em branco detectado. Malha fina chamando! 📞',
];
const fraseMalha = () => FRASES_MALHA[Math.floor(Math.random() * FRASES_MALHA.length)]();
const PRIORIDADES = ['Alta', 'Média', 'Baixa'];
const MOTIVOS = {
  material: 'Falta de material / sobressalente',
  liberacao: 'Equipamento sem liberação da operação',
  prioridade: 'Prioridade alterada / emergência',
  efetivo: 'Falta de efetivo',
  distribuicao: 'Programação não chegou à equipe',
};
const STATUS = {
  programada: { label: 'Programada', short: 'Programada', cor: '#9AA3AF' },
  concluida: { label: 'Concluída', short: 'Concluída', cor: '#22C55E' },
  iniciada: { label: 'Iniciada / Parcial', short: 'Parcial', cor: '#EAB308' },
  pendente: { label: 'Pendente', short: 'Pendente', cor: '#EF4444' },
  extra: { label: 'Atividade extra', short: 'Extra', cor: '#3B82F6' },
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtData = s => (s ? s.split('-').reverse().slice(0, 2).join('/') : '');
const fmtDataCompleta = s => (s ? s.split('-').reverse().join('/') : '');
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const diaIdx = s => (new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = segunda
const diaSem = s => DIAS[diaIdx(s)];
const somarDias = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const pc = v => String(v).replace('.', ',') + '%';

/* ---------- ícones ---------- */
const ICONES = {
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"></path>',
  mais: '<path d="M12 5v14M5 12h14"></path>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  apont: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4h6v3H9zM9 12h6M9 16h4"></path>',
  ader: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>',
  prog: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
  rel: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"></path>',
  pessoas: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"></path>',
  chave: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"></path>',
  pino: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"></path>',
  enviar: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"></path>',
  ok: '<path d="M5 12l5 5 9-10"></path>',
  x: '<path d="M6 6l12 12M18 6L6 18"></path>',
  lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
  alerta: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16.5v.01"></path>',
  mover: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"></path>',
};
const icone = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;

/* ---------- avatares ---------- */
const AV_CORES = ['#334155', '#0F766E', '#6D28D9', '#9D174D', '#7C2D12', '#1D4ED8', '#B45309', '#047857'];
function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0][0] || '?') + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ''))).toUpperCase();
}
function corDe(chave) {
  let h = 0; for (const ch of String(chave || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_CORES[h % AV_CORES.length];
}
const avatar = (nome, chave, tam = 32, fonte = 12) =>
  `<span class="avatar" style="width:${tam}px;height:${tam}px;font-size:${fonte}px;background:${corDe(chave || nome)}">${esc(iniciais(nome))}</span>`;

/* ---------- armazenamento ---------- */
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
  getJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
};
const ss = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return (window.__ss || {})[k] || null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { (window.__ss = window.__ss || {})[k] = v; } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { if (window.__ss) delete window.__ss[k]; } },
};
// Sessões: colaborador (matrícula + turno) e gestão (e-mail + senha)
const Sessao = {
  colab: () => ss.get('pcm_colab'),
  gestao: () => ss.get('pcm_gestao'),
  entrarColab(perfil) { ss.set('pcm_colab', perfil); },
  entrarGestao(g) { ss.set('pcm_gestao', g); },
  sairColab() { ss.del('pcm_colab'); },
  sairGestao() { ss.del('pcm_gestao'); },
};

/* ---------- chamadas ao servidor ---------- */
let pendentes = 0;
function carregando(delta) {
  pendentes = Math.max(0, pendentes + delta);
  let b = document.getElementById('barra-carregando');
  if (!b) { b = document.createElement('div'); b.id = 'barra-carregando'; document.body.appendChild(b); }
  b.className = pendentes ? 'ativa' : '';
}

// Resolve com os dados ou rejeita com Error(mensagem). Sessão da gestão vencida → volta ao login.
function rpc(metodo, args) {
  const g = Sessao.gestao();
  const params = Object.assign({}, args || {}, { token: g ? g.token : '' });
  carregando(1);
  return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ metodo, args: params }), redirect: 'follow' })
    .then(r => r.json())
    .catch(() => { throw new Error('Não foi possível falar com o servidor. Verifique a internet e tente de novo.'); })
    .then(r => {
      if (r && r.ok) return r.dados;
      if (r && r.auth) { Sessao.sairGestao(); ir('login', 'pcm'); }
      throw new Error((r && r.erro) || 'Falha na resposta do servidor.');
    })
    .finally(() => carregando(-1));
}

/* ---------- avisos e janelas ---------- */
let toastT;
function toast(msg, erro) {
  let el = $('#toast-b');
  if (!el) { el = document.createElement('div'); el.id = 'toast-b'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.className = 'toast-b' + (erro ? ' erro' : '');
  el.innerHTML = `<div class="pop">${icone(erro ? 'alerta' : 'ok')}${esc(msg)}</div>`;
  clearTimeout(toastT); toastT = setTimeout(() => { el.innerHTML = ''; }, erro ? 5000 : 2600);
}
function modal(html) {
  const o = document.createElement('div');
  o.className = 'modal-ov'; o.innerHTML = `<div class="modal-c pop" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(o);
  o.fechar = () => o.remove();
  return o;
}

/* ---------- foto: reduz no navegador (máx. 1280 px, JPEG) ---------- */
function reduzirFoto(file) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const e = Math.min(1, 1280 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * e); cv.height = Math.round(img.height * e);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('foto')); };
    img.src = url;
  });
}

/* ---------- barra lateral da ADM ---------- */
function marcaImg(largura) { return `<img src="logo.png" alt="AngloGold Ashanti" style="width:${largura}px">`; }
