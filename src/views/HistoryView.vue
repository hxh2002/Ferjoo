<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';
import { addMeasurement, createDevice, listDevices, listMeasurements } from '../services/device.service.js';

const auth = useAuth();
const devices = ref([]);
const selectedId = ref('');
const measurements = ref([]);
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

const selectedDevice = computed(() => devices.value.find((x) => x.id === selectedId.value));

onMounted(async () => {
  await auth.init();
  if (auth.configured) await refreshDevices();
});

watch(selectedId, async (id) => {
  if (id) await refreshMeasurements();
  else measurements.value = [];
});

async function refreshDevices() {
  busy.value = true; error.value = '';
  try {
    devices.value = await listDevices();
    if (!selectedId.value && devices.value.length) selectedId.value = devices.value[0].id;
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
    await refreshDevices();
    selectedId.value = device.id;
  } catch (e) {
    error.value = e?.message || '创建设备失败。';
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

async function saveMeasurement() {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    await addMeasurement(selectedId.value, measurement);
    Object.assign(measurement, { temperatureC: '', heightMm: '', heightDeltaMm: '', humidityPercent: '', batteryPercent: '' });
    await refreshMeasurements();
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
        <h1>把趋势留住，<span>比一次读数更重要。</span></h1>
      </div>
      <div class="profile-plate">
        <small>FERJOO ID</small>
        <strong>{{ auth.profile.value?.system_user_id || '—' }}</strong>
        <span>{{ auth.profile.value?.display_name || auth.user.value?.email }}</span>
      </div>
    </div>

    <div v-if="!auth.configured" class="panel config-warning history-warning">
      Supabase 尚未配置，因此设备历史不可用。诊断页无需数据库即可工作。
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
          <div class="device-list">
            <button
              v-for="device in devices"
              :key="device.id"
              :class="{ selected: selectedId === device.id }"
              @click="selectedId = device.id"
            >
              <span class="device-dot"></span>
              <span><strong>{{ device.name }}</strong><small>{{ device.id }}</small></span>
            </button>
            <p v-if="!devices.length" class="empty-list">还没有设备。创建一个即可开始保存测量。</p>
          </div>
        </aside>

        <main class="panel measurement-panel">
          <div class="panel-heading compact-heading">
            <div>
              <p class="eyebrow dark">10-MINUTE BUCKETS</p>
              <h2>{{ selectedDevice?.name || '选择一个设备' }}</h2>
            </div>
            <button v-if="selectedId" class="copy-button" type="button" @click="refreshMeasurements">REFRESH</button>
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
