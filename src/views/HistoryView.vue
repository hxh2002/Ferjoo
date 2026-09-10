<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';
import SeriesChart from '../components/SeriesChart.vue';
import {
  addMeasurement,
  bindDeviceMember,
  claimDevice,
  createDevice,
  getLatestMeasurement,
  listDeviceMembers,
  listDevices,
  listMeasurements,
  renameDevice,
  unbindDeviceMember
} from '../services/device.service.js';

const ONLINE_WINDOW_MS = 20 * 60 * 1000; // 两个 10 分钟桶内视为在线

const auth = useAuth();
const devices = ref([]);
const selectedId = ref('');
const measurements = ref([]);
const latest = ref(null);
const error = ref('');
const busy = ref(false);
const newDeviceName = ref('');
const measurement = reactive({
  temperatureC: '',
  heightMm: '',
  heightDeltaMm: '',
  humidityPercent: '',
  batteryPercent: ''
});

const selectedDevice = computed(() => devices.value.find((x) => x.device_id === selectedId.value));
const createdCredential = ref(null);
const members = ref([]);
const memberSystemUserId = ref('');

const renaming = ref(false);
const renameValue = ref('');

const bindCode = ref('');
const bindSuccess = ref('');
const bindCopied = ref(false);

function formatBindCode(code) {
  if (!code) return '—';
  const clean = code.toUpperCase();
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

async function claimBind() {
  const code = bindCode.value.trim();
  if (!code) return;
  busy.value = true;
  error.value = '';
  bindSuccess.value = '';
  try {
    const res = await claimDevice(code);
    bindCode.value = '';
    await refreshDevices();
    if (res.device_id) selectedId.value = res.device_id;
    bindSuccess.value = res.already_mine
      ? '该设备已在你的列表中。'
      : res.role === 'owner'
        ? '绑定成功，你是这台设备的创建者。'
        : '绑定成功，设备已加入你的列表。';
    setTimeout(() => { bindSuccess.value = ''; }, 4000);
  } catch (e) {
    error.value = e?.message?.includes('INVALID_BIND_CODE')
      ? '绑定码无效，请核对后重试。'
      : e?.message || '绑定失败，请稍后重试。';
  } finally {
    busy.value = false;
  }
}

async function copyBindCode() {
  const code = selectedDevice.value?.bind_code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(formatBindCode(code));
    bindCopied.value = true;
    setTimeout(() => { bindCopied.value = false; }, 1500);
  } catch {
    bindCopied.value = false;
  }
}

const canManage = computed(() => {
  if (auth.profile.value?.role === 'A') return true;
  const myId = auth.profile.value?.system_user_id;
  return members.value.some((m) => m.member_role === 'owner' && m.system_user_id === myId);
});

const seriesAscending = computed(() =>
  [...measurements.value].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
);
const tempSeries = computed(() => seriesAscending.value.map((r) => ({ t: r.recorded_at, v: toNum(r.temperature_c) })));
const heightSeries = computed(() => seriesAscending.value.map((r) => ({ t: r.recorded_at, v: toNum(r.height_mm) })));
const humiditySeries = computed(() => seriesAscending.value.map((r) => ({ t: r.recorded_at, v: toNum(r.humidity_percent) })));
const batterySeries = computed(() => seriesAscending.value.map((r) => ({ t: r.recorded_at, v: toNum(r.battery_percent) })));

const selectedStatus = computed(() => deviceStatus(selectedDevice.value));
const lastSeenText = computed(() => {
  const at = selectedDevice.value?.last_seen_at;
  if (!at) return '从未上报';
  return new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
});

onMounted(async () => {
  await auth.init();
  if (auth.configured) await refreshDevices();
});

