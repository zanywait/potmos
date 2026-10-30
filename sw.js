/* POTMOS:Whisky — 서비스 워커 (홈 화면 앱 설치 + 앱 껍데기 오프라인 캐시)
   - 화면(HTML)은 "네트워크 우선": 새 버전을 배포하면 바로 반영되고, 오프라인일 때만 캐시본을 보여준다.
   - 아이콘/매니페스트 등 정적 파일은 "캐시 우선".
   - API·다른 도메인 요청은 건드리지 않는다(서버 연결 시 데이터가 캐시되지 않도록).
   배포 후 캐시를 강제로 새로 받게 하려면 VERSION 만 올리면 된다. */
const VERSION = 'potmos-v40';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 라운드 37: 공개 약관 페이지(refund.html 등)는 그대로 네트워크에서 — 앱 화면(index.html) 캐시에 섞이지 않게
  if (req.mode === 'navigate' && /\/[a-z]+\.html$/i.test(url.pathname) && !/\/index\.html$/i.test(url.pathname)) {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  const isStatic = /\.(png|jpe?g|webp|svg|ico|webmanifest)$/i.test(url.pathname);
  if (!isStatic) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
