'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criarAmbiente } = require('./harness');

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somar = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = s => new Date(s + 'T00:00:00Z').getUTCDay();

function gestao(props = {}) {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's', ...props } });
  const login = env.rpc('auth.login', { senha: 's' });
  const token = login.dados && login.dados.token;
  const g = (m, a) => env.rpc('gestao.' + m, { ...a, token });
  return { env, token, g, login };
}

test('login da gestão: só a senha, sessão e bloqueio', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  assert.strictEqual(env.rpc('gestao.cadastros', {}).auth, true);
  assert.match(env.rpc('auth.login', { senha: 'errada' }).erro, /incorreta/);
  assert.match(env.rpc('auth.login', {}).erro, /incorreta/);
  const ok = env.rpc('auth.login', { senha: 's' });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.dados.usuario.nome, 'PCM');
  assert.strictEqual(env.rpc('auth.status', { token: ok.dados.token }).dados.autenticado, true);
  assert.strictEqual(env.rpc('auth.status', { token: ok.dados.token + 'a' }).dados.autenticado, false);
  assert.strictEqual(env.rpc('gestao.cadastros', { token: ok.dados.token }).ok, true);
  for (let i = 0; i < 8; i++) env.rpc('auth.login', { senha: 'errada' });
  assert.match(env.rpc('auth.login', { senha: 's' }).erro, /Muitas tentativas/);
});

test('sem GESTAO_SENHA o login avisa', () => {
  assert.match(criarAmbiente().rpc('auth.login', { senha: 'a' }).erro, /GESTAO_SENHA/);
});

