<script setup>
import { onMounted, ref, watch } from 'vue';
import AdminDrawer from '../../components/admin/AdminDrawer.vue';
import AdminPager from '../../components/admin/AdminPager.vue';
import { ADMIN_PAGE_SIZE, closureDetailLabel, formatAdminTime, formatRatio, personLabel, roundStatus } from '../../lib/admin-access.js';
import { getRound, listRounds } from '../../services/admin.service.js';

const query = ref('');
const status = ref('all');
const page = ref(0);
const rows = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
const selectedId = ref('');
let timer;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await listRounds({ query: query.value, status: status.value, page: page.value });
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
watch(status, () => { page.value = 0; load(); });
function turn(next) { page.value = next; load(); }
async function openRound(row) {
  selectedId.value = row.id;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try { detail.value = await getRound(row.id); }
  catch (cause) { detailError.value = cause.message; }
  finally { detailLoading.value = false; }
}
onMounted(load);
</script>

<template>
  <section>
    <p class="admin-lead">每一次喂养是一轮发酵。结束由用户手动确认、设备自动归档，或下一次喂养接上。后台不改写这些事实。</p>
    <div class="admin-toolbar">
      <input v-model="query" type="search" placeholder="搜索账号、系统 ID 或酵种" aria-label="搜索发酵轮次" @input="search">
      <select v-model="status" aria-label="轮次状态">
        <option value="all">全部状态</option>
        <option value="active">进行中</option>
        <option value="closed">已结束</option>
      </select>
    </div>
    <p v-if="loading" class="admin-note" role="status">正在读取发酵轮次…</p>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="m-secondary" @click="load">重试</button></p>
    <p v-else-if="!rows.length" class="admin-note">没有符合条件的发酵轮次。</p>
    <div v-else class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>喂养时间</th><th>账号</th><th>酵种</th><th>比例</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :class="{ 'is-selected': selectedId === row.id }">
            <td>{{ formatAdminTime(row.occurred_at) }}</td>
            <td>{{ row.display_name || row.system_user_id }}<br><span class="admin-note">{{ row.email }}</span></td>
            <td>{{ row.starter_name }}<template v-if="row.starter_archived_at"> · 已归档</template></td>
            <td>{{ formatRatio(row.ratio) }}</td>
            <td><span class="admin-badge" :class="roundStatus(row).key === 'active' ? 'is-live' : 'is-ended'">{{ roundStatus(row).label }}</span></td>
            <td><button type="button" class="m-secondary" @click="openRound(row)">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <AdminPager :page="page" :total="total" :page-size="ADMIN_PAGE_SIZE" @page="turn" />

    <AdminDrawer :open="Boolean(selectedId)" title="发酵轮次" @close="selectedId = ''">
      <p v-if="detailLoading" class="admin-note" role="status">正在读取详情…</p>
      <p v-else-if="detailError" class="m-error" role="alert">{{ detailError }}</p>
      <template v-else-if="detail">
        <dl class="admin-facts">
          <div><dt>状态</dt><dd>{{ roundStatus(detail).label }}<template v-if="roundStatus(detail).source"> · {{ roundStatus(detail).source }}</template></dd></div>
          <div><dt>账号</dt><dd>{{ personLabel(detail) }}（{{ detail.system_user_id }}）</dd></div>
          <div><dt>邮箱</dt><dd>{{ detail.email }}</dd></div>
          <div><dt>酵种</dt><dd>{{ detail.starter_name }}<template v-if="detail.starter_archived_at"> · 已归档</template></dd></div>
          <div><dt>喂养时间</dt><dd>{{ formatAdminTime(detail.occurred_at) }}</dd></div>
          <div><dt>喂养比例</dt><dd>{{ formatRatio(detail.ratio) }}</dd></div>
          <div><dt>起始高度</dt><dd>{{ detail.baseline_height_mm ? `${detail.baseline_height_mm} mm` : '未记录' }}<template v-if="detail.baseline_source"> · {{ detail.baseline_source === 'manual' ? '手工记录' : detail.baseline_source === 'device' ? '设备读取' : detail.baseline_source }}</template></dd></div>
          <div><dt>当时关联的设备</dt><dd>{{ detail.device ? `${detail.device.name || '未命名设备'}（${detail.device.device_id}）` : '这一时刻没有关联设备' }}</dd></div>
          <div><dt>结束时间</dt><dd>{{ detail.ended_at ? formatAdminTime(detail.ended_at) : detail.next_feeding_at ? `下一次喂养 ${formatAdminTime(detail.next_feeding_at)}` : '尚未结束' }}</dd></div>
          <div v-if="closureDetailLabel(detail.detail)"><dt>结束说明</dt><dd>{{ closureDetailLabel(detail.detail) }}</dd></div>
        </dl>
        <section class="admin-section">
          <h3>这一轮的诊断</h3>
          <p v-if="!detail.observations?.length" class="admin-note">还没有基于这次喂养的诊断。</p>
          <ul v-else>
            <li v-for="item in detail.observations" :key="item.id">{{ item.title }}<br><span class="admin-note">{{ formatAdminTime(item.occurred_at) }}</span></li>
          </ul>
        </section>
        <p class="admin-note">结束记录一旦写入就不会被后台覆盖。</p>
      </template>
    </AdminDrawer>
  </section>
</template>
