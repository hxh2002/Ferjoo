// 顶栏标题的单一来源：手机顶栏与桌面顶栏共用，页面名称沿用手机端已有文案。
const exactTitles = {
  '/device': '设备',
  '/diary': '日记',
  '/checkin': '诊断记录',
  '/feeding': '记录喂养',
  '/reports': '诊断报告',
  '/me': '我的',
  '/me/devices': '我的设备',
  '/me/profile': '个人资料',
  '/me/profile/edit': '编辑资料',
  '/me/invite': '我的邀请码',
  '/me/notifications': '通知设置',
  '/me/account': '修改密码',
  '/me/help': '关于与帮助',
  '/me/help/faq': '常见问题',
  '/me/help/feedback': '意见反馈',
  '/me/help/privacy': '隐私与权限',
  '/login': '登录',
  '/register': '注册',
  '/profile': '个人资料',
  '/claim': '绑定设备',
  '/admin': '概览',
  '/admin/users': '用户与权限',
  '/admin/bindings': '绑定关系',
  '/admin/rounds': '发酵轮次',
  '/admin/devices': '设备',
  '/admin/care': '养护与反馈',
  '/admin/analytics': '埋点观察'
};

export function pageTitle(route) {
  const path = route.path;
  if (typeof route.meta?.title === 'string') return route.meta.title;
  if (path === '/me/devices/add') return '添加设备';
  if (/^\/me\/devices\/[^/]+\/info$/.test(path)) return '设备信息';
  if (path.startsWith('/devices/')) return '数据详情';
  if (path.startsWith('/doctor/')) return '酵种医生';
  if (path.startsWith('/diary/records/')) return '数据详情';
  if (path.startsWith('/reports/')) return '诊断报告';
  if (path.startsWith('/me/devices/')) return '设备设置';
  return exactTitles[path] || '养护详情';
}
