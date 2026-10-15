<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { createStarter, listCareRecords, listStarters } from '../../services/care.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { loadSessionReport } from '../../services/mobile-diagnosis.service.js';

const auth = useAuth();
const starters = ref([]);
const devices = ref([]);
const starterId = ref('');
const record = ref(null);
const report = ref(null);
const name = ref('');
const loading = ref(false);
const error = ref('');
const accountId = computed(() => auth.user.value?.id || '');
const starter = computed(() => starters.value.find((item) => item.id === starterId.value));
const latestDevice = computed(() => devices.value[0]);
async function load() {
  error.value = '';
  if (!accountId.value) { starters.value = []; devices.value = []; record.value = null; return; }
  loading.value = true;
  try {
    const [starterRows, service] = await Promise.all([listStarters(), mobileDeviceService()]);
    starters.value = starterRows;
    devices.value = accountId.value ? await service.listDevices(accountId.value) : [];
    if (!starterId.value && starterRows[0]) starterId.value = starterRows[0].id;
    const records = starterId.value ? await listCareRecords({ starterId: starterId.value }) : [];
    record.value = records[0] || null;
    report.value = loadSessionReport(accountId.value);
  } catch (e) { error.value = e?.message || '读取失败，请稍后重试。'; }
  finally { loading.value = false; }
}
async function addStarter() {
  if (!auth.user.value) { error.value = '添加酵种前请先登录。'; return; }
  if (!name.value.trim()) return;
  error.value = '';
  try {
    const created = await createStarter(name.value);
    starters.value.unshift(created);
    starterId.value = created.id;
    name.value = '';
  } catch (e) { error.value = e?.message || '添加失败，请稍后重试。'; }
}
onMounted(async () => { await auth.init(); await load(); });
</script>

<template>
  <main class="m-page">
    <section class="m-card m-intro">
      <p class="m-eyebrow">今天</p>
      <h1>{{ starter?.name || (auth.user.value ? '先从这份酵种开始' : '先看清现在的状态') }}</h1>
      <p>{{ auth.user.value ? '先看对象、时效和下一步；设备只是可选数据来源。' : '登录后可以记录喂养、观察并保存建议；下面为结构示例，不代表你的数据。' }}</p>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="m-muted" role="status">正在读取当前养护上下文…</p>
    </section>

    <section v-if="!auth.user.value" class="m-card">
      <h2>开始你的养护任务</h2>
      <p class="m-muted">示例：上次观察为“轻微上涨”；下一步通常是记录本次观察，而不是先理解设备字段。</p>
      <RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/today' } }">登录后开始记录</RouterLink>
      <RouterLink class="m-secondary" :to="{ path: '/register', query: { redirect: '/today' } }">邀请码注册</RouterLink>
    </section>

    <template v-else>
      <section class="m-card">
        <h2>当前对象</h2>
        <label v-if="starters.length" class="m-field">选择酵种
          <select v-model="starterId"><option v-for="item in starters" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        </label>
        <p v-else class="m-muted">还没有酵种档案；没有设备也可以手工养护。</p>
        <form class="m-inline" @submit.prevent="addStarter"><input v-model="name" maxlength="80" placeholder="例如：小橙"><button class="m-secondary" type="submit">添加酵种</button></form>
        <p v-if="latestDevice" class="m-muted">数据来源：{{ latestDevice.name || latestDevice.device_id }} · 最近接收 {{ latestDevice.last_seen_at ? new Date(latestDevice.last_seen_at).toLocaleString() : '从未接收' }}</p>
      </section>

      <section class="m-card">
        <h2>当前状态</h2>
        <template v-if="report"><p class="m-badge">{{ report.result.badge }}</p><p>{{ report.result.title }}</p><p class="m-muted">观察时刻：{{ new Date(report.occurredAt).toLocaleString() }} · {{ report.savedId ? '已云端保存' : '本会话结果，未云端保存' }}</p></template>
        <template v-else-if="record"><p>最近{{ record.kind === 'feeding' ? '喂养' : '观察' }}：{{ record.ratio || record.result?.title || '已记录' }}</p><p class="m-muted">{{ new Date(record.occurred_at).toLocaleString() }}</p></template>
        <p v-else class="m-muted">还没有本轮记录。先记录已经发生的喂养，或直接记录这次观察。</p>
        <div class="m-action-list">
          <RouterLink class="m-primary" :to="{ path: '/checkin', query: starterId ? { starter: starterId } : {} }">记录观察</RouterLink>
          <RouterLink class="m-secondary" :to="{ path: '/feeding', query: starterId ? { starter: starterId } : {} }">记录喂养</RouterLink>
          <RouterLink v-if="report" class="m-secondary" to="/reports/session">继续这次建议</RouterLink>
        </div>
      </section>

      <section class="m-card">
        <h2>数据时效</h2>
        <p v-if="latestDevice">设备摘要：{{ latestDevice.my_role === 'owner' ? '所有者' : '成员' }}；最后接收时间不能单独代表读数很新。</p>
        <p v-else class="m-muted">未关联设备；手工记录照常可用。</p>
        <RouterLink class="m-secondary" to="/me/devices">设备设置</RouterLink>
      </section>
    </template>
  </main>
</template>

<style scoped>
.m-page{max-width:42rem;margin:auto;padding-bottom:calc(8rem + env(safe-area-inset-bottom))}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-eyebrow,.m-badge{margin:0 0 .5rem;color:#a44213;font-weight:700}.m-action-list,.m-inline{display:flex;flex-wrap:wrap;gap:.75rem}.m-field{display:grid;gap:.5rem;margin:1rem 0}.m-field select,.m-inline input{box-sizing:border-box;min-height:48px;padding:.75rem;font:inherit;border:1px solid #938d83;border-radius:0;background:#fff}.m-inline input{flex:1;min-width:12rem}.m-primary,.m-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.7rem 1rem;text-decoration:none;font:inherit;cursor:pointer}.m-primary{flex:1;background:#a44213;color:#fff;border:1px solid #a44213}.m-secondary{border:1px solid #938d83;background:transparent;color:inherit}.m-error{color:#9b2920}.m-muted{color:#625e56;font-size:.92rem;line-height:1.55}
</style>
