import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import * as linkChange from '../src/lib/link-change.js';

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
// 182:885 出生日期面板底部「取消」「确定」并排；182:872 性别面板底部全宽「取消」（设计里没有「确定」）。
assert.match(profileEdit, /<MSheet :open="sheet === 'birth'[\s\S]*<template #footer>[\s\S]*class="sheet-cancel"[\s\S]*@click="closeBirthSheet"[\s\S]*class="sheet-confirm"[\s\S]*@click="confirmBirth"/);
assert.match(profileEdit, /:model-value="draftBirth\.(year|month|day)"/);
// 遮罩点击、Esc、右上角 × 全部走 MSheet 的 close，必须落到同一个丢弃草稿的取消路径。
assert.match(profileEdit, /<MSheet :open="sheet === 'birth'"[^>]*@close="closeBirthSheet"/);
assert.match(profileEdit, /<MSheet :open="sheet === 'gender'"[^>]*@close="cancelSheet"/);
// 性别面板只加一个全宽「取消」，不能凭空加「确定」。
const genderStart = profileEdit.indexOf('<MSheet :open="sheet === \'gender\'"');
const genderBlock = profileEdit.slice(genderStart, profileEdit.indexOf('</MSheet>', genderStart));
assert.match(genderBlock, /<template #footer>/, 'gender sheet renders a footer action');
assert.match(genderBlock, /class="sheet-cancel"[^>]*@click="cancelSheet"[^>]*>取消</, 'gender footer is the Cancel button');
assert.doesNotMatch(genderBlock, /sheet-confirm|确定/, 'the gender sheet has no confirm button in the design');
const birthStart = profileEdit.indexOf('<MSheet :open="sheet === \'birth\'"');
const birthBlock = profileEdit.slice(birthStart, profileEdit.indexOf('</MSheet>', birthStart));
assert.match(birthBlock, /class="sheet-cancel"[^>]*>取消</);
assert.match(birthBlock, /class="sheet-confirm"[^>]*>确定</);
assert.match(profileEdit, /\.sheet-actions\{display:grid;grid-template-columns:1fr 1fr;gap:12px\}/, 'the two birth buttons sit side by side');
assert.doesNotMatch(profileEdit, /sheet = 'birth'/, 'the birth button opens the draft snapshot instead of the sheet directly');

// 真实执行 script setup，验证出生日期滚轮只改草稿、取消（含遮罩 / Esc）丢弃、确定才提交。
async function profileSheetHarness() {
  const descriptor = parse(profileEdit).descriptor;
  const compiled = compileScript(descriptor, { id: 'profile-sheet-test' });
  const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, path) => {
    if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(path)}];`;
    return `const ${bindings.trim()} = modules[${JSON.stringify(path)}];`;
  }).replace('export default', 'return');
  const profile = Vue.ref(null);
  const user = Vue.ref({ id: 'u1' });
  const updates = [];
  const headerTone = Vue.ref('');
  const mountedHooks = [];
  const unmountHooks = [];
  const modules = {
    vue: { ...Vue, inject: (key) => (key === 'mobileHeaderTone' ? headerTone : null), onMounted: (hook) => { mountedHooks.push(hook); }, onBeforeUnmount: (hook) => { unmountHooks.push(hook); } },
    '../../composables/useAuth.js': { useAuth: () => ({ user, profile, init: async () => {}, refreshProfile: async () => {} }) },
    '../../services/auth.service.js': {
      removeAvatar: async () => {},
      uploadAvatar: async () => '',
      updateProfile: async (...args) => { updates.push(args); }
    },
    '../../lib/profile-options.js': await import('../src/lib/profile-options.js'),
    '../../components/mobile/MActionSheet.vue': {},
    '../../components/mobile/MConfirmDialog.vue': {},
    '../../components/mobile/MRadioCard.vue': {},
    '../../components/mobile/MSheet.vue': {},
    '../../components/mobile/MToast.vue': {},
    '../../components/mobile/MWheelPicker.vue': {}
  };
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const vm = Vue.proxyRefs(scope.run(() => component.setup({}, { expose() {} })));
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return { vm, updates, headerTone, mountedHooks, unmountHooks, stop: () => scope.stop() };
}

const editSheet = await profileSheetHarness();
assert.equal(editSheet.vm.birthValue, false, 'no birth date is confirmed before the sheet is opened');
editSheet.vm.openBirthSheet();
assert.equal(editSheet.vm.sheet, 'birth');
assert.deepEqual({ ...editSheet.vm.draftBirth }, { year: '2000', month: '01', day: '01' }, 'opening snapshots the confirmed date');
editSheet.vm.updateBirth('year', '1995');
editSheet.vm.updateBirth('month', '03');
editSheet.vm.updateBirth('day', '12');
assert.equal(editSheet.vm.birth.year, '2000', 'wheel edits never touch the confirmed date');
assert.equal(editSheet.vm.birthValue, false, 'wheel edits never mark the date as chosen');
// 取消 / 遮罩 / Esc / 右上角 × 都走 MSheet 的 close，最终落到 closeBirthSheet。
editSheet.vm.closeBirthSheet();
assert.equal(editSheet.vm.sheet, '');
assert.deepEqual({ ...editSheet.vm.birth }, { year: '2000', month: '01', day: '01' }, 'cancel discards the draft');
assert.equal(editSheet.vm.birthValue, false);
editSheet.vm.openBirthSheet();
assert.deepEqual({ ...editSheet.vm.draftBirth }, { year: '2000', month: '01', day: '01' }, 'reopening starts from the confirmed date again');
editSheet.vm.updateBirth('year', '1995');
editSheet.vm.updateBirth('month', '03');
editSheet.vm.updateBirth('day', '12');
editSheet.vm.confirmBirth();
assert.equal(editSheet.vm.sheet, '');
assert.deepEqual({ ...editSheet.vm.birth }, { year: '1995', month: '03', day: '12' }, 'confirm commits the draft');
assert.equal(editSheet.vm.birthValue, true, 'confirm marks the date as chosen');
assert.equal(editSheet.vm.birthLabel, '1995-03-12');
// 2 月没有 31 日：改月份后草稿日期要收回到月底，否则滚轮停在不存在的那一天。
editSheet.vm.openBirthSheet();
editSheet.vm.updateBirth('year', '2000');
editSheet.vm.updateBirth('day', '31');
editSheet.vm.updateBirth('month', '02');
assert.equal(editSheet.vm.draftBirth.day, '29', '2000 is a leap year');
assert.equal(editSheet.vm.dayOptions.length, 29);
editSheet.vm.updateBirth('year', '1999');
assert.equal(editSheet.vm.draftBirth.day, '28', 'the day is clamped to the month length');
assert.equal(editSheet.vm.birth.month, '03', 'clamping still only touches the draft');
editSheet.vm.closeBirthSheet();
// 性别：面板选项来自真实组件状态，只有「男 / 女」；已保存性别为空时入口走占位分支。
assert.deepEqual(editSheet.vm.MOBILE_GENDER_OPTIONS.map((item) => item.label), ['男', '女'], 'the mounted gender sheet offers only 男 / 女');
assert.equal(editSheet.vm.gender, '', 'an empty saved gender stays empty (placeholder 请选择性别 is shown)');
// 取消只关闭面板，不改动已选值；点选项仍是「提交并关闭」。
editSheet.vm.gender = 'male';
editSheet.vm.sheet = 'gender';
editSheet.vm.cancelSheet();
assert.equal(editSheet.vm.sheet, '');
assert.equal(editSheet.vm.gender, 'male', 'gender cancel keeps the current choice');
assert.match(profileEdit, /@update:model-value="gender = \$event; sheet = ''"/, 'choosing a gender still commits and closes');
editSheet.stop();
console.log('profile sheets: birth draft/confirm/cancel and gender cancel passed');
const profileOptions = await import('../src/lib/profile-options.js');
// 182:872 性别面板只有「男 / 女」两行，没有「未设置」。
assert.deepEqual(profileOptions.MOBILE_GENDER_OPTIONS.map((item) => item.value), ['male', 'female']);
assert.deepEqual(profileOptions.MOBILE_GENDER_OPTIONS.map((item) => item.label), ['男', '女']);
assert.equal(profileOptions.optionLabel(profileOptions.GENDER_OPTIONS, 'secret'), '保密', 'legacy values remain readable');
assert.equal(profileOptions.optionLabel(profileOptions.GENDER_OPTIONS, ''), '未设置', 'shared label lookup still resolves an empty gender');
assert.deepEqual(profileOptions.GENDER_OPTIONS.map((item) => item.value), ['', 'male', 'female', 'other', 'secret'], 'desktop options remain unchanged');
// 桌面端（ProfileView）仍使用完整 GENDER_OPTIONS，不受移动端面板影响。
assert.match(read('src/views/ProfileView.vue'), /:options="GENDER_OPTIONS"/);
assert.match(read('src/views/ProfileView.vue'), /v-for="option in GENDER_OPTIONS"/);
// 已保存性别为空时，入口仍显示「请选择性别」占位而不是「未设置」。
assert.match(profileEdit, /gender \? optionLabel\(GENDER_OPTIONS, gender\) : '请选择性别'/);
assert.match(profileEdit, /:class="\{ placeholder: !gender \}"/);
assert.doesNotMatch(genderBlock, /未设置/);
const shell = compile('src/components/MobileShell.vue');
assert.doesNotMatch(shell, /pageOwnTitle/, 'pageOwnTitle is retired: the topbar title is the only title');
assert.match(shell, /hideTopbarTitle = computed\(\(\) => isAuthPage\.value\)/, 'only login / register keep a title-less topbar');
assert.match(shell, /<h1 v-if="!hideTopbarTitle">/);
assert.doesNotMatch(read('src/router/index.js'), /pageOwnTitle/);
assert.match(read('src/router/index.js'), /name: 'mobile-profile-edit'.*title: '编辑资料'/);
// 编辑资料页与邀请码 / 修改密码页同样写 settings 语义档：挂载置 settings，卸载复位；标题只在顶栏，页内无 h1。
{
  const tone = await profileSheetHarness();
  assert.equal(tone.headerTone.value, '', 'nothing is set before mount');
  await Promise.all(tone.mountedHooks.map((hook) => hook()));
  assert.equal(tone.headerTone.value, 'settings', 'mount puts the topbar into settings tone (back arrow only)');
  tone.unmountHooks.forEach((hook) => hook());
  assert.equal(tone.headerTone.value, '', 'unmount resets the tone');
  tone.stop();
  assert.match(profileEdit, /inject\('mobileHeaderTone', null\)/);
  assert.doesNotMatch(profileEdit, /<h1/, 'the in-page title is gone; the topbar owns 编辑资料');
  assert.doesNotMatch(read('src/views/mobile/MobileProfile.vue'), /<h1/, '个人资料 title lives in the topbar only');
  // 壳：所有 tone 共用同一套玻璃顶栏，没有 tone 变体覆盖背景 / 标题档 / 换行布局。
  assert.doesNotMatch(shell, /\.mobile-subbar\.is-(feeding|detail|auth|settings)/, 'tone no longer changes topbar appearance');
  assert.doesNotMatch(shell, /返回<\/span>/, 'the topbar never renders the 返回 text');
  assert.match(shell, /aria-label="返回上一页"/, 'the icon-only back button keeps an accessible name');
  // 顶栏样式：磨砂玻璃专用令牌、无下边界线 / 内阴影、统一 20/500/29 标题与 44×44 返回键。
  const css = read('src/assets/mobile.css');
  const topbarRule = css.match(/\.mobile-area \.mobile-topbar \{[^}]*\}/)[0];
  assert.match(topbarRule, /position: sticky/);
  assert.match(topbarRule, /z-index: var\(--m-z-header\)/);
  assert.match(topbarRule, /background: var\(--m-topbar-glass\)/);
  assert.match(topbarRule, /-webkit-backdrop-filter: var\(--m-topbar-blur\); backdrop-filter: var\(--m-topbar-blur\)/);
  assert.match(topbarRule, /border-bottom: 0/);
  assert.match(topbarRule, /box-shadow: none/);
  assert.match(css, /--m-topbar-glass: rgba\(255, 249, 243, \.72\)/);
  assert.match(css, /--m-topbar-blur: blur\(16px\) saturate\(1\.4\)/);
  assert.match(css, /--m-glass: #FFF9F3;\s*--m-glass-blur: none;/, 'shared glass tokens used by cards stay untouched');
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{ :root\.mobile-mode \{ --m-topbar-glass: #FFF9F3; --m-topbar-blur: none; \} \}/);
  assert.match(css, /\.mobile-subbar h1 \{ margin: 0; font-size: 20px; font-weight: 500; line-height: 29px; letter-spacing: 0; \}/);
  assert.match(css, /\.mobile-back \{[^}]*width: 44px; min-width: 44px; min-height: 44px;/);
}
const notifications = compile('src/views/mobile/MobileNotifications.vue');
assert.match(notifications, /提醒倍数 <span class="label-sub">以喂养后高度为 1×，可多选<\/span>/);
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
assert.match(devices, /<template #footer>[\s\S]*class="starter-save"[\s\S]*@click="saveLink"/);
assert.match(devices, /:aria-pressed="linkedStarters.includes\(item.id\)"/);
assert.match(devices, /选择要关联的酵种，可多选/);
assert.match(devices, /@close="closeStarterSheet"/);
// 182:1151 修改设备名称面板底部是「取消」「保存」并排；原实现只有正文里的「保存」，缺「取消」。
assert.match(devices, /<template #footer>[\s\S]*class="rename-cancel"[\s\S]*@click="closeRename"[\s\S]*class="rename-save"[\s\S]*@click="saveRename"/);
assert.match(devices, /<MSheet :open="renameOpen" title="修改设备名称" @close="closeRename">/);
assert.match(devices, /async function saveRename\(\)[\s\S]*rename\(\)[\s\S]*renameOpen\.value = false/);

// 执行真实的 script setup，确保选择只是草稿，关闭不保存，确认成功后才提交并收起弹层。
async function starterSheetHarness() {
  const descriptor = parse(devices).descriptor;
  const compiled = compileScript(descriptor, { id: 'device-starter-sheet-test' });
  const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, path) => {
    if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(path)}];`;
    return `const ${bindings.trim()} = modules[${JSON.stringify(path)}];`;
  }).replace('export default', 'return');
  const user = Vue.ref(null);
  const state = { calls: [], renames: [], fail: false, gate: null, links: [
    { starter_id: 's1', device_id: 'd1', active_from: '2026-01-01T00:00:00Z', active_to: null },
    { starter_id: 's3', device_id: 'd2', active_from: '2026-01-01T00:00:00Z', active_to: null }
  ] };
  const service = {
    getDevice: async () => ({ device_id: 'd1', name: '设备一', my_role: 'owner', last_seen_at: new Date().toISOString() }),
    rename: async (deviceId, next) => { state.renames.push([deviceId, next]); return { name: next }; },
    members: async () => []
  };
  const modules = {
    vue: { ...Vue, onMounted() {}, onBeforeUnmount() {} },
    'vue-router': { useRoute: () => ({ params: { deviceId: 'd1' }, query: {}, fullPath: '/me/devices/d1' }), useRouter: () => ({ push() {}, replace() {} }) },
    '../../composables/useAuth.js': { useAuth: () => ({ user, profile: Vue.ref(null), init() {} }) },
    '../../services/care.service.js': { listStarters: async () => [{ id: 's1', name: '一号' }, { id: 's2', name: '二号' }, { id: 's3', name: '三号' }] },
    '../../lib/link-change.js': linkChange,
    '../../lib/read-cache.js': { invalidateReadCache() {} },
    '../../services/starter-device.service.js': {
      listStarterDeviceLinks: async () => state.links.slice(),
      linkStarterDevice: async (args) => {
        state.calls.push(args);
        if (state.gate) await state.gate;
        if (state.fail) throw new Error('link failed');
        const now = new Date().toISOString();
        for (const link of state.links) if (link.starter_id === args.starterId && link.active_to == null) link.active_to = now;
        if (args.deviceId) state.links.unshift({ starter_id: args.starterId, device_id: args.deviceId, active_from: now, active_to: null });
        return { starter_id: args.starterId, device_id: args.deviceId };
      }
    },
    '../../services/mobile-device.service.js': { mobileDeviceService: async () => service, mobileError: (cause) => cause.message, normalizeBindCode: (value) => value },
    '../../components/mobile/MConfirmDialog.vue': {}, '../../components/mobile/MSheet.vue': {}, '../../components/mobile/MToast.vue': {}
  };
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const vm = Vue.proxyRefs(scope.run(() => component.setup({}, { expose() {} })));
  user.value = { id: 'u1' };
  for (let i = 0; i < 12; i++) await Promise.resolve();
  return { state, vm, stop: () => scope.stop() };
}
const starterSheet = await starterSheetHarness();
assert.deepEqual(starterSheet.vm.savedStarters, ['s1']);
assert.deepEqual(starterSheet.vm.linkableStarters.map(item => item.id), ['s1', 's2', 's3'], 'all starters remain visible, including one linked to another device');
starterSheet.vm.openStarterSheet();
assert.deepEqual(starterSheet.vm.linkedStarters, ['s1'], 'opening restores the persisted multi-selection');
starterSheet.vm.chooseStarter('s2');
assert.deepEqual(starterSheet.vm.linkedStarters, ['s1', 's2']);
assert.equal(starterSheet.vm.starterOpen, true);
assert.equal(starterSheet.state.calls.length, 0, 'selection alone never saves');
starterSheet.vm.closeStarterSheet();
assert.equal(starterSheet.vm.starterOpen, false);
assert.deepEqual(starterSheet.vm.linkedStarters, ['s1']);
assert.deepEqual(starterSheet.vm.savedStarters, ['s1']);
assert.equal(starterSheet.state.calls.length, 0, 'closing discards the unconfirmed selection');

