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

