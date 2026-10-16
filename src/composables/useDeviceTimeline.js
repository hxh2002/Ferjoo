import { onScopeDispose, ref, toValue, watch } from 'vue';
import { mobileDeviceService } from '../services/mobile-device.service.js';

export function useDeviceTimeline(deviceId, range) {
  const rows = ref([]);
  const loading = ref(false);
  const error = ref('');
  const completeness = ref('complete');
  let version = 0;

  async function refresh() {
    const request = ++version;
    const id = toValue(deviceId);
    const requestedRange = { ...toValue(range) };
    rows.value = [];
    error.value = '';
    completeness.value = 'complete';
    loading.value = Boolean(id);
    if (!id) return;
    try {
      const service = await mobileDeviceService();
      if (request !== version) return;
      const result = await service.range(id, { ...requestedRange, onPage(page) {
        if (request === version) rows.value = page;
      } });
      if (request !== version) return;
      rows.value = result.rows;
      error.value = result.error;
      completeness.value = result.error ? (result.rows.length ? 'partial' : 'failed') : result.limited ? 'limited' : 'complete';
    } catch (cause) {
      if (request !== version) return;
      error.value = cause?.message || '设备数据加载失败。';
      completeness.value = 'failed';
    } finally {
      if (request === version) loading.value = false;
    }
  }
  watch(() => [toValue(deviceId), toValue(range)], refresh, { immediate: true, deep: true });
  onScopeDispose(() => { version += 1; });
  return { rows, loading, error, completeness, refresh };
}
