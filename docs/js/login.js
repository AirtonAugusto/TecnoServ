'use strict';
/* ===== Acesso por perfil: Colaborador (matrícula + turno) ou PCM / Gestão (e-mail + senha) ===== */
const Login = (() => {
  let perfil = 'campo';
  let PRE = null; // entrada antecipada com a matrícula lembrada

  // Se a pessoa já entrou antes neste aparelho, busca as tarefas enquanto ela lê a tela.
  function prefetch() {
    const mat = ls.get('pcm_matricula'), turno = ls.get('pcm_turno');
    if (mat && !PRE) PRE = { mat, turno: turno || TURNOS[0], p: rpc('publico.entrar', { matricula: mat, turno: turno || TURNOS[0] }).catch(() => null) };
  }

  function html() {
    const mat = ls.get('pcm_matricula') || '', turno = ls.get('pcm_turno') || TURNOS[0], email = ls.get('pcm_email') || '';
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
          <label class="fld">Matrícula<input class="inp" id="l-mat" inputmode="numeric" autocomplete="off" placeholder="Ex.: 102345" value="${esc(mat)}"></label>
          <label class="fld">Turno<select class="inp" id="l-turno">${TURNOS.map(t => `<option ${t === turno ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          <div class="erro" id="l-erro" role="alert" hidden></div>
          <button class="btn pri lg" id="l-ok">Entrar no apontamento ${icone('seta')}</button>
          <p class="nota">Acesso simplificado: sem senha. O relatório fica vinculado à sua matrícula e ao turno.</p>
        </form>` : `
        <form class="form reveal" id="f-pcm" novalidate>
          <label class="fld">E-mail corporativo<input class="inp" id="l-email" type="email" autocomplete="username" placeholder="nome@empresa.com" value="${esc(email)}"></label>
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
    const mat = $('#l-mat').value.trim(), turno = $('#l-turno').value;
    if (!mat) return erro('Informe a matrícula.');
    const rotulo = `Entrar no apontamento ${icone('seta')}`;
    ocupado(true);
    try {
      let r = null;
      if (PRE && PRE.mat === mat && PRE.turno === turno) r = await PRE.p; // já veio da busca antecipada
      PRE = null;
      if (!r) r = await rpc('publico.entrar', { matricula: mat, turno });
      ls.set('pcm_matricula', mat); ls.set('pcm_turno', turno);
      Sessao.entrarColab({ perfil: r.perfil, tarefas: r.tarefas });
      ir('apontamento');
    } catch (err) { ocupado(false, rotulo); erro(err.message); }
  }

  async function entrarPcm(e) {
    e.preventDefault(); erro('');
    const email = $('#l-email').value.trim(), senha = $('#l-senha').value;
    if (!email || !senha) return erro('Informe o e-mail e a senha.');
    const rotulo = `Entrar como PCM ${icone('seta')}`;
    ocupado(true);
    try {
      const r = await rpc('auth.login', { email, senha });
      ls.set('pcm_email', email);
      Sessao.entrarGestao({ token: r.token, usuario: r.usuario });
      ir('aderencia');
    } catch (err) { ocupado(false, rotulo); erro(err.message); }
  }

  function mount(qual) {
    if (qual) perfil = qual;
    app.innerHTML = html();
    $$('[data-perfil]').forEach(b => b.onclick = () => { perfil = b.dataset.perfil; ls.set('pcm_perfil', perfil); mount(); });
    const fc = $('#f-campo'), fp = $('#f-pcm');
    if (fc) { fc.onsubmit = entrarCampo; $('#l-mat').focus(); }
    if (fp) { fp.onsubmit = entrarPcm; ($('#l-email').value ? $('#l-senha') : $('#l-email')).focus(); }
    prefetch();
  }
  return { mount, prefetch, perfilSalvo: () => ls.get('pcm_perfil') || 'campo' };
})();
