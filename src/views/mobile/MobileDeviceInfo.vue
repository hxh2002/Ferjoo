<script setup>
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService, mobileError } from '../../services/mobile-device.service.js';

const headerTone = inject('mobileHeaderTone', null);
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
  if (headerTone) headerTone.value = 'settings';
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
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>

<template>
  <main class="m-page device-info">
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <template v-else-if="device">
      <ul class="info-card">
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 10h14M7 6h10M6 14h12M9 18h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
          <span>设备编号</span>
          <strong>{{ device.device_id }}</strong>
        </li>
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><rect x="4" y="6" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 20h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
          <span>设备型号</span>
          <strong>{{ device.model || '未提供' }}</strong>
        </li>
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M19 12a7 7 0 1 1-1.7-4.5M19 4v3.5h-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span>最近同步</span>
          <strong>{{ formatSeen(device.last_seen_at) }}</strong>
        </li>
        <li>
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 12h6M12 9v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
          <span>固件版本</span>
          <strong>{{ device.firmware_version || '待设备上报' }}</strong>
        </li>
      </ul>
      <p class="footnote">排查连接问题时，可提供设备编号和固件版本。</p>
    </template>
  </main>
</template>

<style scoped>
.mobile-area .m-page.device-info{padding-top:16px}
.info-card{list-style:none;margin:0;padding:4px 16px;border-radius:20px;background:var(--surface-card);box-shadow:var(--m-shadow-button)}
.info-card li{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:68px}
.info-card li + li{border-top:1px solid var(--border-warm)}
.disc{display:grid;place-items:center;width:32px;height:32px;color:var(--brand-action)}
.info-card span{font-size:16px;line-height:24px}
.info-card strong{color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400;text-align:right;overflow-wrap:anywhere}
.footnote{margin:16px 0 0;color:var(--text-secondary);font-size:14px;line-height:21px}
</style>
