'use strict';
const crypto = require('crypto');

const COOKIE = 'pcm_token';
const DURACAO_MS = 12 * 3600 * 1000;

function criarAuth({ senha, segredo }) {
  if (!senha) throw new Error('GESTAO_SENHA não definida');
  const chave = segredo || crypto.randomBytes(32).toString('hex');
  const hash = s => crypto.createHash('sha256').update(String(s)).digest();
  const assinar = p => crypto.createHmac('sha256', chave).update(p).digest('base64url');

  const tentativas = new Map(); // ip -> {n, ate}
  function bloqueado(ip) {
    const t = tentativas.get(ip);
    if (t && t.ate > Date.now() && t.n >= 8) return true;
    if (t && t.ate <= Date.now()) tentativas.delete(ip);
    return false;
  }

  function verificarSenha(ip, tentativa) {
    if (bloqueado(ip)) return 'bloqueado';
    const ok = crypto.timingSafeEqual(hash(tentativa || ''), hash(senha));
    if (!ok) {
      const t = tentativas.get(ip) || { n: 0, ate: Date.now() + 15 * 60000 };
      t.n++;
      tentativas.set(ip, t);
      return false;
    }
    tentativas.delete(ip);
    return true;
  }

  function emitirToken() {
    const p = Buffer.from(JSON.stringify({ exp: Date.now() + DURACAO_MS })).toString('base64url');
    return `${p}.${assinar(p)}`;
  }
  function tokenValido(tok) {
    if (!tok || !tok.includes('.')) return false;
    const [p, s] = tok.split('.');
    const esperado = assinar(p);
    if (s.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(esperado))) return false;
    try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch { return false; }
  }
  function lerCookie(req) {
    const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
    return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
  }
  function cookieHeader(req, tok, limpar) {
    const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
    return `${COOKIE}=${limpar ? '' : encodeURIComponent(tok)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${limpar ? 0 : DURACAO_MS / 1000}${seguro ? '; Secure' : ''}`;
  }
  const exigir = (req, res, next) => tokenValido(lerCookie(req)) ? next() : res.status(401).json({ erro: 'Acesso restrito à gestão. Faça login.' });

  return { verificarSenha, emitirToken, tokenValido, lerCookie, cookieHeader, exigir };
}
module.exports = { criarAuth };