watch(selectedId, async (id) => {
  renaming.value = false;
  if (id) {
    await Promise.all([refreshMeasurements(), refreshMembers(), refreshLatest()]);
  } else {
    measurements.value = [];
    members.value = [];
    latest.value = null;
  }
});

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function deviceStatus(device) {
  if (!device?.last_seen_at) return 'never';
  return Date.now() - new Date(device.last_seen_at).getTime() <= ONLINE_WINDOW_MS ? 'online' : 'offline';
}

const STATUS_LABEL = { online: '在线', offline: '离线', never: '未连接' };

async function refreshDevices() {
  busy.value = true; error.value = '';
  try {
    devices.value = await listDevices();
    if (!selectedId.value && devices.value.length) selectedId.value = devices.value[0].device_id;
    if (selectedId.value && !devices.value.some((d) => d.device_id === selectedId.value)) {
      selectedId.value = devices.value[0]?.device_id || '';
    }
  } catch (e) {
    error.value = e?.message || '无法读取设备。';
  } finally {
    busy.value = false;
  }
}

async function addDevice() {
  if (!newDeviceName.value.trim()) return;
  busy.value = true; error.value = '';
  try {
    const device = await createDevice({ name: newDeviceName.value });
    newDeviceName.value = '';
    createdCredential.value = { device_id: device.device_id, api_key: device.api_key, bind_code: device.bind_code };
    await refreshDevices();
    selectedId.value = device.device_id;
  } catch (e) {
    error.value = e?.message || '创建设备失败。';
  } finally {
    busy.value = false;
  }
}

function startRename() {
  if (!selectedDevice.value) return;
  renameValue.value = selectedDevice.value.name || '';
  renaming.value = true;
}

async function saveRename() {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    await renameDevice(selectedId.value, renameValue.value);
    renaming.value = false;
    await refreshDevices();
  } catch (e) {
    error.value = e?.message || '重命名失败（需要设备创建者或管理员权限）。';
  } finally {
    busy.value = false;
  }
}

async function refreshMeasurements() {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    measurements.value = await listMeasurements(selectedId.value, { limit: 120 });
  } catch (e) {
    error.value = e?.message || '无法读取测量历史。';
  } finally {
    busy.value = false;
  }
}

async function refreshLatest() {
  if (!selectedId.value) return;
  try {
    latest.value = await getLatestMeasurement(selectedId.value);
  } catch {
    latest.value = null;
  }
}

async function refreshMembers() {
  if (!selectedId.value) return;
  try {
    members.value = await listDeviceMembers(selectedId.value);
  } catch (e) {
    error.value = e?.message || '无法读取设备绑定。';
  }
}

async function bindMember() {
  if (!selectedId.value || !memberSystemUserId.value.trim()) return;
  busy.value = true; error.value = '';
  try {
    await bindDeviceMember(selectedId.value, memberSystemUserId.value);
    memberSystemUserId.value = '';
    await refreshMembers();
  } catch (e) {
    error.value = e?.message || '绑定用户失败。';
  } finally {
    busy.value = false;
  }
}

async function unbindMember(systemUserId) {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    await unbindDeviceMember(selectedId.value, systemUserId);
    await refreshMembers();
  } catch (e) {
    error.value = e?.message || '解绑用户失败。';
  } finally {
    busy.value = false;
  }
}

async function saveMeasurement() {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    await addMeasurement(selectedId.value, measurement);
    Object.assign(measurement, { temperatureC: '', heightMm: '', heightDeltaMm: '', humidityPercent: '', batteryPercent: '' });
    await Promise.all([refreshMeasurements(), refreshLatest()]);
  } catch (e) {
    error.value = e?.message || '保存测量失败。';
  } finally {
    busy.value = false;
  }
}

