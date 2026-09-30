'use strict';
const fs = require('fs');
const path = require('path');

// Armazenamento em arquivo local (data/db.json), gravação atômica.
class JsonAdapter {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
  }
  async loadAll() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.file)) return {};
    return JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }
  async saveTables(_tabelas, data) {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.file);
  }
}
module.exports = JsonAdapter;
