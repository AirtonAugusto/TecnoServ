'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criarAmbiente } = require('./harness');

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somar = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('login, token e bloqueio', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 'segredo' } });
  assert.strictEqual(env.rpc('gestao.equipes', {}).auth, true);
  assert.strictEqual(env.rpc('auth.login', { senha: 'x' }).ok, false);
  const tok = env.rpc('auth.login', { senha: 'segredo' }).dados.token;
  assert.strictEqual(env.rpc('auth.status', { token: tok }).dados.autenticado, true);
  assert.strictEqual(env.rpc('auth.status', { token: tok + 'a' }).dados.autenticado, false);
  assert.strictEqual(env.rpc('gestao.equipes', { token: tok }).ok, true);
  for (let i = 0; i < 8; i++) env.rpc('auth.login', { senha: 'errada' });
  assert.match(env.rpc('auth.login', { senha: 'segredo' }).erro, /Muitas tentativas/);
});

test('sem GESTAO_SENHA o login avisa', () => {
  const env = criarAmbiente();
  assert.match(env.rpc('auth.login', { senha: 'a' }).erro, /GESTAO_SENHA/);
});

test('fluxo completo: cadastro, programação, apontamento, aderência, fotos', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  const token = env.rpc('auth.login', { senha: 's' }).dados.token;
  const g = (m, a) => env.rpc('gestao.' + m, { ...a, token });

  const eq = g('equipe.salvar', { nome: 'Mec A' }).dados;
  const c = g('colaborador.salvar', { nome: 'Fulano', equipe_id: eq.id }).dados;
  const h = hoje(), ontem = somar(h, -1), amanha = somar(h, 1);
  const a1 = g('atividade.salvar', { os: '1', descricao: 'A', data: h, colaborador_id: c.id }).dados;
  const a2 = g('atividade.salvar', { os: '2', descricao: 'B', data: h, colaborador_id: c.id }).dados;
  const a3 = g('atividade.salvar', { os: '3', descricao: 'C ontem', data: ontem, colaborador_id: c.id }).dados;

  let t = env.rpc('publico.tarefas', { id: c.id }).dados;
  assert.strictEqual(t.atividades.length, 2);
  assert.strictEqual(t.anteriores.length, 1);

  assert.strictEqual(env.rpc('publico.enviar', { colaborador_id: c.id, data: h, itens: [], extras: [{ descricao: 'x' }] }).ok, false);

  const foto = 'data:image/jpeg;base64,/9j/4AAQ';
  const envio = {
    colaborador_id: c.id, data: h, observacao: 'ok',
    itens: [{ atividade_id: a1.id, status: 'concluida' }, { atividade_id: a2.id, status: 'pendente' }, { atividade_id: a3.id, status: 'concluida' }],
    extras: [{ os: '9', descricao: 'Vazamento', classificacao: 'Corretiva' }], fotos: [foto],
  };
  let r = env.rpc('publico.enviar', envio);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  // reenvio substitui e mantém a foto anterior
  envio.fotos = []; envio.itens[1].status = 'iniciada';
  assert.strictEqual(env.rpc('publico.enviar', envio).ok, true);
  assert.strictEqual(env.planilhas.envios.length, 2); // cabeçalho + 1
  assert.strictEqual(env.rpc('publico.tarefas', { id: c.id }).dados.fotos, 1);

  t = env.rpc('publico.tarefas', { id: c.id }).dados;
  assert.strictEqual(t.atividades.find(x => x.id === a2.id).status, 'iniciada');
  assert.strictEqual(t.extras.length, 1);

  const m = g('aderencia', { de: ontem, ate: h }).dados;
  assert.strictEqual(m.geral.planejadas, 3);
  assert.strictEqual(m.geral.concluidas, 2);
  assert.strictEqual(m.geral.iniciadas, 1);
  assert.strictEqual(m.geral.pct_aderencia, 66.7);
  assert.strictEqual(m.geral.apont_sequencia, 1);
  assert.strictEqual(m.geral.extras, 1);
  assert.strictEqual(m.equipes.length, 1);

  const rel = g('relatorios', { data: h }).dados;
  assert.strictEqual(rel[0].enviaram[0].itens.length, 3);
  assert.strictEqual(rel[0].resumo.extras, 1);

  // foto só é servida se registrada em um envio
  const fid = rel[0].enviaram[0].fotos[0];
  assert.match(g('foto', { id: fid }).dados.src, /^data:image\/jpeg;base64,/);
  assert.strictEqual(g('foto', { id: 'qualquer-id-do-drive' }).ok, false);

  // remanejar no calendário reflete na tela do colaborador
  assert.strictEqual(g('atividade.salvar', { id: a2.id, data: amanha }).ok, true);
  assert.strictEqual(env.rpc('publico.tarefas', { id: c.id }).dados.atividades.length, 1);
  const dup = g('atividade.duplicar', { id: a2.id, data: somar(h, 2) });
  assert.strictEqual(dup.ok, true);
  assert.strictEqual(g('atividade.excluir', { id: dup.dados.id }).ok, true);

  const cal = g('calendario', {}).dados;
  assert.strictEqual(cal.semanas.length, 3);
  assert.strictEqual(cal.semanas[1].numero, cal.semanas[0].numero + 1);

  // equipe com colaboradores não pode ser excluída; colaborador é apenas inativado
  assert.strictEqual(g('equipe.excluir', { id: eq.id }).ok, false);
  assert.strictEqual(g('colaborador.inativar', { id: c.id }).ok, true);
  assert.strictEqual(env.rpc('publico.colaboradores', {}).dados.length, 0);
});

