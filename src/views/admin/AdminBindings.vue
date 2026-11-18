<script setup>
import { onMounted, ref, watch } from 'vue';
import AdminDrawer from '../../components/admin/AdminDrawer.vue';
import AdminPager from '../../components/admin/AdminPager.vue';
import { ADMIN_PAGE_SIZE, formatAdminTime, memberRoleLabel, personLabel } from '../../lib/admin-access.js';
import { listBindings, listStarterLinks } from '../../services/admin.service.js';

const mode = ref('members');
const query = ref('');
const active = ref('active');
const page = ref(0);
const rows = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const selected = ref(null);
let timer;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = mode.value === 'members'
      ? await listBindings({ query: query.value, page: page.value })
      : await listStarterLinks({ query: query.value, active: active.value, page: page.value });
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
watch([mode, active], () => { page.value = 0; selected.value = null; load(); });
function turn(next) { page.value = next; load(); }
onMounted(load);
</script>

<template>
  <section>
    <p class="admin-lead">谁绑定了哪台设备，以及酵种目前关联着哪台设备。解绑仍由用户在自己的设备页完成，后台只查阅。</p>
    <div class="admin-tabs" role="tablist">
      <button type="button" :class="{ 'is-active': mode === 'members' }" @click="mode = 'members'">设备成员</button>
      <button type="button" :class="{ 'is-active': mode === 'links' }" @click="mode = 'links'">酵种关联</button>
    </div>
    <div class="admin-toolbar">
      <input v-model="query" type="search" placeholder="搜索账号、设备或酵种" aria-label="搜索绑定" @input="search">
      <select v-if="mode === 'links'" v-model="active" aria-label="关联状态">
        <option value="active">关联中</option>
        <option value="ended">已结束</option>
        <option value="all">全部</option>
      </select>
    </div>
    <p v-if="loading" class="admin-note" role="status">正在读取绑定…</p>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="m-secondary" @click="load">重试</button></p>
    <p v-else-if="!rows.length" class="admin-note">没有符合条件的绑定。</p>
    <div v-else-if="mode === 'members'" class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>账号</th><th>设备</th><th>身份</th><th>绑定时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.device_id}-${row.user_id}`">
            <td>{{ personLabel(row.profile) }}<br><span class="admin-note">{{ row.profile?.system_user_id }}</span></td>
            <td>{{ row.device?.name || row.device_id }}<br><span class="admin-note">{{ row.device_id }}</span></td>
            <td><span class="admin-badge" :class="{ 'is-muted': row.role !== 'owner' }">{{ memberRoleLabel(row.role) }}</span></td>
            <td>{{ formatAdminTime(row.created_at) }}</td>
            <td><button type="button" class="m-secondary" @click="selected = row">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>酵种</th><th>设备</th><th>账号</th><th>状态</th><th>开始</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.starter?.name || '未命名酵种' }}</td>
            <td>{{ row.device?.name || row.device_id }}</td>
            <td>{{ personLabel(row.profile) }}</td>
            <td><span class="admin-badge" :class="row.active_to ? 'is-ended' : 'is-live'">{{ row.active_to ? '已结束' : '关联中' }}</span></td>
            <td>{{ formatAdminTime(row.active_from) }}</td>
            <td><button type="button" class="m-secondary" @click="selected = row">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <AdminPager :page="page" :total="total" :page-size="ADMIN_PAGE_SIZE" @page="turn" />

    <AdminDrawer :open="Boolean(selected)" :title="mode === 'members' ? '绑定详情' : '关联详情'" @close="selected = null">
      <dl v-if="selected && mode === 'members'" class="admin-facts">
        <div><dt>账号</dt><dd>{{ personLabel(selected.profile) }}</dd></div>
        <div><dt>系统 ID</dt><dd>{{ selected.profile?.system_user_id || '—' }}</dd></div>
        <div><dt>邮箱</dt><dd>{{ selected.profile?.email || '—' }}</dd></div>
        <div><dt>设备</dt><dd>{{ selected.device?.name || '未命名设备' }}</dd></div>
        <div><dt>设备编号</dt><dd>{{ selected.device_id }}</dd></div>
        <div><dt>型号</dt><dd>{{ selected.device?.model || '未记录' }}</dd></div>
        <div><dt>成员身份</dt><dd>{{ memberRoleLabel(selected.role) }}</dd></div>
        <div><dt>绑定时间</dt><dd>{{ formatAdminTime(selected.created_at) }}</dd></div>
      </dl>
      <dl v-else-if="selected" class="admin-facts">
        <div><dt>酵种</dt><dd>{{ selected.starter?.name || '未命名酵种' }}<template v-if="selected.starter?.archived_at"> · 已归档</template></dd></div>
        <div><dt>账号</dt><dd>{{ personLabel(selected.profile) }}（{{ selected.profile?.system_user_id || '—' }}）</dd></div>
        <div><dt>设备</dt><dd>{{ selected.device?.name || selected.device_id }}</dd></div>
        <div><dt>设备编号</dt><dd>{{ selected.device_id }}</dd></div>
        <div><dt>状态</dt><dd>{{ selected.active_to ? '已结束' : '关联中' }}</dd></div>
        <div><dt>开始</dt><dd>{{ formatAdminTime(selected.active_from) }}</dd></div>
        <div><dt>结束</dt><dd>{{ selected.active_to ? formatAdminTime(selected.active_to) : '仍在关联' }}</dd></div>
      </dl>
    </AdminDrawer>
  </section>
</template>
