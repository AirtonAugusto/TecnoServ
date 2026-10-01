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

