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
  return HtmlService.createTemplateFromFile('Pagina').evaluate()
    .setTitle('Sistema PCM — AngloGold Ashanti')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Usada por Pagina.html para incluir as partes (Estilos, Js...). */
function incluir(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
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

