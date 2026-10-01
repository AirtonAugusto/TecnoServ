// Teste de interface: abre docs/index.html no Chromium com a API simulada pelo Code.gs (Sheets/Drive simulados).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { criarAmbiente } = require('./harness.js');
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || '/tmp/';

const env = criarAmbiente({ props: { GESTAO_SENHA: 'teste' } });
const somar = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const tok = env.rpc('auth.login', { email: 'airton@empresa.com', senha: 'teste' }).dados.token;
const g = (m, a) => { const r = env.rpc('gestao.' + m, { ...a, token: tok }); if (!r.ok) console.log('SEED ERRO', m, r.erro); return r.dados; };

// ---- dados de exemplo ----
const eqA = g('equipe.salvar', { nome: 'Alta Tensão · AGA' }), eqB = g('equipe.salvar', { nome: 'SM&A' }), eqC = g('equipe.salvar', { nome: 'Cardozo' });
const pessoas = [['Neyberte', '100001', eqA, 'ADM', ''], ['José Nilson', '102345', eqA, 'Turno', 'B'], ['Thiago', '100003', eqB, 'ADM', ''], ['Técnico 4', '100004', eqC, 'Turno', 'C'], ['Técnico 5', '100005', eqC, 'ADM', ''], ['Marcos', '100006', eqA, 'Turno', 'A']]
  .map(([n, m, e, r, l]) => g('colaborador.salvar', { nome: n, matricula: m, equipe_id: e.id, regime: r, letra: l }));
const TAREFAS = [['Inspeção termográfica dos barramentos', 'QGBT-01 · Painel principal', 'Subestação Principal', 'Alta'], ['Medição de resistência de isolamento', 'Transformador TR-02 · 13,8 kV', 'SE-02 · Moagem', 'Média'],
  ['Teste funcional do relé de proteção 50/51', 'Disjuntor DJ-05', 'Subestação Principal', 'Alta'], ['Limpeza e reaperto de conexões', 'CCM-03', 'Planta de beneficiamento', 'Média'], ['Verificação do banco de baterias', 'Retificador RT-02', 'Sala elétrica 2', 'Baixa']];
const seg = (() => { const w = new Date(hoje + 'T00:00:00Z').getUTCDay() || 7; return somar(hoje, 1 - w); })();
let n = 40018700, k = 0;
const ativs = [];
for (let sem = 0; sem < 3; sem++) for (let d = 0; d < 5; d++) {
  const data = somar(seg, sem * 7 + d);
  pessoas.forEach((p, i) => { if ((d + i + sem) % 2 === 0) { const t = TAREFAS[k++ % TAREFAS.length]; ativs.push(g('atividade.salvar', { os: String(n++), descricao: t[0], equipamento: t[1], area: t[2], prioridade: t[3], data, colaborador_id: p.id })); } });
}
[['40017915', 'Substituição de isolador trincado', 'SE-02 · Bay 3', 'Backlog'], ['40018020', 'Revisão do sistema de iluminação', 'Sala elétrica 1', 'Terceiro'], ['40018133', 'Ensaio de rigidez dielétrica', 'TR-03', 'SAP · BPF']]
  .forEach(([os, d, e, o]) => g('atividade.salvar', { os, descricao: d, equipamento: e, origem: o, data: '', colaborador_id: '' }));
// histórico dos 2 dias anteriores (via envio), para o painel ter números
const sts = ['concluida', 'concluida', 'iniciada', 'pendente', 'concluida'];
let s = 0;
for (const p of pessoas) for (const data of [somar(hoje, -1), somar(hoje, -2)]) {
  const minhas = ativs.filter(a => a.colaborador_id === p.id && a.data === data);
  if (!minhas.length) continue;
  const r = env.rpc('publico.enviar', { colaborador_id: p.id, data, turno: 'Turno A', itens: minhas.map(a => { const st = sts[s++ % sts.length]; return st === 'pendente' ? { atividade_id: a.id, status: st, motivo: 'material', justificativa: 'Sem sobressalente' } : { atividade_id: a.id, status: st }; }), extras: [] });
  if (!r.ok) console.log('SEED envio', r.erro);
}

