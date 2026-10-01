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

