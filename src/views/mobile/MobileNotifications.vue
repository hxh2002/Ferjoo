<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { listStarters } from '../../services/care.service.js';
import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { HEIGHT_ALERT_TARGETS, enableSystemNotification, notificationPermission } from '../../services/height-alert.service.js';
import {
  hasCloudPushSubscription, loadHeightTargets, removeHeightPush, saveHeightTargets, subscribeHeightPush, webPushAvailable
} from '../../services/web-push.service.js';

defineOptions({ name: 'MobileNotifications' });
const auth = useAuth();
const loading = ref(false); const busy = ref(''); const error = ref(''); const notice = ref('');
const permission = ref(notificationPermission());
const subscribed = ref(false);
const starters = ref([]);
const supported = webPushAvailable();
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = Boolean(navigator.standalone) || Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
const permissionLabel = computed(() => ({ granted: '已允许', denied: '已拒绝', default: '未授权', unsupported: '浏览器不支持' })[permission.value] || '未知');
const statusLabel = computed(() => subscribed.value ? '已开启' : '未开启');

async function load() {
  const user = auth.user.value;
  if (!user) return;
  loading.value = true; error.value = '';
  try {
    permission.value = notificationPermission();
    const [subscribedNow, rows, links] = await Promise.all([
      hasCloudPushSubscription().catch(() => false),
      listStarters({ userId: user.id }),
      listStarterDeviceLinks({ userId: user.id }).catch(() => [])
    ]);
    const linked = new Set((links || []).filter((row) => row.active_to == null).map((row) => row.starter_id));
    const detailed = await Promise.all(rows.map(async (row) => ({
      ...row, linked: linked.has(row.id), targets: await loadHeightTargets(row.id).catch(() => [])
    })));
    subscribed.value = subscribedNow;
    starters.value = detailed;
  } catch (cause) {
    error.value = cause?.message || '通知设置读取失败，请重试。';
  } finally {
    loading.value = false;
  }
}

async function enable() {
  if (busy.value) return;
  notice.value = ''; error.value = '';
  if (isIos && !standalone) { notice.value = 'iOS 请先在 Safari 分享菜单选择「添加到主屏幕」，再从主屏幕图标打开本页（iOS 16.4+）。'; return; }
  if (!supported) { notice.value = '当前浏览器或环境不支持 Web Push，请用 HTTPS 访问并换用 Safari、Firefox 或 Chrome/Edge。'; return; }
  busy.value = 'push';
  try {
    permission.value = await enableSystemNotification();
    if (permission.value !== 'granted') {
      notice.value = permission.value === 'denied' ? '浏览器已拒绝通知权限，请到站点设置中重新允许后重试。' : '未获得通知权限，无法开启云端推送。';
      return;
    }
    await subscribeHeightPush();
    subscribed.value = true;
    notice.value = '已开启。达到所选倍数时会推送到本机。';
  } catch (cause) {
    error.value = cause?.message || '开启失败，请重试。';
  } finally {
    busy.value = '';
  }
}

async function disable() {
  if (busy.value) return;
  busy.value = 'push'; notice.value = ''; error.value = '';
  try {
    await removeHeightPush();
    subscribed.value = false;
    notice.value = '已关闭本机推送订阅，服务器不再向本机发送提醒。';
  } catch (cause) {
    error.value = cause?.message || '关闭失败，请重试。';
  } finally {
    busy.value = '';
  }
}

async function toggle(row, target) {
  if (busy.value || !row.id) return;
  const targets = row.targets.includes(target)
    ? row.targets.filter((item) => item !== target)
    : [...row.targets, target].sort((a, b) => a - b);
  busy.value = row.id; error.value = ''; notice.value = '';
  try {
    await saveHeightTargets(row.id, targets);
    row.targets = targets;
    notice.value = targets.length ? `「${row.name}」阈值已保存。` : `「${row.name}」的高度提醒已关闭。`;
  } catch (cause) {
    error.value = cause?.message || '保存失败，请重试。';
  } finally {
    busy.value = '';
  }
}

onMounted(() => auth.init().then(load));
</script>