function fmt(value, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`;
}
</script>

<template>
  <section class="history-page">
    <div class="history-heading">
      <div>
        <p class="eyebrow">FERMENTATION HISTORY</p>
        <h1>数据看板</h1>
      </div>
      <div class="profile-plate">
        <small>FERJOO ID</small>
        <strong>{{ auth.profile.value?.system_user_id || '—' }}</strong>
        <span>{{ auth.profile.value?.display_name || auth.user.value?.email }}</span>
      </div>
    </div>

    <div v-if="!auth.configured" class="panel config-warning history-warning">
      Supabase 尚未配置，因此设备历史不可用。请先复制 .env.example 为 .env 并填写项目配置。
    </div>

    <template v-else>
      <p v-if="error" class="form-error global-error">{{ error }}</p>
      <div class="history-grid">
        <aside class="panel device-panel">
          <div class="panel-heading compact-heading">
            <div><p class="eyebrow dark">DEVICES</p><h2>我的设备</h2></div>
          </div>
          <form class="device-add" @submit.prevent="addDevice">
            <input v-model="newDeviceName" placeholder="设备名称" maxlength="80" />
            <button :disabled="busy">＋</button>
          </form>
          <form class="device-add bind-form" @submit.prevent="claimBind">
            <input
              v-model="bindCode"
              placeholder="或输入 8 位绑定码绑定已有设备"
              maxlength="12"
              autocomplete="off"
            />
            <button :disabled="busy" title="绑定设备">⇢</button>
          </form>
          <p v-if="bindSuccess" class="form-success bind-success">{{ bindSuccess }}</p>
          <div class="device-list">
            <button
              v-for="device in devices"
              :key="device.device_id"
              :class="{ selected: selectedId === device.device_id }"
              @click="selectedId = device.device_id"
            >
              <span class="device-dot" :class="`status-${deviceStatus(device)}`"></span>
              <span><strong>{{ device.name || device.device_id }}</strong><small>{{ device.device_id }}</small></span>
            </button>
            <p v-if="!devices.length" class="empty-list">还没有设备。创建一个即可开始保存测量。</p>
          </div>

          <div v-if="createdCredential" class="credential-plate">
            <p class="eyebrow dark">DEVICE CREDENTIALS</p>
            <p class="credential-warning">请立即保存，密钥仅显示一次。</p>
            <dl>
              <dt>device_id</dt>
              <dd>{{ createdCredential.device_id }}</dd>
              <dt>api_key</dt>
              <dd>{{ createdCredential.api_key }}</dd>
              <dt>bind_code</dt>
              <dd>{{ formatBindCode(createdCredential.bind_code) }}</dd>
            </dl>
            <button class="small-primary" type="button" @click="createdCredential = null">知道了</button>
          </div>

          <div v-if="selectedDevice?.bind_code" class="bind-code-plate">
            <p class="eyebrow dark">BIND CODE</p>
            <div class="bind-code-row">
              <code>{{ formatBindCode(selectedDevice.bind_code) }}</code>
              <button class="copy-button" type="button" @click="copyBindCode">{{ bindCopied ? '已复制' : '复制' }}</button>
            </div>
            <small>家人或同事输入此码，即可把这台设备绑到自己的账号。</small>
          </div>

          <div v-if="selectedId && canManage" class="member-plate">
            <p class="eyebrow dark">DEVICE MEMBERS</p>
            <form class="device-add" @submit.prevent="bindMember">
              <input v-model="memberSystemUserId" placeholder="绑定用户 FERJOO ID" maxlength="9" />
              <button :disabled="busy">＋</button>
            </form>
            <div v-for="member in members" :key="member.system_user_id" class="member-row">
              <span>{{ member.system_user_id }} · {{ member.member_role === 'owner' ? '创建者' : '成员' }}</span>
              <button v-if="member.member_role !== 'owner'" type="button" @click="unbindMember(member.system_user_id)">解绑</button>
            </div>
          </div>
        </aside>

        <main class="panel measurement-panel">
          <div class="panel-heading compact-heading">
            <div>
              <p class="eyebrow dark">10-MINUTE BUCKETS</p>
              <div v-if="!renaming" class="device-title-row">
                <h2>{{ selectedDevice?.name || '选择一个设备' }}</h2>
                <button
                  v-if="selectedDevice && canManage"
                  class="rename-button"
                  type="button"
                  title="重命名设备"
                  @click="startRename"
                >✎ 改名</button>
              </div>
              <form v-else class="rename-form" @submit.prevent="saveRename">
                <input v-model.trim="renameValue" maxlength="80" placeholder="设备名称" />
                <button class="small-primary" :disabled="busy">保存</button>
                <button class="ghost-button" type="button" @click="renaming = false">取消</button>
              </form>
            </div>
            <div v-if="selectedId" class="heading-side">
              <span class="status-pill" :class="`status-${selectedStatus}`">{{ STATUS_LABEL[selectedStatus] }}</span>
              <button class="copy-button" type="button" @click="refreshMeasurements">REFRESH</button>
            </div>
          </div>

          <div v-if="selectedId" class="latest-strip">
            <div class="latest-item"><span>最后上报</span><strong>{{ lastSeenText }}</strong></div>
            <div class="latest-item"><span>温度</span><strong>{{ fmt(latest?.temperature_c, ' °C') }}</strong></div>
            <div class="latest-item"><span>高度</span><strong>{{ fmt(latest?.height_mm, ' mm') }}</strong></div>
            <div class="latest-item"><span>Δ高度</span><strong>{{ fmt(latest?.height_delta_mm, ' mm') }}</strong></div>
            <div class="latest-item"><span>湿度</span><strong>{{ fmt(latest?.humidity_percent, ' %') }}</strong></div>
            <div class="latest-item"><span>电量</span><strong>{{ fmt(latest?.battery_percent, ' %') }}</strong></div>
          </div>

          <div v-if="selectedId" class="chart-grid">
            <SeriesChart label="温度" unit="°C" color="#e85d16" :points="tempSeries" />
            <SeriesChart label="高度" unit="mm" color="#2b7de8" :points="heightSeries" />
            <SeriesChart label="湿度" unit="%" color="#2b8a5e" :points="humiditySeries" />
            <SeriesChart label="电量" unit="%" color="#8a6d1f" :points="batterySeries" />
          </div>

          <form v-if="selectedId" class="measurement-form" @submit.prevent="saveMeasurement">
            <label><span>温度 °C</span><input v-model="measurement.temperatureC" type="number" step="0.1" /></label>
            <label><span>高度 mm</span><input v-model="measurement.heightMm" type="number" step="0.1" /></label>
            <label><span>高度变化 mm</span><input v-model="measurement.heightDeltaMm" type="number" step="0.1" /></label>
            <label><span>湿度 %</span><input v-model="measurement.humidityPercent" type="number" step="0.1" /></label>
            <label><span>电量 %</span><input v-model="measurement.batteryPercent" type="number" step="0.1" /></label>
            <button class="small-primary" :disabled="busy">保存当前测量</button>
          </form>

          <div v-if="selectedId" class="table-wrap">
            <table>
              <thead><tr><th>时间</th><th>10 分钟桶</th><th>温度</th><th>高度</th><th>Δ高度</th><th>湿度</th><th>电量</th></tr></thead>
              <tbody>
                <tr v-for="row in measurements" :key="row.id">
                  <td>{{ new Date(row.recorded_at).toLocaleString() }}</td>
                  <td>{{ new Date(row.bucket_start).toLocaleString() }}</td>
                  <td>{{ fmt(row.temperature_c, '°') }}</td>
                  <td>{{ fmt(row.height_mm, ' mm') }}</td>
                  <td>{{ fmt(row.height_delta_mm, ' mm') }}</td>
                  <td>{{ fmt(row.humidity_percent, '%') }}</td>
                  <td>{{ fmt(row.battery_percent, '%') }}</td>
                </tr>
                <tr v-if="!measurements.length"><td colspan="7" class="empty-table">暂无测量记录。</td></tr>
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </template>
  </section>
</template>
