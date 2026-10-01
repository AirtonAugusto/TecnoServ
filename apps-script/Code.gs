/**
 * Informe de Turno — apontamento do turno, aderência e programação semanal.
 * Google Apps Script (API do site). Dados: Google Sheets (planilha que contém este script).
 * Fotos: pasta "PCM-Fotos" no Google Drive de quem publicou o app.
 *
 * Configuração (Configurações do projeto > Propriedades do script):
 *   GESTAO_SENHA     = senha da área ADM/PCM (obrigatória)
 * Opcionais:
 *   GESTAO_EMAILS    = e-mails autorizados na ADM, separados por vírgula (vazio = qualquer e-mail com a senha certa)
 *   META_ADERENCIA   = meta de aderência em % (padrão 85)
 *   SITE_URL         = endereço do site (aparece no link da página de status deste app)
 * Criadas automaticamente: SESSION_SECRET, FOTOS_FOLDER_ID
 */

var TZ_ = 'America/Sao_Paulo';
var STATUS_APONT_ = ['concluida', 'iniciada', 'pendente'];
var CLASSIF_ = ['BPF', 'Corretiva'];
var TURNOS_ = ['Turno B', 'Turno C', 'Administrativo'];
var PRIORIDADES_ = ['Alta', 'Média', 'Baixa'];
var REGIMES_ = ['Turno', 'ADM'];
var LETRAS_ = ['B', 'C'];
var MOTIVOS_ = {
  material: 'Falta de material / sobressalente',
  liberacao: 'Equipamento sem liberação da operação',
  prioridade: 'Prioridade alterada / emergência',
  efetivo: 'Falta de efetivo',
  distribuicao: 'Programação não chegou à equipe',
};

// Tipos: s=texto, b=booleano, j=JSON. Colunas novas entram no fim; abas antigas são atualizadas sozinhas.
var SCHEMAS_ = {
  equipes: { id: 's', nome: 's' },
  colaboradores: { id: 's', nome: 's', equipe_id: 's', ativo: 'b', matricula: 's', regime: 's', letra: 's' },
  atividades: {
    id: 's', os: 's', descricao: 's', data: 's', colaborador_id: 's', criado_em: 's',
    prioridade: 's', equipamento: 's', area: 's', origem: 's',
  },
  apontamentos: {
    id: 's', envio_id: 's', atividade_id: 's', colaborador_id: 's', equipe_id: 's', data: 's',
    status: 's', classificacao: 's', os_extra: 's', descricao_extra: 's', criado_em: 's',
    motivo: 's', justificativa: 's', equip_extra: 's',
  },
  envios: { id: 's', data: 's', colaborador_id: 's', equipe_id: 's', observacao: 's', fotos: 'j', criado_em: 's', turno: 's' },
};

/* ======================= ENTRADA ======================= */

/** Página simples de status (o site de verdade fica no GitHub Pages). */
function doGet() {
  var url = String(props_().getProperty('SITE_URL') || '');
  var link = /^https:\/\/[A-Za-z0-9._~:\/?#@!$&()*+,;=%-]+$/.test(url)
    ? '<p><a href="' + url + '" target="_top">Abrir o Informe de Turno</a></p>' : '';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;padding:32px;max-width:520px"><h2>Informe de Turno</h2>' +
    '<p>O servidor está funcionando.</p>' + link + '</div>').setTitle('Informe de Turno');
}

/**
 * API do site. Recebe JSON em texto simples: {"metodo": "...", "args": {...}} e devolve JSON.
 */
