<script setup>
import { onMounted, ref, watch } from 'vue';
import AdminDrawer from '../../components/admin/AdminDrawer.vue';
import AdminPager from '../../components/admin/AdminPager.vue';
import { ADMIN_PAGE_SIZE, PRESENCE_LABEL, devicePresence, formatAdminTime, memberRoleLabel, personLabel } from '../../lib/admin-access.js';
import { getDevice, listDevices, renameDevice } from '../../services/admin.service.js';

const query = ref('');
const presence = ref('all');
const page = ref(0);
const rows = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
const selectedId = ref('');
const nameDraft = ref('');
const saving = ref(false);
let timer;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await listDevices({ query: query.value, presence: presence.value, page: page.value });
    rows.value = result.rows;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loading.value = false;
  }
}
function search() {
  clearTimeout(timer);
  timer = setTimeout(() => { page.value = 0; load(); }, 250);
}
watch(presence, () => { page.value = 0; load(); });
function turn(next) { page.value = next; load(); }
async function openDevice(row) {
  selectedId.value = row.device_id;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    detail.value = await getDevice(row.device_id);
    nameDraft.value = detail.value.device.name || '';
  } catch (cause) {
    detailError.value = cause.message;
  } finally {
    detailLoading.value = false;
  }
}
async function saveName() {
  if (!selectedId.value) return;
  saving.value = true;
  detailError.value = '';
  try {
    await renameDevice(selectedId.value, nameDraft.value);
    await openDevice({ device_id: selectedId.value });
    await load();
  } catch (cause) {
    detailError.value = cause.message;
  } finally {
    saving.value = false;
  }
}
function metric(value, unit) {
  return value == null || value === '' ? '—' : `${value} ${unit}`;
}
onMounted(load);
</script>

<template>
  <section>
    <p class="admin-lead">设备由出厂登记。这里查看在线状态、绑定和最近一次采样，并可以修改设备名称。上传密钥不会显示。</p>
    <div class="admin-toolbar">
      <input v-model="query" type="search" placeholder="搜索设备编号或名称" aria-label="搜索设备" @input="search">
      <select v-model="presence" aria-label="连接状态">
        <option value="all">全部状态</option>
        <option value="online">已连接</option>
        <option value="offline">离线</option>
        <option value="never">从未同步</option>
      </select>
    </div>
    <p v-if="loading" class="admin-note" role="status">正在读取设备…</p>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="m-secondary" @click="load">重试</button></p>
    <p v-else-if="!rows.length" class="admin-note">没有符合条件的设备。</p>
    <div v-else class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>设备</th><th>编号</th><th>状态</th><th>成员</th><th>最近同步</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.device_id" :class="{ 'is-selected': selectedId === row.device_id }">
            <td>{{ row.name || '未命名设备' }}<br><span class="admin-note">{{ row.model || '型号未记录' }}</span></td>
            <td>{{ row.device_id }}</td>
            <td><span class="admin-badge" :class="{ 'is-live': devicePresence(row.last_seen_at) === 'online', 'is-muted': devicePresence(row.last_seen_at) !== 'online' }">{{ PRESENCE_LABEL[devicePresence(row.last_seen_at)] }}</span></td>
            <td>{{ row.member_count }}</td>
            <td>{{ formatAdminTime(row.last_seen_at) }}</td>
            <td><button type="button" class="m-secondary" @click="openDevice(row)">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <AdminPager :page="page" :total="total" :page-size="ADMIN_PAGE_SIZE" @page="turn" />

    <AdminDrawer :open="Boolean(selectedId)" :title="detail?.device?.name || '设备详情'" @close="selectedId = ''">
      <p v-if="detailLoading" class="admin-note" role="status">正在读取详情…</p>
      <p v-else-if="detailError && !detail" class="m-error" role="alert">{{ detailError }}</p>
      <template v-else-if="detail">
        <dl class="admin-facts">
          <div><dt>设备编号</dt><dd>{{ detail.device.device_id }}</dd></div>
          <div><dt>状态</dt><dd>{{ PRESENCE_LABEL[devicePresence(detail.device.last_seen_at)] }}</dd></div>
          <div><dt>型号</dt><dd>{{ detail.device.model || '未记录' }}</dd></div>
          <div><dt>固件</dt><dd>{{ detail.device.firmware_version || '待设备上报' }}</dd></div>
          <div><dt>最近同步</dt><dd>{{ formatAdminTime(detail.device.last_seen_at) }}</dd></div>
          <div><dt>登记时间</dt><dd>{{ formatAdminTime(detail.device.created_at) }}</dd></div>
          <div><dt>绑定码</dt><dd>{{ detail.device.bind_code || '未签发' }}<br><span class="admin-note">持有绑定码即可认领设备，请不要公开转发。</span></dd></div>
        </dl>
        <form class="admin-form" @submit.prevent="saveName">
          <label class="admin-field"><span>设备名称</span><input v-model="nameDraft" type="text" maxlength="80"></label>
          <p v-if="detailError" class="m-error" role="alert">{{ detailError }}</p>
          <div class="admin-actions"><button class="m-primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存名称' }}</button></div>
        </form>
        <section class="admin-section">
          <h3>最近采样</h3>
          <p v-if="!detail.latest" class="admin-note">还没有采样。</p>
          <dl v-else class="admin-facts">
            <div><dt>时间</dt><dd>{{ formatAdminTime(detail.latest.recorded_at) }}</dd></div>
            <div><dt>高度</dt><dd>{{ metric(detail.latest.height_mm, 'mm') }}</dd></div>
            <div><dt>温度</dt><dd>{{ metric(detail.latest.temperature_c, '°C') }}</dd></div>
            <div><dt>湿度</dt><dd>{{ metric(detail.latest.humidity_percent, '%') }}</dd></div>
            <div><dt>电量</dt><dd>{{ metric(detail.latest.battery_percent, '%') }}</dd></div>
          </dl>
        </section>
        <section class="admin-section">
          <h3>绑定成员</h3>
          <p v-if="!detail.members.length" class="admin-note">还没有人绑定这台设备。</p>
          <ul v-else>
            <li v-for="item in detail.members" :key="item.user_id">{{ personLabel(item.profile) }} · {{ memberRoleLabel(item.role) }}<br><span class="admin-note">{{ item.profile?.system_user_id }} · {{ formatAdminTime(item.created_at) }}</span></li>
          </ul>
        </section>
        <section class="admin-section">
          <h3>酵种关联</h3>
          <p v-if="!detail.links.length" class="admin-note">没有关联记录。</p>
          <ul v-else>
            <li v-for="item in detail.links" :key="item.id">{{ item.starter?.name || '未命名酵种' }} · {{ item.active_to ? '已结束' : '关联中' }}<br><span class="admin-note">{{ personLabel(item.profile) }} · {{ formatAdminTime(item.active_from) }}</span></li>
          </ul>
        </section>
      </template>
    </AdminDrawer>
  </section>
</template>
