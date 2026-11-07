<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listStarters } from '../../services/care.service.js';
import { getStarterDeviceLink, linkStarterDevice } from '../../services/starter-device.service.js';
import MConfirmDialog from '../../components/mobile/MConfirmDialog.vue';
import MSheet from '../../components/mobile/MSheet.vue';
import MToast from '../../components/mobile/MToast.vue';
const starters = ref([]);
const starterLinks = ref({});
const linkedStarter = ref('');
const savedStarter = ref('');
async function saveLink() {
  if (!linkedStarter.value) return;
  const c = context();
  const starterId = linkedStarter.value;
  await perform(async () => {
    const result = await linkStarterDevice({ userId: c.user, starterId, deviceId: c.device });
    if (current(c)) savedStarter.value = starterId;
    return result;
  }, '设置已保存');
}
import { mobileDeviceService, mobileError, normalizeBindCode } from '../../services/mobile-device.service.js';
const router = useRouter();
const route = useRoute();
const auth = useAuth();
const devices = ref([]);
const device = ref(null);
const members = ref([]);
const code = ref('');
const showBinding = ref(false);
const confirmed = ref(false);
const name = ref('');
const target = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const toast = ref('');
const toastTone = ref('success');
const renameOpen = ref(false);
const starterOpen = ref(false);
const unbindTarget = ref(null);
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
      const names = await listStarters({ userId: c.user });
      const links = await Promise.all(names.map(item => getStarterDeviceLink({ userId: c.user, starterId: item.id })));
      if (!current(c)) return;
      starters.value = names;
      starterLinks.value = Object.fromEntries(names.map((item, index) => [item.id, links[index]?.device_id || '']));
      linkedStarter.value = names.find((item) => starterLinks.value[item.id] === c.device)?.id || '';
      savedStarter.value = linkedStarter.value;
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
    if (success === '设置已保存') showToast(success);
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
    if (route.query.bind === '1') router.replace('/device');
    else router.push(`/me/devices/${encodeURIComponent(result.device_id)}`);
  }
}
async function rename() {
  if (!manager.value) return;
  if (!name.value.trim() || name.value.trim().length > 80) { error.value = '设备名称须为一至八十个字符。'; return; }
  const c = context();
  const result = await perform((service) => service.rename(c.device, name.value), '设置已保存');
  if (result && current(c)) device.value = { ...device.value, name: result.name };
}
async function addMember() {
  if (!manager.value) return;
  if (!/^[UA]\d{8}$/.test(target.value.trim())) { error.value = '请输入有效的系统用户编号。'; return; }
  const c = context();
  const result = await perform((service) => service.bind(c.device, target.value), '成员已加入，可查看全部历史采样。');
  if (result && current(c)) { target.value = ''; await load(); }
}
function askRemove(member, self = false) {
  if (member.member_role === 'owner' || (!self && !manager.value)) return;
  unbindTarget.value = { member, self };
}
async function confirmRemove() {
  const target = unbindTarget.value;
  unbindTarget.value = null;
  if (target) await removeMember(target.member, target.self);
}
async function removeMember(member, self = false) {
  if (member.member_role === 'owner' || (!self && !manager.value)) return;
  const c = context();
  if (!current(c)) return;
  const result = await perform((service) => service.unbind(c.device, member.system_user_id), '已解除共享关系。');
  if (result && current(c)) { if (self) { device.value = null; router.replace('/me/devices'); } else await load(); }
}
async function copy(value) {
  const c = context();
  try { await navigator.clipboard.writeText(value); if (current(c)) notice.value = '绑定码已复制。'; }
  catch { if (current(c)) notice.value = '复制失败，请长按下方绑定码手动复制。'; }
}
const offline = computed(() => isOffline(device.value?.last_seen_at));
const lastSync = computed(() => formatSeen(device.value?.last_seen_at));
const linkableStarters = computed(() => starters.value.filter((item) => !starterLinks.value[item.id]));
function isOffline(value) {
  const seen = Date.parse(value);
  return !Number.isFinite(seen) || Date.now() - seen > 40 * 60 * 1000;
}
function formatSeen(value) {
  const seen = Date.parse(value);
  if (!Number.isFinite(seen)) return '从未同步';
  const date = new Date(seen);
  const now = new Date();
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return date.toDateString() === now.toDateString() ? `今天 ${clock}` : date.toLocaleString('zh-CN', { hour12: false });
}
function showToast(message, tone = 'success') {
  toastTone.value = tone;
  toast.value = message;
}
async function refreshDevice() {
  const scoped = Boolean(deviceId.value);
  const seen = device.value?.last_seen_at || '';
  await load();
  if (error.value || (scoped && offline.value)) { showToast('设备仍离线', 'error'); return; }
  if (scoped && (device.value?.last_seen_at || '') === seen) showToast('暂无新数据', 'neutral');
}
async function chooseStarter(id) {
  linkedStarter.value = id;
  starterOpen.value = false;
  await saveLink();
}
watch([userId, deviceId], () => {
  version += 1; devices.value = []; device.value = null; members.value = [];
  code.value = ''; confirmed.value = false; name.value = ''; target.value = '';
  showBinding.value = !deviceId.value && route.query.bind === '1'; starters.value = []; starterLinks.value = {}; linkedStarter.value = ''; savedStarter.value = '';
  notice.value = ''; error.value = ''; saving.value = false; loading.value = false;
  if (userId.value) load();
}, { immediate: true, flush: 'sync' });
watch(() => route.fullPath, () => {
  if (!deviceId.value && route.query.bind === '1') router.replace('/me/devices/add');
}, { immediate: true, flush: 'sync' });
watch(manager, (value) => { if (!value) members.value = []; });
onMounted(async () => { try { await auth.init(); } catch { error.value = '登录状态读取失败，请稍后重试。'; } });
onBeforeUnmount(() => { version += 1; });
</script>
<template>
  <main :key="`${userId}:${route.fullPath}`" class="m-page devices-page">
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="m-muted" role="status">{{ notice }}</p>
    <template v-if="!deviceId">
      <header class="devices-head">
        <h1>我的设备</h1>
        <button class="m-text-action" :disabled="loading || saving || !userId" @click="refreshDevice">刷新</button>
      </header>
      <section v-if="loading && !devices.length" class="m-skeleton" aria-busy="true" aria-label="正在读取设备"><span></span><span></span></section>
      <section v-else-if="!devices.length" class="empty-state">
        <span class="empty-disc" aria-hidden="true"><img src="../../assets/icons/nav-device-active.svg" alt="" width="44" height="29" /></span>
        <h2>暂无设备</h2>
        <p>添加设备，查看数据并关联酵种。</p>
        <RouterLink class="m-primary" to="/me/devices/add">添加设备</RouterLink>
      </section>
      <section v-else class="device-stack">
        <div class="section-heading"><h2>已绑定设备<span class="count"> · {{ devices.length }} 台</span></h2><RouterLink class="m-text-action" to="/me/devices/add">添加设备</RouterLink></div>
        <RouterLink v-for="item in devices" :key="item.device_id" class="m-card overview-card overview-card-list" :to="`/me/devices/${encodeURIComponent(item.device_id)}`">
          <div class="overview-head">
            <span class="device-hat" aria-hidden="true"><img src="../../assets/icons/nav-device.svg" alt="" width="44" height="29" /></span>
            <div class="overview-copy">
              <div class="overview-title"><strong>{{ item.name || item.device_id }}</strong><span class="status-pill" :data-offline="isOffline(item.last_seen_at) || null"><i aria-hidden="true"></i>{{ isOffline(item.last_seen_at) ? '离线' : '已连接' }}</span></div>
              <small>设备编号 {{ item.device_id }}</small>
            </div>
          </div>
          <div class="overview-foot">
            <small>最近同步 {{ formatSeen(item.last_seen_at) }}<template v-if="item.quality"> · {{ item.quality }}</template></small>
            <span class="data-chip">设备设置</span>
          </div>
        </RouterLink>
      </section>
      <section v-if="showBinding" id="device-binding" class="m-card"><h2>绑定设备</h2>
        <form @submit.prevent="claim">
          <label class="m-field">绑定码<input v-model="code" autocomplete="off" autocapitalize="characters" maxlength="24" placeholder="八位字母或数字"></label>
          <label class="m-field binding-confirm"><input v-model="confirmed" type="checkbox">我确认：绑定后可查看这台设备的全部历史采样。</label>
          <button class="m-primary" :disabled="saving || !userId">{{ saving ? '正在绑定…' : '确认绑定设备' }}</button>
        </form>
      </section>
    </template>
    <section v-else-if="loading && !device" class="m-skeleton" aria-busy="true" aria-label="正在读取设备"><span></span><span></span></section>
    <template v-else-if="device">
      <p v-if="offline" class="offline-banner" role="status">设备离线<button type="button" :disabled="loading" @click="refreshDevice">刷新</button><span>上次同步 {{ lastSync }}</span></p>
      <p v-if="offline" class="offline-note">请检查设备电源与网络，再刷新状态。</p>
      <header class="devices-head"><h1>{{ device.name || device.device_id }}</h1><button class="m-text-action" :disabled="loading || saving || !userId" @click="refreshDevice">刷新</button></header>
      <section class="m-card overview-card detail-overview">
        <span class="device-hat" aria-hidden="true"><img src="../../assets/icons/nav-device.svg" alt="" width="44" height="29" /></span>
        <div class="overview-copy">
          <div class="overview-title"><strong>{{ device.name || device.device_id }}</strong><span class="status-pill" :data-offline="offline || null"><i aria-hidden="true"></i>{{ offline ? '离线' : '已连接' }}</span></div>
          <small>设备编号 {{ device.device_id }}</small>
        </div>
      </section>
      <p class="group-label">设备管理</p>
      <section id="device-settings" class="m-card settings-card">
        <button v-if="manager" type="button" class="settings-row" @click="renameOpen = true">设备名称 <span aria-hidden="true">›</span></button>
        <button type="button" class="settings-row" @click="starterOpen = true">关联酵种 <small>{{ starters.find(item => item.id === savedStarter)?.name || '未关联' }}</small><span aria-hidden="true">›</span></button>
        <RouterLink class="settings-row" :to="`/me/devices/${encodeURIComponent(deviceId)}/info`">设备信息 <span aria-hidden="true">›</span></RouterLink>
        <RouterLink class="settings-row" :to="`/devices/${encodeURIComponent(deviceId)}/trend`">查看设备数据 <span aria-hidden="true">›</span></RouterLink>
      </section>
      <section class="unbind-card">
        <button v-if="device.my_role === 'member'" type="button" class="unbind-row" :disabled="saving || !mySystemId" @click="askRemove({ member_role: 'member', system_user_id: mySystemId }, true)">解除绑定</button>
        <p v-else-if="device.my_role === 'owner'" class="settings-note">所有者不能解绑自己。</p>
      </section>
      <details v-if="manager" class="m-card m-disclosure">
        <summary>共享与成员</summary>
        <p>持有绑定码的账号加入后可查看全部历史采样。</p>
        <p class="m-code">{{ device.bind_code || '暂无绑定码' }}</p><button class="m-text-action" :disabled="!device.bind_code" @click="copy(device.bind_code)">复制绑定码</button>
        <h2>共享成员</h2><p class="m-muted">暂不支持转让所有者。</p>
        <div v-for="member in members" :key="member.system_user_id" class="member-row"><span>{{ member.system_user_id }} · {{ member.member_role === 'owner' ? '所有者' : '成员' }}</span><button v-if="member.member_role !== 'owner'" class="m-text-action danger-action" :disabled="saving" @click="askRemove(member)">移除成员</button></div>
        <form @submit.prevent="addMember"><label class="m-field">系统用户编号<input v-model="target" placeholder="例如 U26010001" maxlength="9"></label><button class="m-primary" :disabled="saving">添加成员</button></form>
      </details>
    </template>
    <MSheet :open="renameOpen" title="修改设备名称" @close="renameOpen = false">
      <form class="rename-form" @submit.prevent="rename().then(() => { if (!error.value) renameOpen = false; })"><label class="rename-field">设备名称<input v-model="name" maxlength="80"></label><button class="rename-save" :disabled="saving">保存</button></form>
    </MSheet>
    <MSheet :open="starterOpen" title="关联酵种" @close="starterOpen = false">
      <p v-if="!linkableStarters.length" class="m-muted">还没有可关联的酵种。</p>
      <button v-for="item in linkableStarters" :key="item.id" type="button" class="settings-row" @click="chooseStarter(item.id)">{{ item.name }}</button>
    </MSheet>
    <MConfirmDialog :open="!!unbindTarget" danger title="解除绑定" :message="unbindTarget?.self ? '解绑后将不再通过成员身份访问设备历史，原始数据不会删除。' : '该成员将失去设备历史访问权限。'" confirm-label="解除绑定" @cancel="unbindTarget = null" @confirm="confirmRemove" />
    <MToast :open="!!toast" :message="toast" :tone="toastTone" @close="toast = ''" />
  </main>
