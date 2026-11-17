// 桌面导航只负责路由与信息架构；业务数据仍由各页面原有 composable/service 管理。
export const desktopNavGroups = [
  {
    label: '发酵工作台',
    items: [
      { to: '/device', label: '设备首页', description: '实时发酵状态', icon: 'home', match: (path) => path === '/device' || path.startsWith('/devices/') },
      { to: '/diary', label: '发酵日记', description: '日历与养护记录', icon: 'calendar', match: (path) => path === '/diary' || path.startsWith('/diary/') },
      { to: '/doctor/rounds', label: '酵种医生', description: '诊断与改善建议', icon: 'doctor', match: (path) => path.startsWith('/doctor/') || path === '/checkin' || path === '/reports/session' }
    ]
  },
  {
    label: '记录与管理',
    items: [
      { to: '/doctor/records', label: '诊断报告', description: '云端历史报告', icon: 'report', match: (path) => path === '/doctor/records' || (/^\/reports\/[^/]+$/.test(path) && path !== '/reports/session') },
      { to: '/feeding', label: '记录喂养', description: '配比与目标涨幅', icon: 'feeding', match: (path) => path === '/feeding' },
      { to: '/me/devices', label: '设备中心', description: '设备与酵种绑定', icon: 'device', match: (path) => path.startsWith('/me/devices') }
    ]
  },
  {
    label: '账号与支持',
    items: [
      { to: '/me', label: '个人中心', description: '账号与应用设置', icon: 'user', match: (path) => path === '/me' || (path.startsWith('/me/') && !path.startsWith('/me/devices')) }
    ]
  }
];

const pageTitles = [
  [/^\/devices\/[^/]+\/trend/, '发酵趋势', '设备首页'],
  [/^\/diary\/records\//, '记录详情', '发酵日记'],
  [/^\/reports\/session/, '本次诊断', '酵种医生'],
  [/^\/reports\//, '报告详情', '诊断报告'],
  [/^\/doctor\/records/, '诊断报告', '酵种医生'],
  [/^\/checkin/, '诊断打卡', '酵种医生'],
  [/^\/doctor\/rounds/, '选择诊断轮次', '酵种医生'],
  [/^\/feeding/, '记录喂养', '设备首页'],
  [/^\/me\/devices\/add/, '添加设备', '设备中心'],
  [/^\/me\/devices\/[^/]+\/info/, '设备信息', '设备中心'],
  [/^\/me\/devices/, '设备中心', '个人中心'],
  [/^\/me\/profile\/edit/, '编辑资料', '个人中心'],
  [/^\/me\/notifications/, '通知设置', '个人中心'],
  [/^\/me\/help\/faq/, '常见问题', '帮助与反馈'],
  [/^\/me\/help\/feedback/, '意见反馈', '帮助与反馈'],
  [/^\/me\/help\/privacy/, '隐私政策', '帮助与反馈'],
  [/^\/me\/invite/, '邀请好友', '个人中心'],
  [/^\/me\/account/, '账号与安全', '个人中心'],
  [/^\/me/, '个人中心', '工作台'],
  [/^\/diary/, '发酵日记', '工作台'],
  [/^\/device/, '我的设备', '工作台']
];

export function desktopPageMeta(path) {
  const match = pageTitles.find(([pattern]) => pattern.test(path));
  return { title: match?.[1] || 'Dr. Ferjoo', parent: match?.[2] || '工作台' };
}
