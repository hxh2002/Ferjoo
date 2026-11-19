<script setup>
import { onMounted, ref, watch } from 'vue';
import AdminDrawer from '../../components/admin/AdminDrawer.vue';
import AdminPager from '../../components/admin/AdminPager.vue';
import { ADMIN_PAGE_SIZE, formatAdminTime, personLabel } from '../../lib/admin-access.js';
import {
  ANALYTICS_SUMMARY_LIMIT,
  EVENT_LABELS,
  PAGE_LABELS,
  analyticsSince,
  describeProperties,
  eventLabel,
  formatDuration,
  pageLabel
} from '../../lib/analytics-report.js';
import { listAnalyticsEvents, loadAnalyticsSummary } from '../../services/admin.service.js';

const range = ref('7d');
const event = ref('');
const pageName = ref('');
const page = ref(0);
const rows = ref([]);
const total = ref(0);
const summary = ref(null);
const loading = ref(true);
const error = ref('');
const selected = ref(null);

const eventOptions = Object.entries(EVENT_LABELS);
const pageOptions = Object.entries(PAGE_LABELS);

async function load() {
  loading.value = true;
  error.value = '';
  const since = analyticsSince(range.value);
  try {
    const [summaryResult, listResult] = await Promise.all([
      loadAnalyticsSummary({ since }),
      listAnalyticsEvents({ since, event: event.value, pageName: pageName.value, page: page.value })
    ]);
    summary.value = summaryResult;
    rows.value = listResult.rows;
    total.value = listResult.total;
    page.value = listResult.page;
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loading.value = false;
  }
}
watch(range, () => { page.value = 0; selected.value = null; load(); });
watch([event, pageName], () => { page.value = 0; selected.value = null; load(); });
function turn(next) { page.value = next; load(); }
onMounted(load);
</script>

<template>
  <section>
    <p class="admin-lead">查看已记录的使用行为。停留只计页面在前台的时间，切到后台或离开后结算；设备数据页沿用原有的停留事件。</p>
    <div class="admin-toolbar">
      <select v-model="range" aria-label="统计范围">
        <option value="24h">最近 24 小时</option>
        <option value="7d">最近 7 天</option>
        <option value="30d">最近 30 天</option>
      </select>
    </div>
    <p v-if="loading" class="admin-note" role="status">正在读取使用数据…</p>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="m-secondary" @click="load">重试</button></p>
    <template v-else-if="summary">
      <div class="admin-stats">
        <article class="admin-stat"><span>事件</span><strong>{{ summary.events }}</strong><small>当前范围内读到的行为</small></article>
        <article class="admin-stat"><span>独立用户</span><strong>{{ summary.users }}</strong><small>至少产生过一条事件</small></article>
        <article class="admin-stat"><span>有停留的访问</span><strong>{{ summary.dwellVisits }}</strong><small>带停留时长的页面访问</small></article>
        <article class="admin-stat"><span>平均停留</span><strong>{{ formatDuration(summary.averageMs) }}</strong><small>只按有停留的访问计算</small></article>
      </div>
      <p v-if="summary.truncated" class="admin-note">汇总只覆盖最近 {{ ANALYTICS_SUMMARY_LIMIT }} 条事件。下方明细仍按筛选分页查看全部。</p>

      <section class="admin-section">
        <h3>页面停留</h3>
        <p v-if="!summary.pages.length" class="admin-note">这段时间还没有带停留时长的访问。</p>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>页面</th><th>访问</th><th>用户</th><th>总停留</th><th>平均停留</th></tr></thead>
            <tbody>
              <tr v-for="item in summary.pages" :key="item.page">
                <td>{{ pageLabel(item.page) }}</td>
                <td>{{ item.visits }}</td>
                <td>{{ item.users }}</td>
                <td>{{ formatDuration(item.durationMs) }}</td>
                <td>{{ formatDuration(item.visits ? item.durationMs / item.visits : 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-section">
        <h3>事件</h3>
        <p v-if="!summary.eventCounts.length" class="admin-note">这段时间还没有行为事件。</p>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>事件</th><th>次数</th><th>用户</th></tr></thead>
            <tbody>
              <tr v-for="item in summary.eventCounts" :key="item.event">
                <td>{{ eventLabel(item.event) }}</td>
                <td>{{ item.count }}</td>
                <td>{{ item.users }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-section">
        <h3>最近事件</h3>
        <div class="admin-toolbar">
          <select v-model="event" aria-label="按事件筛选">
            <option value="">全部事件</option>
            <option v-for="[value, label] in eventOptions" :key="value" :value="value">{{ label }}</option>
          </select>
          <select v-model="pageName" aria-label="按页面筛选">
            <option value="">全部页面</option>
            <option v-for="[value, label] in pageOptions" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <p v-if="!rows.length" class="admin-note">没有符合条件的事件。</p>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>时间</th><th>事件</th><th>页面</th><th>账号</th><th>停留</th><th></th></tr></thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td>{{ formatAdminTime(row.occurred_at) }}</td>
                <td>{{ eventLabel(row.event_name) }}</td>
                <td>{{ pageLabel(row.page) }}</td>
                <td>{{ personLabel(row.profile) }}<br><span class="admin-note">{{ row.profile?.system_user_id || '—' }}</span></td>
                <td>{{ formatDuration(Number(row.properties?.duration_ms)) }}</td>
                <td><button type="button" class="admin-row-action" @click="selected = row">查看</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <AdminPager :page="page" :total="total" :page-size="ADMIN_PAGE_SIZE" @page="turn" />
      </section>
    </template>

    <AdminDrawer :open="Boolean(selected)" :title="selected ? eventLabel(selected.event_name) : '事件详情'" @close="selected = null">
      <dl v-if="selected" class="admin-facts">
        <div><dt>时间</dt><dd>{{ formatAdminTime(selected.occurred_at) }}</dd></div>
        <div><dt>页面</dt><dd>{{ pageLabel(selected.page) }}</dd></div>
        <div><dt>账号</dt><dd>{{ personLabel(selected.profile) }}（{{ selected.profile?.system_user_id || '—' }}）</dd></div>
        <div><dt>会话</dt><dd>{{ selected.session_id }}</dd></div>
        <div v-for="item in describeProperties(selected.properties)" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div>
      </dl>
    </AdminDrawer>
  </section>
</template>
