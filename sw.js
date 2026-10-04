/* Fusen の Service Worker。iPhone でホーム画面アプリとして通知やバッジを使うためのもの。
   ページのキャッシュはしない（index.html を更新したらすぐ反映されるように）。 */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
