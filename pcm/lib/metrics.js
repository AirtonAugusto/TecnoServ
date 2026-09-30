'use strict';
const { intervalo } = require('./dates');

/*
 * Definições dos indicadores (período [de, ate]):
 *  - Planejadas: atividades programadas com data no período e data <= hoje.
 *  - Situação final de uma atividade = último apontamento dela (mesmo de dias posteriores).
 *  - Concluídas (verde) / Iniciadas (amarelo) / Pendentes (vermelho) / Sem apontamento.
 *  - % Aderência       = concluídas ÷ planejadas
 *  - % Não conformidade = (pendentes + sem apontamento) ÷ planejadas
 *  - % Sequência       = apontamentos de atividades de dias anteriores (continuidade)
 *                        ÷ apontamentos de atividades programadas no período
 *  - % Extras          = atividades extras (azul) ÷ total de apontamentos no período
 */
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function novoAcc() {
  return { planejadas: 0, concluidas: 0, iniciadas: 0, pendentes: 0, sem_apontamento: 0, apont_programados: 0, apont_sequencia: 0, extras: 0, extras_bpf: 0, extras_corretiva: 0, apont_total: 0 };
}
function fechar(a) {
  return {
    ...a,
    pct_aderencia: pct(a.concluidas, a.planejadas),
    pct_iniciadas: pct(a.iniciadas, a.planejadas),
    pct_nao_conformidade: pct(a.pendentes + a.sem_apontamento, a.planejadas),
    pct_sequencia: pct(a.apont_sequencia, a.apont_programados),
    pct_extras: pct(a.extras, a.apont_total),
  };
}

function calcular(db, { de, ate, hoje, equipe_id }) {
  const colabs = new Map(db.colaboradores.map(c => [c.id, c]));
  const equipes = new Map(db.equipes.map(e => [e.id, e]));
  const ativs = new Map(db.atividades.map(a => [a.id, a]));

  // último apontamento por atividade
  const ultimo = new Map();
  for (const ap of db.apontamentos) {
    if (!ap.atividade_id) continue;
    const u = ultimo.get(ap.atividade_id);
    if (!u || ap.data > u.data || (ap.data === u.data && ap.criado_em >= u.criado_em)) ultimo.set(ap.atividade_id, ap);
  }

  const porColab = new Map(), porEquipe = new Map(), geral = novoAcc();
  const dia = new Map(intervalo(de, ate).map(d => [d, { data: d, planejadas: 0, concluidas: 0 }]));
  const acc = (m, k) => { if (!m.has(k)) m.set(k, novoAcc()); return m.get(k); };
  const somar = (colabId, fn) => {
    const c = colabs.get(colabId);
    const eq = c && c.equipe_id;
    if (equipe_id && eq !== equipe_id) return;
    fn(geral); fn(acc(porColab, colabId));
    if (eq) fn(acc(porEquipe, eq));
  };

  for (const a of db.atividades) {
    if (a.data < de || a.data > ate || a.data > hoje || !a.colaborador_id) continue;
    const u = ultimo.get(a.id);
    somar(a.colaborador_id, x => {
      x.planejadas++;
      if (!u) x.sem_apontamento++;
      else if (u.status === 'concluida') x.concluidas++;
      else if (u.status === 'iniciada') x.iniciadas++;
      else x.pendentes++;
    });
    const d = dia.get(a.data);
    if (d && (!equipe_id || (colabs.get(a.colaborador_id) || {}).equipe_id === equipe_id)) {
      d.planejadas++;
      if (u && u.status === 'concluida') d.concluidas++;
    }
  }

  for (const ap of db.apontamentos) {
    if (ap.data < de || ap.data > ate) continue;
    const a = ap.atividade_id && ativs.get(ap.atividade_id);
    somar(ap.colaborador_id, x => {
      x.apont_total++;
      if (ap.status === 'extra') {
        x.extras++;
        if (ap.classificacao === 'BPF') x.extras_bpf++; else x.extras_corretiva++;
      } else if (a) {
        x.apont_programados++;
        if (a.data < ap.data) x.apont_sequencia++;
      }
    });
  }

  const linhaColab = ([id, a]) => ({ id, nome: colabs.get(id)?.nome || '(removido)', equipe: equipes.get(colabs.get(id)?.equipe_id)?.nome || '-', ...fechar(a) });
  return {
    periodo: { de, ate },
    geral: fechar(geral),
    equipes: [...porEquipe].map(([id, a]) => ({ id, nome: equipes.get(id)?.nome || '(removida)', ...fechar(a) })).sort((x, y) => x.nome.localeCompare(y.nome)),
    colaboradores: [...porColab].map(linhaColab).sort((x, y) => x.nome.localeCompare(y.nome)),
    serie_diaria: [...dia.values()].map(d => ({ ...d, pct_aderencia: pct(d.concluidas, d.planejadas) })),
  };
}

module.exports = { calcular };
