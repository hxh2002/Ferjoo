<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';
import {
  addMeasurement,
  createDevice,
  listDevices,
  listMeasurements
} from '../services/device.service.js';

const auth = useAuth();
const devices = ref([]);
const selectedDeviceId = ref('');
const measurements = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const deviceForm = reactive({ deviceId: '', name: '', model: '', firmwareVersion: '' });
const measurementForm = reactive({
  recordedAt: new Date().toISOString().slice(0, 16),
  temperatureC: '',
  heightMm: '',
  heightDeltaMm: '',
  humidityPercent: '',
  batteryPercent: ''
});

const selectedDevice = computed(() => devices.value.find((d) => d.device_id === selectedDeviceId.value) || null);

async function loadDevices() {
  devices.value = await listDevices();
  if (!selectedDeviceId.value && devices.value.length) selectedDeviceId.value = devices.value[0].device_id;
}

async function loadMeasurements() {
  if (!selectedDeviceId.value) {
    measurements.value = [];
    return;
  }
  loading.value = true;
  try {
    measurements.value = await listMeasurements(selectedDeviceId.value, { limit: 200 });
  } finally {
    loading.value = false;
  }
}

async function addDevice() {
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const row = await createDevice(deviceForm);
    devices.value.push(row);
    selectedDeviceId.value = row.device_id;
    Object.assign(deviceForm, { deviceId: '', name: '', model: '', firmwareVersion: '' });
    successMessage.value = '设备已绑定。';
  } catch (error) {
    errorMessage.value = error?.message || '设备绑定失败';
  }
}

async function saveMeasurement() {
  errorMessage.value = '';
  successMessage.value = '';
  if (!selectedDeviceId.value) {
    errorMessage.value = '请先绑定并选择设备。';
    return;
  }
  try {
    await addMeasurement({ deviceId: selectedDeviceId.value, ...measurementForm });
    successMessage.value = '10 分钟数据点已保存。';
    await loadMeasurements();
  } catch (error) {
    errorMessage.value = error?.message || '数据保存失败';
  }
}

watch(selectedDeviceId, loadMeasurements);
onMounted(async () => {
  try {
    await loadDevices();
    await loadMeasurements();
  } catch (error) {
    errorMessage.value = error?.message || '设备数据加载失败';
  }
});
</script>

<template>
  <section class="history-header">
    <div>
      <p class="eyebrow">Device Data</p>
      <h1>设备与历史数据</h1>
      <p>
        当前账户：<strong>{{ auth.systemUserId.value }}</strong>
        · 权限：{{ auth.role.value }}
      </p>
    </div>
    <select v-model="selectedDeviceId" class="device-select">
      <option value="">选择设备</option>
      <option v-for="device in devices" :key="device.device_id" :value="device.device_id">
        {{ device.name || device.device_id }} · {{ device.device_id }}
      </option>
    </select>
  </section>

  <p v-if="errorMessage" class="notice error">{{ errorMessage }}</p>
  <p v-if="successMessage" class="notice success">{{ successMessage }}</p>

  <div class="history-layout">
    <aside class="stack">
      <section class="panel compact-panel">
        <h2>绑定设备</h2>
        <form class="stack" @submit.prevent="addDevice">
          <label class="input-field"><span>设备 ID</span><input v-model="deviceForm.deviceId" required maxlength="80" /></label>
          <label class="input-field"><span>名称</span><input v-model="deviceForm.name" maxlength="80" placeholder="例如：厨房主罐" /></label>
          <label class="input-field"><span>型号</span><input v-model="deviceForm.model" maxlength="80" /></label>
          <label class="input-field"><span>固件版本</span><input v-model="deviceForm.firmwareVersion" maxlength="40" /></label>
          <button class="button primary wide">绑定设备</button>
        </form>
      </section>

      <section class="panel compact-panel">
        <h2>写入测试数据点</h2>
        <p class="muted">前后端都会按 10 分钟时间桶处理；同一设备同一时间桶只允许一个点。</p>
        <form class="stack" @submit.prevent="saveMeasurement">
          <label class="input-field"><span>时间</span><input v-model="measurementForm.recordedAt" type="datetime-local" required /></label>
          <div class="two-column">
            <label class="input-field"><span>温度 ℃</span><input v-model="measurementForm.temperatureC" type="number" step="0.01" /></label>
            <label class="input-field"><span>高度 mm</span><input v-model="measurementForm.heightMm" type="number" step="0.001" /></label>
          </div>
          <div class="two-column">
            <label class="input-field"><span>高度变化 mm</span><input v-model="measurementForm.heightDeltaMm" type="number" step="0.001" /></label>
            <label class="input-field"><span>湿度 %</span><input v-model="measurementForm.humidityPercent" type="number" min="0" max="100" step="0.01" /></label>
          </div>
          <label class="input-field"><span>电量 %</span><input v-model="measurementForm.batteryPercent" type="number" min="0" max="100" step="0.01" /></label>
          <button class="button wide" :disabled="!selectedDeviceId">保存数据点</button>
        </form>
      </section>
    </aside>

    <section class="panel history-table-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">10-minute resolution</p>
          <h2>{{ selectedDevice?.name || selectedDeviceId || '尚未选择设备' }}</h2>
        </div>
        <button class="button ghost small" type="button" :disabled="!selectedDeviceId || loading" @click="loadMeasurements">
          刷新
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间桶</th>
              <th>温度 ℃</th>
              <th>高度 mm</th>
              <th>高度变化 mm</th>
              <th>湿度 %</th>
              <th>电量 %</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in measurements" :key="row.id">
              <td>{{ new Date(row.bucket_start).toLocaleString() }}</td>
              <td>{{ row.temperature_c ?? '—' }}</td>
              <td>{{ row.height_mm ?? '—' }}</td>
              <td>{{ row.height_delta_mm ?? '—' }}</td>
              <td>{{ row.humidity_percent ?? '—' }}</td>
              <td>{{ row.battery_percent ?? '—' }}</td>
            </tr>
            <tr v-if="!measurements.length">
              <td colspan="6" class="empty-table">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
