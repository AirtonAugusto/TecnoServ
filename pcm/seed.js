'use strict';
// Popula dados de demonstração:  npm run seed   (recusa se já existir cadastro; use --force para sobrescrever)
try { process.loadEnvFile?.(); } catch { /* opcional */ }
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const { criarStore } = require('./server');
const D = require('./lib/dates');

(async () => {
  const { store } = await criarStore();
  if (store.all('colaboradores').length && !process.argv.includes('--force')) {
    console.error('Já existem dados. Use --force para recriar.'); process.exit(1);
  }
  for (const t of Object.keys(store.data)) store.removeWhere(t, () => true);

  const eqA = store.insert('equipes', { nome: 'Mecânica - Turno A' });
  const eqB = store.insert('equipes', { nome: 'Elétrica - Turno A' });
  const nomes = [['Carlos Silva', eqA], ['João Pereira', eqA], ['Marcos Souza', eqA], ['Ana Lima', eqB], ['Rafael Costa', eqB]];
  const colabs = nomes.map(([nome, eq]) => store.insert('colaboradores', { nome, equipe_id: eq.id, ativo: true }));

  const tarefas = ['Lubrificação de mancais', 'Troca de correia do transportador', 'Inspeção de motor elétrico', 'Alinhamento de acoplamento', 'Limpeza de painel', 'Termografia de painel', 'Troca de rolamento', 'Revisão de válvula'];
  const inicio = D.addDays(D.segunda(D.hoje()), -7);
  let n = 1000, k = 0;
  for (let d = 0; d < 28; d++) {
    const data = D.addDays(inicio, d);
    if ([0, 6].includes(D.diaSemana(data))) continue;
    for (const c of colabs) for (let i = 0; i < 2; i++) {
      store.insert('atividades', { os: `OS-${n++}`, descricao: tarefas[k++ % tarefas.length], data, colaborador_id: c.id, criado_em: new Date().toISOString() });
    }
  }
  // Histórico: dias passados com apontamentos variados
  const hoje = D.hoje();
  const sts = ['concluida', 'concluida', 'concluida', 'iniciada', 'pendente'];
  let s = 0;
  for (const a of store.all('atividades').filter(a => a.data < hoje)) {
    const c = store.get('colaboradores', a.colaborador_id);
    store.insert('apontamentos', { atividade_id: a.id, colaborador_id: c.id, equipe_id: c.equipe_id, data: a.data, status: sts[s++ % sts.length], criado_em: a.data + 'T18:00:00.000Z' });
  }
  await store.flush();
  console.log('Dados de demonstração criados.');
})().catch(e => { console.error(e); process.exit(1); });
