'use strict';
/* ===== Apontamento do turno (colaborador) ===== */
const Op = (() => {
  let E = null; // estado da tela
  let seq = 0, toastT2 = null;

  function iniciarEstado(perfil, d) {
    E = { perfil, d, marcas: {}, mot: {}, just: {}, extras: [], fotos: [], fotosEnviadas: d.fotos || 0, obs: d.observacao || '', showErr: false, sent: false, sentAt: '', toast: false, jaEnviado: d.enviado_em || null, arrasto: false };
    [...d.atividades, ...d.anteriores].forEach(a => {
      if (a.status) E.marcas[a.id] = a.status;
      if (a.motivo) E.mot[a.id] = a.motivo;
      if (a.justificativa) E.just[a.id] = a.justificativa;
    });
    E.extras = (d.extras || []).map(x => ({ id: 'x' + (++seq), desc: x.descricao || '', equip: x.equipamento || '', tipo: x.classificacao || '' }));
  }

  const horaDe = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const todos = () => [...E.d.atividades.map(a => ({ ...a, tipoCard: 'prog' })), ...E.extras.map(x => ({ ...x, tipoCard: 'extra' }))];
  const statusDe = c => (c.tipoCard === 'extra' ? 'extra' : E.marcas[c.id]);

  function faltando(c, opcional) {
    const st = statusDe(c);
    if (!st) return !opcional;
    if (c.tipoCard === 'extra') return !c.tipo || !(c.desc || '').trim();
    if (st === 'pendente') return !E.mot[c.id] || !(E.just[c.id] || '').trim();
    return false;
  }

  function cardHtml(c, anterior) {
    const st = statusDe(c), meta = st ? STATUS[st] : null, falta = faltando(c, anterior);
    const borda = E.showErr && falta ? ' erro-c' : (c.tipoCard === 'extra' ? ' nova' : '');
    const rotuloSt = `<span class="stt"><span class="dot" style="width:10px;height:10px;background:${meta ? meta.cor : '#C2C8D0'}"></span>${meta ? meta.label : 'Sem apontamento'}</span>`;
    if (c.tipoCard === 'extra') {
      return `<article class="ativ${borda}" data-x="${c.id}">
        <div class="cab"><div style="display:flex;align-items:center;gap:8px"><span class="os">Sem OS</span><span class="chip">Feita sem programação</span></div>${rotuloSt}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <label class="fld p">O que foi feito? *<input class="inp m" data-campo="desc" value="${esc(c.desc)}" placeholder="Ex.: troca de fusível no CCM-02"></label>
          <label class="fld p">Equipamento / área<input class="inp m" data-campo="equip" value="${esc(c.equip)}" placeholder="Ex.: CCM-02 · Britagem"></label>
        </div>
        <fieldset class="extra-box reveal"><legend>Tipo da atividade extra *</legend>
          <div class="g2">${[['BPF', 'Preventiva / inspeção'], ['Corretiva', 'Falha / reparo']].map(([v, sub]) => `
            <label class="pick ${c.tipo === v ? 'on' : ''}"><input type="radio" name="xt-${c.id}" value="${v}" ${c.tipo === v ? 'checked' : ''}><span><b>${v}</b><small>${sub}</small></span></label>`).join('')}</div>
          ${!c.tipo ? '<div style="font-size:12px;color:#1E40AF">Selecione BPF ou Corretiva para concluir o apontamento.</div>' : ''}
        </fieldset>
        <button type="button" class="btn link" data-rm="${c.id}" style="align-self:flex-start;color:#5B6470;text-decoration:none">${icone('lixo', 's')}Remover atividade extra</button>
      </article>`;
    }
    const opts = ['concluida', 'iniciada', 'pendente'].map(k => {
      const m = STATUS[k], sel = st === k;
      return `<button type="button" class="opt" aria-pressed="${sel}" data-pick="${c.id}" data-st="${k}" style="${sel ? `border-color:${m.cor};background:${m.cor}` : ''}"><span class="dot" style="background:${m.cor}"></span>${m.short}</button>`;
    }).join('');
    const pend = st === 'pendente';
    const semMot = E.showErr && pend && !E.mot[c.id], semJust = E.showErr && pend && !(E.just[c.id] || '').trim();
    return `<article class="ativ${borda}" data-id="${c.id}">
      <div class="cab"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="os">OS ${esc(c.os)}</span><span class="chip">Prioridade ${esc((c.prioridade || 'Média').toLowerCase())}</span>${anterior ? `<span class="chip" style="background:#FEF3C7;color:#92400E">Programada ${fmtData(c.data)}</span>` : ''}</div>${rotuloSt}</div>
      <div style="display:flex;flex-direction:column;gap:6px"><h2>${esc(c.descricao)}</h2>
        ${c.equipamento ? `<div class="meta">${icone('chave', 's')}${esc(c.equipamento)}</div>` : ''}
        ${c.area ? `<div class="meta">${icone('pino', 's')}${esc(c.area)}</div>` : ''}</div>
      <fieldset class="opts"><legend class="sr">Status da OS ${esc(c.os)}</legend>${opts}</fieldset>
      ${pend ? `<div class="motivo reveal">
        <label>Motivo da não execução *<select class="inp m ${semMot ? 'err' : ''}" data-mot="${c.id}"><option value="">Selecione o motivo</option>${Object.entries(MOTIVOS).map(([k, v]) => `<option value="${k}" ${E.mot[c.id] === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <label>Justificativa *<textarea class="inp ${semJust ? 'err' : ''}" rows="3" data-just="${c.id}" placeholder="Descreva o que impediu a execução">${esc(E.just[c.id] || '')}</textarea></label>
        ${(!E.mot[c.id] || !(E.just[c.id] || '').trim()) ? '<div style="font-size:12px;color:#991B1B">Motivo e justificativa são obrigatórios para atividade pendente.</div>' : ''}
      </div>` : ''}
    </article>`;
  }

  function desenhar() {
    const { perfil, d } = E;
    const lista = todos(), contados = [...lista, ...d.anteriores.map(a => ({ ...a, tipoCard: 'prog' }))];
    const feitas = lista.filter(c => !!statusDe(c)).length, total = lista.length;
    const pct = total ? Math.round((feitas / total) * 100) : 0;
    const faltam = lista.filter(c => faltando(c)).length + d.anteriores.filter(a => faltando({ ...a, tipoCard: 'prog' }, true)).length;
    const nFotos = E.fotosEnviadas + E.fotos.length;
    const hojeLbl = d.data === d.hoje ? 'hoje' : fmtDataCompleta(d.data);
    const dataTxt = `${diaSem(d.data)} ${fmtDataCompleta(d.data)} · Semana ${d.semana.numero}`;
    const optsData = [0, 1, 2].map(n => { const v = somarDias(d.hoje, -n); return `<option value="${v}" ${v === d.data ? 'selected' : ''}>${n === 0 ? 'Hoje' : n === 1 ? 'Ontem' : 'Anteontem'} · ${fmtData(v)}</option>`; }).join('');
    const cont = ['concluida', 'iniciada', 'pendente', 'extra'].map(k => `<div><span class="dot" style="background:${STATUS[k].cor}"></span><span>${k === 'iniciada' ? 'Parciais' : STATUS[k].short + 's'}</span><strong>${contados.filter(c => statusDe(c) === k).length}</strong></div>`).join('');

    app.innerHTML = `
    <div class="app-op">
      <header class="topo"><div class="in">
        <div class="marca">${marcaImg(76)}<div><div class="t1">Apontamento do turno</div><div class="t2">${esc(APP.area)} · acesso do colaborador</div></div></div>
        <div class="dir">
          <div class="data">${esc(dataTxt)}</div>
          <div class="quem">${avatar(perfil.nome, perfil.id, 38, 14)}<div><div style="font-weight:600;font-size:15px">${esc(perfil.nome)}</div><div style="font-size:12px;color:#A7B0BC">${esc([perfil.equipe, perfil.turno].filter(Boolean).join(' · '))}</div></div></div>
          <button class="sair" id="op-sair">${icone('sair')}Sair</button>
        </div>
      </div></header>
      <main class="op-main"><div class="wrap">
        <section aria-label="Atividades" style="display:flex;flex-direction:column;gap:16px">
          <div class="sec-t">
            <div><h1>Atividades de ${hojeLbl}</h1><p>Marque o status de cada OS programada. Atividades feitas fora da programação entram como extra.</p></div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <label class="sr" for="op-data">Data do turno</label><select class="inp sm" id="op-data" style="width:auto;min-width:150px">${optsData}</select>
              <button type="button" class="btn-extra" id="op-extra">${icone('mais')}Registrar atividade extra</button>
            </div>
          </div>
          ${E.jaEnviado ? `<div class="aviso" style="border-color:#86EFAC;background:#F0FDF4">${icone('ok')}<span>Este turno já foi enviado às ${horaDe(E.jaEnviado)}. Você pode ajustar e reenviar: o novo envio substitui o anterior.</span></div>` : ''}
          <div class="cards">${lista.length ? lista.map(c => cardHtml(c, false)).join('') : '<p class="nota" style="grid-column:1/-1">Nenhuma atividade programada para este dia. Use “Registrar atividade extra” se fez algo fora da programação.</p>'}</div>
          ${d.anteriores.length ? `<div class="sec-t" style="margin-top:8px"><div><h1 style="font-size:20px">Pendências de dias anteriores</h1><p>Atividades programadas antes que ainda não foram concluídas. Atualize o status se avançou nelas.</p></div></div>
          <div class="cards">${d.anteriores.map(a => cardHtml({ ...a, tipoCard: 'prog' }, true)).join('')}</div>` : ''}
        </section>
        <aside class="side-op">
          <div class="painel">
            <div class="l1"><h2>Resumo do turno</h2><span>${feitas} de ${total} apontadas</span></div>
            <div class="prog"><div style="width:${pct}%"></div></div>
            <div class="cont">${cont}</div>
          </div>
          <section class="painel" id="op-fotos" style="${E.arrasto ? 'border:2px dashed #3B82F6' : ''}">
            <div class="l1"><h2>Fotos do turno</h2><span>${nFotos === 1 ? '1 foto' : nFotos + ' fotos'}</span></div>
            <label class="drop pick">${icone('upload', 'l')}<span><strong style="color:#14181F">Clique para selecionar</strong> ou arraste as fotos aqui</span><span style="font-size:12px;color:#5B6470">JPG ou PNG · várias de uma vez</span><input class="sr" id="op-arq" type="file" accept="image/*" multiple></label>
            ${E.fotos.length ? `<div class="fotos-g">${E.fotos.map(f => `<div class="reveal"><img src="${f.url}" alt="${esc(f.nome)}"><button type="button" aria-label="Remover foto" data-rmf="${f.id}"><span>${icone('x', 's')}</span></button></div>`).join('')}</div>` : ''}
            <label class="fld p">Observações do turno<textarea class="inp" id="op-obs" rows="3" maxlength="2000" placeholder="Ocorrências, pendências para o próximo turno…">${esc(E.obs)}</textarea></label>
          </section>
          <div class="painel" style="padding:16px;gap:8px">
            <div aria-live="polite">${E.showErr && faltam ? `<div class="erro" style="padding-bottom:2px">${icone('alerta', 's')}${faltam === 1 ? '1 atividade sem status completo' : faltam + ' atividades sem status completo'}</div>` : ''}</div>
            <button type="button" class="enviar ${E.sent ? 'ok' : ''}" id="op-enviar">${icone('enviar')}${E.sent ? 'Relatório enviado às ' + E.sentAt : (E.jaEnviado ? 'Reenviar relatório do turno' : 'Enviar relatório do turno')}</button>
          </div>
        </aside>
      </div></main>
      <div class="toast-top" aria-live="polite">${E.toast ? `<div class="t toast-ok"><span class="ic">${icone('ok')}</span><div><b>Relatório de turno enviado com sucesso</b><small>${lista.length} atividades · ${nFotos === 1 ? '1 foto anexada' : nFotos + ' fotos anexadas'}</small></div></div>` : ''}</div>
    </div>`;
    ligar();
  }

  function guardarCampos() {
    const obs = $('#op-obs'); if (obs) E.obs = obs.value;
    $$('[data-x]').forEach(a => { const x = E.extras.find(e => e.id === a.dataset.x); if (!x) return; x.desc = $('[data-campo=desc]', a).value; x.equip = $('[data-campo=equip]', a).value; });
    $$('[data-just]').forEach(t => { E.just[t.dataset.just] = t.value; });
  }
  const mudou = () => { E.sent = false; };

  async function addFotos(arquivos) {
    const imgs = Array.from(arquivos || []).filter(f => f.type && f.type.startsWith('image/'));
    for (const f of imgs) {
      if (E.fotosEnviadas + E.fotos.length >= 8) { toast('Máximo de 8 fotos por turno.', true); break; }
      try { E.fotos.push({ id: ++seq, url: await reduzirFoto(f), nome: f.name }); } catch (e) { toast('Não foi possível ler a foto ' + f.name, true); }
    }
    mudou(); guardarCampos(); desenhar();
  }

  function ligar() {
    $('#op-sair').onclick = () => { Sessao.sairColab(); ir('login', 'campo'); };
    $('#op-extra').onclick = () => { guardarCampos(); E.extras.push({ id: 'x' + (++seq), desc: '', equip: '', tipo: '' }); mudou(); desenhar(); const u = $$('[data-x]').pop(); if (u) $('[data-campo=desc]', u).focus(); };
    $('#op-data').onchange = async e => {
      try { const d = await rpc('publico.tarefas', { id: E.perfil.id, data: e.target.value }); iniciarEstado(E.perfil, d); desenhar(); } catch (err) { toast(err.message, true); desenhar(); }
    };
    $$('[data-pick]').forEach(b => b.onclick = () => { guardarCampos(); const id = b.dataset.pick, st = b.dataset.st; if (E.marcas[id] === st) delete E.marcas[id]; else E.marcas[id] = st; mudou(); desenhar(); });
    $$('[data-mot]').forEach(s => s.onchange = () => { guardarCampos(); E.mot[s.dataset.mot] = s.value; mudou(); desenhar(); });
    $$('[data-just]').forEach(t => t.oninput = () => { E.just[t.dataset.just] = t.value; mudou(); });
    $$('[data-x]').forEach(a => {
      const x = E.extras.find(e => e.id === a.dataset.x);
      $$('[data-campo]', a).forEach(i => i.oninput = () => { x[i.dataset.campo] = i.value; mudou(); });
      $$('input[type=radio]', a).forEach(r => r.onchange = () => { guardarCampos(); x.tipo = r.value; mudou(); desenhar(); });
    });
    $$('[data-rm]').forEach(b => b.onclick = () => { guardarCampos(); E.extras = E.extras.filter(x => x.id !== b.dataset.rm); mudou(); desenhar(); });
    $$('[data-rmf]').forEach(b => b.onclick = () => { guardarCampos(); E.fotos = E.fotos.filter(f => String(f.id) !== b.dataset.rmf); mudou(); desenhar(); });
    $('#op-obs').oninput = e => { E.obs = e.target.value; mudou(); };
    $('#op-arq').onchange = e => { guardarCampos(); addFotos(e.target.files); e.target.value = ''; };
    const box = $('#op-fotos');
    box.ondragover = e => { e.preventDefault(); if (!E.arrasto) { E.arrasto = true; box.style.border = '2px dashed #3B82F6'; } };
    box.ondragleave = () => { E.arrasto = false; box.style.border = ''; };
    box.ondrop = e => { e.preventDefault(); E.arrasto = false; guardarCampos(); addFotos(e.dataTransfer && e.dataTransfer.files); };
    $('#op-enviar').onclick = enviar;
  }

  async function enviar() {
    guardarCampos();
    const lista = todos();
    const incompleto = lista.some(c => faltando(c)) || E.d.anteriores.some(a => faltando({ ...a, tipoCard: 'prog' }, true));
    if (incompleto) {
      E.showErr = true; desenhar();
      const p = $('.erro-c'); if (p) p.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    E.showErr = false;
    const itens = [...E.d.atividades, ...E.d.anteriores].filter(a => E.marcas[a.id]).map(a => ({ atividade_id: a.id, status: E.marcas[a.id], motivo: E.mot[a.id] || '', justificativa: (E.just[a.id] || '').trim() }));
    const btn = $('#op-enviar'); btn.disabled = true; btn.lastChild.textContent = 'Enviando…';
    try {
      await rpc('publico.enviar', {
        colaborador_id: E.perfil.id, turno: E.perfil.turno, data: E.d.data, observacao: E.obs, itens,
        extras: E.extras.map(x => ({ descricao: x.desc.trim(), equipamento: x.equip.trim(), classificacao: x.tipo })),
        fotos: E.fotos.map(f => f.url),
      });
      E.fotosEnviadas += E.fotos.length; E.fotos = [];
      E.sent = true; E.sentAt = horaDe(new Date().toISOString()); E.toast = true; E.jaEnviado = new Date().toISOString();
      desenhar(); window.scrollTo({ top: 0, behavior: 'smooth' });
      clearTimeout(toastT2); toastT2 = setTimeout(() => { E.toast = false; const t = $('.toast-top'); if (t) t.innerHTML = ''; }, 3800);
    } catch (e) { toast(e.message, true); desenhar(); }
  }

  function mount() {
    const s = Sessao.colab();
    iniciarEstado(s.perfil, s.tarefas);
    desenhar();
  }
  return { mount };
})();
