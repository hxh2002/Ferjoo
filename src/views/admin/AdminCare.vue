<script setup>
import { onMounted, ref, watch } from 'vue';
import AdminDrawer from '../../components/admin/AdminDrawer.vue';
import AdminPager from '../../components/admin/AdminPager.vue';
import { ADMIN_PAGE_SIZE, formatAdminTime, personLabel } from '../../lib/admin-access.js';
import { listDiagnoses, listFeedback, listStarters, listWelcomeInquiries } from '../../services/admin.service.js';

const mode = ref('starters');
const query = ref('');
const archived = ref('active');
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
    const result = mode.value === 'starters'
      ? await listStarters({ query: query.value, archived: archived.value, page: page.value })
      : mode.value === 'diagnoses'
        ? await listDiagnoses({ query: query.value, page: page.value })
        : mode.value === 'inquiries'
          ? await listWelcomeInquiries({ query: query.value, page: page.value })
          : await listFeedback({ query: query.value, page: page.value });
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
watch([mode, archived], () => { page.value = 0; selected.value = null; load(); });
function turn(next) { page.value = next; load(); }
function diagnosisTitle(row) {
  return row.result?.title || '诊断结果';
}
function inquiryLabel(kind) {
  if (kind === 'stay') return '留资';
  if (kind === 'contact') return '留言';
  return '其他';
}
function inquiryPreview(row) {
  const text = row.message || '';
  if (!text) return '未留';
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}
function emptyCopy() {
  if (mode.value !== 'inquiries') return '没有符合条件的记录。';
  return String(query.value || '').trim()
    ? '没有符合条件的网站留言。'
    : '还没有网站留言。欢迎页提交的留资和留言会显示在这里。';
}
onMounted(load);
</script>

