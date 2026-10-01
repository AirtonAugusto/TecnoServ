// Compara tempo de abertura (versão antiga x nova) simulando latência do Apps Script por chamada.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { criarAmbiente } = require('./harness.js');
const dir = path.dirname(fileURLToPath(import.meta.url));
const LAT = Number(process.env.LAT || 1500);

function ambiente() {
  const env = criarAmbiente({ props: { GESTAO_SENHA: 'teste' } });
  const tok = env.rpc('auth.login', { senha: 'teste' }).dados.token;
  const g = (m, a) => env.rpc('gestao.' + m, { ...a, token: tok }).dados;
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const eq = g('equipe.salvar', { nome: 'Mecânica' });
  const cs = ['Ana', 'Bruno', 'Carla'].map(n => g('colaborador.salvar', { nome: n, equipe_id: eq.id }));
  for (const c of cs) for (let i = 0; i < 3; i++) g('atividade.salvar', { os: 'OS' + i, descricao: 'Tarefa ' + i, data: hoje, colaborador_id: c.id });
  return { env, colabId: cs[0].id };
}

async function medir(arquivo) {
  const { env, colabId } = ambiente();
  const b = await chromium.launch({ args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  let chamadas = 0;
  await ctx.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(dir, '../../pcm/public/vendor/chart.umd.js')) }));
  await ctx.route('**/script.google.com/macros/**', async r => {
    chamadas++;
    const resp = env.doPost(r.request().postData() || '{}');
    await new Promise(ok => setTimeout(ok, LAT));
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(resp) });
  });
  await ctx.addInitScript(id => { try { localStorage.setItem('pcm_colaborador', id); } catch (e) {} }, colabId);
  const p = await ctx.newPage();
  await p.goto('file://' + arquivo);
  await p.waitForSelector('.escolhas');
  await p.waitForTimeout(2500); // a pessoa lê a tela inicial por alguns segundos
  let t0 = Date.now(), c0 = chamadas;
  await p.click('[data-ir=operacional]'); await p.waitForSelector('.ativ');
  const tOp = Date.now() - t0, cOp = chamadas - c0;
  await p.click('[data-ir=inicio]'); await p.waitForSelector('.escolhas');
  t0 = Date.now(); c0 = chamadas;
  await p.click('[data-ir=adm]'); await p.waitForSelector('#login-ov');
  await p.fill('#senha', 'teste'); const tLogin = Date.now();
  await p.click('#lf button.pri'); await p.waitForSelector('.kpi'); await p.waitForTimeout(100);
  const tAdm = Date.now() - tLogin, cAdm = chamadas - c0;
  await b.close();
  return { tOp, cOp, tAdm, cAdm };
}
const fmt = ms => (ms / 1000).toFixed(1) + ' s';
const velho = await medir('/tmp/old_index.html');
const novo = await medir(path.join(dir, '../../docs/index.html'));
console.log(`Latência simulada por chamada: ${LAT} ms`);
console.log('                              ANTES      DEPOIS');
console.log(`Abrir OPERACIONAL (com tarefas): ${fmt(velho.tOp).padStart(6)}   ${fmt(novo.tOp).padStart(6)}   (chamadas: ${velho.cOp} → ${novo.cOp})`);
console.log(`Entrar na ADM até o painel:      ${fmt(velho.tAdm).padStart(6)}   ${fmt(novo.tAdm).padStart(6)}   (chamadas: ${velho.cAdm} → ${novo.cAdm})`);
