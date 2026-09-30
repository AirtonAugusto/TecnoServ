'use strict';
const COR = { verde: '#2e9e4f', amarelo: '#dd9a00', vermelho: '#d93c3c', ouro: '#c4902e' };
const TINTA = '#1b1b1b', MUDO = '#6a665e', GRADE = '#ebe7df', SUPERFICIE = '#ffffff';
let graficos = {};
const hojeStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somar = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const pc = v => String(v).replace('.', ',') + '%';

function estilo() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = MUDO;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation.duration = 350;
}
function grafico(id, cfg) { graficos[id]?.destroy(); graficos[id] = new Chart($('#' + id), cfg); }

const tooltipBase = {
  backgroundColor: SUPERFICIE, titleColor: TINTA, bodyColor: TINTA, footerColor: MUDO, borderColor: '#d9d4c8', borderWidth: 1,
  padding: 10, cornerRadius: 6, boxPadding: 5, usePointStyle: true, titleFont: { weight: '600' }, footerFont: { weight: '400' },
};

// Valor da aderência, à direita de cada barra (rótulo seletivo: só o número que importa).
const rotuloFim = linhas => ({
  id: 'rotuloFim',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    ctx.save(); ctx.font = '600 13px ' + Chart.defaults.font.family; ctx.fillStyle = TINTA; ctx.textBaseline = 'middle';
    linhas.forEach((l, i) => ctx.fillText(pc(l.pct_aderencia), chartArea.right + 10, scales.y.getPixelForValue(i)));
    ctx.restore();
  },
});

function barras(linhas) {
  const nc = l => l.pendentes + l.sem_apontamento;
  const serie = (label, campo, cor) => ({ label, data: linhas.map(l => l[campo]), backgroundColor: cor, borderColor: SUPERFICIE, borderWidth: 2, borderRadius: 4, borderSkipped: false, maxBarThickness: 22, categoryPercentage: 0.72, barPercentage: 1 });
  const contagem = { 'Concluídas': l => l.concluidas, 'Iniciadas': l => l.iniciadas, 'Não conformidade': nc };
  return {
    type: 'bar',
    data: { labels: linhas.map(l => l.nome), datasets: [serie('Concluídas', 'pct_aderencia', COR.verde), serie('Iniciadas', 'pct_iniciadas', COR.amarelo), serie('Não conformidade', 'pct_nao_conformidade', COR.vermelho)] },
    options: {
      indexAxis: 'y', layout: { padding: { right: 68 } },
      interaction: { mode: 'nearest', axis: 'y', intersect: true },
      scales: {
        x: { stacked: true, min: 0, max: 100, grid: { color: GRADE, lineWidth: 1 }, border: { display: false }, ticks: { callback: v => v + '%', stepSize: 25 } },
        y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: TINTA, font: { size: 13 } } },
      },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 18, color: MUDO } },
        tooltip: {
          ...tooltipBase,
          callbacks: {
            title: it => linhas[it[0].dataIndex].nome,
            label: c => { const l = linhas[c.dataIndex]; return ` ${c.dataset.label}: ${pc(c.parsed.x)} (${contagem[c.dataset.label](l)} atividades)`; },
            afterLabel: c => { const l = linhas[c.dataIndex]; return c.dataset.label === 'Não conformidade' ? `   ${l.pendentes} pendentes · ${l.sem_apontamento} sem apontamento` : ''; },
            footer: it => `${linhas[it[0].dataIndex].planejadas} atividades planejadas`,
          },
        },
      },
    },
    plugins: [rotuloFim(linhas)],
  };
}

function ajustarAltura(id, n, porLinha, min = 150) { $('#' + id).style.height = Math.max(min, 76 + n * porLinha) + 'px'; }

// Linha vertical fina que acompanha o ponteiro no gráfico de evolução.
const mira = { id: 'mira', afterDatasetsDraw(chart) {
  const a = chart.tooltip?._active?.[0]; if (!a) return;
  const { ctx, chartArea } = chart; ctx.save(); ctx.strokeStyle = '#cfc9bb'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(a.element.x, chartArea.top); ctx.lineTo(a.element.x, chartArea.bottom); ctx.stroke(); ctx.restore();
} };

