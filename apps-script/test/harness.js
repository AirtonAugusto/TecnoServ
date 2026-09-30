'use strict';
// Executa o Code.gs no Node com mocks de SpreadsheetApp/DriveApp/etc. (Apps Script não roda localmente).
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function criarAmbiente({ props = {} } = {}) {
  const planilhas = {}; // nome -> matriz (linha 0 = cabeçalho)
  const arquivos = {};
  const propriedades = { ...props };
  const cacheMem = {};
  const sheet = nome => {
    const m = planilhas[nome];
    const rng = (r, c, nr = 1, nc = 1) => ({
      setValues(v) { for (let i = 0; i < v.length; i++) { m[r - 1 + i] = m[r - 1 + i] || []; for (let j = 0; j < v[i].length; j++) m[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
      setFontWeight() { return this; }, setNumberFormat() { return this; },
    });
    return {
      getDataRange: () => ({ getValues: () => m.map(l => l.slice()) }),
      getRange: (a, b, c, d) => typeof a === 'string' ? rng(1, 1) : rng(a, b, c, d),
      appendRow: v => { m.push(v.slice()); },
      getLastRow: () => m.length,
      deleteRow: n => { m.splice(n - 1, 1); },
      setFrozenRows() {},
    };
  };
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, parseInt, parseFloat,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: n => planilhas[n] ? sheet(n) : null,
      insertSheet: n => { planilhas[n] = []; return sheet(n); },
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => propriedades[k] ?? null, setProperty: (k, v) => { propriedades[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cacheMem[k] ?? null, put: (k, v) => { cacheMem[k] = v; }, remove: k => { delete cacheMem[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log() {} },
    DriveApp: {
      createFolder: nome => ({ getId: () => 'pasta1', createFile: b => { const id = 'arq' + Object.keys(arquivos).length; arquivos[id] = b; return { getId: () => id }; } }),
      getFolderById: id => { if (id !== 'pasta1') throw new Error('sem pasta'); return { createFile: b => { const i = 'arq' + Object.keys(arquivos).length; arquivos[i] = b; return { getId: () => i }; } }; },
      getFileById: id => ({ getBlob: () => ({ getContentType: () => arquivos[id].type, getBytes: () => arquivos[id].bytes }) }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, fmt) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
      base64Decode: s => [...Buffer.from(s, 'base64')],
      base64Encode: b => Buffer.from(b).toString('base64'),
      base64EncodeWebSafe: b => Buffer.from(typeof b === 'string' ? b : b).toString('base64url'),
      base64DecodeWebSafe: s => [...Buffer.from(s, 'base64url')],
      newBlob: (bytes, type, nome) => ({ bytes, type, nome, getDataAsString: () => Buffer.from(bytes).toString() }),
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()],
    },
    HtmlService: { createHtmlOutputFromFile: n => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; }, arquivo: n }), XFrameOptionsMode: { ALLOWALL: 1 } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  return { ctx, planilhas, arquivos, propriedades, rpc: (m, a) => JSON.parse(JSON.stringify(ctx.rpc(m, a))) };
}
module.exports = { criarAmbiente };
