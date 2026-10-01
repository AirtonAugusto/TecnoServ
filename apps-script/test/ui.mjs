// Teste de interface: abre Pagina.html no Chromium com um shim de google.script.run ligado ao Code.gs (mocks).
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
const tok = env.rpc('auth.login', { senha: 'teste' }).dados.token;
const g = (m, a) => env.rpc('gestao.' + m, { ...a, token: tok }).dados;
const eqA = g('equipe.salvar', { nome: 'Mecânica - Turno A' }), eqB = g('equipe.salvar', { nome: 'Elétrica - Turno A' });
const cs = [['Carlos Silva', eqA], ['João Pereira', eqA], ['Ana Lima', eqB]].map(([n, e]) => g('colaborador.salvar', { nome: n, equipe_id: e.id }));
const tarefas = ['Lubrificação de mancais', 'Troca de correia', 'Inspeção de motor', 'Termografia de painel'];
const seg = (() => { const d = new Date(hoje + 'T00:00:00Z'); const w = d.getUTCDay() || 7; return somar(hoje, 1 - w); })();
let k = 0, n = 100;
for (let i = 0; i < 10; i++) { const data = somar(somar(seg, -7), i); if ([0, 6].includes(new Date(data + 'T00:00:00Z').getUTCDay())) continue;
  for (const c of cs) for (let j = 0; j < 2; j++) g('atividade.salvar', { os: 'OS-' + n++, descricao: tarefas[k++ % 4], data, colaborador_id: c.id }); }
const sts = ['concluida', 'concluida', 'iniciada', 'pendente', 'concluida'];
let s = 0;
for (const c of cs) for (let d = 1; d <= 6; d++) { const data = somar(hoje, -d);
  const ats = env.rpc('publico.tarefas', { id: c.id, data: hoje }).dados; // só para validar acesso
  const itens = env.ctx && []; }
// apontamentos de dias passados: via planilha diretamente (publico.enviar só aceita hoje-2)
for (const c of cs) for (const data of [somar(hoje, -1), somar(hoje, -2)]) {
  const ats = JSON.parse(JSON.stringify(env.ctx.todos_('atividades'))).filter(a => a.colaborador_id === c.id && a.data === data);
  const r = env.rpc('publico.enviar', { colaborador_id: c.id, data, observacao: 'Turno sem ocorrências', itens: ats.map(a => ({ atividade_id: a.id, status: sts[s++ % sts.length] })), extras: [], fotos: [] });
  if (!r.ok) console.log('seed', r.erro);
}

const errs = [];
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(dir, '../../pcm/public/vendor/chart.umd.js')) }));
await ctx.addInitScript(() => {
  const mk = () => { let ok = () => {}, bad = () => {}; const o = {
    withSuccessHandler(f) { ok = f; return o; }, withFailureHandler(f) { bad = f; return o; },
    rpc(m, a) { window.__rpc(m, a).then(ok, e => bad(new Error(String(e)))); } }; return o; };
  Object.defineProperty(window, 'google', { value: { script: { get run() { return mk(); } } } });
});
const p = await ctx.newPage();
await p.exposeFunction('__rpc', (m, a) => env.rpc(m, a));
p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
// Monta Pagina.html como o servidor faz (<?!= incluir('X') ?>)
const montada = fs.readFileSync(path.join(dir, '../Pagina.html'), 'utf8').replace(/<\?!= incluir\('(\w+)'\) \?>/g, (_, n) => fs.readFileSync(path.join(dir, '..', n + '.html'), 'utf8'));
const tmp = path.join(dir, '_pagina_montada.html'); fs.writeFileSync(tmp, montada);
await p.goto('file://' + tmp);
await p.waitForTimeout(300); console.log('erros iniciais:', errs); await p.screenshot({ path: out + 'gas_ini.png' });

// --- Operacional ---
await p.click('[data-ir=operacional]');
await p.selectOption('#colab', { index: 1 });
await p.waitForSelector('.ativ');
await p.click('.cor.v >> nth=0'); await p.click('.cor.a >> nth=1');
await p.click('#addx'); p.once('dialog', d => d.accept());
await p.click('#enviar'); await p.waitForTimeout(300);
console.log('validação extra:', await p.textContent('.toast'));
await p.selectOption('[data-k=classificacao]', 'BPF'); await p.fill('[data-k=descricao]', 'Limpeza extra'); await p.fill('#obs', 'Turno tranquilo');
await p.setInputFiles('#arq', { name: 'f.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(dir, '../../pcm/public/img/logo-anglo.png')) });
await p.waitForSelector('#fotos img');
await p.click('#enviar'); await p.waitForTimeout(800);
console.log('envio:', await p.textContent('.toast'));
await p.screenshot({ path: out + 'gas_op.png' });

// --- ADM ---
await p.click('[data-ir=inicio]'); await p.click('[data-ir=adm]');
await p.waitForSelector('#login-ov');
await p.fill('#senha', 'errada'); await p.click('#lf button.pri'); await p.waitForTimeout(200);
console.log('senha errada:', await p.textContent('#lerro'));
await p.fill('#senha', 'teste'); await p.click('#lf button.pri');
await p.waitForSelector('.kpi'); await p.waitForTimeout(1200);
await p.screenshot({ path: out + 'gas_dash.png', fullPage: true });
console.log('relatório:', (await p.textContent('#rel')).replace(/\s+/g, ' ').slice(0, 160));
await p.click('.btn-fotos'); await p.waitForSelector('.fotos-rel img');
console.log('fotos carregadas:', await p.locator('.fotos-rel img').count());

await p.click('[data-aba=programacao]'); await p.waitForSelector('.chip');
const chip = p.locator('.chip').first(), id = await chip.getAttribute('data-id');
await chip.dragTo(p.locator('td[data-d][data-c=""]').nth(3)); await p.waitForTimeout(500);
console.log('arrastou p/ backlog:', await p.locator(`td[data-c=""] .chip[data-id="${id}"]`).count());
await p.click('.add >> nth=8'); await p.fill('#f-desc', 'Nova atividade'); await p.click('#f-ok'); await p.waitForTimeout(500);
console.log('criou:', await p.locator('.chip', { hasText: 'Nova atividade' }).count());
await p.screenshot({ path: out + 'gas_cal.png' });
await p.click('[data-aba=cadastros]'); await p.waitForSelector('#te tr');
await p.fill('#co-nome', 'Novo Colaborador'); await p.click('#fc button.pri'); await p.waitForTimeout(400);
console.log('cadastrou:', await p.locator('#tc tr', { hasText: 'Novo Colaborador' }).count());
await p.click('#sair'); await p.waitForSelector('.escolhas');
console.log('erros:', errs);
await b.close();
