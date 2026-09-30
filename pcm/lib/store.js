'use strict';
const crypto = require('crypto');

// Tipos: s=texto, b=booleano, j=JSON
const SCHEMAS = {
  equipes: { id: 's', nome: 's' },
  colaboradores: { id: 's', nome: 's', equipe_id: 's', ativo: 'b' },
  atividades: { id: 's', os: 's', descricao: 's', data: 's', colaborador_id: 's', criado_em: 's' },
  apontamentos: {
    id: 's', envio_id: 's', atividade_id: 's', colaborador_id: 's', equipe_id: 's', data: 's',
    status: 's', classificacao: 's', os_extra: 's', descricao_extra: 's', criado_em: 's',
  },
  envios: { id: 's', data: 's', colaborador_id: 's', equipe_id: 's', observacao: 's', fotos: 'j', criado_em: 's' },
};

const uid = () => crypto.randomBytes(6).toString('hex');

class Store {
  constructor(adapter) {
    this.adapter = adapter;
    this.data = {};
    this.dirty = new Set();
    this.timer = null;
    this.chain = Promise.resolve();
  }

  async init() {
    const loaded = await this.adapter.loadAll(SCHEMAS);
    for (const t of Object.keys(SCHEMAS)) this.data[t] = loaded[t] || [];
    return this;
  }

  all(t) { return this.data[t]; }
  get(t, id) { return this.data[t].find(r => r.id === id) || null; }

  insert(t, obj) {
    const row = {};
    for (const f of Object.keys(SCHEMAS[t])) row[f] = obj[f] ?? (SCHEMAS[t][f] === 'j' ? [] : SCHEMAS[t][f] === 'b' ? false : '');
    if (!row.id) row.id = uid();
    this.data[t].push(row);
    this._touch(t);
    return row;
  }

  update(t, id, patch) {
    const row = this.get(t, id);
    if (!row) return null;
    for (const f of Object.keys(SCHEMAS[t])) if (f !== 'id' && f in patch) row[f] = patch[f];
    this._touch(t);
    return row;
  }

  remove(t, id) { return this.removeWhere(t, r => r.id === id) > 0; }

  removeWhere(t, fn) {
    const antes = this.data[t].length;
    this.data[t] = this.data[t].filter(r => !fn(r));
    const n = antes - this.data[t].length;
    if (n) this._touch(t);
    return n;
  }

  _touch(t) {
    this.dirty.add(t);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush().catch(() => {}), 300);
  }

  // Persistência serializada: nunca há duas gravações simultâneas.
  flush() {
    clearTimeout(this.timer);
    const anterior = this.chain.catch(() => {});
    this.chain = anterior.then(async () => {
      if (!this.dirty.size) return;
      const tabelas = [...this.dirty];
      this.dirty.clear();
      try {
        await this.adapter.saveTables(tabelas, this.data, SCHEMAS);
      } catch (e) {
        tabelas.forEach(t => this.dirty.add(t));
        console.error('[store] falha ao persistir:', e.message);
        throw e;
      }
    });
    return this.chain;
  }
}

module.exports = { Store, SCHEMAS, uid };
