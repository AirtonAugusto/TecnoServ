// Service worker: guarda a página no aparelho para abrir rápido (e atualiza em segundo plano).
// As chamadas ao servidor (POST para o Google) nunca passam pelo cache.
const VERSAO = 'informe-v1';
const BASE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const mesmaOrigem = url.origin === self.location.origin;
  if (!mesmaOrigem && url.hostname !== 'cdnjs.cloudflare.com') return;
  // Responde do cache na hora e atualiza em segundo plano (stale-while-revalidate)
  e.respondWith(caches.open(VERSAO).then(async c => {
    const guardado = await c.match(req, { ignoreSearch: true });
    const rede = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => guardado);
    return guardado || rede;
  }));
});
