// 只用于发送系统级通知：不缓存、不拦截任何请求，避免影响现有加载行为。
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow('/today');
  })());
});
