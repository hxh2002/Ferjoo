<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService, mobileError } from '../../services/mobile-device.service.js';

const route = useRoute();
const auth = useAuth();
const device = ref(null);
const error = ref('');
function formatSeen(value) {
  const seen = Date.parse(value);
  if (!Number.isFinite(seen)) return '从未同步';
  const date = new Date(seen);
  const now = new Date();
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return date.toDateString() === now.toDateString() ? `今天 ${clock}` : date.toLocaleString('zh-CN', { hour12: false });
}
onMounted(async () => {
  await auth.init();
  const userId = auth.user.value?.id;
  if (!userId) return;
  try {
    const service = await mobileDeviceService();
    device.value = await service.getDevice(route.params.deviceId, userId);
    if (!device.value) error.value = '设备不存在或共享权限已变化。';
  } catch (cause) {
    error.value = mobileError(cause);
  }
});
</script>

<template>
  <main class="m-page device-info">
    <h1>设备信息</h1>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <template v-else-if="device">
      <ul class="info-card">
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M3.5 6.5h9M5 3.5h6M4 9.5h8M6 12.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>
          <span>设备编号</span>
          <strong>{{ device.device_id }}</strong>
        </li>
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect x="2.5" y="4" width="11" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 12.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>
          <span>设备型号</span>
          <strong>{{ device.model || '未提供' }}</strong>
        </li>
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M13 8a5 5 0 1 1-1.2-3.2M13 2.5V5h-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span>最近同步</span>
          <strong>{{ formatSeen(device.last_seen_at) }}</strong>
        </li>
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 8h4M8 6v4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>
          <span>固件版本</span>
          <strong>{{ device.firmware_version || '待设备上报' }}</strong>
        </li>
      </ul>
      <p class="footnote">排查连接问题时，可提供设备编号和固件版本。</p>
    </template>
  </main>
</template>

<style scoped>
h1{margin:0 0 16px;font-size:28px;line-height:36px;font-weight:500}
.info-card{list-style:none;margin:0;padding:4px 16px;border-radius:20px;background:var(--surface-card);box-shadow:0 4px 16px rgba(48,37,31,.06)}
.info-card li{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:68px}
.info-card li + li{border-top:1px solid var(--border-warm)}
.disc{display:grid;place-items:center;width:32px;height:32px;border-radius:16px;background:var(--m-icon-disc);color:var(--brand-action)}
.info-card span{font-size:16px;line-height:24px}
.info-card strong{color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400;text-align:right;overflow-wrap:anywhere}
.footnote{margin:16px 0 0;color:var(--text-secondary);font-size:14px;line-height:21px}
</style>
