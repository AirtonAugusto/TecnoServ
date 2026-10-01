/**
 * Sistema PCM — Apontamento de turno, aderência e programação semanal.
 * Google Apps Script (Web App). Dados: Google Sheets (planilha que contém este script).

 * Arquivos do projeto: Principal.gs, Dados.gs, Operacional.gs, Adm.gs, Indicadores.gs e (HTML) Pagina, Estilos,
 * JsLogo, JsNucleo, JsOperacional, JsAderencia, JsProgramacao, JsCadastros, JsTelas.
 * Fotos: pasta "PCM-Fotos" no Google Drive de quem publicou o app.
 *
 * Configuração (Configurações do projeto > Propriedades do script):
 *   GESTAO_SENHA  = senha da área ADM (obrigatória)
 * Opcionais (criadas automaticamente): SESSION_SECRET, FOTOS_FOLDER_ID
 */

var TZ_ = 'America/Sao_Paulo';
var STATUS_APONT_ = ['concluida', 'iniciada', 'pendente'];
var CLASSIF_ = ['BPF', 'Corretiva'];

// Tipos: s=texto, b=booleano, j=JSON
var SCHEMAS_ = {
  equipes: { id: 's', nome: 's' },
  colaboradores: { id: 's', nome: 's', equipe_id: 's', ativo: 'b' },
  atividades: { id: 's', os: 's', descricao: 's', data: 's', colaborador_id: 's', criado_em: 's' },
  apontamentos: {
    id: 's', envio_id: 's', atividade_id: 's', colaborador_id: 's', equipe_id: 's', data: 's',
    status: 's', classificacao: 's', os_extra: 's', descricao_extra: 's', criado_em: 's',
  },
  envios: { id: 's', data: 's', colaborador_id: 's', equipe_id: 's', observacao: 's', fotos: 'j', criado_em: 's' },
};

/* ======================= ENTRADA ======================= */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Pagina')
    .setTitle('Sistema PCM — AngloGold Ashanti')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Execute uma vez no editor (Executar > preparar) para criar as abas e autorizar o script. */
function preparar() {
  Object.keys(SCHEMAS_).forEach(function (t) { folha_(t); });
  pastaFotos_();
  segredo_();
  var ok = !!PropertiesService.getScriptProperties().getProperty('GESTAO_SENHA');
  Logger.log(ok ? 'Pronto. Abas criadas e senha encontrada.' : 'ATENÇÃO: defina a propriedade GESTAO_SENHA em Configurações do projeto.');
}

/* ======================= DISPATCHER ======================= */

function mapaApi_() {
  return {
  'publico.colaboradores': publicoColaboradores_,
  'publico.tarefas': publicoTarefas_,
  'publico.enviar': publicoEnviar_,
  'auth.login': authLogin_,
  'auth.status': function (a) { return { autenticado: tokenValido_(a.token) }; },
  'gestao.equipes': function () { return todos_('equipes'); },
  'gestao.equipe.salvar': gEquipeSalvar_,
  'gestao.equipe.excluir': gEquipeExcluir_,
  'gestao.colaboradores': function () { return todos_('colaboradores'); },
  'gestao.colaborador.salvar': gColabSalvar_,
  'gestao.colaborador.inativar': gColabInativar_,
  'gestao.calendario': gCalendario_,
  'gestao.atividade.salvar': gAtividadeSalvar_,
  'gestao.atividade.excluir': gAtividadeExcluir_,
  'gestao.atividade.duplicar': gAtividadeDuplicar_,
  'gestao.aderencia': gAderencia_,
  'gestao.relatorios': gRelatorios_,
  'gestao.foto': gFoto_,
  };
}
var ESCRITA_ = {
  'publico.enviar': 1, 'gestao.equipe.salvar': 1, 'gestao.equipe.excluir': 1, 'gestao.colaborador.salvar': 1,
  'gestao.colaborador.inativar': 1, 'gestao.atividade.salvar': 1, 'gestao.atividade.excluir': 1, 'gestao.atividade.duplicar': 1,
};