test('cache de leitura: evita ler a planilha e é invalidado por gravações', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  const token = env.rpc('auth.login', { senha: 's' }).dados.token;
  const g = (m, a) => env.rpc('gestao.' + m, { ...a, token });
  const eq = g('equipe.salvar', { nome: 'A' }).dados;
  g('colaborador.salvar', { nome: 'Zé', equipe_id: eq.id });

  env.rpc('publico.colaboradores', {}); // aquece o cache
  const antes = env.stats.leituras;
  for (let i = 0; i < 5; i++) assert.strictEqual(env.rpc('publico.colaboradores', {}).dados.length, 1);
  assert.strictEqual(env.stats.leituras, antes, 'leituras repetidas não devem tocar a planilha');

  g('colaborador.salvar', { nome: 'Maria', equipe_id: eq.id });           // gravação invalida
  const lista = env.rpc('publico.colaboradores', {}).dados;
  assert.deepStrictEqual(lista.map(c => c.nome), ['Maria', 'Zé']);
  g('colaborador.inativar', { id: lista[0].id });
  assert.deepStrictEqual(env.rpc('publico.colaboradores', {}).dados.map(c => c.nome), ['Zé']);
});

test('doPost: API JSON para a página hospedada no GitHub Pages', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  const r = env.doPost(JSON.stringify({ metodo: 'auth.login', args: { senha: 's' } }));
  assert.strictEqual(r.ok, true);
  const eq = env.doPost(JSON.stringify({ metodo: 'gestao.equipe.salvar', args: { nome: 'X', token: r.dados.token } }));
  assert.strictEqual(eq.ok, true);
  assert.strictEqual(env.doPost(JSON.stringify({ metodo: 'gestao.equipes', args: {} })).auth, true);
  assert.strictEqual(env.doPost('isto não é json').ok, false);
});

test('chamadas combinadas: publico.inicio, gestao.painel e gestao.cadastros', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  const token = env.rpc('auth.login', { senha: 's' }).dados.token;
  const g = (m, a) => env.rpc('gestao.' + m, { ...a, token });
  const eq = g('equipe.salvar', { nome: 'A' }).dados;
  const c = g('colaborador.salvar', { nome: 'Zé', equipe_id: eq.id }).dados;
  const h = hoje();
  g('atividade.salvar', { os: '1', descricao: 'X', data: h, colaborador_id: c.id });

  const sem = env.rpc('publico.inicio', { id: '' }).dados;
  assert.strictEqual(sem.colaboradores.length, 1); assert.strictEqual(sem.tarefas, null);
  const com = env.rpc('publico.inicio', { id: c.id }).dados;
  assert.strictEqual(com.tarefas.atividades.length, 1);
  assert.strictEqual(env.rpc('publico.inicio', { id: 'id-que-nao-existe' }).dados.tarefas, null);

  const p = g('painel', { de: somar(h, -6), ate: h, equipe_id: '', rdata: h }).dados;
  assert.strictEqual(p.equipes.length, 1); assert.strictEqual(p.aderencia.geral.planejadas, 1); assert.ok(Array.isArray(p.relatorios));
  const cad = g('cadastros', {}).dados;
  assert.strictEqual(cad.equipes.length, 1); assert.strictEqual(cad.colaboradores.length, 1);
  assert.strictEqual(env.rpc('gestao.painel', {}).auth, true, 'painel exige login');
  assert.strictEqual(env.rpc('ping', {}).ok, true);
});