const errs = [];
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.route('**/script.google.com/macros/**', async r => {
  const resp = env.doPost(r.request().postData() || '{}');
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(resp) });
});
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push('CONSOLE ' + m.text()));
p.on('dialog', d => d.accept());
const docs = 'file://' + path.join(dir, '../../docs/index.html');
const log = (...a) => console.log(...a);

// ---------- login (colaborador) ----------
await p.goto(docs); await p.waitForSelector('.split');
await p.screenshot({ path: out + 'N_login.png' });
await p.fill('#l-mat', '999'); await p.click('#l-ok'); await p.waitForSelector('#l-erro:not([hidden])');
log('matrícula inválida:', (await p.textContent('#l-erro')).trim());
await p.fill('#l-mat', '102345'); await p.click('#l-ok'); // turno automático (pelo cadastro: Turno B)
await p.waitForSelector('.ativ');
log('cards:', await p.locator('.ativ').count(), '| header:', (await p.textContent('.topo .quem')).replace(/\s+/g, ' ').trim());

// ---------- apontamento ----------
await p.click('.opt[data-st=pendente] >> nth=0'); // primeira OS como pendente
await p.click('#op-enviar'); await p.waitForTimeout(200);
log('erro ao enviar incompleto:', (await p.textContent('.painel .erro').catch(() => '')).trim(), '| piada:', (await p.textContent('.piada').catch(() => '(nenhuma)')).trim());
const m2 = await p.locator('[data-mot]').count();
await p.selectOption('[data-mot]', 'liberacao'); await p.fill('[data-just]', 'Sem liberação da operação');
// marcar o restante como concluída
const total = await p.locator('.ativ[data-id]').count();
for (let i = 0; i < total; i++) { const c = p.locator('.ativ[data-id]').nth(i); if ((await c.locator('.opt[aria-pressed=true]').count()) === 0) await c.locator('.opt[data-st=concluida]').click(); }
await p.click('#op-extra'); await p.fill('[data-campo=desc]', 'Limpeza extra no painel');
await p.click('#op-enviar'); await p.waitForTimeout(200);
log('extra sem tipo bloqueia:', (await p.textContent('.painel .erro').catch(() => '')).trim());
await p.click('.pick:has-text("BPF")');
await p.setInputFiles('#op-arq', { name: 'f.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(dir, '../../docs/logo.png')) });
await p.waitForSelector('.fotos-g img'); await p.fill('#op-obs', 'Turno tranquilo');
await p.screenshot({ path: out + 'N_apont.png', fullPage: true });
await p.click('#op-enviar'); await p.waitForSelector('.toast-top .t');
log('envio:', (await p.textContent('.toast-top')).replace(/\s+/g, ' ').trim(), '|', (await p.textContent('#op-enviar')).trim());
await p.click('#op-sair'); await p.waitForSelector('.split');

// ---------- ADM ----------
await p.click('[data-perfil=pcm]');
await p.fill('#l-email', 'airton@empresa.com'); await p.fill('#l-senha', 'errada'); await p.click('#l-ok');
await p.waitForSelector('#l-erro:not([hidden])'); log('senha errada:', (await p.textContent('#l-erro')).trim());
await p.fill('#l-senha', 'teste'); await p.click('#l-ok');
await p.waitForSelector('.kpi'); await p.waitForTimeout(300);
log('KPIs:', (await p.locator('.kpi .v').allTextContents()).join(' | '), '| sidebar:', (await p.textContent('.side .who')).replace(/\s+/g, ' ').trim());
await p.screenshot({ path: out + 'N_dash.png', fullPage: true });
await p.click('[data-per=dia]'); await p.waitForTimeout(300);
log('período dia →', (await p.textContent('.cab-pag .e')).trim());
await p.selectOption('#f-eq', eqC.id); log('filtro equipe → pessoas:', await p.locator('.pbar').count());
await p.click('[data-per=semana]'); await p.waitForTimeout(300);

await p.click('.nav[data-aba=programacao]'); await p.waitForSelector('.task');
await p.screenshot({ path: out + 'N_prog.png', fullPage: true });
const antes = await p.locator('#p-backlog .task').count();
const card = p.locator('.celula .task[data-t]').first(); const id = await card.getAttribute('data-t');
await card.dragTo(p.locator('#p-backlog')); await p.waitForTimeout(400);
log('backlog:', antes, '→', await p.locator('#p-backlog .task').count());
await p.locator('#p-backlog .task').first().dragTo(p.locator('.celula:not(.folga)').nth(7)); await p.waitForTimeout(400);
log('backlog depois de programar:', await p.locator('#p-backlog .task').count());
await p.click('#p-nova'); await p.fill('#m-os', '40019999'); await p.fill('#m-desc', 'OS de teste'); await p.fill('#m-equip', 'TR-09'); await p.click('#m-save'); await p.waitForTimeout(400);
log('criou OS:', await p.locator('.task', { hasText: 'OS de teste' }).count());
await p.click('.task[data-t] >> nth=0'); await p.waitForSelector('#m-form'); await p.screenshot({ path: out + 'N_modal.png' }); await p.click('#m-cancel');
// folga arrastada da paleta para um dia livre
const alvo = p.locator('.celula:not(.folga):not(:has(.task))').nth(1);
const folgasAntes = await p.locator('.folga-card[data-fid]').count();
await p.locator('[data-fnova]').dragTo(alvo); await p.waitForTimeout(500);
log('folga marcada:', folgasAntes, '→', await p.locator('.folga-card[data-fid]').count(), '| grupos na grade:', (await p.locator('.grade .grp').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()).join(' / '));
await p.screenshot({ path: out + 'N_prog2.png', fullPage: true });
await p.locator('.folga-card[data-fid] .x').first().click(); await p.waitForTimeout(400);
log('folga removida:', await p.locator('.folga-card[data-fid]').count());
await p.click('.sem >> nth=1'); await p.waitForTimeout(150);
log('semana 2 selecionada:', await p.locator('.sem[aria-selected=true] b').textContent());

await p.click('.nav[data-aba=relatorios]'); await p.waitForSelector('.rel-eq');
log('relatório:', (await p.textContent('#rel-lista')).replace(/\s+/g, ' ').slice(0, 170));
await p.click('[data-fotos]'); await p.waitForSelector('.fotos-rel img'); log('fotos:', await p.locator('.fotos-rel img').count());
await p.screenshot({ path: out + 'N_rel.png', fullPage: true });

await p.click('.nav[data-aba=cadastros]'); await p.waitForSelector('#c-fc');
await p.selectOption('#c-reg', 'ADM'); log('letra escondida p/ ADM:', !(await p.locator('#c-letra').isVisible()));
await p.selectOption('#c-reg', 'Turno'); await p.selectOption('#c-letra', 'B');
await p.fill('#c-nome', 'Novo Colaborador'); await p.fill('#c-mat', '555'); await p.click('#c-fc .btn.pri'); await p.waitForTimeout(500);
log('cadastrou:', await p.locator('tr', { hasText: 'Novo Colaborador' }).count(), '| grupos:', (await p.locator('tr.grp-l').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()).join(' / '));
await p.locator('tr', { hasText: 'Novo Colaborador' }).locator('[data-exc]').click(); await p.waitForTimeout(500);
log('excluiu:', await p.locator('tr', { hasText: 'Novo Colaborador' }).count() === 0);
await p.screenshot({ path: out + 'N_cad.png', fullPage: true });
await p.click('#adm-sair'); await p.waitForSelector('.split');
log('erros:', errs);
await b.close();
