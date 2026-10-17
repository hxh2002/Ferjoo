self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data?.json() || {}; } catch { data = { title: 'Ferjoo 高度提醒', body: event.data?.text() || '' }; }
    await self.registration.showNotification(data.title || 'Ferjoo 高度提醒', {
      body: data.body || '本轮酵种高度已达到预约阈值。',
      tag: data.tag || 'ferjoo-height-alert',
      icon: '/assets/logo-brand.png',
      badge: '/assets/logo-brand.png',
      data: { url: typeof data.url === 'string' ? data.url : '/today' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const requested = event.notification.data?.url;
    let target = new URL('/today', self.location.origin);
    try {
      const candidate = new URL(requested, self.location.origin);
      if (candidate.origin === self.location.origin && candidate.pathname === '/today') target = candidate;
    } catch { /* Invalid or external destinations always fall back to today. */ }
    target = target.href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        if ('navigate' in client && client.url !== target) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