test('fluxo completo: cadastro, programação, entrada por matrícula, apontamento, aderência, fotos', () => {
  const { env, g } = gestao();
  const eq = g('equipe.salvar', { nome: 'AGA' }).dados;
  const c = g('colaborador.salvar', { nome: 'José Nilson', equipe_id: eq.id, matricula: '0102345', regime: 'Turno', letra: 'B' }).dados;
  assert.match(g('colaborador.salvar', { nome: 'Outro', equipe_id: eq.id, matricula: '102345', letra: 'B' }).erro, /mesma matrícula|já existe/i);
  assert.strictEqual(g('colaborador.salvar', { nome: 'Sem Mat', equipe_id: eq.id, letra: 'B' }).ok, true, 'matrícula é opcional');

  const h = hoje(), ontem = somar(h, -1), amanha = somar(h, 1);
  const base = { colaborador_id: c.id, prioridade: 'Alta', equipamento: 'TR-02', area: 'SE-02' };
  const a1 = g('atividade.salvar', { ...base, os: '1', descricao: 'A', data: h }).dados;
  const a2 = g('atividade.salvar', { ...base, os: '2', descricao: 'B', data: h }).dados;
  const a3 = g('atividade.salvar', { ...base, os: '3', descricao: 'C (ontem)', data: ontem }).dados;

  // entrada: matrícula (com ou sem zeros à esquerda) + turno
  assert.match(env.rpc('publico.entrar', { id: 'inexistente', turno: 'Turno B' }).erro, /Escolha o seu nome/);
  const auto = env.rpc('publico.entrar', { id: c.id });
  assert.strictEqual(auto.dados.perfil.turno, 'Turno B', 'sem turno informado usa a letra do cadastro');
  const ent = env.rpc('publico.entrar', { id: c.id, turno: 'Turno B' });
  assert.strictEqual(ent.ok, true, JSON.stringify(ent));
  assert.strictEqual(ent.dados.perfil.turno, 'Turno B');
  assert.strictEqual(ent.dados.tarefas.atividades.length, 2);
  assert.strictEqual(ent.dados.tarefas.atividades[0].prioridade, 'Alta');
  assert.strictEqual(ent.dados.tarefas.anteriores.length, 1);
  assert.ok(ent.dados.tarefas.semana.numero >= 1);

  const itens = (b, extra) => ({ colaborador_id: c.id, data: h, turno: 'Turno B', observacao: 'ok', ...extra, itens: b });
  // pendente exige motivo e justificativa; extra exige tipo
  assert.match(env.rpc('publico.enviar', itens([{ atividade_id: a1.id, status: 'pendente' }])).erro, /motivo/i);
  assert.match(env.rpc('publico.enviar', itens([{ atividade_id: a1.id, status: 'pendente', motivo: 'material' }])).erro, /justificativa/i);
  assert.match(env.rpc('publico.enviar', itens([], { extras: [{ descricao: 'x' }] })).erro, /BPF ou Corretiva/);

  const envio = itens([
    { atividade_id: a1.id, status: 'concluida' },
    { atividade_id: a2.id, status: 'pendente', motivo: 'material', justificativa: 'Sem fusível' },
    { atividade_id: a3.id, status: 'concluida' },
  ], { extras: [{ descricao: 'Vazamento', equipamento: 'CCM-02', classificacao: 'Corretiva' }], fotos: ['data:image/jpeg;base64,/9j/4AAQ'] });
  assert.strictEqual(env.rpc('publico.enviar', envio).ok, true);
  // reenvio substitui e mantém a foto
  envio.fotos = []; envio.itens[1] = { atividade_id: a2.id, status: 'iniciada' };
  assert.strictEqual(env.rpc('publico.enviar', envio).ok, true);
  assert.strictEqual(env.planilhas.envios.length, 2);
  const t = env.rpc('publico.tarefas', { id: c.id }).dados;
  assert.strictEqual(t.fotos, 1);
  assert.strictEqual(t.atividades.find(x => x.id === a2.id).status, 'iniciada');
  assert.deepStrictEqual(t.extras[0], { descricao: 'Vazamento', equipamento: 'CCM-02', classificacao: 'Corretiva' });

  const m = g('painel', { periodo: 'semana', ref: h }).dados.aderencia;
  const esperadoProgramadas = [h, ontem].filter(d => d >= m.de && d <= m.ate).length * 0 + [a1, a2, a3].filter(a => a.data >= m.de && a.data <= m.ate).length;
  assert.strictEqual(m.geral.programadas, esperadoProgramadas);
  const dia = g('painel', { periodo: 'dia', ref: h }).dados.aderencia;
  assert.strictEqual(dia.geral.programadas, 2);
  assert.strictEqual(dia.geral.concluidas, 1);
  assert.strictEqual(dia.geral.iniciadas, 1);
  assert.strictEqual(dia.geral.no_prazo, 1);
  assert.strictEqual(dia.geral.pct_aderencia, 50);
  assert.strictEqual(dia.geral.extras, 1);
  assert.strictEqual(dia.geral.extras_corretiva, 1);
  assert.strictEqual(dia.meta, 85);
  assert.strictEqual(dia.equipes.length, 1);
  assert.strictEqual(dia.colaboradores[0].nome, 'José Nilson');

  // pendente com motivo aparece em "motivos de não execução"
  envio.itens[1] = { atividade_id: a2.id, status: 'pendente', motivo: 'liberacao', justificativa: 'Sem liberação' };
  assert.strictEqual(env.rpc('publico.enviar', envio).ok, true);
  const dia2 = g('painel', { periodo: 'dia', ref: h }).dados.aderencia;
  assert.strictEqual(dia2.geral.pendentes, 1);
  assert.strictEqual(dia2.motivos.find(x => x.codigo === 'liberacao').total, 1);
  assert.strictEqual(g('painel', { periodo: 'dia', ref: h, colaborador_id: 'outro' }).dados.aderencia.geral.programadas, 0);

  const rel = g('relatorios', { data: h }).dados;
  const itRel = rel[0].enviaram[0].itens.find(i => i.status === 'pendente');
  assert.strictEqual(itRel.motivo, 'Equipamento sem liberação da operação');
  assert.strictEqual(itRel.justificativa, 'Sem liberação');
  assert.strictEqual(rel[0].enviaram[0].turno, 'Turno B');
  assert.strictEqual(rel[0].resumo.extras, 1);

  const fid = rel[0].enviaram[0].fotos[0];
  assert.match(g('foto', { id: fid }).dados.src, /^data:image\/jpeg;base64,/);
  assert.strictEqual(g('foto', { id: 'qualquer-id-do-drive' }).ok, false);

  // calendário: semanas, extras do colaborador e backlog; remanejar reflete na tela do colaborador
  const cal = g('calendario', {}).dados;
  assert.strictEqual(cal.semanas.length, 3);
  assert.strictEqual(cal.semanas[1].numero, cal.semanas[0].numero + 1);
  assert.strictEqual(cal.extras.length, 1);
  assert.strictEqual(g('atividade.salvar', { id: a2.id, data: amanha }).ok, true);
  assert.strictEqual(env.rpc('publico.tarefas', { id: c.id }).dados.atividades.length, 1);
  assert.strictEqual(g('atividade.salvar', { id: a2.id, data: '' }).ok, true); // vai para o backlog
  assert.strictEqual(g('calendario', {}).dados.backlog.length, 1);
  const dup = g('atividade.duplicar', { id: a2.id, data: somar(h, 2) });
  assert.strictEqual(dup.ok, true);
  assert.strictEqual(g('atividade.excluir', { id: dup.dados.id }).ok, true);

  assert.strictEqual(g('equipe.excluir', { id: eq.id }).ok, false);
  assert.strictEqual(g('colaborador.inativar', { id: c.id }).ok, true);
  assert.match(env.rpc('publico.entrar', { id: c.id, turno: 'Turno B' }).erro, /Escolha o seu nome/);
});

