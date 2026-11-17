import { onBeforeUnmount, ref } from 'vue';

// 仅用于切换桌面呈现层；路由和业务逻辑不根据屏幕尺寸分叉。
export function useDesktopLayout() {
  const query = typeof window === 'undefined' ? null : window.matchMedia('(min-width: 768px)');
  const isDesktop = ref(query?.matches ?? false);
  const update = (event) => { isDesktop.value = event.matches; };
  query?.addEventListener('change', update);
  onBeforeUnmount(() => query?.removeEventListener('change', update));
  return { isDesktop };
}
