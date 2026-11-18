<script setup>
import { onMounted, ref } from 'vue';
import { fetchOverview } from '../../services/admin.service.js';

const loading = ref(true);
const error = ref('');
const stats = ref(null);

const cards = [
  { key: 'users', label: '用户', hint: (row) => `其中管理员 ${row.admins || 0}` },
  { key: 'devices', label: '设备', hint: (row) => `已连接 ${row.devices_online || 0}` },
  { key: 'bindings', label: '设备绑定', hint: (row) => `酵种关联中 ${row.starter_links || 0}` },
  { key: 'active_rounds', label: '进行中的发酵', hint: () => '尚未结束，也没有下一次喂养' },
  { key: 'starters', label: '在用酵种', hint: () => '不含已归档' },
  { key: 'feedback', label: '意见反馈', hint: () => '用户提交的全部反馈' }
];

async function load() {
  loading.value = true;
  error.value = '';
  try { stats.value = await fetchOverview(); }
  catch (cause) { error.value = cause.message; }
  finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <section>
    <p class="admin-lead">账号、设备、绑定和发酵轮次的当前数量。日常查阅对所有管理员开放。</p>
    <p v-if="loading" class="admin-note" role="status">正在读取概览…</p>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="m-secondary" @click="load">重试</button></p>
    <div v-else class="admin-stats">
      <article v-for="card in cards" :key="card.key" class="admin-stat">
        <span>{{ card.label }}</span>
        <strong>{{ stats?.[card.key] ?? 0 }}</strong>
        <small>{{ card.hint(stats || {}) }}</small>
      </article>
    </div>
  </section>
</template>
