'use strict';
let equipes = [], colabs = [];

async function carregar() {
  [equipes, colabs] = await Promise.all([api('GET', '/api/gestao/equipes'), api('GET', '/api/gestao/colaboradores')]);
  const opts = '<option value="">Sem equipe</option>' + equipes.map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');
  $('#co-eq').innerHTML = opts;
  $('#te').innerHTML = equipes.map(e => `<tr><td>${esc(e.nome)}</td><td>${colabs.filter(c => c.equipe_id === e.id && c.ativo).length} colaborador(es)</td>
    <td style="text-align:right"><button class="peq" data-ren="${e.id}">Renomear</button> <button class="peq perigo" data-dele="${e.id}">Excluir</button></td></tr>`).join('') || '<tr><td class="mut">Nenhuma equipe.</td></tr>';
  $('#tc').innerHTML = colabs.map(c => `<tr style="${c.ativo ? '' : 'opacity:.5'}"><td>${esc(c.nome)}${c.ativo ? '' : ' (inativo)'}</td>
    <td><select data-eq="${c.id}">${opts.replace(`value="${c.equipe_id}"`, `value="${c.equipe_id}" selected`)}</select></td>
    <td style="text-align:right">${c.ativo ? `<button class="peq perigo" data-inat="${c.id}">Inativar</button>` : `<button class="peq" data-ativ="${c.id}">Reativar</button>`}</td></tr>`).join('') || '<tr><td class="mut">Nenhum colaborador.</td></tr>';
  document.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
    const e = equipes.find(x => x.id === b.dataset.ren), nome = prompt('Novo nome da equipe:', e.nome);
    if (nome) acao(() => api('PUT', `/api/gestao/equipes/${e.id}`, { nome }));
  });
  document.querySelectorAll('[data-dele]').forEach(b => b.onclick = () => confirm('Excluir equipe?') && acao(() => api('DELETE', `/api/gestao/equipes/${b.dataset.dele}`)));
  document.querySelectorAll('[data-eq]').forEach(s => s.onchange = () => { const c = colabs.find(x => x.id === s.dataset.eq); acao(() => api('PUT', `/api/gestao/colaboradores/${c.id}`, { ...c, equipe_id: s.value })); });
  document.querySelectorAll('[data-inat]').forEach(b => b.onclick = () => confirm('Inativar colaborador? O histórico é mantido.') && acao(() => api('DELETE', `/api/gestao/colaboradores/${b.dataset.inat}`)));
  document.querySelectorAll('[data-ativ]').forEach(b => b.onclick = () => { const c = colabs.find(x => x.id === b.dataset.ativ); acao(() => api('PUT', `/api/gestao/colaboradores/${c.id}`, { ...c, ativo: true })); });
}
async function acao(fn) { try { await fn(); await carregar(); } catch (e) { toast(e.message, true); carregar(); } }

iniciarGestao('cadastros.html', () => {
  $('#fe').onsubmit = e => { e.preventDefault(); acao(async () => { await api('POST', '/api/gestao/equipes', { nome: $('#eq-nome').value }); $('#eq-nome').value = ''; }); };
  $('#fc').onsubmit = e => { e.preventDefault(); acao(async () => { await api('POST', '/api/gestao/colaboradores', { nome: $('#co-nome').value, equipe_id: $('#co-eq').value }); $('#co-nome').value = ''; }); };
  carregar();
});
