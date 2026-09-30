'use strict';
const COR = { verde: '#2e9e4f', amarelo: '#f2b705', vermelho: '#d93c3c', azul: '#2a6fdb', cinza: '#8a94a3' };
let graficos = {};
const hojeStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somar = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function estilo() {
  const s = getComputedStyle(document.documentElement);
  Chart.defaults.color = s.getPropertyValue('--txt').trim();
  Chart.defaults.borderColor = s.getPropertyValue('--brd').trim();
  Chart.defaults.maintainAspectRatio = false;
}
function grafico(id, cfg) { graficos[id]?.destroy(); graficos[id] = new Chart($('#' + id), cfg); }

const barrasEmpilhadas = (linhas) => ({
  type: 'bar',
  data: {
    labels: linhas.map(l => l.nome),
    datasets: [
      { label: 'Concluídas %', data: linhas.map(l => l.pct_aderencia), backgroundColor: COR.verde },
      { label: 'Iniciadas %', data: linhas.map(l => l.pct_iniciadas), backgroundColor: COR.amarelo },
      { label: 'Não conformidade %', data: linhas.map(l => l.pct_nao_conformidade), backgroundColor: COR.vermelho },
    ],
  },
  options: { indexAxis: 'y', scales: { x: { stacked: true, max: 100, title: { display: true, text: '% das atividades planejadas' } }, y: { stacked: true } },
    plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.x}%` } } } },
});

async function carregar() {
  const q = new URLSearchParams({ de: $('#de').value, ate: $('#ate').value, equipe_id: $('#equipe').value });
  let m;
  try { m = await api('GET', '/api/gestao/aderencia?' + q); } catch (e) { return toast(e.message, true); }
  const g = m.geral;
  const kpi = (v, t, cor, sub) => `<div class="kpi" style="border-left-color:${cor}"><b>${v}%</b>${t}<br><span>${sub}</span></div>`;
  $('#kpis').innerHTML =
    kpi(g.pct_aderencia, 'Aderência (concluídas)', COR.verde, `${g.concluidas} de ${g.planejadas} planejadas`) +
    kpi(g.pct_sequencia, 'Sequência / continuidade', COR.amarelo, `${g.apont_sequencia} de ${g.apont_programados} apontamentos de dias anteriores`) +
    kpi(g.pct_extras, 'Atividades extras', COR.azul, `${g.extras} extras (BPF ${g.extras_bpf} · Corretiva ${g.extras_corretiva})`) +
    kpi(g.pct_nao_conformidade, 'Não conformidade', COR.vermelho, `${g.pendentes} pendentes + ${g.sem_apontamento} sem apontamento`);

  estilo();
  grafico('gEquipe', barrasEmpilhadas(m.equipes));
  grafico('gColab', barrasEmpilhadas(m.colaboradores));
  grafico('gDia', {
    type: 'line',
    data: { labels: m.serie_diaria.map(d => fmtData(d.data)), datasets: [{ label: 'Aderência %', data: m.serie_diaria.map(d => d.planejadas ? d.pct_aderencia : null), borderColor: COR.verde, backgroundColor: COR.verde, tension: .25, spanGaps: true }] },
    options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } },
  });
  grafico('gPizza', {
    type: 'doughnut',
    data: { labels: ['Concluídas', 'Iniciadas', 'Pendentes', 'Sem apontamento', 'Extras'], datasets: [{ data: [g.concluidas, g.iniciadas, g.pendentes, g.sem_apontamento, g.extras], backgroundColor: [COR.verde, COR.amarelo, COR.vermelho, COR.cinza, COR.azul] }] },
    options: { plugins: { legend: { position: 'bottom' } } },
  });

  const th = ['Colaborador', 'Equipe', 'Planej.', 'Concl.', 'Inic.', 'Pend.', 'S/ apont.', 'Aderência', 'Sequência', 'Extras', 'Não conf.'];
  $('#tab').innerHTML = `<tr>${th.map(t => `<th>${t}</th>`).join('')}</tr>` + m.colaboradores.map(c =>
    `<tr><td>${esc(c.nome)}</td><td>${esc(c.equipe)}</td><td>${c.planejadas}</td><td>${c.concluidas}</td><td>${c.iniciadas}</td><td>${c.pendentes}</td><td>${c.sem_apontamento}</td><td><b>${c.pct_aderencia}%</b></td><td>${c.pct_sequencia}%</td><td>${c.extras} (${c.pct_extras}%)</td><td>${c.pct_nao_conformidade}%</td></tr>`).join('')
    || '<tr><td colspan="11" class="mut">Sem dados no período.</td></tr>';
}

async function relatorio() {
  let r;
  try { r = await api('GET', `/api/gestao/relatorios?data=${$('#rdata').value}&equipe_id=${$('#equipe').value}`); } catch (e) { return toast(e.message, true); }
  $('#rel').innerHTML = r.map(t => `<div class="rel-equipe"><h3>${esc(t.equipe)} — ${fmtDataCompleta(t.data)}</h3>
    <div>${['concluidas:concluida:Concluídas', 'iniciadas:iniciada:Iniciadas', 'pendentes:pendente:Pendentes', 'extras:extra:Extras'].map(s => { const [k, cls, n] = s.split(':'); return `<span class="tag ${cls}">${n}: ${t.resumo[k]}</span> `; }).join('')}</div>
    ${t.pendentes_envio.length ? `<p class="mut">Ainda não enviaram: ${t.pendentes_envio.map(esc).join(', ')}</p>` : ''}
    ${t.enviaram.map(e => `<div class="rel-colab"><b>${esc(e.colaborador)}</b> <span class="mut">enviado às ${new Date(e.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <ul>${e.itens.map(i => `<li><span class="tag ${i.status}">${STATUS[i.status].nome}</span> ${esc(i.os)} ${esc(i.descricao)}${i.data_prevista < t.data ? ` <span class="mut">(prevista ${fmtData(i.data_prevista)})</span>` : ''}</li>`).join('')}
      ${e.extras.map(x => `<li><span class="tag extra">Extra · ${esc(x.classificacao)}</span> ${esc(x.os)} ${esc(x.descricao)}</li>`).join('')}</ul>
      ${e.observacao ? `<p>💬 ${esc(e.observacao)}</p>` : ''}
      <div class="fotos-rel">${e.fotos.map(f => `<a href="/api/gestao/foto/${f}" target="_blank"><img src="/api/gestao/foto/${f}" alt="foto" loading="lazy"></a>`).join('')}</div></div>`).join('')}
  </div>`).join('') || '<p class="mut">Nenhum envio nesta data.</p>';
}

iniciarGestao('dashboard.html', async () => {
  const h = hojeStr();
  $('#ate').value = h; $('#de').value = somar(h, -6); $('#rdata').value = h;
  const eq = await api('GET', '/api/gestao/equipes');
  $('#equipe').insertAdjacentHTML('beforeend', eq.map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join(''));
  $('#aplicar').onclick = () => { carregar(); relatorio(); };
  $('#p7').onclick = () => { $('#de').value = somar($('#ate').value, -6); carregar(); };
  $('#p30').onclick = () => { $('#de').value = somar($('#ate').value, -29); carregar(); };
  $('#rbtn').onclick = relatorio; $('#rimp').onclick = () => window.print();
  carregar(); relatorio();
});
