// DumPOS Service Worker — PWA offline cache
const CACHE_NAME = 'dumpos-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
];

// ติดตั้ง SW และ cache assets หลัก
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ลบ cache เก่าเมื่อ SW อัปเดต
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: ลองดึงจาก network ก่อน ถ้าไม่ได้ใช้ cache
self.addEventListener('fetch', (event) => {
  // ข้าม Supabase API requests (ต้อง online เสมอ)
  if (event.request.url.includes('supabase.co') ||
      event.request.url.includes('telegram.org')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // cache ไฟล์ static ใหม่
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});
