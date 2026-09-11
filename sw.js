// Okul Ekmek Takip - service worker
// Uygulama dosyaları önbelleğe alınır (çevrimdışı açılsın diye),
// ama Firebase/Telegram istekleri ASLA önbellekten verilmez - veri hep canlıdır.

const CACHE = 'okul-ekmek-v2-2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isLiveData =
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('api.telegram.org');

  // Canlı veri: sadece ağ, önbellek yok.
  if (isLiveData) return;

  // Uygulama dosyaları: önce ağdan dene (güncel sürüm gelsin),
  // ağ yoksa önbellekten aç.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
