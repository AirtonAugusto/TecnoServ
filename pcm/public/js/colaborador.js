'use strict';
let estado = null; // { dados, marcas:{atividadeId:status}, extras:[], fotos:[] }
const chave = 'pcm_colaborador';

async function iniciar() {
  const lista = await api('GET', '/api/publico/colaboradores');
  const sel = $('#colab');
  sel.innerHTML = '<option value="">Selecione seu nome…</option>' + lista.map(c => `<option value="${c.id}">${esc(c.nome)}${c.equipe ? ' — ' + esc(c.equipe) : ''}</option>`).join('');
  try { sel.value = localStorage.getItem(chave) || ''; } catch { /* storage bloqueado */ }
  sel.onchange = () => { try { localStorage.setItem(chave, sel.value); } catch {} carregar(); };
  $('#data').onchange = carregar;
  carregar(true);
}

async function carregar(primeira) {
  const id = $('#colab').value;
  if (!id) { $('#conteudo').innerHTML = '<p class="mut">Escolha seu nome para ver as atividades do dia.</p>'; return; }
  try {
    const d = await api('GET', `/api/colaborador/${id}/tarefas?data=${$('#data').value || ''}`);
    if (!$('#data').options.length || primeira) {
      $('#data').innerHTML = [0, 1, 2].map(n => { const v = addDias(d.hoje, -n); return `<option value="${v}">${n === 0 ? 'Hoje' : n === 1 ? 'Ontem' : 'Anteontem'} — ${fmtDataCompleta(v)}</option>`; }).join('');
      $('#data').value = d.data;
    }
    estado = { dados: d, marcas: {}, extras: d.extras.map(e => ({ ...e })), fotos: [] };
    for (const a of [...d.atividades, ...d.anteriores]) if (a.status) estado.marcas[a.id] = a.status;
    desenhar();
  } catch (e) { toast(e.message, true); $('#conteudo').innerHTML = ''; }
}
function addDias(s, n) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function cardAtiv(a, ant) {
  const m = estado.marcas[a.id] || '';
  const caixa = (st, cor, txt) => `<div class="cor ${cor} ${m === st ? 'sel' : ''}" data-id="${a.id}" data-st="${st}" role="button" tabindex="0">${txt}</div>`;
  return `<div class="ativ ${ant ? 'ant' : ''}">
    <div><span class="os">${esc(a.os || 'Sem OS')}</span>${ant ? ` <span class="mut">· programada ${fmtData(a.data)}${a.ultimo_status ? ' · última: ' + STATUS[a.ultimo_status].nome : ' · sem apontamento'}</span>` : ''}</div>
    <div class="desc">${esc(a.descricao)}</div>
    <div class="cores">${caixa('concluida', 'v', '✔ Concluída')}${caixa('iniciada', 'a', '◐ Iniciada')}${caixa('pendente', 'r', '✖ Pendente')}</div>
  </div>`;
}

