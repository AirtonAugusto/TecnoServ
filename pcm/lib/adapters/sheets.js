'use strict';
// Armazenamento no Google Sheets: cada tabela vira uma aba (linha 1 = cabeçalho).
// Compartilhe a planilha (como Editor) com o e-mail da conta de serviço.
const fs = require('fs');

class SheetsAdapter {
  constructor({ spreadsheetId, credentialsJson, keyFile }) {
    if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID não definido');
    let google;
    try { ({ google } = require('googleapis')); }
    catch { throw new Error('Pacote "googleapis" não instalado. Rode: npm install googleapis'); }
    let credentials;
    if (credentialsJson) {
      credentials = credentialsJson.trim().startsWith('{') ? JSON.parse(credentialsJson) : JSON.parse(fs.readFileSync(credentialsJson, 'utf8'));
    }
    const auth = new google.auth.GoogleAuth({
      ...(credentials ? { credentials } : { keyFile }),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.id = spreadsheetId;
  }

  async _garantirAbas(nomes) {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.id, fields: 'sheets.properties.title' });
    const existentes = new Set(meta.data.sheets.map(s => s.properties.title));
    const faltam = nomes.filter(n => !existentes.has(n));
    if (faltam.length) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.id,
        requestBody: { requests: faltam.map(title => ({ addSheet: { properties: { title } } })) },
      });
    }
    return faltam;
  }

  async loadAll(schemas) {
    const nomes = Object.keys(schemas);
    await this._garantirAbas(nomes);
    const res = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.id,
      ranges: nomes.map(n => `${n}!A:Z`),
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const out = {};
    nomes.forEach((nome, i) => {
      const [cab, ...linhas] = res.data.valueRanges[i].values || [];
      out[nome] = [];
      if (!cab) return;
      for (const l of linhas) {
        if (!l.length || l.every(c => c === '')) continue;
        const row = {};
        for (const [campo, tipo] of Object.entries(schemas[nome])) {
          const v = l[cab.indexOf(campo)];
          if (tipo === 'b') row[campo] = v === true || String(v).toLowerCase() === 'true';
          else if (tipo === 'j') { try { row[campo] = v ? JSON.parse(v) : []; } catch { row[campo] = []; } }
          else row[campo] = v === undefined || v === null ? '' : String(v);
        }
        out[nome].push(row);
      }
    });
    // cabeçalhos das abas novas
    for (const nome of nomes) if (!(res.data.valueRanges[nomes.indexOf(nome)].values || []).length) await this._gravar(nome, schemas[nome], []);
    return out;
  }

  async _gravar(nome, schema, linhas) {
    const campos = Object.keys(schema);
    const valores = [campos, ...linhas.map(r => campos.map(c =>
      schema[c] === 'j' ? JSON.stringify(r[c] ?? []) : schema[c] === 'b' ? !!r[c] : String(r[c] ?? '')))];
    await this.sheets.spreadsheets.values.clear({ spreadsheetId: this.id, range: `${nome}!A:Z` });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.id, range: `${nome}!A1`, valueInputOption: 'RAW', requestBody: { values: valores },
    });
  }

  async saveTables(tabelas, data, schemas) {
    for (const t of tabelas) await this._gravar(t, schemas[t], data[t]);
  }
}
module.exports = SheetsAdapter;
