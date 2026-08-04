// Минимальный service worker. Единственная задача — удовлетворить критерий
// "installability" у браузера (Chrome и большинство других требуют
// зарегистрированный service worker с обработчиком fetch, чтобы вообще
// предложить установку на главный экран).
//
// Сознательно НЕ кэширует данные приложения: Switch Inspector — живой
// инструмент с постоянно обновляющимися данными (свитчи, живые
// обновления через SSE), и агрессивное кэширование могло бы показывать
// устаревшую информацию вместо реальной. Все запросы просто прозрачно
// уходят в сеть, как будто service worker'а нет вовсе.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
