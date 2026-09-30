'use strict';
try { process.loadEnvFile?.(); } catch { /* .env é opcional */ }
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { criarApp } = require('./lib/app');
const { Store } = require('./lib/store');

async function criarStore() {
  const tipo = (process.env.STORAGE || 'json').toLowerCase();
  const dir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
  let adapter;
  if (tipo === 'sheets') {
    const SheetsAdapter = require('./lib/adapters/sheets');
    adapter = new SheetsAdapter({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      credentialsJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  } else {
    const JsonAdapter = require('./lib/adapters/json');
    adapter = new JsonAdapter(dir);
  }
  console.log(`[pcm] armazenamento: ${tipo}`);
  return { store: await new Store(adapter).init(), dir };
}

if (require.main === module) {
  (async () => {
    if (!process.env.GESTAO_SENHA) { console.error('Defina GESTAO_SENHA (veja .env.example).'); process.exit(1); }
    if (!process.env.SESSION_SECRET) console.warn('[pcm] SESSION_SECRET não definido: logins da gestão expiram a cada reinício.');
    const { store, dir } = await criarStore();
    const uploads = path.join(dir, 'uploads');
    fs.mkdirSync(uploads, { recursive: true });
    const app = criarApp({ store, senha: process.env.GESTAO_SENHA, segredo: process.env.SESSION_SECRET, uploadsDir: uploads });
    const porta = Number(process.env.PORT) || 3000;
    app.listen(porta, () => console.log(`[pcm] rodando em http://localhost:${porta}`));
    const sair = async () => { try { await store.flush(); } finally { process.exit(0); } };
    process.on('SIGINT', sair); process.on('SIGTERM', sair);
  })().catch(e => { console.error(e); process.exit(1); });
}
module.exports = { criarStore, express };
