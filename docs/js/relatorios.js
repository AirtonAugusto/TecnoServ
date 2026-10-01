'use strict';
/* ===== Relatório de turno por equipe ===== */
const Rel = (() => {
  let el = null, equipes = null;
  const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function pintar(lista, data) {
    const alvo = $('#rel-lista', el);
    alvo.innerHTML = lista.map(t => `<div class="cartao rel-eq">
      <h3>${esc(t.equipe)} · ${fmtDataCompleta(t.data)}</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${[['concluida', 'Concluídas', t.resumo.concluidas], ['iniciada', 'Parciais', t.resumo.iniciadas], ['pendente', 'Pendentes', t.resumo.pendentes], ['extra', 'Extras', t.resumo.extras]].map(([c, n, v]) => `<span class="tag ${c}">${n}: ${v}</span>`).join('')}</div>
      ${t.pendentes_envio.length ? `<p class="nota">Ainda não enviaram: ${t.pendentes_envio.map(esc).join(', ')}</p>` : ''}
      ${t.enviaram.map(e => `<div class="rel-col"><div><b>${esc(e.colaborador)}</b> <span class="nota">${e.turno ? esc(e.turno) + ' · ' : ''}enviado às ${hora(e.enviado_em)}</span></div>
        <ul>${e.itens.map(i => `<li><span class="tag ${i.status}">${(STATUS[i.status] || STATUS.programada).short}</span> <span class="mono" style="font-size:13px">${esc(i.os)}</span> ${esc(i.descricao)}${i.data_prevista && i.data_prevista < t.data ? ` <span class="nota">(prevista ${fmtData(i.data_prevista)})</span>` : ''}
          ${i.status === 'pendente' ? `<div class="just"><b>${esc(i.motivo || 'Sem motivo')}</b>${i.justificativa ? ' · ' + esc(i.justificativa) : ''}</div>` : ''}</li>`).join('')}
          ${e.extras.map(x => `<li><span class="tag extra">Extra · ${esc(x.classificacao)}</span> ${esc(x.descricao)}${x.equipamento ? ` <span class="nota">(${esc(x.equipamento)})</span>` : ''}</li>`).join('')}</ul>
        ${e.observacao ? `<p style="font-size:14px">💬 ${esc(e.observacao)}</p>` : ''}
        ${e.fotos.length ? `<div><button type="button" class="btn sm no-print" data-fotos="${e.fotos.join(',')}" style="min-height:36px">Ver ${e.fotos.length} foto(s)</button><div class="fotos-rel" style="margin-top:8px"></div></div>` : ''}
      </div>`).join('')}
    </div>`).join('') || '<div class="cartao bloco" style="text-align:center;color:#5B6470">Nenhum envio nesta data.</div>';
    $$('[data-fotos]', alvo).forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Carregando…';
      const caixa = b.nextElementSibling;
      for (const id of b.dataset.fotos.split(',')) {
        try { const r = await rpc('gestao.foto', { id }); const im = document.createElement('img'); im.src = r.src; im.alt = 'foto do turno'; caixa.appendChild(im); }
        catch (err) { toast(err.message, true); }
      }
      b.remove();
    });
  }

  async function ver() {
    try { pintar(await rpc('gestao.relatorios', { data: $('#r-data', el).value, equipe_id: $('#r-eq', el).value }), $('#r-data', el).value); }
    catch (e) { toast(e.message, true); }
  }

  async function mount() {
    el = Adm.quadro('relatorios');
    el.innerHTML = Adm.cabecalho('Turnos enviados pelos colaboradores', 'Relatório de turno por equipe') + `
    <section class="cartao filtros">
      <label class="lb">Data<input class="inp sm" type="date" id="r-data" value="${hoje()}" style="min-width:180px"></label>
      <label class="lb">Equipe<select id="r-eq"><option value="">Todas as equipes</option></select></label>
      <button type="button" class="btn pri" id="r-ver">Ver</button><button type="button" class="btn no-print" id="r-imp">Imprimir</button>
    </section><div id="rel-lista"></div>`;
    $('#r-ver', el).onclick = ver; $('#r-imp', el).onclick = () => window.print();
    $('#r-data', el).onchange = ver; $('#r-eq', el).onchange = ver;
    try {
      if (!equipes) equipes = (await rpc('gestao.cadastros')).equipes;
      $('#r-eq', el).insertAdjacentHTML('beforeend', equipes.map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join(''));
    } catch (e) { return toast(e.message, true); }
    ver();
  }
  return { mount };
})();
