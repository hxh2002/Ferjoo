import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function compile(file) {
  const source = read(file);
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, [], file);
  const script = compileScript(descriptor, { id: file });
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, [], file);
  return source;
}

const me = compile('src/views/mobile/MobileMe.vue');
assert.match(me, /个人资料/);
assert.match(me, /我的设备/);
assert.match(me, /设置/);
assert.match(me, /通知设置/);
assert.match(me, /关于与帮助/);
assert.match(me, /\/me\/profile/);
assert.match(me, /管理已绑定的设备/);
assert.match(me, /row-icon/);
assert.match(me, /<MConfirmDialog[\s\S]*danger[\s\S]*退出登录/);

const profile = compile('src/views/mobile/MobileProfile.vue');
assert.match(profile, /未设置/);
assert.match(profile, /性别/);
assert.match(profile, /出生日期/);
assert.match(profile, /身份/);
const profileEdit = compile('src/views/mobile/MobileProfileEdit.vue');
assert.match(profileEdit, /MOBILE_GENDER_OPTIONS/);
assert.match(profileEdit, /:options="MOBILE_GENDER_OPTIONS"/);
assert.match(profileEdit, /label="性别" marker="end"/);
const profileOptions = await import('../src/lib/profile-options.js');
assert.deepEqual(profileOptions.MOBILE_GENDER_OPTIONS.map((item) => item.value), ['', 'male', 'female']);
assert.equal(profileOptions.optionLabel(profileOptions.GENDER_OPTIONS, 'secret'), '保密', 'legacy values remain readable');
assert.equal(profileOptions.GENDER_OPTIONS.length, 5, 'desktop options remain unchanged');
const shell = compile('src/components/MobileShell.vue');
assert.match(shell, /route\.meta\.pageOwnTitle === true/);
assert.match(shell, /<h1 v-if="!hideTopbarTitle">/);
assert.match(read('src/router/index.js'), /name: 'mobile-profile-edit'.*pageOwnTitle: true/);
const notifications = compile('src/views/mobile/MobileNotifications.vue');
assert.match(notifications, /每个酵种的提醒倍数/);
assert.match(notifications, /以喂养后的起始高度为 1×/);
assert.match(notifications, /起始高度的 \$\{target\} 倍/);

const toasts = {
  'src/views/mobile/MobileProfileEdit.vue': '资料已保存',
  'src/views/mobile/MobileInvite.vue': '邀请码已复制',
  'src/views/mobile/MobileAccount.vue': '密码修改成功',
  'src/views/mobile/MobileDevices.vue': '设置已保存',
  'src/views/mobile/MobileFeedback.vue': '反馈已提交',
  'src/views/mobile/MobileFeedback.vue#error': '请填写反馈内容',
  'src/views/mobile/MobileDevices.vue#offline': '设备仍离线',
  'src/views/mobile/MobileDevices.vue#empty': '暂无新数据'
};
for (const [file, text] of Object.entries(toasts)) assert.match(read(file.split('#')[0]), new RegExp(text));
assert.doesNotMatch(read('src/views/mobile/MobileInvite.vue'), /邀请码已复制。/);
assert.match(compile('src/views/mobile/MobileInvite.vue'), /点击复制邀请码/);
assert.match(read('src/views/mobile/MobileInvite.vue'), /还可邀请/);
assert.doesNotMatch(read('src/views/mobile/MobileAccount.vue'), /密码修改成功。/);
assert.match(compile('src/views/mobile/MobileAccount.vue'), /确认修改/);
assert.match(read('src/views/mobile/MobileAccount.vue'), /为了账号安全，请先验证当前密码。/);
assert.match(compile('src/views/mobile/MobileDeviceInfo.vue'), /待设备上报/);
assert.match(read('src/views/mobile/MobileDeviceInfo.vue'), /排查连接问题时，可提供设备编号和固件版本。/);

const devices = compile('src/views/mobile/MobileDevices.vue');
assert.match(devices, /<MConfirmDialog[\s\S]*danger[\s\S]*解除绑定/);
assert.match(devices, /设备仍离线/);
assert.match(devices, /暂无新数据/);
assert.match(devices, /linkableStarters/);
assert.match(devices, /m-skeleton/);
assert.match(devices, /height:64px/);
assert.match(devices, /nav-device-active\.svg/);
assert.match(devices, /暂无设备/);
assert.match(devices, /添加设备，查看数据并关联酵种。/);
assert.match(devices, />设备设置</);
const home = compile('src/views/mobile/MobileDeviceHome.vue');
assert.match(home, /<MConfirmDialog[\s\S]*danger[\s\S]*删除酵种/);
assert.match(home, /<MConfirmDialog[\s\S]*danger[\s\S]*结束当前发酵？/);
assert.match(home, /deleteStarter/);
assert.match(home, /v-if="!item\.link"/);

