/* Fusen の Service Worker
   - オフラインでも起動できるよう、アプリ本体（index.html など）を保存しておく。
   - 本体は「通信を優先」：つながるときは毎回最新を取りに行き、保存も更新する（index.html を更新したらすぐ反映）。
     つながらない・遅い（3.5秒）ときだけ、保存しておいた版で起動する。
   - 同期用の Firebase の部品とフォントは、版ごとにURLが固定なので「保存を優先」。
   - Firestore・ログインなどの通信には手を出さない（Firebase 側が自分でオフライン対応する）。 */
const CACHE = 'fusen-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'favicon.ico', 'favicon-32.png', 'favicon-16.png'];
const TIMEOUT = 3500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('fusen-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
  return res;
};

/* 通信を優先。失敗・時間切れなら保存した版。ページ遷移なら最後の手段として index.html */
function networkFirst(e) {
  const req = e.request, nav = req.mode === 'navigate';
  const fromCache = () => caches.match(req, { ignoreSearch: nav })
    .then(r => r || (nav ? caches.match('index.html').then(x => x || caches.match('./')) : undefined));
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const net = fetch(req).then(res => {
      if (nav && res.ok) put(new Request(new URL('index.html', self.registration.scope)), res.clone());
      return put(req, res);
    });
    e.waitUntil(net.catch(() => {}));
    const timer = setTimeout(() => fromCache().then(finish), TIMEOUT);
    net.then(r => { clearTimeout(timer); finish(r); })
       .catch(() => { clearTimeout(timer); fromCache().then(r => { if (r) finish(r); else if (!done) { done = true; resolve(Response.error()); } }); });
  });
}

/* 保存を優先（なければ取りに行って保存） */
function cacheFirst(req) {
  return caches.match(req).then(r => r || fetch(req).then(res => put(req, res)));
}

/* 保存した版をすぐ返し、裏で更新 */
function staleWhileRevalidate(e) {
  const req = e.request;
  const net = fetch(req).then(res => put(req, res));
  e.waitUntil(net.catch(() => {}));
  return caches.match(req).then(r => r || net);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) { e.respondWith(networkFirst(e)); return; }
  if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) { e.respondWith(cacheFirst(req)); return; }
  if (u.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req)); return; }
  if (u.hostname === 'fonts.googleapis.com') { e.respondWith(staleWhileRevalidate(e)); return; }
  /* それ以外（Firestore・ログインなど）は素通し */
});