test('folga: colaborador do regime ADM não recebe atividade no fim de semana', () => {
  const { g } = gestao();
  const eq = g('equipe.salvar', { nome: 'A' }).dados;
  const adm = g('colaborador.salvar', { nome: 'Ana ADM', equipe_id: eq.id, regime: 'ADM' }).dados;
  const turno = g('colaborador.salvar', { nome: 'Bia Turno', equipe_id: eq.id, regime: 'Turno', letra: 'C' }).dados;
  let sab = hoje(); while (dow(sab) !== 6) sab = somar(sab, 1);
  assert.match(g('atividade.salvar', { os: '1', descricao: 'X', data: sab, colaborador_id: adm.id }).erro, /folga/);
  assert.strictEqual(g('atividade.salvar', { os: '1', descricao: 'X', data: sab, colaborador_id: turno.id }).ok, true);
  assert.strictEqual(g('atividade.salvar', { os: '2', descricao: 'Y', data: '', colaborador_id: adm.id }).ok, true);
});

test('cache de leitura: evita ler a planilha e é invalidado por gravações', () => {
  const { env, g } = gestao();
  const eq = g('equipe.salvar', { nome: 'A' }).dados;
  const ze = g('colaborador.salvar', { nome: 'Zé', equipe_id: eq.id, letra: 'B' }).dados;
  env.rpc('publico.entrar', { id: ze.id }); // aquece o cache
  const antes = env.stats.leituras;
  for (let i = 0; i < 5; i++) assert.strictEqual(env.rpc('publico.entrar', { id: ze.id }).ok, true);
  assert.strictEqual(env.stats.leituras, antes, 'leituras repetidas não devem tocar a planilha');
  const maria = g('colaborador.salvar', { nome: 'Maria', equipe_id: eq.id, letra: 'B' }).dados;
  assert.strictEqual(env.rpc('publico.entrar', { id: maria.id }).dados.perfil.nome, 'Maria');
  const lista = g('cadastros', {}).dados.colaboradores;
  g('colaborador.inativar', { id: lista.find(c => c.nome === 'Maria').id });
  assert.strictEqual(env.rpc('publico.entrar', { id: maria.id }).ok, false);
});