const add = compile('src/views/mobile/MobileDeviceAdd.vue');
const emptyAt = add.indexOf('请输入设备编号。');
const claimAt = add.indexOf('service.claim');
assert.ok(emptyAt > -1 && claimAt > emptyAt, 'an empty device id returns before any claim request');
assert.match(add, /if \(!code\.value\.trim\(\)\)/);

const router = read('src/router/index.js');
const addRoute = router.indexOf("path: 'me/devices/add'");
const infoRoute = router.indexOf("path: 'me/devices/:deviceId/info'");
const idRoute = router.indexOf("path: 'me/devices/:deviceId'");
assert.ok(addRoute > -1 && infoRoute > addRoute && idRoute > infoRoute, 'add and info stay ahead of the device id route');
assert.match(router, /to\.query\.feeding \|\| to\.query\.edit === 'session'/);

compile('src/views/mobile/MobileFaq.vue');
compile('src/views/mobile/MobileFeedback.vue');
compile('src/views/mobile/MobilePrivacy.vue');
compile('src/views/mobile/MobileDeviceInfo.vue');
compile('src/views/mobile/MobileHelp.vue');

console.log('mobile me: sections, empty profile, toasts, danger confirm and device id passed');

// --- 游客态：统一空态组件 + redirect 回跳保留 ---
const { authPhase, isGuest, isAuthPending, guestRedirectPath, guestLoginTarget, guestRegisterTarget } = await import('../src/lib/mobile-guest.js');
const pending = { user: { value: null }, ready: { value: false } };
const member = { user: { value: { id: 'u1' } }, ready: { value: true } };
const visitor = { user: { value: null }, ready: { value: true } };
// ready 未就绪时既不是游客也不是成员：页面必须出骨架屏，不能先闪一下「去登录」。
assert.equal(authPhase(pending), 'pending');
assert.equal(isAuthPending(pending), true);
assert.equal(isGuest(pending), false);
assert.equal(authPhase(member), 'member');
assert.equal(authPhase(visitor), 'guest');
// 只注入 user 的旧调用方按已就绪处理。
assert.equal(isGuest({ user: { value: null } }), true);

assert.equal(guestRedirectPath({ path: '/diary', query: { from: '2026-11-08', to: '2026-11-08', page: '2', scroll: '640', starter: 's1' } }), '/diary?from=2026-11-08&to=2026-11-08&page=2&starter=s1');
assert.equal(guestRedirectPath({ path: '/diary' }), '/diary');
assert.equal(guestRedirectPath({ path: '/device', query: { from: ['a', ''] } }), '/device?from=a');
assert.equal(guestRedirectPath(undefined), '/device');
assert.deepEqual(guestLoginTarget({ path: '/me' }), { name: 'mobile-login', query: { redirect: '/me' } });
assert.deepEqual(guestRegisterTarget({ path: '/me' }), { name: 'mobile-register', query: { redirect: '/me' } });
// 登录页自身不能成为回跳目标，否则登录成功会原地打转。
assert.equal(guestRedirectPath({ path: '/login', query: {} }), '/login');

const guestNotice = compile('src/components/mobile/MGuestNotice.vue');
assert.match(guestNotice, /data-testid="guest-notice"/);
assert.match(guestNotice, /loginTo: \{ type: Object, required: true \}/);
assert.match(guestNotice, /is-compact|is-hero/);
assert.doesNotMatch(guestNotice, /border-radius:\s*999px|#[0-9a-f]{3,8}\b/i, 'guest notice must use color tokens');

// 每个游客可达页面都必须复用同一个空态组件，并带上 redirect 目标。
for (const file of [
  'src/views/mobile/MobileDeviceHome.vue',
  'src/views/mobile/MobileDiary.vue',
  'src/views/mobile/MobileTrend.vue',
  'src/views/mobile/MobileMe.vue',
  'src/views/mobile/MobileDoctorRounds.vue',
  'src/views/mobile/MobileCheckin.vue',
  'src/views/mobile/MobileFeeding.vue'
]) {
  const page = compile(file);
  assert.match(page, /MGuestNotice/, `${file} reuses the shared guest notice`);
  assert.match(page, /isAuthPending|isGuest/, `${file} distinguishes a pending session from a guest`);
}
// 云端观察记录只对登录用户开放：游客只看到登录引导。
assert.match(read('src/views/mobile/MobileReport.vue'), /MGuestNotice[\s\S]*guestLoginTarget/);
// 游客不应再写死桌面登录地址，否则会跳出 MobileShell。
for (const file of ['MobileDeviceHome', 'MobileDiary', 'MobileTrend', 'MobileMe', 'MobileDoctorRounds', 'MobileCheckin', 'MobileFeeding', 'MobileReport']) {
  const page = read(`src/views/mobile/${file}.vue`);
  assert.doesNotMatch(page, /path: '\/login'|to="\/login/, `${file} links to the mobile login route`);
}
console.log('mobile guest: phase detection, redirect preservation, shared notice and per-page wiring passed');