</template>
<style scoped>
.devices-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;margin:0 0 14px}
.devices-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
.group-label{margin:18px 0 8px;color:var(--text-secondary);font-size:14px;line-height:21px}
.empty-state{display:grid;justify-items:center;gap:8px;padding:72px 0 0;text-align:center}
.empty-disc{display:grid;place-items:center;width:80px;height:80px;margin-bottom:8px;border-radius:50%;background:var(--m-icon-disc)}
.empty-disc img{width:44px;height:29px}
.empty-state h2{margin:0;font-size:22px;line-height:30px;font-weight:500}
.empty-state p{margin:0 0 20px;color:var(--text-secondary);font-size:14px;line-height:21px}
.empty-state .m-primary{display:flex;align-items:center;justify-content:center;width:min(327px,100%);height:60px;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font-size:16px;font-weight:500;text-decoration:none}
.device-stack{display:grid;gap:12px}
.settings-card{padding:8px 16px}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
.section-heading h2{margin:0;font-size:16px;font-weight:500}
.count{color:var(--text-secondary);font-size:13px;font-weight:400}
.device-row,.member-row{display:flex;align-items:center;gap:12px;min-height:76px;padding:12px 0;border-top:1px solid var(--border-subtle);color:inherit;text-decoration:none}
.device-list .device-row:first-of-type{border-top:0}
.device-disc{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;background:var(--m-icon-disc)}
.device-disc img{width:20px;height:20px}
.device-disc.large{width:56px;height:56px}
.device-disc.large img{width:24px;height:24px}
.overview-card{display:flex;align-items:center;gap:12px;min-height:144px;color:inherit;text-decoration:none}
.overview-card-list{display:grid;gap:16px;padding:20px;align-content:space-between}
.overview-head{display:flex;align-items:center;gap:12px;min-width:0}
.overview-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.detail-overview{min-height:96px;padding:20px;gap:12px}
.device-hat{display:grid;place-items:center;flex:none;width:56px;height:56px;border-radius:28px;background:var(--m-disc)}
.device-hat img{width:44px;height:28.6px}
.overview-copy{display:grid;gap:5px;min-width:0;flex:1}
.overview-title{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;width:100%;min-width:0}
.overview-title strong{flex:1 1 100%;min-width:0;font-size:16px;font-weight:500;line-height:22px}
.overview-card small{color:var(--text-secondary);font-size:12px;line-height:18px}
.status-pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;width:72px;height:26px;border-radius:13px;background:var(--m-disc);color:var(--brand-action);font-size:12px;font-weight:500;line-height:18px;white-space:nowrap}
.status-pill i{flex:none;width:4px;height:4px;border-radius:50%;background:currentColor}
.status-pill[data-offline]{background:var(--warning-bg);color:var(--warning-text)}
.data-chip{display:inline-flex;align-items:center;justify-content:center;flex:none;width:94px;height:32px;border-radius:16px;background:var(--brand-light);color:var(--text-primary);font-size:13px;font-weight:500;text-decoration:none}
.row-main{display:grid;gap:2px;min-width:0;flex:1;overflow-wrap:anywhere}
.row-main strong{font-size:15px;font-weight:500}
.row-main small{color:var(--text-secondary);font-size:12px}
.chevron{color:var(--text-secondary);font-size:18px}
.m-code{overflow-wrap:anywhere;user-select:text;font-family:ui-monospace,monospace}
.binding-confirm{grid-template-columns:auto minmax(0,1fr);align-items:start}
.m-text-action.danger-action{color:var(--danger-text)}
.unbind-action{margin-top:24px}
.settings-row{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:68px;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-size:16px;line-height:24px;font-weight:500;text-align:left;text-decoration:none}
.settings-row + .settings-row::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:var(--border-warm)}
.settings-row small{margin-left:auto;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.settings-row > span{margin-left:auto;color:var(--brand-action);font-size:18px;line-height:1}
.settings-row.danger{color:var(--danger-text)}
.settings-note{margin:0;padding:12px 0;color:var(--text-secondary);font-size:14px;line-height:21px}
.unbind-card{padding:0 16px;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow-button)}
.unbind-row{display:flex;align-items:center;justify-content:center;width:100%;min-height:68px;padding:0;border:0;background:transparent;color:var(--brand-action);font:inherit;font-size:16px;line-height:24px;font-weight:500;cursor:pointer}
.offline-banner{display:flex;align-items:center;gap:12px;margin:0;padding:12px 16px;border-radius:var(--radius-control);background:var(--warning-bg);color:var(--warning-text);font-size:14px;line-height:21px}
.offline-banner button{min-height:32px;padding:0 12px;border:0;border-radius:16px;background:var(--brand-light);color:var(--text-primary)}
.offline-note{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px}
.rename-form{display:grid;gap:16px;width:min(327px,100%)}
.rename-field{display:grid;gap:8px;font-size:var(--text-sm);font-weight:500}
.rename-field input{width:100%;height:64px;min-height:64px;padding:0 16px;border:1px solid var(--border-warm);border-radius:var(--radius-control);background:var(--surface-input);color:var(--text-primary);font:inherit;font-size:var(--text-md)}
.rename-save{display:flex;align-items:center;justify-content:center;width:100%;height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:var(--text-md);font-weight:500;cursor:pointer}
</style>
