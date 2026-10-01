// Service worker: guarda a página no aparelho para abrir rápido e funcionar com internet fraca.
// Estratégia "rede primeiro": sempre tenta a versão nova e só usa o guardado se a rede falhar.
// As chamadas ao servidor (POST para o Google) nunca passam pelo cache.
const VERSAO = 'informe-v2';
const BASE = ['./', 'index.html', 'css/app.css', 'manifest.json', 'logo.png', 'icon-192.png', 'icon-512.png',
  'js/core.js', 'js/login.js', 'js/operacional.js', 'js/adm.js', 'js/dashboard.js', 'js/programacao.js', 'js/relatorios.js', 'js/cadastros.js', 'js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(r => {
    if (r && r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
