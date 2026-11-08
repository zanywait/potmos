/* POTMOS:Whisky — 서비스 워커 (홈 화면 앱 설치 + 앱 껍데기 오프라인 캐시)
   - 화면(HTML)은 "네트워크 우선": 새 버전을 배포하면 바로 반영되고, 오프라인일 때만 캐시본을 보여준다.
   - 아이콘/매니페스트 등 정적 파일은 "캐시 우선".
   - API·다른 도메인 요청은 건드리지 않는다(서버 연결 시 데이터가 캐시되지 않도록).
   배포 후 캐시를 강제로 새로 받게 하려면 VERSION 만 올리면 된다. */
const VERSION = 'potmos-v175';
// 라운드 168: 내장 에셋(assets/emb · 이름 = 내용 해시라 바뀌지 않음)은 버전과 따로 오래 두는 캐시 — 앱을 업데이트해도 다시 받지 않는다
const EMB = 'potmos-emb-1';
const isEmb = (p) => /\/assets\/emb\/[0-9a-f]{12}\.(webp|png|jpg|mp3)$/i.test(p);
async function warmEmb(){   // 설치 · 업데이트 뒤 한 번: 아직 없는 이미지만 조용히 받아 둔다(하나씩 · 실패는 다음에 다시)
  try{
    const c = await caches.open(EMB), r = await fetch('./assets/emb/manifest.json', { cache:'no-cache' }); if(!r.ok) return;
    const list = await r.json();
    for(const f of list){ const u = './assets/emb/' + f; if(await c.match(u)) continue; try{ const res = await fetch(u); if(res.ok) await c.put(u, res); }catch(e){} }
  }catch(e){}
}
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest-supabase.webmanifest',
  './icons/icon-192.png',
  './icons/badge-96.png',
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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== EMB).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => { warmEmb(); })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/ops(\/|$)/.test(url.pathname)) return;   // 라운드 84: 운영 콘솔(PWA)은 자기 서비스 워커가 맡는다 — 앱 캐시(index.html)에 섞이지 않게

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

  if (isEmb(url.pathname)) {   // 라운드 168: 내장 에셋 = 오래 두는 캐시 우선 · 네트워크가 한 번 끊겨도 한 번 더 받아 본다
    e.respondWith(caches.open(EMB).then((c) => c.match(req, { ignoreSearch:true }).then((hit) => hit || fetch(req).catch(() => fetch(req)).then((res) => {
      if (res && res.ok && !url.search) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  const isStatic = /\.(png|jpe?g|webp|svg|ico|webmanifest|mp3)$/i.test(url.pathname);   // 라운드 166: 그 밖의 정적 파일도 캐시 우선
  if (!isStatic) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

/* 라운드 112: 휴대폰 푸시 알림 — 서버(Web Push · aes128gcm)가 보낸 { title, body, tag, url } 을 알림으로 띄우고, 누르면 앱을 연다 */
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'POTMOS';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', tag: d.tag || 'potmos', renotify: !!d.tag, icon: './icons/icon-192.png', badge: './icons/badge-96.png',
    data: { url: d.url || './' }, vibrate: [80, 40, 80],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => c.url.split('#')[0] === url) || list[0];
    if (same) { try { same.navigate && same.url.split('#')[0] !== url && same.navigate(url); } catch (err) {} return same.focus(); }
    return self.clients.openWindow(url);
  }));
});
