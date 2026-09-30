'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.TZ = 'America/Sao_Paulo';
const { Store } = require('../lib/store');
const JsonAdapter = require('../lib/adapters/json');
const { criarApp } = require('../lib/app');
const D = require('../lib/dates');

let server, base, store, cookie = '';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcm-'));

test.before(async () => {
  store = await new Store(new JsonAdapter(dir)).init();
  fs.mkdirSync(path.join(dir, 'uploads'));
  const app = criarApp({ store, senha: 'segredo', segredo: 'x', uploadsDir: path.join(dir, 'uploads') });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
});
test.after(async () => { server.close(); await store.flush(); });

const api = async (m, p, body, comCookie = true) => {
  const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(comCookie && cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};

test('semana ISO', () => {
  assert.deepStrictEqual(D.semanaISO('2026-09-30'), { ano: 2026, numero: 40 });
  assert.strictEqual(D.semanaISO('2021-01-03').numero, 53);
  assert.strictEqual(D.segunda('2026-09-30'), '2026-09-28');
});

test('gestão exige login', async () => {
  assert.strictEqual((await api('GET', '/api/gestao/calendario', null, false)).status, 401);
  assert.strictEqual((await api('GET', '/api/gestao/aderencia', null, false)).status, 401);
  assert.strictEqual((await api('POST', '/api/auth/login', { senha: 'errada' })).status, 401);
  const r = await api('POST', '/api/auth/login', { senha: 'segredo' });
  assert.strictEqual(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await api('GET', '/api/gestao/calendario')).status, 200);
});

test('fluxo completo: cadastro, programação, apontamento, aderência', async () => {
  const eq = (await api('POST', '/api/gestao/equipes', { nome: 'Mec A' })).body;
  const c = (await api('POST', '/api/gestao/colaboradores', { nome: 'Fulano', equipe_id: eq.id })).body;
  const hoje = D.hoje(), ontem = D.addDays(hoje, -1);
  const a1 = (await api('POST', '/api/gestao/atividades', { os: '1', descricao: 'A', data: hoje, colaborador_id: c.id })).body;
  const a2 = (await api('POST', '/api/gestao/atividades', { os: '2', descricao: 'B', data: hoje, colaborador_id: c.id })).body;
  const a3 = (await api('POST', '/api/gestao/atividades', { os: '3', descricao: 'C (ontem)', data: ontem, colaborador_id: c.id })).body;

  let t = (await api('GET', `/api/colaborador/${c.id}/tarefas`, null, false)).body;
  assert.strictEqual(t.atividades.length, 2);
  assert.strictEqual(t.anteriores.length, 1); // continuidade de ontem

  // azul sem classificação é rejeitado
  let r = await api('POST', '/api/envios', { colaborador_id: c.id, data: hoje, itens: [], extras: [{ descricao: 'x' }] }, false);
  assert.strictEqual(r.status, 400);

  r = await api('POST', '/api/envios', {
    colaborador_id: c.id, data: hoje, observacao: 'ok',
    itens: [{ atividade_id: a1.id, status: 'concluida' }, { atividade_id: a2.id, status: 'pendente' }, { atividade_id: a3.id, status: 'concluida' }],
    extras: [{ os: '9', descricao: 'Vazamento', classificacao: 'Corretiva' }],
    fotos: ['data:image/jpeg;base64,/9j/4AAQ'],
  }, false);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  // reenvio substitui
  r = await api('POST', '/api/envios', { colaborador_id: c.id, data: hoje, itens: [{ atividade_id: a1.id, status: 'concluida' }, { atividade_id: a2.id, status: 'iniciada' }, { atividade_id: a3.id, status: 'concluida' }], extras: [{ os: '9', descricao: 'Vazamento', classificacao: 'Corretiva' }] }, false);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(store.all('envios').length, 1);
  assert.strictEqual(store.all('envios')[0].fotos.length, 1);

  t = (await api('GET', `/api/colaborador/${c.id}/tarefas`, null, false)).body;
  assert.strictEqual(t.atividades.find(x => x.id === a2.id).status, 'iniciada');
  assert.strictEqual(t.extras.length, 1);

  const m = (await api('GET', `/api/gestao/aderencia?de=${ontem}&ate=${hoje}`)).body;
  assert.strictEqual(m.geral.planejadas, 3);
  assert.strictEqual(m.geral.concluidas, 2);
  assert.strictEqual(m.geral.iniciadas, 1);
  assert.strictEqual(m.geral.pct_aderencia, 66.7);
  assert.strictEqual(m.geral.apont_sequencia, 1);
  assert.strictEqual(m.geral.extras, 1);
  assert.strictEqual(m.equipes.length, 1);

  const rel = (await api('GET', `/api/gestao/relatorios?data=${hoje}`)).body;
  assert.strictEqual(rel[0].enviaram[0].itens.length, 3);
  assert.strictEqual(rel[0].resumo.extras, 1);

  // mover atividade no calendário reflete na tela do colaborador
  const amanha = D.addDays(hoje, 1);
  assert.strictEqual((await api('PUT', `/api/gestao/atividades/${a2.id}`, { data: amanha })).status, 200);
  t = (await api('GET', `/api/colaborador/${c.id}/tarefas`, null, false)).body;
  assert.strictEqual(t.atividades.length, 1);

  const cal = (await api('GET', '/api/gestao/calendario')).body;
  assert.strictEqual(cal.semanas.length, 3);
  assert.strictEqual(cal.semanas[1].numero, cal.semanas[0].numero + 1);
});