test('doPost: API JSON do site', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  const r = env.doPost(JSON.stringify({ metodo: 'auth.login', args: { senha: 's' } }));
  assert.strictEqual(r.ok, true);
  const eq = env.doPost(JSON.stringify({ metodo: 'gestao.equipe.salvar', args: { nome: 'X', token: r.dados.token } }));
  assert.strictEqual(eq.ok, true);
  assert.strictEqual(env.doPost(JSON.stringify({ metodo: 'gestao.cadastros', args: {} })).auth, true);
  assert.strictEqual(env.doPost('isto não é json').ok, false);
  assert.strictEqual(env.doPost(JSON.stringify({ metodo: 'ping' })).ok, true);
});

test('migração: abas antigas ganham as colunas novas sem perder dados', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  // aba "colaboradores" no formato antigo (sem matricula/regime) com um registro
  env.planilhas.colaboradores = [['id', 'nome', 'equipe_id', 'ativo'], ['c1', 'Antigo', '', true]];
  env.planilhas.equipes = [['id', 'nome']];
  const tok = env.rpc('auth.login', { senha: 's' }).dados.token;
  const lista = env.rpc('gestao.cadastros', { token: tok }).dados.colaboradores;
  assert.strictEqual(lista[0].nome, 'Antigo');
  assert.strictEqual(lista[0].matricula, '');
  assert.deepStrictEqual(env.planilhas.colaboradores[0], ['id', 'nome', 'equipe_id', 'ativo', 'matricula', 'regime', 'letra']);
  // salvar preenche as colunas novas na posição certa
  const r = env.rpc('gestao.colaborador.salvar', { id: 'c1', nome: 'Antigo', matricula: '77', regime: 'ADM', letra: 'B', token: tok });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(env.planilhas.colaboradores[1], ['c1', 'Antigo', '', true, '77', 'ADM', '']); // ADM não tem letra
  const novo = env.rpc('gestao.colaborador.salvar', { nome: 'Novo', matricula: '78', letra: 'C', token: tok });
  assert.strictEqual(novo.ok, true);
  assert.strictEqual(env.planilhas.colaboradores[2][4], '78');
  assert.strictEqual(env.rpc('publico.entrar', { matricula: '77' }).dados.perfil.regime, 'ADM');
});

test('letras: turno exige B ou C, ADM não tem letra; turno automático pelo cadastro', () => {
  const { env, g } = gestao();
  assert.match(g('colaborador.salvar', { nome: 'X', regime: 'Turno' }).erro, /letra/i);
  assert.match(g('colaborador.salvar', { nome: 'X', regime: 'Turno', letra: 'A' }).erro, /letra/i);
  const adm = g('colaborador.salvar', { nome: 'Adm', regime: 'ADM', letra: 'B' }).dados;
  assert.strictEqual(adm.letra, '');
  const c = g('colaborador.salvar', { nome: 'Turnista', regime: 'Turno', letra: 'c' }).dados;
  assert.strictEqual(c.letra, 'C');
  assert.strictEqual(env.rpc('publico.entrar', { id: c.id }).dados.perfil.turno, 'Turno C');
  assert.strictEqual(env.rpc('publico.entrar', { id: adm.id }).dados.perfil.turno, 'Administrativo');
  assert.strictEqual(env.rpc('publico.entrar', { id: c.id, turno: 'Turno B' }).dados.perfil.turno, 'Turno B', 'pode cobrir outro turno');
  const ad = g('aderencia', {}).dados || g('painel', { periodo: 'dia' }).dados.aderencia;
  const linha = g('painel', { periodo: 'dia' }).dados.aderencia.colaboradores.find(x => x.nome === 'Turnista');
  assert.strictEqual(linha.letra, 'C'); assert.strictEqual(linha.regime, 'Turno');
});

