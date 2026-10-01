'use strict';
/* ===== Estrutura da área PCM / Gestão: barra lateral + conteúdo ===== */
const Adm = (() => {
  const ABAS = [
    ['aderencia', 'Aderência', 'ader'], ['programacao', 'Programação', 'prog'],
    ['relatorios', 'Relatórios', 'rel'], ['cadastros', 'Cadastros', 'pessoas'],
  ];

  // Desenha a estrutura (se ainda não existir) e devolve o elemento onde a página deve ser montada.
  function quadro(aba) {
    const g = Sessao.gestao();
    let el = $('#adm-conteudo');
    if (!el) {
      const u = g.usuario || { nome: 'Gestão', papel: 'PCM' };
      app.innerHTML = `
      <div class="shell">
        <aside class="side">
          <div class="marca">${marcaImg(72)}<div><b>${esc(APP.area)}</b><span>Gestão de manutenção</span></div></div>
          <nav aria-label="Principal">
            <div class="grupo">Campo</div>
            <a class="nav" href="#apontamento">${icone('apont')}Apontamento</a>
            <div class="grupo">PCM / Gestão</div>
            ${ABAS.map(([k, n, ic]) => `<a class="nav" href="#${k}" data-aba="${k}">${icone(ic)}${n}</a>`).join('')}
          </nav>
          <div class="who"><span class="avatar" style="width:34px;height:34px;font-size:13px;background:#E6E8EC;color:#14181F">${esc(iniciais(u.nome))}</span><div class="n"><b>${esc(u.nome)}</b><small>${esc(u.papel || 'PCM')}</small></div><button id="adm-sair" aria-label="Sair">${icone('sair')}</button></div>
          ${assinatura('lateral')}
        </aside>
        <main class="conteudo"><div class="in" id="adm-conteudo"></div></main>
      </div>`;
      $('#adm-sair').onclick = () => { Sessao.sairGestao(); ir('login', 'pcm'); };
      el = $('#adm-conteudo');
    }
    $$('[data-aba]').forEach(a => { if (a.dataset.aba === aba) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    return el;
  }
  const cabecalho = (eyebrow, titulo, direita = '') => `<div class="cab-pag"><div><div class="e">${eyebrow}</div><h1>${titulo}</h1></div>${direita}</div>`;
  return { quadro, cabecalho };
})();
