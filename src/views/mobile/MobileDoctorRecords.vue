<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords } from '../../services/care.service.js';
import { formatDiagnosisRecord } from '../../lib/mobile-records.js';
import { isUuid } from '../../lib/uuid.js';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../../lib/mobile-guest.js';
import MGuestNotice from '../../components/mobile/MGuestNotice.vue';
import timelineDot from '../../assets/icons/doctor-timeline-dot.svg';

defineOptions({ name: 'MobileDoctorRecords' });
const route = useRoute();
const auth = useAuth();
const headerTone = inject('mobileHeaderTone', null);
const guest = computed(() => isGuest(auth));
const authPending = computed(() => isAuthPending(auth));
const rows = ref([]);
const loading = ref(false);
const error = ref('');
let generation = 0;

const records = computed(() => rows.value.map((row) => ({ ...formatDiagnosisRecord(row), id: row.id })));

async function load() {
  const token = ++generation;
  const owner = auth.user.value?.id;
  error.value = '';
  rows.value = [];
  if (!owner) return;
  loading.value = true;
  try {
    const starter = typeof route.query.starter === 'string' && isUuid(route.query.starter) ? route.query.starter : undefined;
    const list = await listCareRecords({ userId: owner, ...(starter ? { starterId: starter } : {}), kind: 'observation', diagnosisOnly: true, limit: 50 });
    if (token === generation) rows.value = list;
  } catch (cause) {
    if (token === generation) error.value = cause?.message || '诊断记录读取失败，请重试。';
  } finally {
    if (token === generation) loading.value = false;
  }
}
watch([() => auth.user.value?.id, () => route.query.starter], () => { auth.init().then(load); }, { immediate: true });
onMounted(() => { if (headerTone) headerTone.value = 'detail'; });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>

<template>
  <main class="m-page doctor-records">
    <header class="doctor-head">
      <h1>诊断记录</h1>
      <small>查看之前保存的诊断结果</small>
    </header>
    <div v-if="loading" class="m-skeleton" role="status" aria-label="正在读取诊断记录"><span></span><span></span><span></span></div>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="retry" @click="load">重试</button></p>
    <MGuestNotice
      v-else-if="authPending"
      compact
      title="正在恢复登录状态"
      description="稍候即可读取本账号的诊断记录。"
      :login-to="guestLoginTarget(route)"
    />
    <MGuestNotice
      v-else-if="guest"
      title="登录后查看诊断记录"
      description="诊断记录按账号保存，登录后会回到当前页面。"
      :login-to="guestLoginTarget(route)"
      :register-to="guestRegisterTarget(route)"
      register
    />
    <section v-else-if="!records.length" class="empty">
      <p>还没有保存过诊断结果</p>
      <RouterLink class="empty-return" to="/doctor/rounds">选择一次喂养开始诊断</RouterLink>
    </section>
    <ol v-else class="record-timeline">
      <li v-for="record in records" :key="record.id">
        <img class="record-dot" :src="timelineDot" alt="" width="10" height="10" />
        <RouterLink class="record-card" :to="`/reports/${encodeURIComponent(record.id)}`">
          <span><strong>{{ record.title }}</strong><small>{{ record.detail }}</small><small v-if="record.diagnosed">{{ record.diagnosed }}</small></span>
          <span class="record-chevron" aria-hidden="true">›</span>
        </RouterLink>
      </li>
    </ol>
  </main>
</template>

<style scoped>
/* 542:3055：顶栏底 91 → 标题 132（41）→ 说明 169（6）→ 首条 224（35）。 */
.mobile-area .m-page.doctor-records{padding-top:41px;gap:0}
.mobile-area .m-page.doctor-records > .doctor-head{margin-bottom:35px}
.mobile-area .m-page.doctor-records .doctor-head h1{margin:0;font-size:22px;line-height:31px;font-weight:500;letter-spacing:0}
.doctor-head small{display:block;margin:6px 0 0;color:var(--text-secondary);font-size:14px;line-height:20px}
.retry{min-height:44px;padding:0 12px;border:1px solid var(--border-warm);border-radius:17px;background:var(--surface-card);color:var(--text-primary);font:inherit;font-size:14px}
.empty{display:grid;gap:12px;margin:14px 0 0;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
.empty p{margin:0}
.empty-return{display:inline-flex;align-items:center;justify-content:center;justify-self:start;min-height:44px;padding:0 18px;border:1px solid var(--border-warm);border-radius:var(--m-radius-button);background:var(--surface-card);color:var(--text-primary);font-size:14px;font-weight:500;text-decoration:none}
/* 时间线：圆点 10 落在条目 (2, 18)，引导线 x=6.5 从 34 连到下一条圆点顶（条目 80 + 间距 10 + 18）。卡片 290×80 起于 x=20，右侧留 17。 */
.mobile-area .m-page.doctor-records .record-timeline{display:grid;gap:10px;margin:0;padding:0 17px 0 0;list-style:none}
.record-timeline li{position:relative;padding-left:20px}
.record-timeline li:not(:last-child)::after{content:'';position:absolute;left:6.5px;top:34px;bottom:-28px;width:1px;background:var(--m-timeline-line)}
.record-dot{position:absolute;left:2px;top:18px;display:block}
.record-card{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-height:80px;box-sizing:border-box;padding:14px 9px 12px 16px;border-radius:18px;background:var(--m-record-surface);color:inherit;text-decoration:none}
.record-card > span:first-child{display:grid;gap:8px;min-width:0}
/* 结论标题最长二十余字，单行省略会把「越过峰值 / 明显偏慢」这类区分点截掉，最多放两行。 */
.record-card strong{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;font-size:var(--text-md);line-height:21px;font-weight:500}
.record-card small{color:var(--text-secondary);font-size:var(--text-xs);line-height:17px}
.record-chevron{align-self:center;flex:none;width:13px;color:var(--m-date-capsule-text);font-size:22px;line-height:26px}
</style>