test('excluir colaborador: OS futuras vão ao backlog e o histórico é mantido', () => {
  const { env, g } = gestao();
  const eq = g('equipe.salvar', { nome: 'A' }).dados;
  const c = g('colaborador.salvar', { nome: 'Sai', equipe_id: eq.id, letra: 'B' }).dados;
  const h = hoje(), ontem = somar(h, -1), amanha = somar(h, 1);
  const passada = g('atividade.salvar', { os: '1', descricao: 'passada', data: ontem, colaborador_id: c.id }).dados;
  const futura = g('atividade.salvar', { os: '2', descricao: 'futura', data: amanha, colaborador_id: c.id }).dados;
  g('folga.salvar', { colaborador_id: c.id, data: somar(h, 3) });
  assert.strictEqual(g('colaborador.excluir', { id: c.id }).ok, true);
  assert.match(env.rpc('publico.entrar', { id: c.id }).erro, /Escolha o seu nome/);
  assert.strictEqual(g('cadastros', {}).dados.colaboradores.length, 0);
  const cal = g('calendario', {}).dados;
  assert.deepStrictEqual(cal.backlog.map(x => x.id), [futura.id]);
  assert.strictEqual(cal.folgas.length, 0, 'folgas do excluído somem');
  assert.strictEqual(g('colaborador.excluir', { id: c.id }).ok, false);
  assert.ok(passada.id);
});

test('folga arrastada para a programação: criar, mover, bloquear conflito e excluir', () => {
  const { env, g } = gestao();
  const eq = g('equipe.salvar', { nome: 'A' }).dados;
  const c = g('colaborador.salvar', { nome: 'Turnista', equipe_id: eq.id, letra: 'B' }).dados;
  const adm = g('colaborador.salvar', { nome: 'Adm', equipe_id: eq.id, regime: 'ADM' }).dados;
  const h = hoje(), d1 = somar(h, 1), d2 = somar(h, 2);
  const f = g('folga.salvar', { colaborador_id: c.id, data: d1 });
  assert.strictEqual(f.ok, true, JSON.stringify(f));
  assert.strictEqual(g('calendario', {}).dados.folgas.length, 1);
  // não vira tarefa do colaborador nem entra na aderência / backlog
  assert.strictEqual(g('calendario', {}).dados.backlog.length, 0);
  assert.strictEqual(g('calendario', {}).dados.atividades.length, 0);
  // no dia da folga não cabe OS; em outro dia cabe
  assert.match(g('atividade.salvar', { os: '1', descricao: 'X', data: d1, colaborador_id: c.id }).erro, /folga/);
  const os = g('atividade.salvar', { os: '1', descricao: 'X', data: d2, colaborador_id: c.id }).dados;
  // não dá para marcar folga em dia com OS, nem repetir folga
  assert.match(g('folga.salvar', { colaborador_id: c.id, data: d2 }).erro, /OS programada/);
  assert.match(g('folga.salvar', { colaborador_id: c.id, data: d1 }).erro, /já está de folga/);
  // mover a folga
  const mov = g('folga.salvar', { id: f.dados.id, colaborador_id: c.id, data: somar(h, 4) });
  assert.strictEqual(mov.ok, true);
  assert.strictEqual(g('calendario', {}).dados.folgas[0].data, somar(h, 4));
  // folga não pode ser editada como OS e ADM não precisa de folga no fim de semana
  assert.strictEqual(g('atividade.salvar', { id: f.dados.id, descricao: 'x', data: d2 }).ok, false);
  let sab = h; while (new Date(sab + 'T00:00:00Z').getUTCDay() !== 6) sab = somar(sab, 1);
  assert.match(g('folga.salvar', { colaborador_id: adm.id, data: sab }).erro, /já tem folga/);
  // excluir
  assert.strictEqual(g('folga.excluir', { id: f.dados.id }).ok, true);
  assert.strictEqual(g('calendario', {}).dados.folgas.length, 0);
  assert.ok(os.id);
  assert.strictEqual(env.rpc('publico.entrar', { id: c.id }).dados.tarefas.atividades.length, 0);
});

