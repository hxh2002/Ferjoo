import { onActivated, onDeactivated, onMounted, onUnmounted } from 'vue';

export function useVisiblePolling(callback, intervalMs = 60000) {
  let timer;
  let active = false;
  let running = false;

  function clear() {
    clearTimeout(timer);
  }
  async function refresh() {
    if (!active || document.hidden || running) return;
    clear();
    running = true;
    try {
      await callback();
    } finally {
      running = false;
      if (active && !document.hidden) timer = setTimeout(() => { refresh().catch(() => {}); }, intervalMs);
    }
  }
  function visibility() {
    clear();
    if (!document.hidden) refresh().catch(() => {});
  }
  function start() {
    active = true;
    refresh().catch(() => {});
  }
  function stop() {
    active = false;
    clear();
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', visibility);
    start();
  });
  onActivated(start);
  onDeactivated(stop);
  onUnmounted(() => {
    stop();
    document.removeEventListener('visibilitychange', visibility);
  });
  return { refresh };
}
