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
compile('src/views/mobile/MobileProfileEdit.vue');

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
assert.doesNotMatch(read('src/views/mobile/MobileAccount.vue'), /密码修改成功。/);

const devices = compile('src/views/mobile/MobileDevices.vue');
assert.match(devices, /<MConfirmDialog[\s\S]*danger[\s\S]*解除绑定/);
assert.match(devices, /设备仍离线/);
assert.match(devices, /暂无新数据/);
assert.match(devices, /linkableStarters/);
assert.match(devices, /m-skeleton/);
assert.match(devices, /height:64px/);
assert.match(devices, /jar-body\.svg/);
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