test('sem matrícula: lista de nomes pública, entrada pelo nome e matrícula opcional', () => {
  const { env, g } = gestao();
  assert.deepStrictEqual(env.rpc('publico.colaboradores', {}).dados, []);
  const eq = g('equipe.salvar', { nome: 'AGA' }).dados;
  const bia = g('colaborador.salvar', { nome: 'Bia', equipe_id: eq.id, letra: 'C' });
  assert.strictEqual(bia.ok, true, JSON.stringify(bia));
  const ana = g('colaborador.salvar', { nome: 'Ana', equipe_id: eq.id, regime: 'ADM' }).dados;
  g('colaborador.salvar', { nome: 'Inativa', equipe_id: eq.id, letra: 'B' });
  const lista = env.rpc('publico.colaboradores', {}).dados;
  assert.deepStrictEqual(lista.map(x => x.nome), ['Ana', 'Bia', 'Inativa']);
  assert.deepStrictEqual(lista.find(x => x.nome === 'Bia'), { id: bia.dados.id, nome: 'Bia', equipe: 'AGA', turno: 'Turno C' });
  assert.strictEqual(lista.find(x => x.nome === 'Ana').turno, 'Administrativo');
  g('colaborador.inativar', { id: lista.find(x => x.nome === 'Inativa').id });
  assert.deepStrictEqual(env.rpc('publico.colaboradores', {}).dados.map(x => x.nome), ['Ana', 'Bia']);
  assert.strictEqual(env.rpc('publico.entrar', { id: ana.id }).ok, true);
  // matrícula é opcional: editar sem enviar o campo não apaga a que já existe
  const c = g('colaborador.salvar', { nome: 'Com Mat', equipe_id: eq.id, letra: 'B', matricula: '77' }).dados;
  g('colaborador.salvar', { id: c.id, nome: 'Com Mat 2', equipe_id: eq.id, letra: 'B' });
  assert.strictEqual(g('cadastros', {}).dados.colaboradores.find(x => x.id === c.id).matricula, '77');
  assert.strictEqual(env.rpc('publico.entrar', { matricula: '77' }).dados.perfil.nome, 'Com Mat 2', 'entrada por matrícula continua disponível se for usada');
});

test('desempenho: login já traz o painel e leitura do cache em lote', () => {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 's' } });
  const tok = env.rpc('auth.login', { senha: 's' }).dados.token;
  const g = (m, a) => env.rpc('gestao.' + m, { ...a, token: tok }).dados;
  const eq = g('equipe.salvar', { nome: 'A' });
  const c = g('colaborador.salvar', { nome: 'Zé', equipe_id: eq.id, letra: 'B' });
  g('atividade.salvar', { os: '1', descricao: 'X', data: hoje(), colaborador_id: c.id });

  const login = env.rpc('auth.login', { senha: 's', painel: { periodo: 'dia' } }).dados;
  assert.ok(login.token);
  assert.strictEqual(login.painel.aderencia.geral.programadas, 1);
  assert.strictEqual(login.painel.equipes.length, 1);
  const tudo = env.rpc('auth.login', { senha: 's', painel: { periodo: 'semana' }, tudo: true }).dados;
  assert.strictEqual(tudo.calendario.semanas.length, 3);
  assert.strictEqual(tudo.cadastros.colaboradores.length, 1);

  env.rpc('publico.entrar', { id: c.id }); // aquece o cache de todas as tabelas
  const l0 = env.stats.leituras, c0 = env.stats.cache;
  assert.strictEqual(env.rpc('publico.entrar', { id: c.id }).ok, true);
  assert.strictEqual(env.stats.leituras, l0, 'não lê a planilha');
  assert.ok(env.stats.cache - c0 <= 3, `idas ao cache numa entrada: ${env.stats.cache - c0} (esperado ≤ 3)`);
});
