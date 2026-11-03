// POTMOS 운영 콘솔(PWA) — 껍데기만 캐시. 콘솔 화면 · 데이터는 항상 서버에서(관리자 키 필요) 받는다
const C = 'potmos-ops-v3', SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;           // API(관리자 키) 요청은 건드리지 않는다
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
});

/* 라운드 114(B): 운영자 푸시 — 생성요청 · 소명 · 신고 · 피드백 */
self.addEventListener('push', e => { let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) {}
  const page = { potreq: 'requests', appeal: 'restrict', report: 'reports', feedback: 'feedback' }[d.tag] || '';
  e.waitUntil(self.registration.showNotification(d.title || 'POTMOS 운영', { body: d.body || '', tag: d.tag || 'ops', renotify: true, icon: './icon-192.png', badge: './icon-192.png', data: { url: './' + (page ? '?page=' + page : '') } })); });
self.addEventListener('notificationclick', e => { e.notification.close(); const url = new URL((e.notification.data && e.notification.data.url) || './', self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { const c = list[0]; if (c) { try { c.navigate && c.navigate(url); } catch (err) {} return c.focus(); } return self.clients.openWindow(url); })); });
