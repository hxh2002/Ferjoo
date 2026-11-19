// 埋点的 page 列必须以小写字母开头。路由路径不能直接写入，这里收成稳定的页面名。
// 设备数据页已有自己的停留事件，外壳不再重复记一次。

const UNTRACKED = new Set(['', 'admin', 'login', 'register', 'welcome', 'device_trend']);

export function analyticsPage(path) {
  const value = String(path || '');
  if (value === '/device' || value === '/today') return 'device';
  if (/^\/devices\/[^/]+\/trend$/.test(value)) return 'device_trend';
  if (value === '/diary') return 'diary';
  if (value.startsWith('/diary/records/')) return 'record_detail';
  if (value === '/doctor/rounds' || value === '/checkin') return 'doctor';
  if (value === '/doctor/records') return 'doctor_records';
  if (value.startsWith('/reports/')) return 'report';
  if (value === '/feeding') return 'feeding';
  if (value.startsWith('/me/devices') || value === '/claim') return 'devices';
  if (value === '/me/notifications') return 'notifications';
  if (value === '/me' || value.startsWith('/me/')) return 'me';
  if (value === '/admin' || value.startsWith('/admin/')) return 'admin';
  if (value === '/login') return 'login';
  if (value === '/register') return 'register';
  if (value === '/') return 'welcome';
  return '';
}

export function dwellPageFor(path) {
  const page = analyticsPage(path);
  return UNTRACKED.has(page) ? '' : page;
}
