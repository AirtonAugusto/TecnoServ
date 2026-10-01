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
