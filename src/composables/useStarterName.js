import { ref, watch, onScopeDispose, unref } from 'vue';
import { listStarters } from '../services/care.service.js';

export function useStarterName(accountId, starterId) {
  const starterName = ref('名称不可用');
  let version = 0;
  watch([() => unref(accountId), () => unref(starterId)], async ([owner, id]) => {
    const token = ++version;
    starterName.value = id ? '正在加载名称…' : '';
    if (!id) return;
    if (!owner || owner === 'guest') {
      starterName.value = '名称不可用（请登录后查看）';
      return;
    }
    try {
      const starters = await listStarters({ userId: owner });
      if (token === version) starterName.value = starters.find((item) => item.id === id)?.name || '名称不可用（酵种可能已移除）';
    } catch {
      if (token === version) starterName.value = '名称加载失败，请稍后重试';
    }
  }, { immediate: true, flush: 'sync' });
  onScopeDispose(() => { version += 1; });
  return { starterName };
}
