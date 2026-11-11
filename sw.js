// アプリ本体をスマホに保存して、電波がなくても開けるようにする。
// 旅のデータは IndexedDB（js/store.js）に保存するので、ここでは扱わない。
// アプリを更新したら VERSION を上げる。
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`, TILES = 'tiles', FONTS = 'fonts';
const MAX_TILES = 1500; // 1枚20〜80KBほど。見た所の地図を最大でこれだけ残す

const SHELL_FILES = [
  './', 'index.html', 'style.css', 'config.js', 'manifest.webmanifest',
  'js/main.js', 'js/api.js', 'js/auth.js', 'js/store.js', 'js/util.js', 'js/list.js', 'js/detail.js', 'js/edit.js', 'js/all.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'cyberjapandata.gsi.go.jp') return e.respondWith(cacheFirst(req, TILES, true));
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(staleWhileRevalidate(req, FONTS));
  const inScope = url.href.startsWith(self.registration.scope);
  if (inScope || url.hostname === 'cdnjs.cloudflare.com') {
    if (req.mode === 'navigate') return e.respondWith(navigate(req));
    return e.respondWith(staleWhileRevalidate(req, SHELL));
  }
  // Googleログインや Apps Script の窓口はそのまま通す
});

/**
 * 画面を開くとき：保存した index.html をすぐ出し、最新版は裏で取りに行く。
 * アプリ本体を置いたMacにつながらない（寝ている・Tailscaleがオフ）ときでも待たされない。
 * 更新は次に開いたときに反映される。
 */
async function navigate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match('index.html');
  const net = fetch(req).then(res => {
    if (res.ok) cache.put('index.html', res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: name === SHELL });
  const net = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

async function cacheFirst(req, name, trim) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req, res.clone());
      if (trim && Math.random() < 0.05) trimCache(cache);
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}