starterSheet.vm.openStarterSheet();
starterSheet.vm.chooseStarter('s2');
starterSheet.state.fail = true;
await starterSheet.vm.saveLink();
assert.equal(starterSheet.vm.starterOpen, true, 'failed confirmation keeps the sheet open');
assert.deepEqual(starterSheet.vm.savedStarters, ['s1']);
assert.deepEqual(starterSheet.vm.linkedStarters, ['s1'], 'a failed save reloads the persisted selection');
starterSheet.state.fail = false;
// 失败后已回读服务器状态；用户重新勾选新增酵种，再确认保存。
starterSheet.vm.chooseStarter('s2');
await starterSheet.vm.saveLink();
assert.equal(starterSheet.vm.starterOpen, false, 'successful confirmation closes the sheet');
assert.deepEqual(starterSheet.vm.savedStarters, ['s1', 's2'], 'adding a starter retains the existing association');
assert.deepEqual(starterSheet.state.calls.map(call => call.starterId), ['s2', 's2']);
assert.equal(starterSheet.vm.starterLinks.s1, 'd1');
assert.equal(starterSheet.vm.starterLinks.s2, 'd1');
assert.deepEqual(starterSheet.vm.savedStarterNames, ['一号', '二号']);

let releaseSave;
starterSheet.state.gate = new Promise(resolve => { releaseSave = resolve; });
starterSheet.vm.openStarterSheet();
starterSheet.vm.chooseStarter('s3');
assert.match(starterSheet.vm.movedStarters.map(item => item.id).join(','), /s3/, 'moving from another device is explained before saving');
const pendingSave = starterSheet.vm.saveLink();
await Promise.resolve(); await Promise.resolve();
starterSheet.vm.closeStarterSheet();
assert.equal(starterSheet.vm.starterOpen, true, 'an in-flight save is not presented as cancelled');
const callsBeforeDoubleConfirm = starterSheet.state.calls.length;
await starterSheet.vm.saveLink();
assert.equal(starterSheet.state.calls.length, callsBeforeDoubleConfirm, 'double confirmation cannot duplicate the request');
releaseSave();
await pendingSave;
assert.deepEqual(starterSheet.vm.savedStarters, ['s1', 's2', 's3']);
assert.equal(starterSheet.vm.starterOpen, false);
starterSheet.vm.openStarterSheet();
starterSheet.vm.chooseStarter('s1');
await starterSheet.vm.saveLink();
assert.equal(starterSheet.vm.starterLinks.s1, '', 'a starter can be unlinked from the same multi-select sheet');
assert.equal(starterSheet.vm.starterLinks.s2, 'd1', 'unlinking one starter leaves sibling links untouched');
assert.equal(starterSheet.vm.starterLinks.s3, 'd1');
assert.deepEqual(starterSheet.state.calls.at(-1), { userId: 'u1', starterId: 's1', deviceId: null });
// 182:1151 修改设备名称：面板底部「取消」丢弃改名，「保存」成功才回写并收起。
const renamesBefore = starterSheet.state.renames.length;
assert.equal(starterSheet.vm.name, '设备一', 'the edit field shows the loaded device name');
starterSheet.vm.openRename();
assert.equal(starterSheet.vm.renameOpen, true);
starterSheet.vm.name = '改名未保存';
starterSheet.vm.closeRename();
assert.equal(starterSheet.vm.renameOpen, false);
assert.equal(starterSheet.vm.name, '设备一', 'cancel restores the persisted name');
assert.equal(starterSheet.state.renames.length, renamesBefore, 'cancel never calls the rename API');
starterSheet.vm.openRename();
starterSheet.vm.name = '新名字';
await starterSheet.vm.saveRename();
assert.deepEqual(starterSheet.state.renames.at(-1), ['d1', '新名字'], 'save submits the edited name');
assert.equal(starterSheet.vm.renameOpen, false, 'a successful save closes the sheet');
assert.equal(starterSheet.vm.device.name, '新名字');
// 校验失败时保留面板，避免用户丢掉刚输入的内容。
starterSheet.vm.openRename();
starterSheet.vm.name = '   ';
await starterSheet.vm.saveRename();
assert.equal(starterSheet.vm.renameOpen, true, 'an invalid name keeps the sheet open');
assert.equal(starterSheet.vm.error, '设备名称须为一至八十个字符。');
starterSheet.vm.closeRename();
starterSheet.stop();
console.log('mobile devices: starter draft, cancel, confirm, failure and duplicate-save behavior passed');

const home = compile('src/views/mobile/MobileDeviceHome.vue');
assert.match(home, /<MConfirmDialog[\s\S]*danger[\s\S]*删除酵种/);
assert.match(home, /<MConfirmDialog[\s\S]*danger[\s\S]*结束当前发酵？/);
assert.match(home, /deleteStarter/);
assert.match(home, /v-if="!deleteGuard\(item\)"/, 'delete is only offered for starters without link history or records');
assert.match(home, /item\.hasLinkHistory[\s\S]*设备关联历史，不能删除/);

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