function doPost(e) {
  var saida;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    saida = rpc(req.metodo, req.args);
  } catch (err) {
    saida = { ok: false, erro: 'Requisição inválida.' };
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Opcional: crie um acionador por tempo (Acionadores > Adicionar > manterAtivo > a cada 5 minutos)
 * para manter o sistema "acordado" e reduzir a demora do primeiro acesso.
 */
function manterAtivo() { todos_('equipes'); }

/** Execute uma vez no editor (Executar > preparar) para criar/atualizar as abas e autorizar o script. */
function preparar() {
  Object.keys(SCHEMAS_).forEach(function (t) { folha_(t); });
  pastaFotos_();
  segredo_();
  var ok = !!PropertiesService.getScriptProperties().getProperty('GESTAO_SENHA');
  Logger.log(ok ? 'Pronto. Abas criadas/atualizadas e senha encontrada.' : 'ATENÇÃO: defina a propriedade GESTAO_SENHA em Configurações do projeto.');
}

/* ======================= DISPATCHER ======================= */

function mapaApi_() {
  return {
    'ping': function () { return { ok: true }; },
    'publico.entrar': publicoEntrar_,
    'publico.tarefas': publicoTarefas_,
    'publico.enviar': publicoEnviar_,
    'auth.login': authLogin_,
    'auth.status': function (a) { return { autenticado: tokenValido_(a.token) }; },
    'gestao.painel': gPainel_,
    'gestao.cadastros': gCadastros_,
    'gestao.equipe.salvar': gEquipeSalvar_,
    'gestao.equipe.excluir': gEquipeExcluir_,
    'gestao.colaborador.salvar': gColabSalvar_,
    'gestao.colaborador.inativar': gColabInativar_,
    'gestao.colaborador.excluir': gColabExcluir_,
    'gestao.folga.salvar': gFolgaSalvar_,
    'gestao.folga.excluir': gFolgaExcluir_,
    'gestao.calendario': gCalendario_,
    'gestao.atividade.salvar': gAtividadeSalvar_,
    'gestao.atividade.excluir': gAtividadeExcluir_,
    'gestao.atividade.duplicar': gAtividadeDuplicar_,
    'gestao.relatorios': gRelatorios_,
    'gestao.foto': gFoto_,
  };
}
var ESCRITA_ = {
  'publico.enviar': 1, 'gestao.equipe.salvar': 1, 'gestao.equipe.excluir': 1, 'gestao.colaborador.salvar': 1,
  'gestao.colaborador.inativar': 1, 'gestao.colaborador.excluir': 1, 'gestao.folga.salvar': 1, 'gestao.folga.excluir': 1, 'gestao.atividade.salvar': 1, 'gestao.atividade.excluir': 1, 'gestao.atividade.duplicar': 1,
};

/** Único ponto de entrada das chamadas do site. */
function rpc(metodo, args) {
  args = args || {};
  var lock = null;
  try {
    var fn = mapaApi_()[metodo];
    if (!fn) throw erro_('Método inválido.');
    if (metodo.indexOf('gestao.') === 0 && !tokenValido_(args.token)) {
      return { ok: false, erro: 'Acesso restrito à ADM. Faça login.', auth: true };
    }
    cache_ = {}; cab_ = {};
    semCache_ = !!ESCRITA_[metodo];
    if (ESCRITA_[metodo]) { lock = LockService.getScriptLock(); lock.waitLock(25000); }
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
function primeiroDoMes_(s) { return s.slice(0, 8) + '01'; }
function ultimoDoMes_(s) {
  var d = new Date(s.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/* ======================= DADOS (Google Sheets) ======================= */

var cache_ = {};
var cab_ = {};

function planilha_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Este script precisa estar vinculado a uma planilha (Extensões > Apps Script).');
  return ss;
}

/** Garante a aba e todas as colunas do modelo (acrescenta no fim as que faltarem). */
function folha_(t) {
  var ss = planilha_(), sh = ss.getSheetByName(t), campos = Object.keys(SCHEMAS_[t]);
  if (!sh) {
    sh = ss.insertSheet(t);
    sh.getRange('A:Z').setNumberFormat('@'); // texto puro: evita converter datas/ids
    sh.getRange(1, 1, 1, campos.length).setValues([campos]).setFontWeight('bold');
    sh.setFrozenRows(1);
    cab_[t] = campos.slice();
    return sh;
  }
  if (!cab_[t]) {
    var larg = Math.max(1, sh.getLastColumn());
    var atual = sh.getRange(1, 1, 1, larg).getValues()[0].map(function (c) { return String(c); });
    while (atual.length && atual[atual.length - 1] === '') atual.pop();
    var faltam = campos.filter(function (c) { return atual.indexOf(c) < 0; });
    if (faltam.length) {
      sh.getRange(1, atual.length + 1, 1, faltam.length).setValues([faltam]).setFontWeight('bold');
      atual = atual.concat(faltam);
    }
    cab_[t] = atual;
  }
  return sh;
}
function cabecalho_(t) { folha_(t); return cab_[t]; }

function celula_(v, tipo, campo) {
  if (v instanceof Date) v = campo === 'data' ? Utilities.formatDate(v, TZ_, 'yyyy-MM-dd') : v.toISOString();
  if (tipo === 'b') return v === true || String(v).toLowerCase() === 'true';
  if (tipo === 'j') { try { return v ? JSON.parse(v) : []; } catch (e) { return []; } }
  return v == null ? '' : String(v);
}

var semCache_ = false; // true durante gravações: sempre lê a planilha (linhas corretas)

function cacheTab_() { return CacheService.getScriptCache(); }
function versaoTab_(t) {
  var c = cacheTab_(), v = c.get('v:' + t);
  if (!v) { v = String(Date.now()); c.put('v:' + t, v, 21600); }
  return v;
}
function invalidar_(t) { cacheTab_().put('v:' + t, String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); }

function lerCache_(t, v) {
  var c = cacheTab_(), n = c.get('d:' + t + ':' + v + ':n');
  if (!n) return null;
  var chaves = []; for (var i = 0; i < Number(n); i++) chaves.push('d:' + t + ':' + v + ':' + i);
  var partes = c.getAll(chaves), txt = '';
  for (var j = 0; j < chaves.length; j++) { if (partes[chaves[j]] == null) return null; txt += partes[chaves[j]]; }
  try { return JSON.parse(txt); } catch (e) { return null; }
}
function gravarCache_(t, v, linhas) {
  if (versaoTab_(t) !== v) return; // houve gravação enquanto líamos: não guarda dado velho
  var txt = JSON.stringify(linhas), TAM = 90000, mapa = {}, n = 0;
  for (var i = 0; i < txt.length; i += TAM) mapa['d:' + t + ':' + v + ':' + (n++)] = txt.slice(i, i + TAM);
  mapa['d:' + t + ':' + v + ':n'] = String(n);
  try { cacheTab_().putAll(mapa, 21600); } catch (e) { /* tabela grande demais: segue sem cache */ }
}

function todos_(t) {
  if (cache_[t]) return cache_[t];
  var v = null, lido = null;
  if (!semCache_) { v = versaoTab_(t); lido = lerCache_(t, v); }
  if (lido) { cache_[t] = lido; return lido; }
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
  if (!semCache_) gravarCache_(t, v, out);
  return out;
}
function achar_(t, id) { var r = todos_(t).filter(function (x) { return x.id === id; }); return r[0] || null; }

/** Monta a linha na ordem real das colunas da planilha. */
function paraLinha_(t, row) {
  var sch = SCHEMAS_[t];
  return cabecalho_(t).map(function (nome) {
    if (!(nome in sch)) return '';
    var v = row[nome];
    return sch[nome] === 'j' ? JSON.stringify(v || []) : sch[nome] === 'b' ? !!v : String(v == null ? '' : v);
  });
}
function novoRegistro_(t, obj) {
  var sch = SCHEMAS_[t], row = {};
  Object.keys(sch).forEach(function (c) { row[c] = obj[c] != null ? obj[c] : (sch[c] === 'j' ? [] : sch[c] === 'b' ? false : ''); });
  if (!row.id) row.id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  return row;
}

function inserir_(t, obj) {
  var row = novoRegistro_(t, obj);
  folha_(t).appendRow(paraLinha_(t, row));
  cache_[t] = null; invalidar_(t);
  return row;
}
function inserirVarios_(t, objs) { // uma única gravação para vários registros
  if (!objs.length) return [];
  var sh = folha_(t), rows = objs.map(function (o) { return novoRegistro_(t, o); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, cabecalho_(t).length).setValues(rows.map(function (r) { return paraLinha_(t, r); }));
  cache_[t] = null; invalidar_(t);
  return rows;
}
function atualizar_(t, id, patch) {
  var row = achar_(t, id); if (!row) return null;
  Object.keys(SCHEMAS_[t]).forEach(function (c) { if (c !== 'id' && c in patch) row[c] = patch[c]; });
  folha_(t).getRange(row._linha, 1, 1, cabecalho_(t).length).setValues([paraLinha_(t, row)]);
  cache_[t] = null; invalidar_(t);
  return row;
}
function removerOnde_(t, fn) {
  var linhas = todos_(t).filter(fn).map(function (r) { return r._linha; }).sort(function (a, b) { return b - a; });
  var sh = folha_(t);
  linhas.forEach(function (l) { sh.deleteRow(l); });
  cache_[t] = null; invalidar_(t);
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
  var email = txt_(a.email, 120).toLowerCase();
  exigir_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Informe um e-mail válido.');
  var lista = String(props_().getProperty('GESTAO_EMAILS') || '').toLowerCase().split(',')
    .map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  var c = CacheService.getScriptCache(), falhas = Number(c.get('falhas') || 0);
  exigir_(falhas < 8, 'Muitas tentativas erradas. Aguarde 15 minutos.');
  var ok = iguais_(a.senha || '', senha) && (!lista.length || lista.indexOf(email) >= 0);
  if (!ok) {
    c.put('falhas', String(falhas + 1), 900);
    throw erro_('E-mail ou senha incorretos.');
  }
  c.remove('falhas');
  var primeiro = email.split('@')[0].split(/[._-]/)[0];
  var nome = primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
  return { token: emitirToken_(), usuario: { nome: nome, email: email, papel: 'Gestão · PCM' } };
}

/* ======================= OPERACIONAL (colaborador) ======================= */

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
function normMat_(m) { return String(m == null ? '' : m).trim().replace(/^0+/, ''); }

function turnoDe_(c) { return c.regime === 'ADM' ? 'Administrativo' : (c.letra ? 'Turno ' + c.letra : ''); }
function ehFolga_(a) { return a.origem === 'Folga'; }

function perfil_(c, turno) {
  var eq = achar_('equipes', c.equipe_id);
  return { id: c.id, nome: c.nome, equipe: eq ? eq.nome : '', regime: c.regime || 'Turno', letra: c.letra || '', turno: turno || turnoDe_(c) };
}

/** Entrada do colaborador: matrícula + turno. Devolve o perfil e as tarefas numa única chamada. */
function publicoEntrar_(a) {
  var mat = normMat_(a.matricula); exigir_(mat, 'Informe a matrícula.');
  var c = todos_('colaboradores').filter(function (x) { return x.ativo && normMat_(x.matricula) === mat; })[0];
  exigir_(c, 'Matrícula não encontrada. Confira o número ou fale com o PCM.');
  var turno = TURNOS_.indexOf(a.turno) >= 0 ? a.turno : (turnoDe_(c) || TURNOS_[0]); // vazio = pelo cadastro
  var t = publicoTarefas_({ id: c.id, data: a.data });
  t.perfil.turno = turno;
  return { perfil: t.perfil, tarefas: t };
}

function publicoTarefas_(a) {
  var c = colabAtivo_(a.id); exigir_(c, 'Colaborador não encontrado.');
  var hoje = hoje_(), data = a.data || hoje;
  exigir_(ehData_(data) && data <= hoje && data >= somarDias_(hoje, -2), 'Data inválida (só hoje e os 2 dias anteriores).');

  var envio = todos_('envios').filter(function (e) { return e.colaborador_id === c.id && e.data === data; })[0] || null;
  var apDoDia = todos_('apontamentos').filter(function (x) { return x.colaborador_id === c.id && x.data === data; });
  var porAtiv = {}; apDoDia.forEach(function (x) { if (x.atividade_id) porAtiv[x.atividade_id] = x; });
  var ult = ultimosApont_();
  var fmt = function (x) {
    var ap = porAtiv[x.id];
    return {
      id: x.id, os: x.os, descricao: x.descricao, data: x.data, status: ap ? ap.status : '',
      prioridade: x.prioridade || 'Média', equipamento: x.equipamento || '', area: x.area || '',
      motivo: ap ? ap.motivo : '', justificativa: ap ? ap.justificativa : '',
    };
  };

  var minhas = todos_('atividades').filter(function (x) { return x.colaborador_id === c.id && x.data && !ehFolga_(x); });
  var doDia = minhas.filter(function (x) { return x.data === data; }).map(fmt);
  var anteriores = minhas.filter(function (x) { return x.data < data && x.data >= somarDias_(data, -14); }).filter(function (x) {
    if (porAtiv[x.id]) return true;
    var u = ult[x.id]; return !u || u.status !== 'concluida';
  }).map(function (x) { var o = fmt(x); o.ultimo_status = ult[x.id] ? ult[x.id].status : ''; return o; })
    .sort(function (x, y) { return x.data.localeCompare(y.data); });

  return {
    perfil: perfil_(c, ''),
    data: data, hoje: hoje, semana: semanaISO_(data), atividades: doDia, anteriores: anteriores,
    extras: apDoDia.filter(function (x) { return x.status === 'extra'; }).map(function (x) {
      return { descricao: x.descricao_extra, equipamento: x.equip_extra, classificacao: x.classificacao };
    }),
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
    if (i.status === 'pendente') {
      exigir_(MOTIVOS_[i.motivo], 'Informe o motivo da não execução.');
      exigir_(txt_(i.justificativa, 1), 'Informe a justificativa da atividade pendente.');
    }
  });
  extras.forEach(function (x) {
    exigir_(CLASSIF_.indexOf(x.classificacao) >= 0, 'Atividade extra exige o tipo BPF ou Corretiva.');
    exigir_(txt_(x.descricao, 1), 'Descreva a atividade extra.');
  });
  exigir_(itens.length || extras.length || txt_(b.observacao, 1) || fotos.length, 'Nada para enviar.');

  // Reenvio no mesmo dia substitui o anterior (mantendo as fotos já enviadas)
  var anterior = todos_('envios').filter(function (e) { return e.colaborador_id === c.id && e.data === b.data; })[0];
  var fotosAnt = anterior ? anterior.fotos : [];
  if (anterior) removerOnde_('envios', function (e) { return e.id === anterior.id; });
  removerOnde_('apontamentos', function (x) { return x.colaborador_id === c.id && x.data === b.data; });

  var agora = new Date().toISOString(), envioId = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  var novas = fotos.map(function (f, n) { return salvarFoto_(f, envioId, n); });
  inserir_('envios', {
    id: envioId, data: b.data, colaborador_id: c.id, equipe_id: c.equipe_id, observacao: txt_(b.observacao, 2000),
    fotos: fotosAnt.concat(novas), criado_em: agora, turno: TURNOS_.indexOf(b.turno) >= 0 ? b.turno : '',
  });
  var aps = itens.map(function (i) {
    var pend = i.status === 'pendente';
    return {
      envio_id: envioId, atividade_id: i.atividade_id, colaborador_id: c.id, equipe_id: c.equipe_id, data: b.data, status: i.status, criado_em: agora,
      motivo: pend ? i.motivo : '', justificativa: pend ? txt_(i.justificativa, 500) : '',
    };
  }).concat(extras.map(function (x) {
    return {
      envio_id: envioId, colaborador_id: c.id, equipe_id: c.equipe_id, data: b.data, status: 'extra', classificacao: x.classificacao,
      descricao_extra: txt_(x.descricao, 300), equip_extra: txt_(x.equipamento, 120), criado_em: agora,
    };
  }));
  inserirVarios_('apontamentos', aps);
  return { envio_id: envioId };
}

/* ======================= ADM / PCM ======================= */

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
  var mat = txt_(a.matricula, 20); exigir_(mat, 'Informe a matrícula (é com ela que o colaborador entra).');
  exigir_(!todos_('colaboradores').some(function (c) { return c.id !== a.id && normMat_(c.matricula) === normMat_(mat); }), 'Já existe um colaborador com esta matrícula.');
  var equipeId = a.equipe_id || '';
  exigir_(!equipeId || achar_('equipes', equipeId), 'Equipe inválida.');
  var regime = REGIMES_.indexOf(a.regime) >= 0 ? a.regime : 'Turno';
  var letra = regime === 'ADM' ? '' : String(a.letra || '').toUpperCase();
  exigir_(regime === 'ADM' || LETRAS_.indexOf(letra) >= 0, 'Escolha a letra do turno (B ou C).');
  var dados = { nome: nome, equipe_id: equipeId, ativo: a.ativo !== false, matricula: mat, regime: regime, letra: letra };
  if (a.id) { var r = atualizar_('colaboradores', a.id, dados); exigir_(r, 'Colaborador não encontrado.'); return limpar_(r); }
  return limpar_(inserir_('colaboradores', dados));
}
function gColabInativar_(a) {
  exigir_(atualizar_('colaboradores', a.id, { ativo: false }), 'Colaborador não encontrado.');
  return { ok: true };
}
/** Exclui de vez. OS futuras vão para o backlog; o histórico de apontamentos é mantido. */
function gColabExcluir_(a) {
  var c = achar_('colaboradores', a.id); exigir_(c, 'Colaborador não encontrado.');
  var hoje = hoje_();
  todos_('atividades').filter(function (x) { return x.colaborador_id === c.id; }).forEach(function (x) {
    if (ehFolga_(x)) removerOnde_('atividades', function (y) { return y.id === x.id; });
    else if (x.data >= hoje || !x.data) atualizar_('atividades', x.id, { colaborador_id: '', data: '' });
  });
  removerOnde_('colaboradores', function (x) { return x.id === c.id; });
  return { ok: true };
}

function gCadastros_() {
  return { equipes: todos_('equipes').map(limpar_), colaboradores: todos_('colaboradores').map(limpar_) };
}

function metaAderencia_() {
  var m = Number(props_().getProperty('META_ADERENCIA'));
  return m > 0 && m <= 100 ? m : 85;
}

/** Uma única chamada para abrir o painel: filtros + indicadores do período. */
function gPainel_(a) {
  return {
    equipes: todos_('equipes').map(limpar_),
    colaboradores: todos_('colaboradores').filter(function (c) { return c.ativo; }).map(limpar_),
    aderencia: gAderencia_(a),
  };
}

function emFolga_(colab, data) {
  if (!colab || !data) return false;
  var d = diaSemana_(data);
  if (colab.regime === 'ADM' && (d === 0 || d === 6)) return true; // ADM folga sábado e domingo
  return todos_('atividades').some(function (a) { return ehFolga_(a) && a.colaborador_id === colab.id && a.data === data; });
}

/** Marca (ou move) uma folga na programação. */
function gFolgaSalvar_(a) {
  var colab = colabAtivo_(a.colaborador_id); exigir_(colab, 'Colaborador inválido.');
  exigir_(ehData_(a.data), 'Data inválida.');
  exigir_(!(colab.regime === 'ADM' && (diaSemana_(a.data) === 0 || diaSemana_(a.data) === 6)), colab.nome + ' já tem folga neste dia (ADM).');
  var todas = todos_('atividades');
  exigir_(!todas.some(function (x) { return !ehFolga_(x) && x.colaborador_id === colab.id && x.data === a.data; }), 'Já há OS programada para ' + colab.nome + ' neste dia. Mova a OS antes de marcar a folga.');
  exigir_(!todas.some(function (x) { return ehFolga_(x) && x.colaborador_id === colab.id && x.data === a.data && x.id !== a.id; }), colab.nome + ' já está de folga neste dia.');
  if (a.id) {
    var atual = achar_('atividades', a.id); exigir_(atual && ehFolga_(atual), 'Folga não encontrada.');
    return limpar_(atualizar_('atividades', a.id, { colaborador_id: colab.id, data: a.data }));
  }
  return limpar_(inserir_('atividades', { os: '', descricao: 'Folga', data: a.data, colaborador_id: colab.id, origem: 'Folga', criado_em: new Date().toISOString() }));
}
function gFolgaExcluir_(a) {
  var f = achar_('atividades', a.id); exigir_(f && ehFolga_(f), 'Folga não encontrada.');
  removerOnde_('atividades', function (x) { return x.id === a.id; });
  return { ok: true };
}

function gCalendario_() {
  var hoje = hoje_(), ini = segunda_(hoje), fim = somarDias_(ini, 20);
  var semanas = [0, 1, 2].map(function (i) {
    var inicio = somarDias_(ini, i * 7), w = semanaISO_(inicio);
    return { ano: w.ano, numero: w.numero, inicio: inicio, dias: intervalo_(inicio, somarDias_(inicio, 6)) };
  });
  var ult = ultimosApont_();
  var fmt = function (x) {
    var o = limpar_(x); o.status = ult[x.id] ? ult[x.id].status : 'programada';
    o.prioridade = o.prioridade || 'Média'; o.origem = o.origem || 'Manual'; return o;
  };
  var todas = todos_('atividades');
  return {
    hoje: hoje, semanas: semanas,
    atividades: todas.filter(function (x) { return x.data && x.data >= ini && x.data <= fim && !ehFolga_(x); }).map(fmt),
    folgas: todas.filter(function (x) { return ehFolga_(x) && x.data >= ini && x.data <= fim; }).map(limpar_),
    backlog: todas.filter(function (x) { return !x.data && !ehFolga_(x); }).map(fmt),
    extras: todos_('apontamentos').filter(function (x) { return x.status === 'extra' && x.data >= ini && x.data <= fim; }).map(function (x) {
      return { id: x.id, data: x.data, colaborador_id: x.colaborador_id, descricao: x.descricao_extra, equipamento: x.equip_extra, classificacao: x.classificacao };
    }),
    colaboradores: todos_('colaboradores').filter(function (c) { return c.ativo; }).map(limpar_),
    equipes: todos_('equipes').map(limpar_),
  };
}

function validarAtividade_(b) {
  var descricao = txt_(b.descricao, 300); exigir_(descricao, 'Informe a descrição da atividade.');
  var data = b.data || '';
  exigir_(!data || ehData_(data), 'Data inválida.');
  var colabId = b.colaborador_id || '';
  var colab = colabId ? colabAtivo_(colabId) : null;
  exigir_(!colabId || colab, 'Colaborador inválido.');
  exigir_(!emFolga_(colab, data), colab ? colab.nome + ' está de folga neste dia.' : '');
  return {
    os: txt_(b.os, 40), descricao: descricao, data: data, colaborador_id: colabId,
    prioridade: PRIORIDADES_.indexOf(b.prioridade) >= 0 ? b.prioridade : 'Média',
    equipamento: txt_(b.equipamento, 80), area: txt_(b.area, 80), origem: txt_(b.origem, 20) || 'Manual',
  };
}
function gAtividadeSalvar_(a) {
  if (a.id) {
    var atual = achar_('atividades', a.id); exigir_(atual && !ehFolga_(atual), 'Atividade não encontrada.');
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
  var merged = {};
  ['os', 'descricao', 'data', 'colaborador_id', 'prioridade', 'equipamento', 'area', 'origem'].forEach(function (k) {
    merged[k] = a[k] !== undefined ? a[k] : orig[k];
  });
  var d = validarAtividade_(merged); d.criado_em = new Date().toISOString();
  return limpar_(inserir_('atividades', d));
}

/** Indicadores do período (dia, semana ou mês) com filtros de equipe e colaborador. */
function gAderencia_(a) {
  var hoje = hoje_(), ref = ehData_(a.ref) ? a.ref : hoje, periodo = a.periodo || 'semana', de, ate;
  if (periodo === 'dia') { de = ref; ate = ref; }
  else if (periodo === 'mes') { de = primeiroDoMes_(ref); ate = ultimoDoMes_(ref); }
  else { periodo = 'semana'; de = segunda_(ref); ate = somarDias_(de, 6); }
  var r = calcularAderencia_({
    colaboradores: todos_('colaboradores'), equipes: todos_('equipes'), atividades: todos_('atividades'), apontamentos: todos_('apontamentos'),
  }, { de: de, ate: ate, hoje: hoje, equipe_id: a.equipe_id || '', colaborador_id: a.colaborador_id || '' });
  r.periodo = periodo; r.ref = ref; r.semana = semanaISO_(de); r.meta = metaAderencia_();
  return r;
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
        colaborador: cols[e.colaborador_id] ? cols[e.colaborador_id].nome : '?', turno: e.turno, enviado_em: e.criado_em, observacao: e.observacao, fotos: e.fotos,
        itens: aps.filter(function (x) { return x.status !== 'extra'; }).map(function (x) {
          var at = ativs[x.atividade_id];
          return {
            os: at ? at.os : '', descricao: at ? at.descricao : '(atividade removida)', status: x.status, data_prevista: at ? at.data : '',
            motivo: x.motivo ? MOTIVOS_[x.motivo] || x.motivo : '', justificativa: x.justificativa,
          };
        }),
        extras: aps.filter(function (x) { return x.status === 'extra'; }).map(function (x) {
          return { descricao: x.descricao_extra, equipamento: x.equip_extra, classificacao: x.classificacao };
        }),
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

/* ======================= INDICADORES ======================= */
/*
 * Período [de, ate]:
 *  - Programadas: atividades com data no período e data <= hoje, alocadas a um colaborador.
 *  - Situação final de uma atividade = último apontamento dela (mesmo de dias posteriores).
 *  - Aderência geral    = concluídas ÷ programadas
 *  - Concluídas no prazo = concluídas no próprio dia programado ÷ programadas
 *  - Extras             = contadas à parte (não entram na aderência), por tipo BPF / Corretiva
 *  - Pendências         = atividades cuja situação final é "pendente" (com motivo); "parciais" à parte
 */
function pct_(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
function novoAcc_() {
  return { programadas: 0, concluidas: 0, no_prazo: 0, iniciadas: 0, pendentes: 0, sem_apontamento: 0, extras: 0, extras_bpf: 0, extras_corretiva: 0 };
}
function fechar_(a) {
  var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; });
  o.pct_aderencia = pct_(a.concluidas, a.programadas);
  o.pct_no_prazo = pct_(a.no_prazo, a.programadas);
  o.pct_pendentes = pct_(a.pendentes + a.sem_apontamento, a.programadas);
  return o;
}

function calcularAderencia_(db, p) {
  var de = p.de, ate = p.ate, hoje = p.hoje;
  var colabs = {}, equipes = {};
  db.colaboradores.forEach(function (c) { colabs[c.id] = c; });
  db.equipes.forEach(function (e) { equipes[e.id] = e; });

  var ultimo = {};
  db.apontamentos.forEach(function (ap) {
    if (!ap.atividade_id) return;
    var u = ultimo[ap.atividade_id];
    if (!u || ap.data > u.data || (ap.data === u.data && ap.criado_em >= u.criado_em)) ultimo[ap.atividade_id] = ap;
  });

  var passa = function (colabId) {
    var c = colabs[colabId]; if (!c) return false;
    if (p.equipe_id && c.equipe_id !== p.equipe_id) return false;
    if (p.colaborador_id && c.id !== p.colaborador_id) return false;
    return true;
  };
  var geral = novoAcc_(), porColab = {}, porEquipe = {}, motivos = {}, motivosColab = {};
  Object.keys(MOTIVOS_).forEach(function (k) { motivos[k] = 0; });
  var acc = function (m, k) { if (!m[k]) m[k] = novoAcc_(); return m[k]; };
  var somar = function (colabId, fn) {
    fn(geral); fn(acc(porColab, colabId));
    var eq = colabs[colabId].equipe_id; if (eq) fn(acc(porEquipe, eq));
  };

  db.atividades.forEach(function (a) {
    if (ehFolga_(a) || !a.data || a.data < de || a.data > ate || a.data > hoje || !a.colaborador_id || !passa(a.colaborador_id)) return;
    var u = ultimo[a.id];
    somar(a.colaborador_id, function (x) {
      x.programadas++;
      if (!u) x.sem_apontamento++;
      else if (u.status === 'concluida') { x.concluidas++; if (u.data === a.data) x.no_prazo++; }
      else if (u.status === 'iniciada') x.iniciadas++;
      else x.pendentes++;
    });
    if (u && u.status === 'pendente' && MOTIVOS_[u.motivo]) {
      motivos[u.motivo]++;
      if (!motivosColab[a.colaborador_id]) motivosColab[a.colaborador_id] = {};
      motivosColab[a.colaborador_id][u.motivo] = (motivosColab[a.colaborador_id][u.motivo] || 0) + 1;
    }
  });

  db.apontamentos.forEach(function (ap) {
    if (ap.status !== 'extra' || ap.data < de || ap.data > ate || !passa(ap.colaborador_id)) return;
    somar(ap.colaborador_id, function (x) {
      x.extras++;
      if (ap.classificacao === 'BPF') x.extras_bpf++; else x.extras_corretiva++;
    });
  });

  var elegiveis = db.colaboradores.filter(function (c) { return c.ativo && passa(c.id); });
  var porNome = function (x, y) { return x.nome.localeCompare(y.nome); };
  var equipesIds = {};
  elegiveis.forEach(function (c) { if (c.equipe_id) equipesIds[c.equipe_id] = 1; });
  return {
    de: de, ate: ate, geral: fechar_(geral),
    equipes: Object.keys(equipesIds).map(function (id) {
      var o = fechar_(porEquipe[id] || novoAcc_()); o.id = id; o.nome = equipes[id] ? equipes[id].nome : '(removida)'; return o;
    }).sort(porNome),
    colaboradores: elegiveis.map(function (c) {
      var o = fechar_(porColab[c.id] || novoAcc_());
      o.id = c.id; o.nome = c.nome; o.equipe_id = c.equipe_id; o.motivos = motivosColab[c.id] || {};
      o.regime = c.regime || 'Turno'; o.letra = c.letra || '';
      o.equipe = c.equipe_id && equipes[c.equipe_id] ? equipes[c.equipe_id].nome : '-'; return o;
    }).sort(porNome),
    motivos: Object.keys(MOTIVOS_).map(function (k) { return { codigo: k, rotulo: MOTIVOS_[k], total: motivos[k] }; }),
  };
}
