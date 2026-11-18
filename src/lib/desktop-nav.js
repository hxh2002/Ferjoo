// 桌面侧栏只是同一批路由的另一种导航呈现：名称沿用手机端页面标题，业务数据仍由各页面的 composable/service 管理；需登录的入口与手机端一样，由路由守卫引导登录。
export const desktopNavItems = [
  { to: '/device', label: '设备', icon: 'home', match: (path) => path === '/device' || path.startsWith('/devices/') },
  { to: '/diary', label: '日记', icon: 'calendar', match: (path) => path === '/diary' || path.startsWith('/diary/') },
  { to: '/doctor/rounds', label: '酵种医生', icon: 'doctor', match: (path) => path === '/doctor/rounds' || path === '/checkin' || path === '/reports/session' },
  { to: '/doctor/records', label: '诊断记录', icon: 'report', match: (path) => path === '/doctor/records' || (/^\/reports\/[^/]+$/.test(path) && path !== '/reports/session') },
  { to: '/feeding', label: '记录喂养', icon: 'feeding', match: (path) => path === '/feeding' },
  { to: '/me/devices', label: '设备绑定', icon: 'device', match: (path) => path.startsWith('/me/devices') || path === '/claim' },
  { to: '/me', label: '我的', icon: 'user', match: (path) => path === '/me' || (path.startsWith('/me/') && !path.startsWith('/me/devices')) }
];

// 后台只出现在桌面侧栏，且仅管理员可见。它不是手机底部标签，也不进入上面的产品导航。
export const adminNavItems = [
  { to: '/admin', label: '概览', icon: 'overview', match: (path) => path === '/admin' },
  { to: '/admin/users', label: '用户与权限', icon: 'user', match: (path) => path.startsWith('/admin/users') },
  { to: '/admin/bindings', label: '绑定关系', icon: 'link', match: (path) => path.startsWith('/admin/bindings') },
  { to: '/admin/rounds', label: '发酵轮次', icon: 'rounds', match: (path) => path.startsWith('/admin/rounds') },
  { to: '/admin/devices', label: '设备', icon: 'device', match: (path) => path.startsWith('/admin/devices') },
  { to: '/admin/care', label: '养护与反馈', icon: 'care', match: (path) => path.startsWith('/admin/care') }
];
