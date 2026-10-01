'use strict';
/* ===== Cadastros: equipes e colaboradores ===== */
const Cad = (() => {
  let el = null, equipes = [], colabs = [];
  const nomeEq = id => (equipes.find(e => e.id === id) || {}).nome || '—';

  function desenhar() {
    const opcoesEq = (sel) => '<option value="">Sem equipe</option>' + equipes.map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');
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
        <label class="fld p" style="flex:1 1 180px">Equipe<select class="inp sm" id="c-eq">${opcoesEq('')}</select></label>
        <label class="fld p" style="flex:1 1 120px">Regime<select class="inp sm" id="c-reg"><option>Turno</option><option>ADM</option></select></label>
        <button class="btn pri fx">Adicionar</button>
      </form>
      <p class="nota">A matrícula é o que o colaborador digita para entrar no apontamento. Regime “ADM” tem folga aos sábados e domingos na programação.</p>
      <div style="overflow-x:auto"><table class="tab"><tr><th>Colaborador</th><th>Matrícula</th><th>Equipe</th><th>Regime</th><th></th></tr>${colabs.map(c => `<tr style="${c.ativo ? '' : 'opacity:.5'}">
        <td><span style="display:inline-flex;align-items:center;gap:10px">${avatar(c.nome, c.id, 30, 12)}<b>${esc(c.nome)}</b>${c.ativo ? '' : ' <span class="chip">inativo</span>'}</span></td>
        <td class="mono">${esc(c.matricula || '—')}</td><td>${esc(nomeEq(c.equipe_id))}</td><td>${esc(c.regime || 'Turno')}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm" data-edit="${c.id}" style="min-height:36px">Editar</button> ${c.ativo ? `<button class="btn perigo sm" data-inat="${c.id}" style="min-height:36px">Inativar</button>` : `<button class="btn sm" data-ativ="${c.id}" style="min-height:36px">Reativar</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="nota">Nenhum colaborador cadastrado.</td></tr>'}</table></div>
    </section>`;
    $('#c-fe', el).onsubmit = e => { e.preventDefault(); acao(async () => { await rpc('gestao.equipe.salvar', { nome: $('#c-eq-nome', el).value }); }); };
    $('#c-fc', el).onsubmit = e => { e.preventDefault(); acao(async () => { await rpc('gestao.colaborador.salvar', { nome: $('#c-nome', el).value, matricula: $('#c-mat', el).value, equipe_id: $('#c-eq', el).value, regime: $('#c-reg', el).value }); }); };
    $$('[data-ren]', el).forEach(b => b.onclick = () => { const e = equipes.find(x => x.id === b.dataset.ren), nome = prompt('Novo nome da equipe:', e.nome); if (nome) acao(() => rpc('gestao.equipe.salvar', { id: e.id, nome })); });
    $$('[data-dele]', el).forEach(b => b.onclick = () => confirm('Excluir esta equipe?') && acao(() => rpc('gestao.equipe.excluir', { id: b.dataset.dele })));
    $$('[data-inat]', el).forEach(b => b.onclick = () => confirm('Inativar colaborador? O histórico é mantido e ele deixa de entrar no apontamento.') && acao(() => rpc('gestao.colaborador.inativar', { id: b.dataset.inat })));
    $$('[data-ativ]', el).forEach(b => b.onclick = () => { const c = colabs.find(x => x.id === b.dataset.ativ); acao(() => rpc('gestao.colaborador.salvar', { ...c, ativo: true })); });
    $$('[data-edit]', el).forEach(b => b.onclick = () => editar(colabs.find(x => x.id === b.dataset.edit)));
  }

  function editar(c) {
    const o = modal(`<form id="e-form" novalidate><div class="tt"><h2>Editar colaborador</h2><button type="button" class="x" id="e-x" aria-label="Fechar">${icone('x')}</button></div>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:16px">
        <label class="fld p">Nome<input class="inp sm" id="e-nome" value="${esc(c.nome)}"></label>
        <div class="g2e"><label class="fld p">Matrícula<input class="inp sm" id="e-mat" inputmode="numeric" value="${esc(c.matricula)}"></label>
        <label class="fld p">Regime<select class="inp sm" id="e-reg"><option ${c.regime !== 'ADM' ? 'selected' : ''}>Turno</option><option ${c.regime === 'ADM' ? 'selected' : ''}>ADM</option></select></label></div>
        <label class="fld p">Equipe<select class="inp sm" id="e-eq"><option value="">Sem equipe</option>${equipes.map(e => `<option value="${e.id}" ${e.id === c.equipe_id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></label>
        <div class="erro" id="e-erro" role="alert" hidden></div>
        <div class="acoes"><span></span><div><button type="button" class="btn" id="e-cancel">Cancelar</button><button class="btn pri">Salvar</button></div></div>
      </div></form>`);
    $('#e-x', o).onclick = $('#e-cancel', o).onclick = o.fechar;
    $('#e-form', o).onsubmit = async ev => {
      ev.preventDefault();
      try { await rpc('gestao.colaborador.salvar', { id: c.id, ativo: c.ativo, nome: $('#e-nome', o).value, matricula: $('#e-mat', o).value, regime: $('#e-reg', o).value, equipe_id: $('#e-eq', o).value }); o.fechar(); toast('Colaborador atualizado'); await carregar(); }
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
