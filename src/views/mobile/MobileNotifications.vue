<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { listStarters } from '../../services/care.service.js';
import { starterDisambiguation } from '../../lib/starter-labels.js';
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
// 只有列表里存在同名酵种时才给次要说明，避免两行「一号」无法分辨。
const starterNotes = computed(() => starterDisambiguation(starters.value));
const systemLabel = computed(() => (permission.value === 'granted' ? '已开启' : permissionLabel.value));

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
    const activeLinks = (links || []).filter((row) => row.active_to == null);
    const linked = new Set(activeLinks.map((row) => row.starter_id));
    const deviceOf = new Map(activeLinks.map((row) => [row.starter_id, row.device_id]));
    const detailed = await Promise.all(rows.map(async (row) => ({
      ...row, linked: linked.has(row.id), deviceId: deviceOf.get(row.id) || '', targets: await loadHeightTargets(row.id).catch(() => [])
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
  if (permission.value === 'granted') {
    notice.value = '系统通知已允许。声音与横幅样式请在手机系统设置中调整。';
    return;
  }
  if (isIos && !standalone) { notice.value = 'iOS 请先在 Safari 分享菜单选择「添加到主屏幕」，再从主屏幕图标打开本页（iOS 16.4+）。'; return; }
  notice.value = ''; error.value = '';
  try {
    permission.value = await enableSystemNotification();
    notice.value = permission.value === 'granted' ? '系统通知已允许。' : (permission.value === 'denied' ? '浏览器已拒绝通知权限，请到站点设置中重新允许。' : '未获得通知权限。');
  } catch (cause) {
    error.value = cause?.message || '开启失败，请重试。';
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
  <a class="m-card system-card" href="app-settings:" @click.prevent="requestSystemAccess">
    <strong>系统通知</strong>
    <span class="system-status">{{ systemLabel }}</span>
    <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
  </a>
  <p class="hint">{{ permission === 'granted' ? '声音、横幅等展示方式在手机系统中设置。' : '请前往手机系统设置，允许 Ferjoo 发送通知。' }}</p>
  <p v-if="notice" class="hint" role="status">{{ notice }}</p>

  <p class="group-label">提醒类型</p>
  <div class="m-card switch-card">
    <div class="switch-row">
      <span class="switch-copy">
        <strong>高度提醒</strong>
        <small>达到你设置的高度时提醒</small>
      </span>
      <button type="button" class="m-switch" role="switch" :aria-label="`高度提醒${subscribed ? '已开启' : '已关闭'}`" :aria-checked="subscribed" :disabled="busy === 'push' || loading" @click="subscribed ? disable() : enable()"><span></span></button>
    </div>
  </div>
  <p v-if="error" class="m-error" role="alert">{{ error }}</p>
  <p v-if="!supported" class="hint warn">当前浏览器不支持 Web Push，或页面不是 HTTPS。iOS 需 16.4+ 并从主屏幕图标打开。</p>

  <p class="group-label">提醒倍数 <span class="label-sub">以喂养后高度为 1×，可多选</span></p>
  <section class="m-card">
    <div v-if="loading && !starters.length" class="m-skeleton" aria-busy="true" aria-label="正在读取通知"><span></span><span></span></div>
    <p v-else-if="!starters.length" class="m-muted">还没有酵种，请先到「今日」页新建。</p>
    <div v-for="row in starters" :key="row.id" class="starter-row">
      <div class="starter-head">
        <strong>{{ row.name }}</strong>
        <small v-if="starterNotes.get(row.id)" class="starter-note">{{ starterNotes.get(row.id) }}</small>
        <small v-if="!row.linked">未关联设备，不会产生提醒</small>
      </div>
      <div class="targets" role="group" :aria-label="`${row.name} 起始高度提醒倍数`">
        <button v-for="target in HEIGHT_ALERT_TARGETS" :key="target" type="button" class="target" :aria-label="`${row.name} 起始高度的 ${target} 倍`" :class="{ active: row.targets.includes(target) }" :aria-pressed="row.targets.includes(target)" :disabled="busy === row.id" @click="toggle(row, target)">{{ target }}×</button>
      </div>
    </div>
  </section>

  <p class="group-label">触发条件</p>
  <section class="m-card">
    <ul class="rules">
      <li>酵种已关联在线设备，且有喂养记录。</li>
      <li>每轮每个倍数只提醒一次，下次喂养后重新计数。</li>
    </ul>
  </section>

  <p class="group-label">开启引导</p>
  <section class="m-card guide-card">
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
.notify-page{padding-bottom:calc(2rem + env(safe-area-inset-bottom));gap:12px}
.system-card{display:flex;align-items:center;gap:12px;min-height:68px;padding:0 16px;color:inherit;text-decoration:none;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow-button)}
.system-card strong{flex:1;min-width:0;font-size:16px;line-height:24px;font-weight:500;color:var(--text-primary)}
.system-status{flex:none;color:var(--text-secondary);font-size:14px;line-height:21px}
.chevron{flex:none;width:20px;height:20px;fill:none;stroke:var(--brand-action);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.group-label{margin:12px 0 0;color:var(--text-secondary);font-size:14px;line-height:21px}
/* 本页 gap 统一 16，分组标签与上下内容等距（实测 16 / 16），标题读起来像夹在两张卡之间。
   实测原 scoped 的 `margin:12px 0 0` 被 `.m-page > *` 归零，这里用高优先级别名把「上多下少」
   的层级写回：标签上方 16+8=24、下方 16，与「我的」页分组节奏一致。 */
.mobile-area .mobile-main .m-page.notify-page > .group-label{margin-block:8px 0}
.switch-card{padding:0 16px;box-shadow:var(--m-shadow-button)}
.switch-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:88px}
.switch-copy{display:grid;gap:4px;min-width:0}
.switch-copy strong{font-size:16px;line-height:24px;font-weight:400;color:var(--text-primary)}
.switch-copy small{color:var(--text-secondary);font-size:12px;line-height:18px}
.m-switch{position:relative;flex:none;width:48px;height:28px;min-height:28px;padding:0;border:0;border-radius:14px;background:var(--border-warm);cursor:pointer}
.m-switch span{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--surface-card);transition:transform var(--motion-base) var(--m-spring)}
.m-switch[aria-checked="true"]{background:var(--brand-light)}
.m-switch[aria-checked="true"] span{transform:translateX(20px)}
.m-switch:disabled{opacity:.55;cursor:not-allowed}
.label-sub{margin-left:6px;font-size:12px;color:var(--text-tertiary, var(--text-secondary));opacity:.85}
.hint{margin:0;font-size:12px;line-height:18px;color:var(--text-secondary)}
.hint.warn{color:var(--danger-text)}
.starter-row{display:grid;gap:8px;padding:12px 0;border-top:1px solid var(--border-warm)}
.starter-row:first-of-type{border-top:0;padding-top:0}
.starter-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.starter-head strong{font-size:16px;line-height:24px;font-weight:400}
.starter-head small{font-size:12px;line-height:18px;color:var(--text-secondary)}
.starter-head .starter-note{margin-right:auto}
.targets{display:flex;gap:6px}
.target{flex:1;min-height:44px;padding:0 4px;border:1px solid var(--border-warm);border-radius:var(--m-radius-button);background:var(--surface-input);font:inherit;font-size:14px;color:inherit;cursor:pointer}
.target.active{border-color:var(--brand-action);background:var(--brand-light);color:var(--text-primary);font-weight:500}
.target:disabled{opacity:.55}
.rules{margin:0;padding-left:18px;display:grid;gap:8px;font-size:14px;line-height:21px;color:var(--text-secondary)}
.guide-card{padding:0 16px;box-shadow:var(--m-shadow-button)}
.guide{border-top:1px solid var(--border-warm);padding:8px 0}
.guide:first-of-type{border-top:0;padding-top:0}
.guide summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:16px;line-height:24px}
.guide p{margin:4px 0 0;font-size:14px;line-height:21px;color:var(--text-secondary)}
.guide code{font-size:12px;overflow-wrap:anywhere}
</style>
