<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService, mobileError, normalizeBindCode } from '../../services/mobile-device.service.js';
const router = useRouter();
const route = useRoute();
const auth = useAuth();
const devices = ref([]);
const device = ref(null);
const members = ref([]);
const code = ref('');
const confirmed = ref(false);
const name = ref('');
const target = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
let version = 0;
const userId = computed(() => auth.user.value?.id || '');
const deviceId = computed(() => String(route.params.deviceId || ''));
const manager = computed(() => device.value?.my_role === 'owner' || (auth.profile.value?.id === userId.value && auth.profile.value?.role === 'A'));
const mySystemId = computed(() => auth.profile.value?.id === userId.value ? auth.profile.value?.system_user_id : '');
function context() { return { version, user: userId.value, device: deviceId.value }; }
function current(c) { return c.version === version && c.user === userId.value && c.device === deviceId.value; }
async function load() {
  const c = context();
  loading.value = true;
  error.value = '';
  try {
    const service = await mobileDeviceService();
    if (c.device) {
      const info = await service.getDevice(c.device, c.user);
      if (!current(c)) return;
      device.value = info;
      if (!info) { error.value = '设备不存在或共享权限已变化。'; return; }
      name.value = info.name || '';
      if (manager.value) {
        const list = await service.members(c.device);
        if (current(c)) members.value = list || [];
      }
    } else {
      const rows = await service.listDevices(c.user);
      if (!current(c)) return;
      devices.value = rows.map((d) => ({ ...d, quality: '质量尚未读取' }));
      await Promise.all(rows.map(async (d) => {
        try {
          const latest = await service.latest(d.device_id);
          if (current(c)) devices.value = devices.value.map((item) => item.device_id === d.device_id ? { ...item, quality: !latest ? '等待首次采样' : latest.sensor_error ? '传感器故障' : latest.mode === 'sleep' ? '休眠' : latest.mode === 'fer' ? '最近采样正常' : '模式未知' } : item);
        } catch { if (current(c)) devices.value = devices.value.map((item) => item.device_id === d.device_id ? { ...item, quality: '质量读取失败' } : item); }
      }));
    }
  } catch (e) { if (current(c)) error.value = mobileError(e); }
  finally { if (current(c)) loading.value = false; }
}
async function perform(action, success) {
  if (saving.value) return;
  const c = context();
  saving.value = true;
  error.value = ''; notice.value = '';
  try {
    const service = await mobileDeviceService();
    const result = await action(service, c);
    if (!current(c)) return;
    notice.value = success;
    return result;
  } catch (e) { if (current(c)) error.value = mobileError(e); }
  finally { if (current(c)) saving.value = false; }
}
async function claim() {
  const normalized = normalizeBindCode(code.value);
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(normalized)) { error.value = '请输入有效的八位字母或数字绑定码。'; return; }
  if (!confirmed.value) { error.value = '请先确认全部历史采样的共享范围。'; return; }
  const c = context();
  const result = await perform((service) => service.claim(normalized), '设备已加入。');
  if (result?.device_id && current(c)) {
    notice.value = result.already_mine ? '已在你的设备中。' : '设备绑定成功。';
    code.value = ''; confirmed.value = false;
    router.push(`/me/devices/${encodeURIComponent(result.device_id)}`);
  }
}
async function rename() {
  if (!manager.value) return;
  if (!name.value.trim() || name.value.trim().length > 80) { error.value = '设备名称须为一至八十个字符。'; return; }
  const c = context();
  const result = await perform((service) => service.rename(c.device, name.value), '名称已更新，对所有共享成员生效。');
  if (result && current(c)) device.value = { ...device.value, name: result.name };
}
async function addMember() {
  if (!manager.value) return;
  if (!/^[UA]\d{8}$/.test(target.value.trim())) { error.value = '请输入有效的系统用户编号。'; return; }
  const c = context();
  const result = await perform((service) => service.bind(c.device, target.value), '成员已加入，可查看全部历史采样。');
  if (result && current(c)) { target.value = ''; await load(); }
}
async function removeMember(member, self = false) {
  if (member.member_role === 'owner' || (!self && !manager.value)) return;
  if (!window.confirm(self ? '确认解绑这台设备？解绑后将不再通过成员身份访问设备历史，原始数据不会删除。' : `确认移除 ${member.system_user_id}？该成员将失去设备历史访问权限。`)) return;
  const c = context();
  const result = await perform((service) => service.unbind(c.device, member.system_user_id), '已解除共享关系。');
  if (result && current(c)) { if (self) { device.value = null; router.replace('/me/devices'); } else await load(); }
}
async function copy(value) {
  const c = context();
  try { await navigator.clipboard.writeText(value); if (current(c)) notice.value = '绑定码已复制。'; }
  catch { if (current(c)) notice.value = '复制失败，请长按下方绑定码手动复制。'; }
}
watch([userId, deviceId], () => {
  version += 1; devices.value = []; device.value = null; members.value = [];
  code.value = ''; confirmed.value = false; name.value = ''; target.value = '';
  notice.value = ''; error.value = ''; saving.value = false; loading.value = false;
  if (userId.value) load();
}, { immediate: true, flush: 'sync' });
watch(manager, (value) => { if (!value) members.value = []; });
onMounted(async () => { try { await auth.init(); } catch { error.value = '登录状态读取失败，请稍后重试。'; } });
onBeforeUnmount(() => { version += 1; });
</script>
<template>
  <main class="m-page">
    <RouterLink to="/me/devices" v-if="deviceId">返回我的设备</RouterLink>
    <h1>{{ deviceId ? '设备设置' : '我的设备' }}</h1>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="m-muted" role="status">{{ notice }}</p>
    <button class="m-secondary" :disabled="loading || saving || !userId" @click="load">{{ loading ? '正在读取…' : '刷新设备' }}</button>
    <template v-if="!deviceId">
      <section class="m-card"><h2>绑定设备</h2>
        <label class="m-field">绑定码<input v-model="code" autocomplete="off" autocapitalize="characters" maxlength="24" placeholder="八位字母或数字"></label>
        <p class="m-muted">规范化绑定码：{{ normalizeBindCode(code) || '尚未输入' }}</p>
        <label><input v-model="confirmed" type="checkbox">我确认：绑定后可查看这台设备的全部历史采样。</label>
        <button class="m-primary" :disabled="saving || !userId" @click="claim">{{ saving ? '正在绑定…' : '确认绑定设备' }}</button>
      </section>
      <section class="m-card"><h2>已绑定设备</h2><p v-if="!devices.length && !loading" class="m-muted">还没有绑定设备；无需设备也可以手工观察。</p>
        <RouterLink v-for="item in devices" :key="item.device_id" :to="`/me/devices/${encodeURIComponent(item.device_id)}`" class="m-list-row">
          <strong>{{ item.name || item.device_id }}</strong><span>{{ item.my_role === 'owner' ? '所有者' : '成员' }} · {{ item.quality }}</span>
          <small>最近接收：{{ item.last_seen_at ? new Date(item.last_seen_at).toLocaleString() : '从未接收' }}</small>
        </RouterLink>
      </section>
    </template>
    <template v-else-if="device">
      <section class="m-card"><h2>{{ device.name || device.device_id }}</h2>
        <p>我的设备角色：{{ device.my_role === 'owner' ? '所有者' : device.my_role === 'member' ? '成员' : '无成员身份（管理员访问）' }}</p>
        <p class="m-muted">最近收到数据：{{ device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : '从未接收' }}。接收时间不等于最新采样时间。</p>
        <RouterLink :to="`/devices/${encodeURIComponent(deviceId)}/trend`">查看设备趋势</RouterLink>
        <form v-if="manager" @submit.prevent="rename"><label class="m-field">设备名称<input v-model="name" maxlength="80"></label><p class="m-muted">改名会对所有共享成员生效。</p><button class="m-primary" :disabled="saving">保存名称</button></form>
      </section>
      <section class="m-card"><h2>共享设备</h2><p>持有绑定码的账号加入后，可查看这台设备的全部历史采样。个人观察、备注和报告不因此自动共享。</p>
        <p class="m-muted">当前绑定码可持续用于加入；解绑不能收回他人已保存的信息。</p>
        <p class="m-code">{{ device.bind_code || '暂无绑定码' }}</p><button class="m-secondary" :disabled="!device.bind_code" @click="copy(device.bind_code)">复制绑定码</button>
      </section>
      <section v-if="manager" class="m-card"><h2>共享成员</h2><p class="m-muted">列表遵循现有管理员隐藏规则。暂不支持转让所有者。</p>
        <div v-for="member in members" :key="member.system_user_id" class="m-list-row"><span>{{ member.system_user_id }} · {{ member.member_role === 'owner' ? '所有者' : '成员' }}</span><button v-if="member.member_role !== 'owner'" class="m-secondary" :disabled="saving" @click="removeMember(member)">移除成员</button></div>
        <form @submit.prevent="addMember"><label class="m-field">系统用户编号<input v-model="target" placeholder="例如 U26010001" maxlength="9"></label><button class="m-primary" :disabled="saving">添加成员</button></form>
      </section>
      <section class="m-card"><h2>技术信息</h2><p class="m-code">设备编号：{{ device.device_id }}</p><p>型号：{{ device.model || '未提供' }}；固件：{{ device.firmware_version || '未提供' }}</p></section>
      <section class="m-card"><h2>解绑设备</h2><p v-if="device.my_role === 'owner'" class="m-muted">所有者不能解绑自己，当前暂不支持所有权转让。</p>
        <template v-else-if="device.my_role === 'member'"><p class="m-muted">解绑会撤销你的成员访问权限，不会删除设备原始数据。</p><button class="m-secondary" :disabled="saving || !mySystemId" @click="removeMember({ member_role: 'member', system_user_id: mySystemId }, true)">解绑自己</button></template>
        <p v-else class="m-muted">当前账号没有需要解除的设备成员关系。</p>
      </section>
    </template>
  </main>
</template>
<style scoped>
.m-code { overflow-wrap: anywhere; user-select: text; }
.m-list-row { display: grid; gap: 4px; }
.m-field { display: grid; gap: 8px; margin: 12px 0; }
.m-field input { width: 100%; min-width: 0; box-sizing: border-box; }
.m-primary { margin-top: 12px; }
</style>
