'use strict';
// Datas trabalhadas como string "YYYY-MM-DD" para evitar problemas de fuso.
const TZ = () => process.env.TZ || 'America/Sao_Paulo';
const RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(s) {
  if (typeof s !== 'string' || !RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diaSemana(s) { // 0=domingo
  return new Date(s + 'T00:00:00Z').getUTCDay();
}
function segunda(s) {
  const dow = diaSemana(s);
  return addDays(s, dow === 0 ? -6 : 1 - dow);
}
// Semana ISO 8601 (semana começa na segunda; semana 1 contém a primeira quinta)
function semanaISO(s) {
  const d = new Date(s + 'T00:00:00Z');
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const ano = d.getUTCFullYear();
  const ini = new Date(Date.UTC(ano, 0, 1));
  return { ano, numero: Math.ceil(((d - ini) / 86400000 + 1) / 7) };
}
function intervalo(de, ate) {
  const out = [];
  for (let d = de; d <= ate && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
module.exports = { isDate, hoje, addDays, segunda, semanaISO, diaSemana, intervalo };