function desenhar() {
  const { dados: d } = estado;
  let h = `<div class="card legenda"><span><i style="background:var(--verde)"></i>Concluída</span><span><i style="background:var(--amarelo)"></i>Iniciada, não concluída</span><span><i style="background:var(--vermelho)"></i>Pendente</span><span><i style="background:var(--azul)"></i>Extra</span></div>`;
  if (d.enviado_em) h += `<div class="card" style="border-color:var(--verde)">✔ Você já enviou este turno. Pode ajustar e reenviar — o novo envio substitui o anterior.</div>`;
  h += `<h2>Atividades de ${d.data === d.hoje ? 'hoje' : fmtDataCompleta(d.data)}</h2>`;
  h += d.atividades.length ? d.atividades.map(a => cardAtiv(a, false)).join('') : '<p class="mut">Nenhuma atividade programada para este dia.</p>';
  if (d.anteriores.length) h += `<h2>Continuidade (dias anteriores)</h2>` + d.anteriores.map(a => cardAtiv(a, true)).join('');

  h += `<h2>Atividades extras</h2><div id="extras">${estado.extras.map((x, i) => `
    <div class="ativ extra">
      <div class="linha"><div><label>OS (opcional)</label><input data-x="${i}" data-k="os" value="${esc(x.os)}"></div>
      <div><label>Classificação *</label><select data-x="${i}" data-k="classificacao"><option value="">Selecione…</option>${['BPF', 'Corretiva'].map(o => `<option ${x.classificacao === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
      <label>Descrição *</label><input data-x="${i}" data-k="descricao" value="${esc(x.descricao)}">
      <div class="cores" style="margin-top:8px;grid-template-columns:1fr auto"><div class="cor z sel">● Extra</div><button data-rm="${i}">Remover</button></div>
    </div>`).join('')}</div>
    <button id="addx" style="width:100%;margin-bottom:14px">+ Adicionar atividade extra</button>`;

  h += `<div class="card"><label for="obs">Observações / relatório do turno</label><textarea id="obs" maxlength="2000" placeholder="Ocorrências, pendências, materiais, recados…">${esc(d.observacao)}</textarea>
    <label>Fotos do dia${d.fotos ? ` <span class="mut">(${d.fotos} já enviada(s))</span>` : ''}</label>
    <input type="file" id="arq" accept="image/*" multiple>
    <div class="fotos" id="fotos"></div></div>
    <div class="enviar"><button class="pri" id="enviar">Enviar relatório do turno</button></div>`;
  $('#conteudo').innerHTML = h;
  desenharFotos();
  ligarEventos();
}

function ligarEventos() {
  const c = $('#conteudo');
  c.querySelectorAll('.cor[data-id]').forEach(el => {
    const alt = () => { const { id, st } = el.dataset; if (estado.marcas[id] === st) delete estado.marcas[id]; else estado.marcas[id] = st; salvarCampos(); desenhar(); };
    el.onclick = alt; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alt(); } };
  });
  c.querySelectorAll('[data-x]').forEach(el => el.oninput = el.onchange = () => { estado.extras[el.dataset.x][el.dataset.k] = el.value; });
  c.querySelectorAll('[data-rm]').forEach(el => el.onclick = () => { salvarCampos(); estado.extras.splice(el.dataset.rm, 1); desenhar(); });
  $('#addx').onclick = () => { salvarCampos(); estado.extras.push({ os: '', descricao: '', classificacao: '' }); desenhar(); };
  $('#arq').onchange = async e => {
    for (const f of e.target.files) {
      if (estado.fotos.length >= 8) { toast('Máximo de 8 fotos por envio.', true); break; }
      try { estado.fotos.push(await reduzir(f)); } catch { toast('Não foi possível ler a foto ' + f.name, true); }
    }
    e.target.value = ''; desenharFotos();
  };
  $('#enviar').onclick = enviar;
}
function salvarCampos() { estado.dados.observacao = $('#obs')?.value ?? estado.dados.observacao; }

function desenharFotos() {
  $('#fotos').innerHTML = estado.fotos.map((f, i) => `<div class="foto"><img src="${f}" alt="foto ${i + 1}"><button data-f="${i}" aria-label="Remover foto">×</button></div>`).join('');
  $('#fotos').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { salvarCampos(); estado.fotos.splice(b.dataset.f, 1); desenharFotos(); });
}

// Reduz a foto no navegador (máx. 1280px, JPEG) para o envio ser rápido no celular.
function reduzir(file) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const esc = Math.min(1, 1280 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(); };
    img.src = url;
  });
}

async function enviar() {
  salvarCampos();
  const d = estado.dados;
  for (const [i, x] of estado.extras.entries()) {
    if (!x.classificacao) return toast(`Atividade extra ${i + 1}: escolha BPF ou Corretiva.`, true);
    if (!x.descricao.trim()) return toast(`Atividade extra ${i + 1}: descreva a atividade.`, true);
  }
  const todas = [...d.atividades, ...d.anteriores];
  const semMarca = d.atividades.filter(a => !estado.marcas[a.id]).length;
  if (semMarca && !confirm(`${semMarca} atividade(s) de hoje sem status serão registradas como NÃO APONTADAS. Enviar mesmo assim?`)) return;
  const btn = $('#enviar'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    await api('POST', '/api/envios', {
      colaborador_id: d.colaborador.id, data: d.data, observacao: d.observacao,
      itens: todas.filter(a => estado.marcas[a.id]).map(a => ({ atividade_id: a.id, status: estado.marcas[a.id] })),
      extras: estado.extras, fotos: estado.fotos,
    });
    toast('Relatório enviado com sucesso!');
    carregar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Enviar relatório do turno'; }
}

iniciar().catch(e => toast(e.message, true));
