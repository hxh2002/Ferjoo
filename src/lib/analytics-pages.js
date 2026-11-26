// 埋点的 page 列必须以小写字母开头。路由路径不能直接写入，这里收成稳定的页面名。
// 设备数据页已有自己的停留事件，外壳不再重复记一次。
// 旧地址在路由里会跳走；若事件仍带着旧路径，记到跳转后的页面上。

const UNTRACKED = new Set(['', 'admin', 'login', 'register', 'welcome', 'device_trend']);

export function analyticsPage(path) {
  const value = String(path || '');
  if (value === '/device' || value === '/today') return 'device';
  if (/^\/devices\/[^/]+\/trend$/.test(value)) return 'device_trend';
  if (value === '/diary' || value === '/records') return 'diary';
  if (value.startsWith('/diary/records/') || /^\/records\/[^/]+$/.test(value)) return 'record_detail';
  if (value === '/doctor/rounds' || value === '/checkin') return 'doctor';
  if (value === '/doctor/records' || value === '/history') return 'doctor_records';
  if (value.startsWith('/reports/')) return 'report';
  if (value === '/feeding') return 'feeding';
  if (value === '/claim') return 'claim';
  if (value === '/me/devices/add') return 'device_add';
  if (/^\/me\/devices\/[^/]+\/info$/.test(value)) return 'device_info';
  if (/^\/me\/devices\/[^/]+$/.test(value)) return 'device_settings';
  if (value === '/me/devices' || value.startsWith('/me/devices/')) return 'devices';
  if (value === '/me/notifications') return 'notifications';
  if (value === '/me/profile/edit') return 'profile_edit';
  if (value === '/me/profile' || value === '/profile') return 'profile';
  if (value === '/me/invite') return 'invite';
  if (value === '/me/account') return 'account';
  if (value === '/me/help/faq') return 'faq';
  if (value === '/me/help/feedback') return 'feedback';
  if (value === '/me/help/privacy') return 'privacy';
  if (value === '/me/help') return 'help';
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
