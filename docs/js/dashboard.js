'use strict';
/* ===== Aderência da programação ===== */
const Dash = (() => {
  const PERIODOS = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']];
  let S = { periodo: 'semana', equipe: 'all', pessoa: 'all', dados: null, hora: '' };
  let el = null;

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const somar = (lista, campo) => lista.reduce((n, c) => n + (c[campo] || 0), 0);

  function rotulo(d) {
    if (S.periodo === 'dia') return `${DIAS[diaIdx(d.de)]}, ${fmtDataCompleta(d.de)}`;
    if (S.periodo === 'mes') return `${MESES[Number(d.de.slice(5, 7)) - 1]} ${d.de.slice(0, 4)}`;
    return `Semana ${d.semana.numero} · ${fmtData(d.de)} – ${fmtDataCompleta(d.ate)}`;
  }

  function desenhar() {
    const D = S.dados, meta = D.aderencia.meta;
    const pessoasTodas = D.aderencia.colaboradores;
    const equipes = D.equipes;
    const pessoas = pessoasTodas.filter(c => (S.equipe === 'all' || c.equipe_id === S.equipe) && (S.pessoa === 'all' || c.id === S.pessoa));
    const opcoesPessoa = pessoasTodas.filter(c => S.equipe === 'all' || c.equipe_id === S.equipe);
    const t = k => somar(pessoas, k);
    const pl = t('programadas'), co = t('concluidas'), np = t('no_prazo'), pa = t('iniciadas'), pe = t('pendentes'), sa = t('sem_apontamento'), xb = t('extras_bpf'), xc = t('extras_corretiva');
    const ex = xb + xc, ader = pct(co, pl), prazo = pct(np, pl);

    const seg = [
      { label: 'Concluída', v: co, cor: '#22C55E' }, { label: 'Iniciada / Parcial', v: pa, cor: '#EAB308' },
      { label: 'Pendente', v: pe, cor: '#EF4444' }, { label: 'Atividade extra', v: ex, cor: '#3B82F6' },
    ];
    if (sa) seg.push({ label: 'Sem apontamento', v: sa, cor: '#C2C8D0' });
    const tot = seg.reduce((n, s) => n + s.v, 0);
    let acc = 0;
    const paradas = seg.map(s => { const a = acc; acc += tot ? (s.v / tot) * 360 : 0; return `${s.cor} ${a.toFixed(2)}deg ${acc.toFixed(2)}deg`; });

    const eqIds = [...new Set(pessoas.map(p => p.equipe_id).filter(Boolean))];
    const eqBars = eqIds.map(id => {
      const ps = pessoas.filter(p => p.equipe_id === id);
      return { nome: (equipes.find(e => e.id === id) || {}).nome || '(sem equipe)', pl: somar(ps, 'programadas'), co: somar(ps, 'concluidas') };
    });
    const maxT = Math.max(1, ...eqBars.map(e => e.pl));
    const maxP = Math.max(1, ...pessoas.map(p => p.programadas));
    const mot = Object.keys(MOTIVOS).map(k => ({ k, rotulo: MOTIVOS[k], v: pessoas.reduce((n, p) => n + ((p.motivos || {})[k] || 0), 0) }));
    const maxM = Math.max(1, ...mot.map(m => m.v));
    const filtrado = S.equipe !== 'all' || S.pessoa !== 'all';
    const vazio = !pl && !ex;

    el.innerHTML = Adm.cabecalho(esc(rotulo(D.aderencia)), 'Aderência da programação', `<div class="sync"><span class="dot"></span>Sincronizado com a planilha · atualizado às ${esc(S.hora)}</div>`) + `
    <section class="cartao filtros" aria-label="Filtros">
      <div class="lb">Período<div class="per" role="group">${PERIODOS.map(([k, n]) => `<button type="button" data-per="${k}" aria-pressed="${k === S.periodo}">${n}</button>`).join('')}</div></div>
      <label class="lb">Equipe<select id="f-eq"><option value="all">Todas as equipes</option>${equipes.map(e => `<option value="${e.id}" ${e.id === S.equipe ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></label>
      <label class="lb">Colaborador<select id="f-pe"><option value="all">Todos os colaboradores</option>${opcoesPessoa.map(p => `<option value="${p.id}" ${p.id === S.pessoa ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      ${filtrado ? '<button type="button" class="btn link" id="f-limpar" style="min-height:44px">Limpar filtros</button>' : ''}
    </section>
    <section class="kpis" aria-label="Indicadores">
      <div class="cartao kpi"><div class="k">Aderência geral</div><div class="v">${ader}<small>%</small></div>
        <div class="trilho"><div class="bar" style="height:100%;border-radius:4px;width:${ader}%;background:${ader >= meta ? '#16A34A' : '#1C2430'}"></div><div style="position:absolute;top:-4px;bottom:-4px;width:2px;background:#14181F;left:calc(${meta}% - 1px)"></div></div>
        <div class="s">${co} de ${pl} programadas · meta ${meta}%</div></div>
      <div class="cartao kpi"><div class="k">Concluídas no prazo</div><div class="v">${prazo}<small>%</small></div>
        <div class="trilho o"><div class="bar" style="height:100%;border-radius:4px;width:${prazo}%;background:#1C2430"></div></div>
        <div class="s">${np} concluídas no dia programado</div></div>
      <div class="cartao kpi"><div class="k"><i style="background:#3B82F6"></i>Total de extras</div><div class="v">${ex}</div>
        <div class="pills"><span class="pill" style="background:#EFF5FF;color:#1E40AF">${xb} BPF</span><span class="pill" style="background:#EFF5FF;color:#1E40AF">${xc} Corretivas</span></div>
        <div class="s">Contadas à parte, não somam à aderência</div></div>
      <div class="cartao kpi"><div class="k"><i style="background:#EF4444"></i>Total de pendências</div><div class="v">${pe}</div>
        <div class="pills"><span class="pill" style="background:#FEF9E7;color:#854D0E">+ ${pa} parciais</span>${sa ? `<span class="pill" style="background:#F3F4F6;color:#3D4652">${sa} sem apontamento</span>` : ''}</div>
        <div class="s">${pct(pe, pl)}% do programado ficou sem execução</div></div>
    </section>
    ${vazio ? '<div class="cartao bloco" style="text-align:center;color:#5B6470">Ainda não há atividades programadas nem extras neste período para o filtro escolhido.</div>' : ''}
    <section class="row3">
      <div class="cartao bloco"><h2>Distribuição de status</h2>
        <div style="display:flex;justify-content:center"><div class="donut" role="img" aria-label="${esc(seg.map(s => s.label + ' ' + s.v).join(', '))}" style="background:conic-gradient(${tot ? paradas.join(', ') : '#EEF0F3 0deg 360deg'})"><div><b>${tot}</b><span>atividades</span></div></div></div>
        <div class="legenda">${seg.map(s => `<div><span class="dot" style="background:${s.cor}"></span><span>${s.label}</span><span class="num" style="font-weight:600">${s.v}</span><span class="p num">${pct(s.v, tot)}%</span></div>`).join('')}</div>
      </div>
      <div class="cartao bloco span2">
        <div class="l1"><h2>Planejado vs. executado por equipe</h2><div class="lg2"><span><i style="background:#C9CED6"></i>Planejado</span><span><i style="background:#1C2430"></i>Executado (concluídas)</span></div></div>
        <div class="cols">${eqBars.map(e => `<div class="g">
          <div class="c"><span class="num">${e.pl}</span><b class="bar" style="background:#C9CED6;height:${Math.round((e.pl / maxT) * 230)}px"></b></div>
          <div class="c"><span class="num" style="font-weight:700;color:#14181F">${e.co}</span><b class="bar" style="background:#1C2430;height:${Math.round((e.co / maxT) * 230)}px"></b></div></div>`).join('') || '<div style="margin:auto;color:#5B6470">Sem equipes para exibir.</div>'}</div>
        <div class="nomes">${eqBars.map(e => `<div>${esc(e.nome)}<small>Aderência ${pct(e.co, e.pl)}%</small></div>`).join('')}</div>
      </div>
    </section>
    <section class="row3">
      <div class="cartao bloco span2">
        <div class="l1"><h2>Planejado vs. executado por colaborador</h2><span style="font-size:13px;color:#5B6470">Concluídas / programadas</span></div>
        <div style="display:flex;flex-direction:column;gap:14px">${pessoas.map(p => `<div class="pbar">
          <div class="n">${avatar(p.nome, p.id, 32, 12)}<span style="min-width:0"><b>${esc(p.nome)}</b><small>${esc(p.equipe)}</small></span></div>
          <div class="b"><div class="bar" style="background:#C9CED6;width:${((p.programadas / maxP) * 100).toFixed(1)}%"></div><div class="bar" style="background:#1C2430;width:${((p.concluidas / maxP) * 100).toFixed(1)}%"></div></div>
          <div class="r num"><b>${pct(p.concluidas, p.programadas)}%</b><span> · ${p.concluidas}/${p.programadas}</span></div></div>`).join('') || '<div style="color:#5B6470">Nenhum colaborador para o filtro escolhido.</div>'}</div>
      </div>
      <div class="cartao bloco"><div><h2>Motivos de não execução</h2><span style="font-size:13px;color:#5B6470">${pe} pendências justificadas</span></div>
        <div style="display:flex;flex-direction:column;gap:12px">${mot.map(m => `<div class="mot"><div class="l"><span>${esc(m.rotulo)}</span><span class="num" style="font-weight:600">${m.v}</span></div><div class="t"><div class="bar" style="width:${((m.v / maxM) * 100).toFixed(1)}%"></div></div></div>`).join('')}</div>
      </div>
    </section>`;

    $$('[data-per]', el).forEach(b => b.onclick = () => { if (b.dataset.per !== S.periodo) { S.periodo = b.dataset.per; carregar(); } });
    $('#f-eq', el).onchange = e => { S.equipe = e.target.value; S.pessoa = 'all'; desenhar(); };
    $('#f-pe', el).onchange = e => { S.pessoa = e.target.value; desenhar(); };
    const l = $('#f-limpar', el); if (l) l.onclick = () => { S.equipe = 'all'; S.pessoa = 'all'; desenhar(); };
  }

  async function carregar() {
    if (S.dados) el.style.opacity = .6;
    try {
      S.dados = await rpc('gestao.painel', { periodo: S.periodo });
      S.hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { el.style.opacity = 1; return toast(e.message, true); }
    el.style.opacity = 1; desenhar();
  }

  function mount() {
    el = Adm.quadro('aderencia');
    if (S.dados) desenhar(); // mostra o que já tinha enquanto atualiza
    carregar();
  }
  return { mount };
})();
