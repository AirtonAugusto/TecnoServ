'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { criarAuth } = require('./auth');
const { calcular } = require('./metrics');
const D = require('./dates');

const STATUS_APONT = ['concluida', 'iniciada', 'pendente'];
const CLASSIF = ['BPF', 'Corretiva'];
const txt = (v, max) => String(v ?? '').trim().slice(0, max);

class ErroHttp extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const req400 = (cond, msg) => { if (!cond) throw new ErroHttp(400, msg); };

function criarApp({ store, senha, segredo, uploadsDir }) {
  const app = express();
  const auth = criarAuth({ senha, segredo });
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:",
    });
    next();
  });
  app.use(express.json({ limit: '25mb' }));

  const db = () => store.data;
  const colabAtivo = id => db().colaboradores.find(c => c.id === id && c.ativo);

  // ---------- Situação mais recente de cada atividade ----------
  function ultimoApont(atividadeId) {
    let u = null;
    for (const ap of db().apontamentos) {
      if (ap.atividade_id !== atividadeId) continue;
      if (!u || ap.data > u.data || (ap.data === u.data && ap.criado_em >= u.criado_em)) u = ap;
    }
    return u;
  }

  // ================= AUTENTICAÇÃO =================
  app.post('/api/auth/login', (req, res) => {
    const r = auth.verificarSenha(req.ip, req.body?.senha);
    if (r === 'bloqueado') return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
    if (!r) return res.status(401).json({ erro: 'Senha incorreta.' });
    res.set('Set-Cookie', auth.cookieHeader(req, auth.emitirToken()));
    res.json({ ok: true });
  });
  app.post('/api/auth/logout', (req, res) => { res.set('Set-Cookie', auth.cookieHeader(req, '', true)); res.json({ ok: true }); });
  app.get('/api/auth/status', (req, res) => res.json({ autenticado: auth.tokenValido(auth.lerCookie(req)) }));

  // ================= TELA 1 — COLABORADOR (público) =================
  app.get('/api/publico/colaboradores', (req, res) => {
    const eq = new Map(db().equipes.map(e => [e.id, e.nome]));
    res.json(db().colaboradores.filter(c => c.ativo).map(c => ({ id: c.id, nome: c.nome, equipe: eq.get(c.equipe_id) || '' }))
      .sort((a, b) => a.nome.localeCompare(b.nome)));
  });

  app.get('/api/colaborador/:id/tarefas', (req, res) => {
    const c = colabAtivo(req.params.id);
    if (!c) throw new ErroHttp(404, 'Colaborador não encontrado.');
    const hoje = D.hoje();
    const data = req.query.data || hoje;
    req400(D.isDate(data) && data <= hoje && data >= D.addDays(hoje, -2), 'Data inválida (só hoje e os 2 dias anteriores).');

    const envio = db().envios.find(e => e.colaborador_id === c.id && e.data === data) || null;
    const apDoDia = db().apontamentos.filter(a => a.colaborador_id === c.id && a.data === data);
    const porAtiv = new Map(apDoDia.filter(a => a.atividade_id).map(a => [a.atividade_id, a]));
    const fmt = a => ({ id: a.id, os: a.os, descricao: a.descricao, data: a.data, status: porAtiv.get(a.id)?.status || '' });

    const minhas = db().atividades.filter(a => a.colaborador_id === c.id);
    const doDia = minhas.filter(a => a.data === data).map(fmt);
    // Continuidade: atividades de dias anteriores (até 14 dias) ainda não concluídas
    const anteriores = minhas.filter(a => a.data < data && a.data >= D.addDays(data, -14)).filter(a => {
      if (porAtiv.has(a.id)) return true; // já apontada hoje: continua listada para permitir edição
      const u = ultimoApont(a.id);
      return !u || u.status !== 'concluida';
    }).map(a => ({ ...fmt(a), ultimo_status: ultimoApont(a.id)?.status || '' }))
      .sort((x, y) => x.data.localeCompare(y.data));

    res.json({
      colaborador: { id: c.id, nome: c.nome, equipe: db().equipes.find(e => e.id === c.equipe_id)?.nome || '' },
      data, hoje, atividades: doDia, anteriores,
      extras: apDoDia.filter(a => a.status === 'extra').map(a => ({ os: a.os_extra, descricao: a.descricao_extra, classificacao: a.classificacao })),
      observacao: envio?.observacao || '',
      fotos: envio?.fotos?.length || 0,
      enviado_em: envio?.criado_em || null,
    });
  });

  function salvarFoto(dataUrl, envioId, n) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    req400(m, 'Foto inválida.');
    const buf = Buffer.from(m[2], 'base64');
    req400(buf.length <= 4 * 1024 * 1024, 'Foto muito grande (máx. 4 MB).');
    const nome = `${envioId}-${n}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(uploadsDir, nome), buf);
    return nome;
  }

  app.post('/api/envios', (req, res) => {
    const b = req.body || {};
    const c = colabAtivo(b.colaborador_id);
    req400(c, 'Colaborador inválido.');
    const hoje = D.hoje();
    req400(D.isDate(b.data) && b.data <= hoje && b.data >= D.addDays(hoje, -2), 'Data inválida.');
    const itens = Array.isArray(b.itens) ? b.itens : [];
    const extras = Array.isArray(b.extras) ? b.extras : [];
    const fotos = Array.isArray(b.fotos) ? b.fotos : [];
    req400(itens.length + extras.length <= 100 && fotos.length <= 8, 'Envio grande demais.');

    const minhas = new Map(db().atividades.filter(a => a.colaborador_id === c.id).map(a => [a.id, a]));
    for (const i of itens) {
      req400(minhas.has(i.atividade_id), 'Atividade não pertence ao colaborador.');
      req400(STATUS_APONT.includes(i.status), 'Status inválido.');
    }
    for (const x of extras) {
      req400(CLASSIF.includes(x.classificacao), 'Atividade extra exige classificação BPF ou Corretiva.');
      req400(txt(x.descricao, 300), 'Descreva a atividade extra.');
    }
    req400(itens.length || extras.length || txt(b.observacao, 1) || fotos.length, 'Nada para enviar.');

    // reenvio no mesmo dia substitui o anterior (mantendo as fotos já enviadas)
    const anterior = db().envios.find(e => e.colaborador_id === c.id && e.data === b.data);
    const fotosAnteriores = anterior?.fotos || [];
    if (anterior) store.remove('envios', anterior.id);
    store.removeWhere('apontamentos', a => a.colaborador_id === c.id && a.data === b.data);

    const agora = new Date().toISOString();
    const envioId = crypto.randomBytes(6).toString('hex');
    const novasFotos = fotos.map((f, n) => salvarFoto(f, envioId, n));
    const envio = store.insert('envios', {
      id: envioId, data: b.data, colaborador_id: c.id, equipe_id: c.equipe_id, observacao: txt(b.observacao, 2000),
      fotos: [...fotosAnteriores, ...novasFotos], criado_em: agora,
    });
    for (const i of itens) store.insert('apontamentos', { envio_id: envioId, atividade_id: i.atividade_id, colaborador_id: c.id, equipe_id: c.equipe_id, data: b.data, status: i.status, criado_em: agora });
    for (const x of extras) store.insert('apontamentos', {
      envio_id: envioId, colaborador_id: c.id, equipe_id: c.equipe_id, data: b.data, status: 'extra', classificacao: x.classificacao,
      os_extra: txt(x.os, 40), descricao_extra: txt(x.descricao, 300), criado_em: agora,
    });
    res.json({ ok: true, envio_id: envio.id });
  });

  // ================= ÁREA DA GESTÃO (protegida) =================
  const g = express.Router();
  g.use(auth.exigir);
  app.use('/api/gestao', g);

  // ---- Cadastros ----
  g.get('/equipes', (req, res) => res.json(db().equipes));
  g.post('/equipes', (req, res) => {
    const nome = txt(req.body?.nome, 60); req400(nome, 'Informe o nome da equipe.');
    res.json(store.insert('equipes', { nome }));
  });
  g.put('/equipes/:id', (req, res) => {
    const nome = txt(req.body?.nome, 60); req400(nome, 'Informe o nome da equipe.');
    const r = store.update('equipes', req.params.id, { nome }); if (!r) throw new ErroHttp(404, 'Equipe não encontrada.');
    res.json(r);
  });
  g.delete('/equipes/:id', (req, res) => {
    req400(!db().colaboradores.some(c => c.equipe_id === req.params.id), 'Há colaboradores nesta equipe. Mova-os antes de excluir.');
    store.remove('equipes', req.params.id); res.json({ ok: true });
  });

  g.get('/colaboradores', (req, res) => res.json(db().colaboradores));
  const validarColab = b => {
    const nome = txt(b?.nome, 80); req400(nome, 'Informe o nome.');
    const equipe_id = b?.equipe_id || '';
    req400(!equipe_id || db().equipes.some(e => e.id === equipe_id), 'Equipe inválida.');
    return { nome, equipe_id, ativo: b?.ativo !== false };
  };
  g.post('/colaboradores', (req, res) => res.json(store.insert('colaboradores', validarColab(req.body))));
  g.put('/colaboradores/:id', (req, res) => {
    const r = store.update('colaboradores', req.params.id, validarColab(req.body)); if (!r) throw new ErroHttp(404, 'Colaborador não encontrado.');
    res.json(r);
  });
  g.delete('/colaboradores/:id', (req, res) => {
    // Preserva histórico: apenas inativa
    const r = store.update('colaboradores', req.params.id, { ativo: false }); if (!r) throw new ErroHttp(404, 'Colaborador não encontrado.');
    res.json({ ok: true });
  });

  // ---- Calendário (3 semanas) ----
  g.get('/calendario', (req, res) => {
    const offset = Math.max(-52, Math.min(52, parseInt(req.query.offset) || 0));
    const ini = D.addDays(D.segunda(D.hoje()), offset * 7);
    const semanas = [0, 1, 2].map(i => {
      const inicio = D.addDays(ini, i * 7);
      return { ...D.semanaISO(inicio), inicio, dias: D.intervalo(inicio, D.addDays(inicio, 6)) };
    });
    const fim = D.addDays(ini, 20);
    const atividades = db().atividades.filter(a => a.data >= ini && a.data <= fim)
      .map(a => ({ ...a, status: ultimoApont(a.id)?.status || '' }));
    res.json({
      hoje: D.hoje(), semanas, atividades,
      colaboradores: db().colaboradores.filter(c => c.ativo),
      equipes: db().equipes,
    });
  });

  const validarAtividade = b => {
    const descricao = txt(b?.descricao, 300); req400(descricao, 'Informe a descrição da atividade.');
    req400(D.isDate(b?.data), 'Data inválida.');
    const colaborador_id = b?.colaborador_id || '';
    req400(!colaborador_id || colabAtivo(colaborador_id), 'Colaborador inválido.');
    return { os: txt(b?.os, 40), descricao, data: b.data, colaborador_id };
  };
  g.post('/atividades', (req, res) => res.json(store.insert('atividades', { ...validarAtividade(req.body), criado_em: new Date().toISOString() })));
  g.put('/atividades/:id', (req, res) => {
    // Aceita edição parcial (arrastar/mover envia só data/colaborador)
    const atual = store.get('atividades', req.params.id); if (!atual) throw new ErroHttp(404, 'Atividade não encontrada.');
    const r = store.update('atividades', atual.id, validarAtividade({ ...atual, ...req.body }));
    res.json(r);
  });
  g.delete('/atividades/:id', (req, res) => {
    req400(store.get('atividades', req.params.id), 'Atividade não encontrada.');
    store.remove('atividades', req.params.id); res.json({ ok: true });
  });
  g.post('/atividades/:id/duplicar', (req, res) => {
    const a = store.get('atividades', req.params.id); if (!a) throw new ErroHttp(404, 'Atividade não encontrada.');
    res.json(store.insert('atividades', { ...validarAtividade({ ...a, ...req.body }), criado_em: new Date().toISOString() }));
  });

  // ---- Dashboard ----
  g.get('/aderencia', (req, res) => {
    const hoje = D.hoje();
    const ate = req.query.ate || hoje;
    const de = req.query.de || D.addDays(ate, -6);
    req400(D.isDate(de) && D.isDate(ate) && de <= ate && D.intervalo(de, ate).length <= 366, 'Período inválido.');
    res.json(calcular(db(), { de, ate, hoje, equipe_id: req.query.equipe_id || '' }));
  });

  // ---- Relatório de turno agrupado por equipe ----
  g.get('/relatorios', (req, res) => {
    const data = req.query.data || D.hoje();
    req400(D.isDate(data), 'Data inválida.');
    const ativs = new Map(db().atividades.map(a => [a.id, a]));
    const cols = new Map(db().colaboradores.map(c => [c.id, c]));
    const rel = db().equipes.filter(e => !req.query.equipe_id || e.id === req.query.equipe_id).map(eq => {
      const membros = db().colaboradores.filter(c => c.equipe_id === eq.id && c.ativo);
      const envios = db().envios.filter(e => e.equipe_id === eq.id && e.data === data);
      const enviaram = envios.map(e => {
        const aps = db().apontamentos.filter(a => a.envio_id === e.id);
        return {
          colaborador: cols.get(e.colaborador_id)?.nome || '?', enviado_em: e.criado_em, observacao: e.observacao, fotos: e.fotos,
          itens: aps.filter(a => a.status !== 'extra').map(a => ({ os: ativs.get(a.atividade_id)?.os || '', descricao: ativs.get(a.atividade_id)?.descricao || '(atividade removida)', status: a.status, data_prevista: ativs.get(a.atividade_id)?.data || '' })),
          extras: aps.filter(a => a.status === 'extra').map(a => ({ os: a.os_extra, descricao: a.descricao_extra, classificacao: a.classificacao })),
        };
      });
      const cont = s => enviaram.reduce((n, e) => n + e.itens.filter(i => i.status === s).length, 0);
      return {
        equipe: eq.nome, data, enviaram,
        pendentes_envio: membros.filter(m => !envios.some(e => e.colaborador_id === m.id)).map(m => m.nome),
        resumo: { concluidas: cont('concluida'), iniciadas: cont('iniciada'), pendentes: cont('pendente'), extras: enviaram.reduce((n, e) => n + e.extras.length, 0) },
      };
    }).filter(r => r.enviaram.length || r.pendentes_envio.length);
    res.json(rel);
  });

  g.get('/foto/:nome', (req, res) => {
    req400(/^[a-f0-9]+-\d+\.(jpg|png|webp)$/.test(req.params.nome), 'Arquivo inválido.');
    res.sendFile(path.join(path.resolve(uploadsDir), req.params.nome), err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  // ================= ESTÁTICOS =================
  app.get('/gestao', (req, res) => res.redirect('/dashboard.html'));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ErroHttp) return res.status(err.status).json({ erro: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Envio grande demais (fotos). Reduza a quantidade.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  });
  return app;
}
module.exports = { criarApp };
