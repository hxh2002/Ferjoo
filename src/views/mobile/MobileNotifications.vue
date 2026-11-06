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

async function requestSystemAccess() {
  if (permission.value === 'denied') {
    notice.value = '无法代开系统设置。请在系统或浏览器的站点设置里允许通知。';
    return;
  }
  await enable();
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
  <p v-if="permission !== 'granted'" class="permission-banner" role="status">系统通知未开启。<button type="button" @click="requestSystemAccess">去系统设置开启</button></p>
  <p v-if="notice" class="hint" role="status">{{ notice }}</p>
  <section class="m-card switch-card">
    <div class="switch-row">
      <span><strong>系统通知</strong><small>权限 {{ permissionLabel }} · {{ statusLabel }}</small></span>
      <button type="button" class="m-switch" role="switch" :aria-checked="subscribed" :disabled="busy === 'push' || loading" @click="subscribed ? disable() : enable()"><span></span></button>
    </div>
    <div class="switch-row">
      <span><strong>高度提醒</strong><small>可选 2×、2.5×、3×。每个阈值每轮喂养只提醒一次。</small></span>
    </div>
  </section>
  <p class="hint">诊断结论保存在日记。这里不另存一条推送开关。</p>
  <p v-if="error" class="m-error" role="alert">{{ error }}</p>
  <p v-if="!supported" class="hint warn">当前浏览器不支持 Web Push，或页面不是 HTTPS。iOS 需 16.4+ 并从主屏幕图标打开。</p>

  <section class="m-card">
    <h2>高度提醒</h2>
    <div v-if="loading && !starters.length" class="m-skeleton" aria-busy="true" aria-label="正在读取通知"><span></span><span></span></div>
    <p v-else-if="!starters.length" class="m-muted">还没有酵种，请先到「今日」页新建。</p>
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
      <li>喂养后、最近 40 分钟内仍有新数据时评估。</li>
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
.notify-page{padding-bottom:calc(2rem + env(safe-area-inset-bottom))}
.switch-card{display:grid;padding:4px 16px}
.switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:68px;border-top:1px solid var(--border-warm)}
.switch-row:first-child{border-top:0}
.switch-row > span{display:grid;gap:2px;min-width:0}
.switch-row strong{font-size:var(--text-md);font-weight:500}
.switch-row small{color:var(--text-secondary);font-size:var(--text-xs);line-height:18px}
.m-switch{position:relative;flex:none;width:52px;height:32px;min-height:32px;padding:0;border:0;border-radius:16px;background:var(--border-warm);cursor:pointer}
.m-switch span{position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:var(--surface-card);transition:transform var(--motion-fast) ease}
.m-switch[aria-checked="true"]{background:var(--brand-light)}
.m-switch[aria-checked="true"] span{transform:translateX(20px)}
.m-switch:disabled{opacity:.55;cursor:not-allowed}
.hint{margin:0;font-size:var(--text-sm);line-height:21px;color:var(--text-secondary)}
.hint.warn{color:var(--danger-text)}
.permission-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:12px 16px;border-radius:var(--radius-control);background:var(--warning-bg);color:var(--warning-text);font-size:var(--text-sm)}
.permission-banner button{min-height:32px;padding:0 12px;border:0;border-radius:16px;background:var(--brand-light);color:var(--text-primary)}
.starter-row{display:grid;gap:8px;padding:12px 0;border-top:1px solid var(--border-warm)}
.starter-row:first-of-type{border-top:0}
.starter-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.starter-head small{font-size:var(--text-xs);color:var(--text-secondary)}
.targets{display:flex;gap:6px}
.target{flex:1;min-height:44px;padding:0 4px;border:1px solid var(--border-warm);border-radius:var(--m-radius-button);background:var(--surface-input);font:inherit;font-size:var(--text-sm);color:inherit;cursor:pointer}
.target.active{border-color:var(--brand-action);background:var(--brand-light);color:var(--text-primary);font-weight:500}
.target:disabled{opacity:.55}
.rules{margin:0;padding-left:18px;display:grid;gap:6px;font-size:var(--text-sm);line-height:21px;color:var(--text-secondary)}
.guide{border-top:1px solid var(--border-warm);padding:8px 0}
.guide:first-of-type{border-top:0}
.guide summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:var(--text-md)}
.guide p{margin:4px 0 0;font-size:var(--text-sm);line-height:21px;color:var(--text-secondary)}
.guide code{font-size:var(--text-xs);overflow-wrap:anywhere}
</style>