<template>
  <section>
    <p class="admin-lead">酵种、酵种医生的诊断、意见反馈，以及欢迎页提交的留资和留言。诊断正文按保存时的结果展示，后台不会重新计算。</p>
    <div class="admin-tabs" role="tablist">
      <button type="button" :class="{ 'is-active': mode === 'starters' }" @click="mode = 'starters'">酵种</button>
      <button type="button" :class="{ 'is-active': mode === 'diagnoses' }" @click="mode = 'diagnoses'">诊断</button>
      <button type="button" :class="{ 'is-active': mode === 'feedback' }" @click="mode = 'feedback'">意见反馈</button>
      <button type="button" :class="{ 'is-active': mode === 'inquiries' }" @click="mode = 'inquiries'">网站留言</button>
    </div>
    <div class="admin-toolbar">
      <input v-model="query" type="search" :placeholder="mode === 'feedback' ? '搜索反馈内容或账号' : mode === 'inquiries' ? '搜索邮箱、姓名或内容' : '搜索账号或名称'" :aria-label="mode === 'inquiries' ? '搜索网站留言' : mode === 'feedback' ? '搜索意见反馈' : '搜索养护记录'" @input="search">
      <select v-if="mode === 'starters'" v-model="archived" aria-label="归档状态">
        <option value="active">在用</option>
        <option value="archived">已归档</option>
        <option value="all">全部</option>
      </select>
    </div>
    <p v-if="loading" class="admin-note" role="status">正在读取…</p>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="m-secondary" @click="load">重试</button></p>
    <p v-else-if="!rows.length" class="admin-note">{{ emptyCopy() }}</p>
    <div v-else-if="mode === 'starters'" class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>酵种</th><th>账号</th><th>当前设备</th><th>状态</th><th>创建时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.name }}</td>
            <td>{{ personLabel(row.profile) }}<br><span class="admin-note">{{ row.profile?.system_user_id }}</span></td>
            <td>{{ row.device ? (row.device.name || row.device.device_id) : '未关联' }}</td>
            <td><span class="admin-badge" :class="row.archived_at ? 'is-ended' : 'is-live'">{{ row.archived_at ? '已归档' : '在用' }}</span></td>
            <td>{{ formatAdminTime(row.created_at) }}</td>
            <td><button type="button" class="admin-row-action" @click="selected = row">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="mode === 'diagnoses'" class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>诊断</th><th>账号</th><th>酵种</th><th>时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ diagnosisTitle(row) }}</td>
            <td>{{ personLabel(row.profile) }}</td>
            <td>{{ row.starter?.name || '—' }}</td>
            <td>{{ formatAdminTime(row.occurred_at) }}</td>
            <td><button type="button" class="admin-row-action" @click="selected = row">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="mode === 'inquiries'" class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>类型</th><th>邮箱</th><th>姓名</th><th>内容</th><th>时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ inquiryLabel(row.kind) }}</td>
            <td>{{ row.email }}</td>
            <td>{{ row.name || '未留' }}</td>
            <td>{{ inquiryPreview(row) }}</td>
            <td>{{ formatAdminTime(row.created_at) }}</td>
            <td><button type="button" class="admin-row-action" @click="selected = row">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>反馈</th><th>账号</th><th>时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.content.slice(0, 48) }}{{ row.content.length > 48 ? '…' : '' }}</td>
            <td>{{ personLabel(row.profile) }}</td>
            <td>{{ formatAdminTime(row.created_at) }}</td>
            <td><button type="button" class="admin-row-action" @click="selected = row">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <AdminPager :page="page" :total="total" :page-size="ADMIN_PAGE_SIZE" @page="turn" />

    <AdminDrawer :open="Boolean(selected)" :title="mode === 'inquiries' ? '网站留言' : mode === 'feedback' ? '意见反馈' : mode === 'diagnoses' ? '诊断详情' : '酵种详情'" @close="selected = null">
      <dl v-if="selected && mode === 'starters'" class="admin-facts">
        <div><dt>名称</dt><dd>{{ selected.name }}</dd></div>
        <div><dt>账号</dt><dd>{{ personLabel(selected.profile) }}（{{ selected.profile?.system_user_id || '—' }}）</dd></div>
        <div><dt>邮箱</dt><dd>{{ selected.profile?.email || '—' }}</dd></div>
        <div><dt>状态</dt><dd>{{ selected.archived_at ? `已归档 · ${formatAdminTime(selected.archived_at)}` : '在用' }}</dd></div>
        <div><dt>当前设备</dt><dd>{{ selected.device ? `${selected.device.name || '未命名设备'}（${selected.device.device_id}）` : '未关联' }}</dd></div>
        <div><dt>创建时间</dt><dd>{{ formatAdminTime(selected.created_at) }}</dd></div>
      </dl>
      <template v-else-if="selected && mode === 'diagnoses'">
        <dl class="admin-facts">
          <div><dt>标题</dt><dd>{{ diagnosisTitle(selected) }}</dd></div>
          <div><dt>账号</dt><dd>{{ personLabel(selected.profile) }}（{{ selected.profile?.email || '—' }}）</dd></div>
          <div><dt>酵种</dt><dd>{{ selected.starter?.name || '—' }}</dd></div>
          <div><dt>诊断时间</dt><dd>{{ formatAdminTime(selected.occurred_at) }}</dd></div>
        </dl>
        <section class="admin-section">
          <h3>保存时的结果</h3>
          <p class="admin-note">{{ selected.result?.summary || selected.result?.advice || selected.result?.message || '这条诊断没有摘要文字。' }}</p>
        </section>
      </template>
      <template v-else-if="selected && mode === 'inquiries'">
        <dl class="admin-facts">
          <div><dt>类型</dt><dd>{{ inquiryLabel(selected.kind) }}</dd></div>
          <div><dt>邮箱</dt><dd>{{ selected.email }}</dd></div>
          <div><dt>姓名</dt><dd>{{ selected.name || '未留' }}</dd></div>
          <div><dt>提交时间</dt><dd>{{ formatAdminTime(selected.created_at) }}</dd></div>
        </dl>
        <section class="admin-section"><h3>内容</h3><p>{{ selected.message || '这条是留资，没有留言内容。' }}</p></section>
      </template>
      <template v-else-if="selected">
        <dl class="admin-facts">
          <div><dt>账号</dt><dd>{{ personLabel(selected.profile) }}（{{ selected.profile?.email || '—' }}）</dd></div>
          <div><dt>联系方式</dt><dd>{{ selected.contact || '未留' }}</dd></div>
          <div><dt>提交时间</dt><dd>{{ formatAdminTime(selected.created_at) }}</dd></div>
        </dl>
        <section class="admin-section"><h3>内容</h3><p>{{ selected.content }}</p></section>
      </template>
    </AdminDrawer>
  </section>
</template>
