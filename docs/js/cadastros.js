'use strict';
/* ===== Cadastros: equipes e colaboradores (com regime Turno/ADM e letra B/C) ===== */
const Cad = (() => {
  let el = null, equipes = [], colabs = [];
  const nomeEq = id => (equipes.find(e => e.id === id) || {}).nome || '—';

  // Campos Regime + Letra: a letra só aparece para quem roda turno (ADM não tem letra)
  const camposRegime = (pref, c) => `
    <label class="fld p" style="flex:1 1 120px">Regime<select class="inp sm" id="${pref}-reg"><option value="Turno" ${c.regime !== 'ADM' ? 'selected' : ''}>Turno (roda letra)</option><option value="ADM" ${c.regime === 'ADM' ? 'selected' : ''}>ADM (não roda turno)</option></select></label>
    <label class="fld p" id="${pref}-letra-w" style="flex:1 1 110px">Letra<select class="inp sm" id="${pref}-letra">${LETRAS.map(l => `<option ${c.letra === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  function ligarRegime(pref, raiz) {
    const reg = $(`#${pref}-reg`, raiz), w = $(`#${pref}-letra-w`, raiz);
    const atualizar = () => { w.style.display = reg.value === 'ADM' ? 'none' : ''; };
    reg.onchange = atualizar; atualizar();
  }
  const valoresRegime = (pref, raiz) => { const regime = $(`#${pref}-reg`, raiz).value; return { regime, letra: regime === 'ADM' ? '' : $(`#${pref}-letra`, raiz).value }; };

  function linhaColab(c) {
    return `<tr style="${c.ativo ? '' : 'opacity:.5'}">
      <td><span style="display:inline-flex;align-items:center;gap:10px">${avatar(c.nome, c.id, 30, 12)}<b>${esc(c.nome)}</b>${c.ativo ? '' : ' <span class="chip">inativo</span>'}</span></td>
      <td class="mono">${esc(c.matricula || '—')}</td><td>${esc(nomeEq(c.equipe_id))}</td><td>${esc(rotuloTurno(c))}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn sm" data-edit="${c.id}" style="min-height:36px">Editar</button>
        ${c.ativo ? `<button class="btn sm" data-inat="${c.id}" style="min-height:36px">Inativar</button>` : `<button class="btn sm" data-ativ="${c.id}" style="min-height:36px">Reativar</button>`}
        <button class="btn perigo sm" data-exc="${c.id}" style="min-height:36px">Excluir</button></td></tr>`;
  }

  function desenhar() {
    const opcoesEq = '<option value="">Sem equipe</option>' + equipes.map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');
    const grupos = GRUPOS.map(([k, nome]) => ({ k, nome, lista: colabs.filter(c => grupoDe(c) === k).sort((a, b) => a.nome.localeCompare(b.nome)) })).filter(g => g.lista.length);
    el.innerHTML = Adm.cabecalho('Quem aparece no apontamento e na programação', 'Cadastros') + `
    <section class="cartao bloco"><h2>Equipes</h2>
      <form class="linha-f" id="c-fe"><label class="fld p" style="flex:2 1 260px">Nome da equipe<input class="inp sm" id="c-eq-nome" placeholder="Ex.: Alta Tensão · AGA" required></label><button class="btn pri fx">Adicionar equipe</button></form>
      <table class="tab"><tr><th>Equipe</th><th>Colaboradores</th><th></th></tr>${equipes.map(e => `<tr><td><b>${esc(e.nome)}</b></td><td>${colabs.filter(c => c.equipe_id === e.id && c.ativo).length}</td>
        <td style="text-align:right"><button class="btn sm" data-ren="${e.id}" style="min-height:36px">Renomear</button> <button class="btn perigo sm" data-dele="${e.id}" style="min-height:36px">Excluir</button></td></tr>`).join('') || '<tr><td colspan="3" class="nota">Nenhuma equipe cadastrada.</td></tr>'}</table>
    </section>
    <section class="cartao bloco"><h2>Colaboradores</h2>
      <form class="linha-f" id="c-fc">
        <label class="fld p" style="flex:2 1 220px">Nome<input class="inp sm" id="c-nome" placeholder="Nome completo" required></label>
        <label class="fld p" style="flex:1 1 130px">Matrícula<input class="inp sm" id="c-mat" inputmode="numeric" placeholder="Ex.: 102345" required></label>
        <label class="fld p" style="flex:1 1 180px">Equipe<select class="inp sm" id="c-eq">${opcoesEq}</select></label>
        ${camposRegime('c', { regime: 'Turno', letra: 'A' })}
        <button class="btn pri fx">Adicionar</button>
      </form>
      <p class="nota">A matrícula é o que o colaborador digita para entrar. <b>Turno</b> = roda as letras B ou C. <b>ADM</b> = não roda turno e tem folga fixa no sábado e domingo.</p>
      <div style="overflow-x:auto"><table class="tab"><tr><th>Colaborador</th><th>Matrícula</th><th>Equipe</th><th>Turno</th><th></th></tr>
        ${grupos.map(g => `<tr class="grp-l"><td colspan="5">${g.nome} <span>· ${g.lista.length} ${g.lista.length === 1 ? 'pessoa' : 'pessoas'}</span></td></tr>${g.lista.map(linhaColab).join('')}`).join('') || '<tr><td colspan="5" class="nota">Nenhum colaborador cadastrado.</td></tr>'}</table></div>
    </section>`;
    ligarRegime('c', el);
    $('#c-fe', el).onsubmit = e => { e.preventDefault(); acao(async () => { await rpc('gestao.equipe.salvar', { nome: $('#c-eq-nome', el).value }); }); };
    $('#c-fc', el).onsubmit = e => {
      e.preventDefault();
      acao(async () => { await rpc('gestao.colaborador.salvar', { nome: $('#c-nome', el).value, matricula: $('#c-mat', el).value, equipe_id: $('#c-eq', el).value, ...valoresRegime('c', el) }); toast('Colaborador adicionado'); });
    };
    $$('[data-ren]', el).forEach(b => b.onclick = () => { const e = equipes.find(x => x.id === b.dataset.ren), nome = prompt('Novo nome da equipe:', e.nome); if (nome) acao(() => rpc('gestao.equipe.salvar', { id: e.id, nome })); });
    $$('[data-dele]', el).forEach(b => b.onclick = () => confirm('Excluir esta equipe?') && acao(() => rpc('gestao.equipe.excluir', { id: b.dataset.dele })));
    $$('[data-inat]', el).forEach(b => b.onclick = () => confirm('Inativar colaborador? O histórico é mantido e ele deixa de entrar no apontamento.') && acao(() => rpc('gestao.colaborador.inativar', { id: b.dataset.inat })));
    $$('[data-ativ]', el).forEach(b => b.onclick = () => { const c = colabs.find(x => x.id === b.dataset.ativ); acao(() => rpc('gestao.colaborador.salvar', { ...c, ativo: true })); });
    $$('[data-exc]', el).forEach(b => b.onclick = () => {
      const c = colabs.find(x => x.id === b.dataset.exc);
      if (confirm(`Excluir ${c.nome} de vez?\n\nAs OS futuras dele voltam para o backlog e as folgas marcadas são removidas. O histórico de apontamentos é mantido. Para só tirar do apontamento sem apagar, use “Inativar”.`))
        acao(async () => { await rpc('gestao.colaborador.excluir', { id: c.id }); toast(`${c.nome} excluído`); });
    });
    $$('[data-edit]', el).forEach(b => b.onclick = () => editar(colabs.find(x => x.id === b.dataset.edit)));
  }

  function editar(c) {
    const o = modal(`<form id="e-form" novalidate><div class="tt"><h2>Editar colaborador</h2><button type="button" class="x" id="e-x" aria-label="Fechar">${icone('x')}</button></div>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:16px">
        <label class="fld p">Nome<input class="inp sm" id="e-nome" value="${esc(c.nome)}"></label>
        <label class="fld p">Matrícula<input class="inp sm" id="e-mat" inputmode="numeric" value="${esc(c.matricula)}"></label>
        <label class="fld p">Equipe<select class="inp sm" id="e-eq"><option value="">Sem equipe</option>${equipes.map(e => `<option value="${e.id}" ${e.id === c.equipe_id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></label>
        <div class="linha-f">${camposRegime('e', c)}</div>
        <div class="erro" id="e-erro" role="alert" hidden></div>
        <div class="acoes"><span></span><div><button type="button" class="btn" id="e-cancel">Cancelar</button><button class="btn pri">Salvar</button></div></div>
      </div></form>`);
    ligarRegime('e', o);
    $('#e-x', o).onclick = $('#e-cancel', o).onclick = o.fechar;
    $('#e-form', o).onsubmit = async ev => {
      ev.preventDefault();
      try { await rpc('gestao.colaborador.salvar', { id: c.id, ativo: c.ativo, nome: $('#e-nome', o).value, matricula: $('#e-mat', o).value, equipe_id: $('#e-eq', o).value, ...valoresRegime('e', o) }); o.fechar(); toast('Colaborador atualizado'); await carregar(); }
      catch (e) { const er = $('#e-erro', o); er.hidden = false; er.innerHTML = icone('alerta', 's') + esc(e.message); }
    };
    $('#e-nome', o).focus();
  }

  async function acao(fn) { try { await fn(); await carregar(); } catch (e) { toast(e.message, true); } }
  async function carregar() {
    try { const r = await rpc('gestao.cadastros'); equipes = r.equipes; colabs = r.colaboradores; } catch (e) { return toast(e.message, true); }
    desenhar();
  }
  function mount() { el = Adm.quadro('cadastros'); if (equipes.length || colabs.length) desenhar(); carregar(); }
  return { mount };
})();