<template>
<main class="m-page notify-page">
  <section class="m-card">
    <div class="status-row">
      <div class="status-meta">
        <strong>本机云端推送</strong>
        <small>系统通知权限：{{ permissionLabel }}</small>
      </div>
      <span class="status-pill" :class="{ on: subscribed }">{{ statusLabel }}</span>
    </div>
    <button v-if="!subscribed" class="m-primary push-action" type="button" :disabled="busy === 'push' || loading" @click="enable">
      {{ busy === 'push' ? '开启中…' : '开启云端推送' }}
    </button>
    <button v-else class="m-secondary push-action" type="button" :disabled="busy === 'push'" @click="disable">
      {{ busy === 'push' ? '关闭中…' : '关闭本机推送' }}
    </button>
    <p v-if="!supported" class="hint warn">当前浏览器不支持 Web Push，或页面不是 HTTPS。iOS 需 16.4+ 并从主屏幕图标打开。</p>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="hint" role="status">{{ notice }}</p>
  </section>

  <section class="m-card">
    <div class="section-heading"><h2>提醒阈值</h2><span v-if="loading" class="m-muted">读取中…</span></div>
    <p class="hint">高度达到基线所选倍数时提醒，可多选；每个阈值每轮喂养只提醒一次。</p>
    <p v-if="!loading && !starters.length" class="m-muted">还没有酵种，请先到「今日」页新建。</p>
    <div v-for="row in starters" :key="row.id" class="starter-row">
      <div class="starter-head">
        <strong>{{ row.name }}</strong>
        <small v-if="!row.linked">未关联设备，不会产生提醒</small>
      </div>
      <div class="targets" role="group" :aria-label="`${row.name} 高度提醒阈值`">
        <button v-for="target in HEIGHT_ALERT_TARGETS" :key="target" type="button" class="target" :class="{ active: row.targets.includes(target) }" :aria-pressed="row.targets.includes(target)" :disabled="busy === row.id" @click="toggle(row, target)">{{ target }}×</button>
      </div>
    </div>
  </section>

  <section class="m-card">
    <h2>触发条件</h2>
    <ul class="rules">
      <li>酵种已关联正在上传数据的设备，并有喂养记录。</li>
      <li>喂养满 50 分钟、且最近 40 分钟内仍有新数据时评估。</li>
      <li>达到所选倍数推送一次，下一轮喂养后重新计数。</li>
    </ul>
  </section>

  <section class="m-card">
    <h2>开启引导</h2>
    <details class="guide">
      <summary>iPhone / iPad</summary>
      <p>Safari 打开本站 → 分享 → 「添加到主屏幕」→ 从主屏幕图标打开 → 回到本页开启。需 iOS 16.4 及以上。</p>
    </details>
    <details class="guide">
      <summary>Android</summary>
      <p>推荐 Chrome 或 Firefox。若提示 <code>push service error</code>，说明浏览器连不上推送服务，换 Firefox 或检查网络后再试。</p>
    </details>
    <details class="guide">
      <summary>macOS / Windows 电脑</summary>
      <p>Safari 16+ 或 Firefox 最稳定。Chrome、Edge 需要能访问 <code>fcm.googleapis.com</code>，代理环境下常见 <code>push service error</code>。</p>
    </details>
    <details class="guide">
      <summary>收不到提醒？</summary>
      <p>依次确认：本机推送已开启、系统通知未被静音、该酵种已关联设备、所选阈值本轮尚未提醒过。关闭再重新开启推送可重新登记本机订阅。</p>
    </details>
  </section>
</main>
</template>

<style scoped>
.notify-page{max-width:42rem;margin:auto;padding-bottom:calc(2rem + env(safe-area-inset-bottom))}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.status-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.status-meta{display:grid;gap:2px;min-width:0}
.status-meta small{color:var(--text-secondary,#75665b);font-size:.82rem}
.status-pill{padding:.2rem .6rem;border:1px solid var(--border-default,#d8d2c8);font-size:.78rem;color:var(--text-secondary,#75665b);flex-shrink:0}
.status-pill.on{border-color:var(--brand-action,#a54214);color:var(--brand-action,#a54214)}
.push-action{width:100%;margin-top:.75rem}
.hint{margin:.6rem 0 0;font-size:.8rem;line-height:1.6;color:var(--text-secondary,#75665b)}
.hint.warn{color:#a12c23}
.starter-row{display:grid;gap:.5rem;padding:.75rem 0;border-top:1px solid var(--border-default,#d8d2c8)}
.starter-row:first-of-type{border-top:0}
.starter-head{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.starter-head small{font-size:.75rem;color:var(--text-secondary,#75665b)}
.targets{display:flex;gap:.35rem}
.target{flex:1;min-height:44px;padding:0 .3rem;border:1px solid var(--border-default,#d8d2c8);background:transparent;font:inherit;font-size:.9rem;color:inherit;cursor:pointer}
.target.active{border-color:var(--brand-action,#a54214);background:var(--brand-action,#a54214);color:#fff;font-weight:600}
.target:disabled{opacity:.55}
.rules{margin:0;padding-left:1.1rem;display:grid;gap:.4rem;font-size:.85rem;line-height:1.6;color:var(--text-secondary,#75665b)}
.guide{border-top:1px solid var(--border-default,#d8d2c8);padding:.6rem 0}
.guide:first-of-type{border-top:0}
.guide summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:.9rem}
.guide p{margin:.25rem 0 0;font-size:.82rem;line-height:1.6;color:var(--text-secondary,#75665b)}
.guide code{font-size:.78rem;overflow-wrap:anywhere}
</style>
