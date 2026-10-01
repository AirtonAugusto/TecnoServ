'use strict';
/* ===== Programação semanal (3 semanas) + carteira de backlog ===== */
const Prog = (() => {
  let C = null;          // dados do servidor
  let semana = 0;        // índice da semana selecionada (0..2)
  let arrasto = null, sobre = null, el = null;

  const TAGS = ['Vigente · W', 'W+1', 'W+2'];
  const pessoa = id => (C.colaboradores || []).find(c => c.id === id);
  const folga = (p, dataIso) => !!p && !!dataIso && p.regime === 'ADM' && diaIdx(dataIso) >= 5;
  const nomeEquipe = id => ((C.equipes || []).find(e => e.id === id) || {}).nome || '';
  const metaPessoa = p => [nomeEquipe(p.equipe_id), p.regime === 'ADM' ? 'ADM' : 'Turno'].filter(Boolean).join(' · ');

  function cartao(t, compacto) {
    const s = STATUS[t.status] || STATUS.programada, p = pessoa(t.colaborador_id);
    const ava = p ? `<span class="ava" style="background:${corDe(p.id)}">${esc(iniciais(p.nome))}</span>` : '';
    return `<button type="button" class="task ${compacto ? '' : 'big'}" draggable="true" data-t="${t.id}" aria-label="${esc(`OS ${t.os}, ${t.descricao}${p ? ', ' + p.nome : ''}, ${s.label}. Clique para editar.`)}" style="box-shadow:inset 0 3px 0 ${s.cor};opacity:${arrasto === t.id ? .4 : 1}">
      <span class="a"><span class="os">${esc(t.os || 'Sem OS')}</span>${compacto ? ava : `<span style="font-size:11px;color:#5B6470">${esc(t.origem || '')}</span>`}</span>
      <span class="d">${esc(t.descricao)}</span>
      ${compacto ? `<span class="s"><span class="dot" style="background:${s.cor}"></span>${s.short}</span>` : `<span class="q">${esc(t.equipamento || t.area || '')}</span>`}
    </button>`;
  }
  function cartaoExtra(x) {
    const p = pessoa(x.colaborador_id);
    return `<div class="task sem-drag" title="${esc(x.descricao)}" style="box-shadow:inset 0 3px 0 #3B82F6">
      <span class="a"><span class="os">Extra</span>${p ? `<span class="ava" style="background:${corDe(p.id)}">${esc(iniciais(p.nome))}</span>` : ''}</span>
      <span class="d">${esc(x.descricao)}</span>
      <span class="s"><span class="dot" style="background:#3B82F6"></span>Extra · ${esc(x.classificacao || '')}</span></div>`;
  }

  function desenhar() {
    const w = C.semanas[semana];
    const dentro = C.atividades.filter(t => t.data >= w.inicio && t.data <= w.dias[6]);
    const extrasSem = C.extras.filter(x => x.data >= w.inicio && x.data <= w.dias[6]);
    const cont = { total: dentro.length + extrasSem.length };
    ['programada', 'concluida', 'iniciada', 'pendente'].forEach(k => { cont[k] = dentro.filter(t => t.status === k).length; });
    cont.extra = extrasSem.length;
    const abas = C.semanas.map((s, i) => {
      const n = C.atividades.filter(t => t.data >= s.inicio && t.data <= s.dias[6]).length;
      return `<button type="button" class="sem" role="tab" aria-selected="${i === semana}" data-sem="${i}"><span class="a"><b>Semana ${s.numero}</b><span class="tag">${TAGS[i]}</span></span><span class="b"><span class="mono">${fmtData(s.inicio)} – ${fmtData(s.dias[6])}</span><span>${n} OS</span></span></button>`;
    }).join('');
    const resumo = [['Total', cont.total, '#14181F'], ['Programada', cont.programada, '#9AA3AF'], ['Concluída', cont.concluida, '#22C55E'], ['Iniciada / Parcial', cont.iniciada, '#EAB308'], ['Pendente', cont.pendente, '#EF4444'], ['Atividade extra', cont.extra, '#3B82F6']]
      .map(([n, v, c]) => `<span><span class="dot" style="background:${c}"></span>${n} <strong class="num" style="color:#14181F">${v}</strong></span>`).join('');
    const linhas = C.colaboradores.map(p => {
      const cel = w.dias.map((d, di) => {
        const off = folga(p, d), chave = p.id + ':' + di, hoje = d === C.hoje;
        const tarefas = dentro.filter(t => t.colaborador_id === p.id && t.data === d);
        const extras = extrasSem.filter(x => x.colaborador_id === p.id && x.data === d);
        return `<div class="celula ${off ? 'folga' : (sobre === chave ? 'sobre' : (hoje ? 'hoje' : ''))}" data-cel="${chave}" data-d="${d}" data-p="${p.id}">${off ? '<div class="fg">Folga</div>' :
          tarefas.map(t => cartao(t, true)).join('') + extras.map(cartaoExtra).join('') +
          `<button type="button" class="add" data-add="${chave}" aria-label="Adicionar OS para ${esc(p.nome)} em ${DIAS_LONGOS[di]} ${fmtData(d)}">${icone('mais', 's')}</button>`}</div>`;
      }).join('');
      return `<div class="lin"><div class="pes">${avatar(p.nome, p.id, 30, 12)}<b>${esc(p.nome)}</b><small>${esc(metaPessoa(p))}</small></div>${cel}</div>`;
    }).join('');

    el.innerHTML = Adm.cabecalho('Horizonte de 3 semanas · ISO 8601', 'Programação semanal', `<button type="button" class="btn-nova" id="p-nova">${icone('mais')}Nova OS</button>`) + `
    <div class="semanas" role="tablist" aria-label="Semanas">${abas}</div>
    <div class="resumo"><div class="l">${resumo}</div><span class="dica">${icone('mover', 's')}Arraste os cartões para reprogramar · clique para editar</span></div>
    <div class="cal">
      <section class="grade" aria-label="Grade da semana"><div class="in">
        <div class="lin cab"><div class="th0">Colaborador</div>${w.dias.map((d, i) => `<div class="th ${d === C.hoje ? 'hoje' : ''}"><span>${DIAS[i]}${d === C.hoje ? ' · hoje' : ''}</span><span>${fmtData(d)}</span></div>`).join('')}</div>
        ${linhas || '<div style="padding:24px;color:#5B6470">Cadastre colaboradores em “Cadastros” para montar a programação.</div>'}
      </div></section>
      <aside class="backlog ${sobre === 'backlog' ? 'sobre' : ''}" id="p-backlog" aria-label="Carteira de backlog">
        <h2>Carteira de backlog<span class="num">${C.backlog.length} OS</span></h2>
        <p>Fora do horizonte de 3 semanas. Arraste para a grade para programar.</p>
        ${C.backlog.map(t => cartao(t, false)).join('') || '<p>Nenhuma OS no backlog.</p>'}
      </aside>
    </div>`;
    ligar();
  }

  const achar = id => C.atividades.find(t => t.id === id) || C.backlog.find(t => t.id === id);

  // Move uma OS (arrastar). Mostra na hora e confirma com o servidor em seguida.
  async function mover(id, data, colabId) {
    const t = achar(id); if (!t) return;
    const p = pessoa(colabId || t.colaborador_id);
    if (data && folga(p, data)) return toast(`${p.nome} está de folga neste dia`, true);
    const antes = { data: t.data, colaborador_id: t.colaborador_id };
    t.data = data; if (colabId) t.colaborador_id = colabId;
    C.atividades = C.atividades.filter(x => x.id !== id); C.backlog = C.backlog.filter(x => x.id !== id);
    (data ? C.atividades : C.backlog).push(t);
    arrasto = null; sobre = null; desenhar();
    toast(data ? `OS ${t.os} → ${diaSem(data)} ${fmtData(data)} · ${p ? p.nome : ''}` : `OS ${t.os} enviada ao backlog`);
    try { await rpc('gestao.atividade.salvar', { id, data, colaborador_id: t.colaborador_id }); }
    catch (e) { toast(e.message, true); Object.assign(t, antes); carregar(); }
  }

  function ligar() {
    $('#p-nova').onclick = () => abrirModal(null, { data: '', colab: C.colaboradores[0] && C.colaboradores[0].id });
    $$('[data-sem]', el).forEach(b => b.onclick = () => { semana = Number(b.dataset.sem); desenhar(); });
    $$('[data-add]', el).forEach(b => b.onclick = () => { const [pid, di] = b.dataset.add.split(':'); abrirModal(null, { data: C.semanas[semana].dias[Number(di)], colab: pid }); });
    $$('[data-t]', el).forEach(b => {
      b.onclick = () => abrirModal(achar(b.dataset.t));
      b.ondragstart = e => { try { e.dataTransfer.setData('text/plain', b.dataset.t); e.dataTransfer.effectAllowed = 'copyMove'; } catch (_) { /* ignora */ } arrasto = b.dataset.t; };
      b.ondragend = () => { arrasto = null; sobre = null; desenhar(); };
    });
    $$('[data-cel]', el).forEach(c => {
      const p = pessoa(c.dataset.p);
      c.ondragover = e => { if (folga(p, c.dataset.d)) return; e.preventDefault(); if (sobre !== c.dataset.cel) { sobre = c.dataset.cel; $$('.celula.sobre', el).forEach(x => x.classList.remove('sobre')); c.classList.add('sobre'); } };
      c.ondrop = e => {
        e.preventDefault(); if (folga(p, c.dataset.d)) return;
        const id = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || arrasto; if (!id) return;
        if (e.ctrlKey || e.altKey) duplicarPara(id, c.dataset.d, c.dataset.p); else mover(id, c.dataset.d, c.dataset.p);
      };
    });
    const bk = $('#p-backlog', el);
    bk.ondragover = e => { e.preventDefault(); if (sobre !== 'backlog') { sobre = 'backlog'; bk.classList.add('sobre'); } };
    bk.ondragleave = () => { bk.classList.remove('sobre'); };
    bk.ondrop = e => { e.preventDefault(); const id = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || arrasto; if (id) mover(id, '', ''); };
  }

  async function duplicarPara(id, data, colabId) {
    try { await rpc('gestao.atividade.duplicar', { id, data, colaborador_id: colabId }); toast('OS duplicada'); arrasto = null; sobre = null; await carregar(); }
    catch (e) { toast(e.message, true); }
  }

  /* ---------- janela de criar / editar OS ---------- */
  function abrirModal(t, ini) {
    const novo = !t;
    const m = novo
      ? { os: '', descricao: '', equipamento: '', area: '', prioridade: 'Média', colab: (ini && ini.colab) || '', data: (ini && ini.data) || '' }
      : { os: t.os, descricao: t.descricao, equipamento: t.equipamento || '', area: t.area || '', prioridade: t.prioridade || 'Média', colab: t.colaborador_id, data: t.data };
    const semIdx = m.data ? C.semanas.findIndex(s => m.data >= s.inicio && m.data <= s.dias[6]) : -1;
    const w0 = m.data ? (semIdx >= 0 ? String(semIdx) : 'fora') : (novo ? String(semana) : 'backlog');
    const dia0 = m.data ? String(diaIdx(m.data)) : '0';
    const st = t ? (STATUS[t.status] || STATUS.programada) : STATUS.programada;
    const o = modal(`<form id="m-form" novalidate>
      <div class="tt"><h2>${novo ? 'Nova OS' : 'Editar OS'}</h2><button type="button" class="x" id="m-x" aria-label="Fechar">${icone('x')}</button></div>
      <div style="display:flex;flex-direction:column;gap:16px;margin-top:16px">
        <div class="g2f"><label class="fld p">Nº da OS<input class="inp sm mono" id="m-os" placeholder="4001xxxx" value="${esc(m.os)}"></label>
          <label class="fld p">Prioridade<select class="inp sm" id="m-prio">${PRIORIDADES.map(p => `<option ${p === m.prioridade ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>
        <label class="fld p">Descrição da atividade<input class="inp sm" id="m-desc" placeholder="Ex.: Inspeção termográfica" value="${esc(m.descricao)}"></label>
        <div class="g2e"><label class="fld p">Equipamento<input class="inp sm" id="m-equip" placeholder="Ex.: TR-02" value="${esc(m.equipamento)}"></label>
          <label class="fld p">Área / local<input class="inp sm" id="m-area" placeholder="Ex.: SE-02 · Moagem" value="${esc(m.area)}"></label></div>
        <div class="g3">
          <label class="fld p">Colaborador<select class="inp sm" id="m-col" style="padding:0 8px;font-size:14px">${C.colaboradores.map(p => `<option value="${p.id}" ${p.id === m.colab ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
          <label class="fld p">Semana<select class="inp sm" id="m-sem" style="padding:0 8px;font-size:14px">${C.semanas.map((s, i) => `<option value="${i}" ${w0 === String(i) ? 'selected' : ''}>Semana ${s.numero}</option>`).join('')}<option value="backlog" ${w0 === 'backlog' ? 'selected' : ''}>Backlog</option>${w0 === 'fora' ? `<option value="fora" selected>${fmtDataCompleta(m.data)}</option>` : ''}</select></label>
          <label class="fld p">Dia<select class="inp sm" id="m-dia" style="padding:0 8px;font-size:14px"></select></label>
        </div>
        ${novo ? '' : `<div style="font-size:13px;color:#3D4652;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="dot" style="background:${st.cor}"></span>Status atual: <b>${st.label}</b> <span style="color:#5B6470">(definido pelo apontamento do colaborador)</span></div>`}
        <div class="erro" id="m-erro" role="alert" hidden></div>
        <div class="acoes">
          <div>${novo ? '' : `<button type="button" class="btn link" id="m-back">Enviar ao backlog</button><button type="button" class="btn link" id="m-dup">Duplicar</button><button type="button" class="btn link" id="m-del" style="color:#B91C1C">Excluir</button>`}</div>
          <div><button type="button" class="btn" id="m-cancel">Cancelar</button><button type="submit" class="btn pri" id="m-save">${novo ? 'Criar OS' : 'Salvar'}</button></div>
        </div>
      </div></form>`);
    const dias = () => { const i = $('#m-sem', o).value; if (i === 'backlog' || i === 'fora') return []; return C.semanas[Number(i)].dias; };
    const preencherDias = () => {
      const sel = $('#m-dia', o), ds = dias(); sel.disabled = !ds.length;
      sel.innerHTML = ds.length ? ds.map((d, i) => `<option value="${i}" ${String(i) === dia0 ? 'selected' : ''}>${DIAS_LONGOS[i]} ${fmtData(d)}</option>`).join('') : '<option>—</option>';
    };
    preencherDias();
    $('#m-sem', o).onchange = preencherDias;
    const dados = () => {
      const s = $('#m-sem', o).value, ds = dias();
      let data = '';
      if (s === 'fora') data = m.data; else if (s !== 'backlog') data = ds[Number($('#m-dia', o).value)];
      return { os: $('#m-os', o).value.trim(), descricao: $('#m-desc', o).value.trim(), equipamento: $('#m-equip', o).value.trim(), area: $('#m-area', o).value.trim(), prioridade: $('#m-prio', o).value, colaborador_id: $('#m-col', o).value, data };
    };
    const erro = msg => { const e = $('#m-erro', o); e.hidden = !msg; e.innerHTML = msg ? icone('alerta', 's') + esc(msg) : ''; };
    const rodar = async (fn, msg) => { try { await fn(); o.fechar(); toast(msg); await carregar(); } catch (e) { erro(e.message); } };
    $('#m-x', o).onclick = $('#m-cancel', o).onclick = o.fechar;
    $('#m-form', o).onsubmit = ev => {
      ev.preventDefault(); const d = dados();
      if (!d.os || !d.descricao) return erro('Informe o número da OS e a descrição.');
      const p = pessoa(d.colaborador_id);
      if (d.data && folga(p, d.data)) return erro(`${p.nome} está de folga em ${DIAS_LONGOS[diaIdx(d.data)]}.`);
      rodar(() => rpc('gestao.atividade.salvar', novo ? d : { id: t.id, ...d }), novo ? `OS ${d.os} criada` : `OS ${d.os} atualizada`);
    };
    if (!novo) {
      $('#m-back', o).onclick = () => rodar(() => rpc('gestao.atividade.salvar', { id: t.id, data: '' }), `OS ${t.os} enviada ao backlog`);
      $('#m-dup', o).onclick = () => { const d = dados(); rodar(() => rpc('gestao.atividade.duplicar', { id: t.id, ...d }), 'OS duplicada'); };
      $('#m-del', o).onclick = () => { if (confirm('Excluir esta OS da programação?')) rodar(() => rpc('gestao.atividade.excluir', { id: t.id }), 'OS excluída'); };
    }
    $('#m-os', o).focus();
  }

  async function carregar() {
    try { C = await rpc('gestao.calendario'); } catch (e) { return toast(e.message, true); }
    if (semana >= C.semanas.length) semana = 0;
    desenhar();
  }

  function mount() {
    el = Adm.quadro('programacao');
    if (C) desenhar();
    carregar();
  }
  return { mount };
})();