function linha(serie) {
  const dados = serie.map(d => d.planejadas ? d.pct_aderencia : null);
  const ultimo = dados.reduce((u, v, i) => v === null ? u : i, -1);
  return {
    type: 'line',
    data: { labels: serie.map(d => diaSem(d.data) + ' ' + fmtData(d.data)), datasets: [{
      label: 'Aderência', data: dados, borderColor: COR.ouro, borderWidth: 2, backgroundColor: 'rgba(196,144,46,.12)', fill: true, tension: 0.25, spanGaps: true,
      pointRadius: dados.map((_, i) => i === ultimo ? 5 : 0), pointHoverRadius: 6, pointBackgroundColor: COR.ouro, pointBorderColor: SUPERFICIE, pointBorderWidth: 2, pointHitRadius: 24,
    }] },
    options: {
      layout: { padding: { top: 8, right: 8 } },
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { min: 0, max: 100, grid: { color: GRADE }, border: { display: false }, ticks: { stepSize: 25, callback: v => v + '%' } },
        x: { grid: { display: false }, border: { color: GRADE }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      },
      plugins: { legend: { display: false }, tooltip: { ...tooltipBase, callbacks: {
        title: it => serie[it[0].dataIndex].data.split('-').reverse().join('/'),
        label: c => { const d = serie[c.dataIndex]; return ` Aderência: ${pc(c.parsed.y)} (${d.concluidas} de ${d.planejadas} planejadas)`; },
      } } },
    },
    plugins: [mira],
  };
}

async function carregar() {
  const q = new URLSearchParams({ de: $('#de').value, ate: $('#ate').value, equipe_id: $('#equipe').value });
  let m;
  $('main').style.opacity = .6;
  try { m = await api('GET', '/api/gestao/aderencia?' + q); } catch (e) { $('main').style.opacity = 1; return toast(e.message, true); }
  $('main').style.opacity = 1;
  const g = m.geral;
  const kpi = (cls, cor, rot, val, sub, meter) => `<div class="kpi ${cls}"><span class="rot"><i style="background:${cor}"></i>${rot}</span><b>${pc(val)}</b>${meter ? `<div class="meter" role="img" aria-label="${pc(val)}"><div style="width:${Math.min(100, val)}%"></div></div>` : ''}<span class="sub">${sub}</span></div>`;
  $('#kpis').innerHTML =
    kpi('hero', COR.verde, 'Aderência (concluídas)', g.pct_aderencia, `${g.concluidas} de ${g.planejadas} atividades planejadas`, true) +
    kpi('', COR.ouro, 'Sequência / continuidade', g.pct_sequencia, `${g.apont_sequencia} de ${g.apont_programados} apontamentos vieram de dias anteriores`) +
    kpi('', '#2a6fdb', 'Atividades extras', g.pct_extras, `${g.extras} extras · BPF ${g.extras_bpf} · Corretiva ${g.extras_corretiva}`) +
    kpi('', COR.vermelho, 'Não conformidade', g.pct_nao_conformidade, `${g.pendentes} pendentes + ${g.sem_apontamento} sem apontamento`);

  estilo();
  const ord = arr => [...arr].sort((a, b) => b.pct_aderencia - a.pct_aderencia || a.nome.localeCompare(b.nome));
  const eq = ord(m.equipes), co = ord(m.colaboradores);
  ajustarAltura('wEquipe', eq.length, 44, 280); ajustarAltura('wColab', co.length, 36);
  grafico('gEquipe', barras(eq));
  grafico('gColab', barras(co));
  grafico('gDia', linha(m.serie_diaria));

  const th = ['Colaborador', 'Equipe', 'Planej.', 'Concl.', 'Inic.', 'Pend.', 'S/ apont.', 'Aderência', 'Sequência', 'Extras', 'Não conf.'];
  $('#tab').innerHTML = `<tr>${th.map(t => `<th>${t}</th>`).join('')}</tr>` + co.map(c =>
    `<tr><td>${esc(c.nome)}</td><td>${esc(c.equipe)}</td><td>${c.planejadas}</td><td>${c.concluidas}</td><td>${c.iniciadas}</td><td>${c.pendentes}</td><td>${c.sem_apontamento}</td><td><b>${pc(c.pct_aderencia)}</b></td><td>${pc(c.pct_sequencia)}</td><td>${c.extras} (${pc(c.pct_extras)})</td><td>${pc(c.pct_nao_conformidade)}</td></tr>`).join('')
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
