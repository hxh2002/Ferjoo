import { onBeforeUnmount, ref } from 'vue';

// 与 desktop.css 共用 768px 断点的实时监听：只服务于「同一份数据在窄屏是周条、宽屏是整月」这类结构差异，
// 不锁定模式、不读 user-agent；拖动窗口或旋转屏幕会立即更新，路由与业务状态不分叉。
export const DESKTOP_QUERY = '(min-width: 768px)';

export function useDesktopLayout() {
  const query = typeof window === 'undefined' ? null : window.matchMedia(DESKTOP_QUERY);
  const isDesktop = ref(query?.matches ?? false);
  const update = (event) => { isDesktop.value = event.matches; };
  query?.addEventListener('change', update);
  onBeforeUnmount(() => query?.removeEventListener('change', update));
  return { isDesktop };
}