/** Único ponto de entrada chamado pelo navegador (google.script.run.rpc). */
function rpc(metodo, args) {
  args = args || {};
  var lock = null;
  try {
    var fn = mapaApi_()[metodo];
    if (!fn) throw erro_('Método inválido.');
    if (metodo.indexOf('gestao.') === 0 && !tokenValido_(args.token)) {
      return { ok: false, erro: 'Acesso restrito à ADM. Faça login.', auth: true };
    }
    if (ESCRITA_[metodo]) { lock = LockService.getScriptLock(); lock.waitLock(25000); }
    cache_ = {};
    return { ok: true, dados: fn(args) };
  } catch (e) {
    if (e && e.pcm) return { ok: false, erro: e.message };
    console.error(e && e.stack || e);
    return { ok: false, erro: 'Erro interno. Tente novamente.' };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function erro_(msg) { var e = new Error(msg); e.pcm = true; return e; }
function exigir_(cond, msg) { if (!cond) throw erro_(msg); }
function txt_(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

/* ======================= DATAS ======================= */

var RE_DATA_ = /^\d{4}-\d{2}-\d{2}$/;
function ehData_(s) {
  if (typeof s !== 'string' || !RE_DATA_.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function hoje_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd'); }
function somarDias_(s, n) {
  var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diaSemana_(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); }
function segunda_(s) { var dow = diaSemana_(s); return somarDias_(s, dow === 0 ? -6 : 1 - dow); }
function semanaISO_(s) { // ISO 8601
  var d = new Date(s + 'T00:00:00Z'), dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  var ano = d.getUTCFullYear(), ini = new Date(Date.UTC(ano, 0, 1));
  return { ano: ano, numero: Math.ceil(((d - ini) / 86400000 + 1) / 7) };
}
function intervalo_(de, ate) {
  var out = [];
  for (var d = de; d <= ate && out.length < 400; d = somarDias_(d, 1)) out.push(d);
  return out;
}

/** Camada de dados (Google Sheets) e autenticação da ADM. */

/* ======================= DADOS (Google Sheets) ======================= */

var cache_ = {};

function planilha_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Este script precisa estar vinculado a uma planilha (Extensões > Apps Script).');
  return ss;
}

function folha_(t) {
  var ss = planilha_(), sh = ss.getSheetByName(t), campos = Object.keys(SCHEMAS_[t]);
  if (!sh) {
    sh = ss.insertSheet(t);
    sh.getRange('A:Z').setNumberFormat('@'); // texto puro: evita converter datas/ids
    sh.getRange(1, 1, 1, campos.length).setValues([campos]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function celula_(v, tipo, campo) {
  if (v instanceof Date) v = campo === 'data' ? Utilities.formatDate(v, TZ_, 'yyyy-MM-dd') : v.toISOString();
  if (tipo === 'b') return v === true || String(v).toLowerCase() === 'true';
  if (tipo === 'j') { try { return v ? JSON.parse(v) : []; } catch (e) { return []; } }
  return v == null ? '' : String(v);
}

function todos_(t) {
  if (cache_[t]) return cache_[t];
  var sch = SCHEMAS_[t], campos = Object.keys(sch), sh = folha_(t);
  var vals = sh.getDataRange().getValues(), cab = vals[0] || [], out = [];
  for (var i = 1; i < vals.length; i++) {
    var l = vals[i];
    if (l.every(function (c) { return c === ''; })) continue;
    var row = { _linha: i + 1 };
    campos.forEach(function (c) { row[c] = celula_(l[cab.indexOf(c)], sch[c], c); });
    out.push(row);
  }
  cache_[t] = out;
  return out;
}
function achar_(t, id) { var r = todos_(t).filter(function (x) { return x.id === id; }); return r[0] || null; }

function paraLinha_(t, row) {
  var sch = SCHEMAS_[t];
  return Object.keys(sch).map(function (c) {
    var v = row[c];
    return sch[c] === 'j' ? JSON.stringify(v || []) : sch[c] === 'b' ? !!v : String(v == null ? '' : v);
  });
}

function inserir_(t, obj) {
  var sch = SCHEMAS_[t], row = {};
  Object.keys(sch).forEach(function (c) { row[c] = obj[c] != null ? obj[c] : (sch[c] === 'j' ? [] : sch[c] === 'b' ? false : ''); });
  if (!row.id) row.id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  folha_(t).appendRow(paraLinha_(t, row));
  cache_[t] = null;
  return row;
}
function inserirVarios_(t, objs) { // uma única gravação para vários registros
  if (!objs.length) return [];
  var sch = SCHEMAS_[t], sh = folha_(t), rows = objs.map(function (obj) {
    var row = {};
    Object.keys(sch).forEach(function (c) { row[c] = obj[c] != null ? obj[c] : (sch[c] === 'j' ? [] : sch[c] === 'b' ? false : ''); });
    if (!row.id) row.id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    return row;
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, Object.keys(sch).length).setValues(rows.map(function (r) { return paraLinha_(t, r); }));
  cache_[t] = null;
  return rows;
}
function atualizar_(t, id, patch) {
  var row = achar_(t, id); if (!row) return null;
  Object.keys(SCHEMAS_[t]).forEach(function (c) { if (c !== 'id' && c in patch) row[c] = patch[c]; });
  folha_(t).getRange(row._linha, 1, 1, Object.keys(SCHEMAS_[t]).length).setValues([paraLinha_(t, row)]);
  cache_[t] = null;
  return row;
}
function removerOnde_(t, fn) {
  var linhas = todos_(t).filter(fn).map(function (r) { return r._linha; }).sort(function (a, b) { return b - a; });
  var sh = folha_(t);
  linhas.forEach(function (l) { sh.deleteRow(l); });
  cache_[t] = null;
  return linhas.length;
}

/* ======================= AUTENTICAÇÃO ======================= */

function props_() { return PropertiesService.getScriptProperties(); }
function segredo_() {
  var p = props_(), s = p.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SESSION_SECRET', s); }
  return s;
}
function iguais_(a, b) { // comparação em tempo constante
  a = String(a); b = String(b);
  var r = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
function assinar_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, segredo_()));
}
function emitirToken_() {
  var p = Utilities.base64EncodeWebSafe(JSON.stringify({ exp: Date.now() + 12 * 3600 * 1000 }));
  return p + '.' + assinar_(p);
}
function tokenValido_(tok) {
  if (!tok || String(tok).indexOf('.') < 0) return false;
  var partes = String(tok).split('.');
  if (!iguais_(partes[1], assinar_(partes[0]))) return false;
  try {
    var dados = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
    return dados.exp > Date.now();
  } catch (e) { return false; }
}
function authLogin_(a) {
  var senha = props_().getProperty('GESTAO_SENHA');
  exigir_(senha, 'A senha da ADM ainda não foi definida (propriedade GESTAO_SENHA do script).');
  var c = CacheService.getScriptCache(), falhas = Number(c.get('falhas') || 0);
  exigir_(falhas < 8, 'Muitas tentativas erradas. Aguarde 15 minutos.');
  if (!iguais_(a.senha || '', senha)) {
    c.put('falhas', String(falhas + 1), 900);
    throw erro_('Senha incorreta.');
  }
  c.remove('falhas');
  return { token: emitirToken_() };
}

/** Tela OPERACIONAL: tarefas do colaborador, envio do turno e fotos. */

/* ======================= TELA OPERACIONAL (pública) ======================= */

function ultimosApont_() { // atividade_id -> apontamento mais recente
  var m = {};
  todos_('apontamentos').forEach(function (ap) {
    if (!ap.atividade_id) return;
    var u = m[ap.atividade_id];
    if (!u || ap.data > u.data || (ap.data === u.data && ap.criado_em >= u.criado_em)) m[ap.atividade_id] = ap;
  });
  return m;
}
function colabAtivo_(id) { var c = achar_('colaboradores', id); return c && c.ativo ? c : null; }

function publicoColaboradores_() {
  var eq = {}; todos_('equipes').forEach(function (e) { eq[e.id] = e.nome; });
  return todos_('colaboradores').filter(function (c) { return c.ativo; })
    .map(function (c) { return { id: c.id, nome: c.nome, equipe: eq[c.equipe_id] || '' }; })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

function publicoTarefas_(a) {
  var c = colabAtivo_(a.id); exigir_(c, 'Colaborador não encontrado.');
  var hoje = hoje_(), data = a.data || hoje;
  exigir_(ehData_(data) && data <= hoje && data >= somarDias_(hoje, -2), 'Data inválida (só hoje e os 2 dias anteriores).');

  var envio = todos_('envios').filter(function (e) { return e.colaborador_id === c.id && e.data === data; })[0] || null;
  var apDoDia = todos_('apontamentos').filter(function (x) { return x.colaborador_id === c.id && x.data === data; });
  var porAtiv = {}; apDoDia.forEach(function (x) { if (x.atividade_id) porAtiv[x.atividade_id] = x; });
  var ult = ultimosApont_();
  var fmt = function (x) { return { id: x.id, os: x.os, descricao: x.descricao, data: x.data, status: porAtiv[x.id] ? porAtiv[x.id].status : '' }; };

  var minhas = todos_('atividades').filter(function (x) { return x.colaborador_id === c.id; });
  var doDia = minhas.filter(function (x) { return x.data === data; }).map(fmt);
  var anteriores = minhas.filter(function (x) { return x.data < data && x.data >= somarDias_(data, -14); }).filter(function (x) {
    if (porAtiv[x.id]) return true;
    var u = ult[x.id]; return !u || u.status !== 'concluida';
  }).map(function (x) { var o = fmt(x); o.ultimo_status = ult[x.id] ? ult[x.id].status : ''; return o; })
    .sort(function (x, y) { return x.data.localeCompare(y.data); });

  var eq = achar_('equipes', c.equipe_id);
  return {
    colaborador: { id: c.id, nome: c.nome, equipe: eq ? eq.nome : '' },
    data: data, hoje: hoje, atividades: doDia, anteriores: anteriores,
    extras: apDoDia.filter(function (x) { return x.status === 'extra'; }).map(function (x) { return { os: x.os_extra, descricao: x.descricao_extra, classificacao: x.classificacao }; }),
    observacao: envio ? envio.observacao : '',
    fotos: envio ? envio.fotos.length : 0,
    enviado_em: envio ? envio.criado_em : null,
  };
}

function pastaFotos_() {
  var p = props_(), id = p.getProperty('FOTOS_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  var pasta = DriveApp.createFolder('PCM-Fotos');
  p.setProperty('FOTOS_FOLDER_ID', pasta.getId());
  return pasta;
}
function salvarFoto_(dataUrl, envioId, n) {
  var m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+\/=]+)$/.exec(dataUrl || '');
  exigir_(m, 'Foto inválida.');
  var bytes = Utilities.base64Decode(m[2]);
  exigir_(bytes.length <= 4 * 1024 * 1024, 'Foto muito grande (máx. 4 MB).');
  var ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  var blob = Utilities.newBlob(bytes, 'image/' + m[1], envioId + '-' + n + '.' + ext);
  return pastaFotos_().createFile(blob).getId();
}

function publicoEnviar_(b) {
  var c = colabAtivo_(b.colaborador_id); exigir_(c, 'Colaborador inválido.');
  var hoje = hoje_();
  exigir_(ehData_(b.data) && b.data <= hoje && b.data >= somarDias_(hoje, -2), 'Data inválida.');
  var itens = Array.isArray(b.itens) ? b.itens : [], extras = Array.isArray(b.extras) ? b.extras : [], fotos = Array.isArray(b.fotos) ? b.fotos : [];
  exigir_(itens.length + extras.length <= 100 && fotos.length <= 8, 'Envio grande demais.');

  var minhas = {}; todos_('atividades').forEach(function (x) { if (x.colaborador_id === c.id) minhas[x.id] = x; });
  itens.forEach(function (i) {
    exigir_(minhas[i.atividade_id], 'Atividade não pertence ao colaborador.');
    exigir_(STATUS_APONT_.indexOf(i.status) >= 0, 'Status inválido.');
  });
  extras.forEach(function (x) {
    exigir_(CLASSIF_.indexOf(x.classificacao) >= 0, 'Atividade extra exige classificação BPF ou Corretiva.');
    exigir_(txt_(x.descricao, 300), 'Descreva a atividade extra.');
  });
  exigir_(itens.length || extras.length || txt_(b.observacao, 1) || fotos.length, 'Nada para enviar.');

  // Reenvio no mesmo dia substitui o anterior (mantendo as fotos já enviadas)
  var anterior = todos_('envios').filter(function (e) { return e.colaborador_id === c.id && e.data === b.data; })[0];
  var fotosAnt = anterior ? anterior.fotos : [];
  if (anterior) removerOnde_('envios', function (e) { return e.id === anterior.id; });
  removerOnde_('apontamentos', function (x) { return x.colaborador_id === c.id && x.data === b.data; });

  var agora = new Date().toISOString(), envioId = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  var novas = fotos.map(function (f, n) { return salvarFoto_(f, envioId, n); });
  inserir_('envios', { id: envioId, data: b.data, colaborador_id: c.id, equipe_id: c.equipe_id, observacao: txt_(b.observacao, 2000), fotos: fotosAnt.concat(novas), criado_em: agora });
  var aps = itens.map(function (i) {
    return { envio_id: envioId, atividade_id: i.atividade_id, colaborador_id: c.id, equipe_id: c.equipe_id, data: b.data, status: i.status, criado_em: agora };
  }).concat(extras.map(function (x) {
    return { envio_id: envioId, colaborador_id: c.id, equipe_id: c.equipe_id, data: b.data, status: 'extra', classificacao: x.classificacao, os_extra: txt_(x.os, 40), descricao_extra: txt_(x.descricao, 300), criado_em: agora };
  }));
  inserirVarios_('apontamentos', aps);
  return { envio_id: envioId };
}

/** Área ADM: cadastros, calendário, relatórios e fotos. */

/* ======================= ADM ======================= */

function limpar_(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_linha') o[k] = r[k]; }); return o; }

function gEquipeSalvar_(a) {
  var nome = txt_(a.nome, 60); exigir_(nome, 'Informe o nome da equipe.');
  if (a.id) { var r = atualizar_('equipes', a.id, { nome: nome }); exigir_(r, 'Equipe não encontrada.'); return limpar_(r); }
  return limpar_(inserir_('equipes', { nome: nome }));
}
function gEquipeExcluir_(a) {
  exigir_(!todos_('colaboradores').some(function (c) { return c.equipe_id === a.id; }), 'Há colaboradores nesta equipe. Mova-os antes de excluir.');
  removerOnde_('equipes', function (e) { return e.id === a.id; });
  return { ok: true };
}
function gColabSalvar_(a) {
  var nome = txt_(a.nome, 80); exigir_(nome, 'Informe o nome.');
  var equipeId = a.equipe_id || '';
  exigir_(!equipeId || achar_('equipes', equipeId), 'Equipe inválida.');
  var dados = { nome: nome, equipe_id: equipeId, ativo: a.ativo !== false };
  if (a.id) { var r = atualizar_('colaboradores', a.id, dados); exigir_(r, 'Colaborador não encontrado.'); return limpar_(r); }
  return limpar_(inserir_('colaboradores', dados));
}
function gColabInativar_(a) {
  exigir_(atualizar_('colaboradores', a.id, { ativo: false }), 'Colaborador não encontrado.');
  return { ok: true };
}

function gCalendario_(a) {
  var offset = Math.max(-52, Math.min(52, parseInt(a.offset, 10) || 0));
  var ini = somarDias_(segunda_(hoje_()), offset * 7), fim = somarDias_(ini, 20);
  var semanas = [0, 1, 2].map(function (i) {
    var inicio = somarDias_(ini, i * 7), w = semanaISO_(inicio);
    return { ano: w.ano, numero: w.numero, inicio: inicio, dias: intervalo_(inicio, somarDias_(inicio, 6)) };
  });
  var ult = ultimosApont_();
  var atividades = todos_('atividades').filter(function (x) { return x.data >= ini && x.data <= fim; })
    .map(function (x) { var o = limpar_(x); o.status = ult[x.id] ? ult[x.id].status : ''; return o; });
  return {
    hoje: hoje_(), semanas: semanas, atividades: atividades,
    colaboradores: todos_('colaboradores').filter(function (c) { return c.ativo; }).map(limpar_),
    equipes: todos_('equipes').map(limpar_),
  };
}

function validarAtividade_(b) {
  var descricao = txt_(b.descricao, 300); exigir_(descricao, 'Informe a descrição da atividade.');
  exigir_(ehData_(b.data), 'Data inválida.');
  var colabId = b.colaborador_id || '';
  exigir_(!colabId || colabAtivo_(colabId), 'Colaborador inválido.');
  return { os: txt_(b.os, 40), descricao: descricao, data: b.data, colaborador_id: colabId };
}
function gAtividadeSalvar_(a) {
  if (a.id) {
    var atual = achar_('atividades', a.id); exigir_(atual, 'Atividade não encontrada.');
    var merged = {}; Object.keys(atual).forEach(function (k) { merged[k] = atual[k]; });
    Object.keys(a).forEach(function (k) { if (k !== 'token' && k !== 'id') merged[k] = a[k]; });
    return limpar_(atualizar_('atividades', a.id, validarAtividade_(merged)));
  }
  var d = validarAtividade_(a); d.criado_em = new Date().toISOString();
  return limpar_(inserir_('atividades', d));
}
function gAtividadeExcluir_(a) {
  exigir_(achar_('atividades', a.id), 'Atividade não encontrada.');
  removerOnde_('atividades', function (x) { return x.id === a.id; });
  return { ok: true };
}
function gAtividadeDuplicar_(a) {
  var orig = achar_('atividades', a.id); exigir_(orig, 'Atividade não encontrada.');
  var merged = { os: orig.os, descricao: orig.descricao, data: orig.data, colaborador_id: orig.colaborador_id };
  ['os', 'descricao', 'data', 'colaborador_id'].forEach(function (k) { if (a[k] !== undefined) merged[k] = a[k]; });
  var d = validarAtividade_(merged); d.criado_em = new Date().toISOString();
  return limpar_(inserir_('atividades', d));
}

function gAderencia_(a) {
  var hoje = hoje_(), ate = a.ate || hoje, de = a.de || somarDias_(ate, -6);
  exigir_(ehData_(de) && ehData_(ate) && de <= ate && intervalo_(de, ate).length <= 366, 'Período inválido.');
  return calcularAderencia_({
    colaboradores: todos_('colaboradores'), equipes: todos_('equipes'), atividades: todos_('atividades'), apontamentos: todos_('apontamentos'),
  }, { de: de, ate: ate, hoje: hoje, equipe_id: a.equipe_id || '' });
}

function gRelatorios_(a) {
  var data = a.data || hoje_(); exigir_(ehData_(data), 'Data inválida.');
  var ativs = {}; todos_('atividades').forEach(function (x) { ativs[x.id] = x; });
  var cols = {}; todos_('colaboradores').forEach(function (x) { cols[x.id] = x; });
  return todos_('equipes').filter(function (e) { return !a.equipe_id || e.id === a.equipe_id; }).map(function (eq) {
    var membros = todos_('colaboradores').filter(function (c) { return c.equipe_id === eq.id && c.ativo; });
    var envios = todos_('envios').filter(function (e) { return e.equipe_id === eq.id && e.data === data; });
    var enviaram = envios.map(function (e) {
      var aps = todos_('apontamentos').filter(function (x) { return x.envio_id === e.id; });
      return {
        colaborador: cols[e.colaborador_id] ? cols[e.colaborador_id].nome : '?', enviado_em: e.criado_em, observacao: e.observacao, fotos: e.fotos,
        itens: aps.filter(function (x) { return x.status !== 'extra'; }).map(function (x) {
          var at = ativs[x.atividade_id];
          return { os: at ? at.os : '', descricao: at ? at.descricao : '(atividade removida)', status: x.status, data_prevista: at ? at.data : '' };
        }),
        extras: aps.filter(function (x) { return x.status === 'extra'; }).map(function (x) { return { os: x.os_extra, descricao: x.descricao_extra, classificacao: x.classificacao }; }),
      };
    });
    var cont = function (s) { return enviaram.reduce(function (n, e) { return n + e.itens.filter(function (i) { return i.status === s; }).length; }, 0); };
    return {
      equipe: eq.nome, data: data, enviaram: enviaram,
      pendentes_envio: membros.filter(function (m) { return !envios.some(function (e) { return e.colaborador_id === m.id; }); }).map(function (m) { return m.nome; }),
      resumo: { concluidas: cont('concluida'), iniciadas: cont('iniciada'), pendentes: cont('pendente'), extras: enviaram.reduce(function (n, e) { return n + e.extras.length; }, 0) },
    };
  }).filter(function (r) { return r.enviaram.length || r.pendentes_envio.length; });
}

/** Devolve a foto como data URL. Só libera arquivos registrados em envios (nunca um id arbitrário do Drive). */
function gFoto_(a) {
  var permitido = todos_('envios').some(function (e) { return e.fotos.indexOf(a.id) >= 0; });
  exigir_(permitido, 'Foto não encontrada.');
  var blob = DriveApp.getFileById(a.id).getBlob();
  return { src: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

/** Indicadores de aderência. */

/* ======================= INDICADORES ======================= */
/*
 * Período [de, ate]:
 *  - Planejadas: atividades programadas com data no período e data <= hoje.
 *  - Situação final de uma atividade = último apontamento dela (mesmo de dias posteriores).
 *  - % Aderência        = concluídas ÷ planejadas
 *  - % Não conformidade = (pendentes + sem apontamento) ÷ planejadas
 *  - % Sequência        = apontamentos de atividades de dias anteriores ÷ apontamentos de atividades programadas
 *  - % Extras           = atividades extras ÷ total de apontamentos
 */
function pct_(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
function novoAcc_() {
  return { planejadas: 0, concluidas: 0, iniciadas: 0, pendentes: 0, sem_apontamento: 0, apont_programados: 0, apont_sequencia: 0, extras: 0, extras_bpf: 0, extras_corretiva: 0, apont_total: 0 };
}
function fechar_(a) {
  var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; });
  o.pct_aderencia = pct_(a.concluidas, a.planejadas);
  o.pct_iniciadas = pct_(a.iniciadas, a.planejadas);
  o.pct_nao_conformidade = pct_(a.pendentes + a.sem_apontamento, a.planejadas);
  o.pct_sequencia = pct_(a.apont_sequencia, a.apont_programados);
  o.pct_extras = pct_(a.extras, a.apont_total);
  return o;
}

function calcularAderencia_(db, p) {
  var de = p.de, ate = p.ate, hoje = p.hoje, equipeId = p.equipe_id;
  var colabs = {}; db.colaboradores.forEach(function (c) { colabs[c.id] = c; });
  var equipes = {}; db.equipes.forEach(function (e) { equipes[e.id] = e; });
  var ativs = {}; db.atividades.forEach(function (a) { ativs[a.id] = a; });

  var ultimo = {};
  db.apontamentos.forEach(function (ap) {
    if (!ap.atividade_id) return;
    var u = ultimo[ap.atividade_id];
    if (!u || ap.data > u.data || (ap.data === u.data && ap.criado_em >= u.criado_em)) ultimo[ap.atividade_id] = ap;
  });

  var porColab = {}, porEquipe = {}, geral = novoAcc_(), dia = {};
  intervalo_(de, ate).forEach(function (d) { dia[d] = { data: d, planejadas: 0, concluidas: 0 }; });
  var acc = function (m, k) { if (!m[k]) m[k] = novoAcc_(); return m[k]; };
  var somar = function (colabId, fn) {
    var c = colabs[colabId], eq = c && c.equipe_id;
    if (equipeId && eq !== equipeId) return;
    fn(geral); fn(acc(porColab, colabId));
    if (eq) fn(acc(porEquipe, eq));
  };

  db.atividades.forEach(function (a) {
    if (a.data < de || a.data > ate || a.data > hoje || !a.colaborador_id) return;
    var u = ultimo[a.id];
    somar(a.colaborador_id, function (x) {
      x.planejadas++;
      if (!u) x.sem_apontamento++;
      else if (u.status === 'concluida') x.concluidas++;
      else if (u.status === 'iniciada') x.iniciadas++;
      else x.pendentes++;
    });
    var d = dia[a.data], c = colabs[a.colaborador_id];
    if (d && (!equipeId || (c && c.equipe_id === equipeId))) {
      d.planejadas++;
      if (u && u.status === 'concluida') d.concluidas++;
    }
  });

  db.apontamentos.forEach(function (ap) {
    if (ap.data < de || ap.data > ate) return;
    var a = ap.atividade_id && ativs[ap.atividade_id];
    somar(ap.colaborador_id, function (x) {
      x.apont_total++;
      if (ap.status === 'extra') {
        x.extras++;
        if (ap.classificacao === 'BPF') x.extras_bpf++; else x.extras_corretiva++;
      } else if (a) {
        x.apont_programados++;
        if (a.data < ap.data) x.apont_sequencia++;
      }
    });
  });

  var porNome = function (x, y) { return x.nome.localeCompare(y.nome); };
  var r = {
    periodo: { de: de, ate: ate }, geral: fechar_(geral),
    equipes: Object.keys(porEquipe).map(function (id) { var o = fechar_(porEquipe[id]); o.id = id; o.nome = equipes[id] ? equipes[id].nome : '(removida)'; return o; }).sort(porNome),
    colaboradores: Object.keys(porColab).map(function (id) {
      var c = colabs[id], o = fechar_(porColab[id]);
      o.id = id; o.nome = c ? c.nome : '(removido)'; o.equipe = c && equipes[c.equipe_id] ? equipes[c.equipe_id].nome : '-'; return o;
    }).sort(porNome),
    serie_diaria: Object.keys(dia).sort().map(function (d) { var o = dia[d]; return { data: o.data, planejadas: o.planejadas, concluidas: o.concluidas, pct_aderencia: pct_(o.concluidas, o.planejadas) }; }),
  };
  return r;
}
