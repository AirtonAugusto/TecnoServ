'use strict';
/* ===== Acesso por perfil: Colaborador (escolhe o nome) ou PCM / Gestão (só a senha) ===== */
const Login = (() => {
  let perfil = 'campo';
  let nomes = ls.getJSON('pcm_nomes') || null; // lista de colaboradores (guardada para abrir rápido)
  let carregandoNomes = false;
  let PRE = null; // entrada antecipada com o último colaborador deste aparelho

  async function buscarNomes() {
    if (carregandoNomes) return;
    carregandoNomes = true;
    try { nomes = await rpc('publico.colaboradores'); ls.setJSON('pcm_nomes', nomes); }
    catch (e) { if (!nomes) nomes = []; $('#l-erro') && erro(e.message); }
    finally { carregandoNomes = false; }
    if (perfil === 'campo' && $('#l-nome')) preencherNomes();
  }

  // Busca as tarefas assim que o nome é escolhido (ou já na abertura, se o aparelho lembra o nome).
  function adiantar(id) {
    if (!id || (PRE && PRE.id === id)) return;
    PRE = { id, p: buscar('publico.entrar', { id }).catch(() => null) };
  }
  function prefetch() { adiantar(ls.get('pcm_colab_id')); buscarNomes(); }

  function opcoesNomes(sel) {
    if (!nomes) return '<option value="">Carregando nomes…</option>';
    if (!nomes.length) return '<option value="">Nenhum colaborador cadastrado</option>';
    return '<option value="">Selecione seu nome…</option>' + nomes.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}${c.equipe ? ' — ' + esc(c.equipe) : ''}</option>`).join('');
  }
  function preencherNomes() {
    const s = $('#l-nome'); if (!s) return;
    const atual = s.value || ls.get('pcm_colab_id') || '';
    s.innerHTML = opcoesNomes(atual); s.disabled = !nomes || !nomes.length;
    if (nomes && nomes.some(c => c.id === atual)) s.value = atual;
  }

  function html() {
    const turno = ls.get('pcm_turno') || '', idSalvo = ls.get('pcm_colab_id') || '';
    return `
    <div class="split">
      <section class="hero">
        <div class="marca">${marcaImg(150)}<div><div style="font-size:20px;font-weight:600">${esc(APP.nome)}</div><div style="font-size:15px;color:#A7B0BC">${esc(APP.area)} · ${esc(APP.equipes)}</div></div></div>
        <div><h1>${esc(APP.lema)}</h1><p class="lead">${esc(APP.descricao)}</p></div>
        <div class="feat">
          <div style="border-color:#22C55E"><b>Apontamento</b><span>Status, extras e fotos do turno</span></div>
          <div style="border-color:#EAB308"><b>Aderência</b><span>Planejado vs. executado</span></div>
          <div style="border-color:#3B82F6"><b>Programação</b><span>Semanas W, W+1 e W+2</span></div>
        </div>
        ${assinatura('hero-ass')}
      </section>
      <section class="acesso"><div class="in">
        <div><h2>Entrar</h2><p style="font-size:15px;color:#5B6470;margin-top:6px">Escolha seu perfil de acesso.</p></div>
        <div class="seg" role="group" aria-label="Perfil">
          <button type="button" data-perfil="campo" aria-pressed="${perfil === 'campo'}">Colaborador</button>
          <button type="button" data-perfil="pcm" aria-pressed="${perfil === 'pcm'}">PCM / Gestão</button>
        </div>
        ${perfil === 'campo' ? `
        <form class="form reveal" id="f-campo" novalidate>
          <label class="fld">Seu nome<select class="inp" id="l-nome" ${nomes && nomes.length ? '' : 'disabled'}>${opcoesNomes(idSalvo)}</select></label>
          <label class="fld">Turno<select class="inp" id="l-turno"><option value="" ${turno === '' ? 'selected' : ''}>Automático (pelo meu cadastro)</option>${TURNOS.map(t => `<option ${t === turno ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          <div class="erro" id="l-erro" role="alert" hidden></div>
          <button class="btn pri lg" id="l-ok">Entrar no apontamento ${icone('seta')}</button>
          <p class="nota">Acesso simplificado: sem senha. O relatório fica vinculado ao seu nome e ao turno.</p>
        </form>` : `
        <form class="form reveal" id="f-pcm" novalidate>
          <label class="fld">Senha<input class="inp" id="l-senha" type="password" autocomplete="current-password" placeholder="••••••••"></label>
          <div class="erro" id="l-erro" role="alert" hidden></div>
          <button class="btn pri lg" id="l-ok">Entrar como PCM ${icone('seta')}</button>
          <div class="aviso">${icone('cadeado')}<span>Dashboard de aderência e Programação semanal são exclusivos do perfil PCM / Gestão.</span></div>
        </form>`}
      </div></section>
    </div>`;
  }

  function erro(msg) { const e = $('#l-erro'); if (e) { e.hidden = !msg; e.innerHTML = msg ? icone('alerta', 's') + esc(msg) : ''; } }
  function ocupado(sim, rotulo) { const b = $('#l-ok'); if (b) { b.disabled = sim; b.innerHTML = sim ? 'Entrando…' : rotulo; } }

  async function entrarCampo(e) {
    e.preventDefault(); erro('');
    const id = $('#l-nome').value, turno = $('#l-turno').value;
    if (!id) return erro('Escolha o seu nome na lista.');
    const rotulo = `Entrar no apontamento ${icone('seta')}`;
    ocupado(true);
    try {
      ls.set('pcm_colab_id', id); ls.set('pcm_turno', turno);
      const ajustar = r => { if (turno) r.perfil.turno = turno; return r; }; // turno escolhido na tela (senão vale o do cadastro)
      const novo = (PRE && PRE.id === id ? PRE.p : null) || buscar('publico.entrar', { id });
      PRE = null;
      const g = Cache.ler('publico.entrar', { id });
      if (g && g.d.tarefas && g.d.tarefas.data === hojeLocal()) {
        // Abre na hora com o que este aparelho já tem; a versão do servidor chega logo depois
        Sessao.entrarColab(ajustar(g.d)); ir('apontamento');
        Promise.resolve(novo).then(r => { if (r) Op.atualizar(ajustar(r)); }).catch(() => {});
        return;
      }
      const r = await novo;
      if (!r) throw new Error('Não foi possível carregar suas atividades. Tente de novo.');
      Sessao.entrarColab(ajustar(r)); ir('apontamento');
    } catch (err) { ocupado(false, rotulo); erro(err.message); }
  }

  async function entrarPcm(e) {
    e.preventDefault(); erro('');
    const senha = $('#l-senha').value;
    if (!senha) return erro('Informe a senha.');
    const rotulo = `Entrar como PCM ${icone('seta')}`;
    ocupado(true);
    try {
      const r = await rpc('auth.login', { senha, painel: { periodo: 'semana' }, tudo: true }); // já traz painel, programação e cadastros
      Sessao.entrarGestao({ token: r.token, usuario: r.usuario });
      if (r.painel) Cache.gravar('gestao.painel', { periodo: 'semana' }, r.painel);
      if (r.calendario) Cache.gravar('gestao.calendario', {}, r.calendario);
      if (r.cadastros) Cache.gravar('gestao.cadastros', {}, r.cadastros);
      ir('aderencia');
    } catch (err) { ocupado(false, rotulo); erro(err.message); }
  }

  function mount(qual) {
    if (qual) perfil = qual;
    app.innerHTML = html();
    $$('[data-perfil]').forEach(b => b.onclick = () => { perfil = b.dataset.perfil; ls.set('pcm_perfil', perfil); mount(); });
    const fc = $('#f-campo'), fp = $('#f-pcm');
    if (fc) { fc.onsubmit = entrarCampo; $('#l-nome').focus(); $('#l-nome').onchange = e => adiantar(e.target.value); }
    if (fp) { fp.onsubmit = entrarPcm; $('#l-senha').focus(); }
    prefetch();
  }
  return { mount, prefetch, perfilSalvo: () => ls.get('pcm_perfil') || 'campo' };
})();
