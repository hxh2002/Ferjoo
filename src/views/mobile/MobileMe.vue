<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { confirmDialog } from '../../platform/dialog.js';
const auth = useAuth(); const router = useRouter(); const devices = ref([]); const error = ref('');
const name = computed(() => auth.profile.value?.display_name || auth.profile.value?.system_user_id || auth.user.value?.email || '我的');
const initial = computed(() => name.value.trim().slice(0, 1).toUpperCase() || '我');
watch(() => auth.user.value?.id, async (id) => { devices.value = []; if (!id) return; try { const service = await mobileDeviceService(); const rows = await service.listDevices(id); if (id === auth.user.value?.id) devices.value = rows; } catch { error.value = '设备暂时无法读取，请到我的设备重试。'; } }, { immediate: true });
async function logout() { if (!await confirmDialog('确认退出登录？尚未同步的观察和喂养草稿会保留在本机当前账号下，不会自动上传。')) return; try { await auth.logout(); await router.push('/device'); } catch { error.value = '退出失败，请稍后重试。'; } }
onMounted(() => auth.init());
</script>

<template>
  <main class="m-page mobile-me">
    <header class="me-head">
      <h1>我的</h1>
      <RouterLink v-if="auth.user.value" class="me-edit" :to="{ path: '/profile', query: { redirect: '/me' } }">编辑资料</RouterLink>
    </header>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>

    <section class="m-card profile-card">
      <div class="profile-row">
        <span class="avatar-disc" aria-hidden="true">
          <img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="" width="56" height="56" />
          <span v-else>{{ initial }}</span>
        </span>
        <div class="profile-meta">
          <strong>{{ name }}</strong>
          <small v-if="auth.user.value">{{ auth.profile.value?.system_user_id }} · 注册于 {{ new Date(auth.user.value.created_at).toLocaleDateString('zh-CN') }}</small>
          <small v-else>尚未登录</small>
        </div>
      </div>
      <div v-if="!auth.user.value" class="auth-links">
        <RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/me' } }">登录</RouterLink>
        <RouterLink class="m-secondary" :to="{ path: '/register', query: { redirect: '/me' } }">邀请码注册</RouterLink>
      </div>
    </section>

    <section v-if="auth.user.value" class="m-card devices-card">
      <div class="section-heading">
        <h2>我的设备</h2>
        <div class="device-actions">
          <RouterLink class="text-link" to="/me/devices">管理 ›</RouterLink>
          <RouterLink class="text-link" :to="{ path: '/claim', query: { redirect: '/me' } }">绑定新设备</RouterLink>
        </div>
      </div>
      <RouterLink v-for="device in devices" :key="device.device_id" class="m-list-row device-row" :to="`/me/devices/${encodeURIComponent(device.device_id)}`">
        <span class="row-main">
          <strong>{{ device.name || device.device_id }}</strong>
          <small>{{ device.my_role === 'owner' ? '所有者' : '成员' }} · 最近接收 {{ device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('zh-CN', { hour12: false }) : '从未接收' }}</small>
        </span>
        <span class="chevron" aria-hidden="true">›</span>
      </RouterLink>
      <div v-if="!devices.length" class="device-empty">
        <img src="/assets/jojo2.png" alt="Jojo 吉祥物" />
        <p class="m-muted">暂无设备。</p>
      </div>
    </section>

    <nav class="m-card nav-card" aria-label="更多">
      <RouterLink v-if="auth.user.value" class="m-list-row" to="/me/notifications"><span class="row-main"><strong>通知设置</strong><small>云端推送、提醒阈值与开启引导</small></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
      <RouterLink v-if="auth.user.value" class="m-list-row" to="/me/account"><span class="row-main"><strong>账号安全</strong></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
      <RouterLink v-if="auth.user.value" class="m-list-row" to="/me/invite"><span class="row-main"><strong>邀请好友</strong></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
      <RouterLink class="m-list-row" to="/me/help"><span class="row-main"><strong>帮助与关于</strong></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
    </nav>

    <p class="desktop-entry"><RouterLink :to="{ path: '/', query: { view: 'desktop' } }">访问电脑端</RouterLink></p>
    <button v-if="auth.user.value" type="button" class="logout-btn" @click="logout">退出登录</button>
  </main>
</template>

<style scoped>
.mobile-area .m-page.mobile-me{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 24px);gap:0}
.mobile-area .mobile-main .m-page.mobile-me > .m-card{margin-block:0 12px}
.me-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;margin:0 0 14px}
.me-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em;color:var(--text-primary)}
.me-edit{flex:none;display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:16px;background:var(--surface-card);color:var(--brand-action);font-size:13px;font-weight:500;text-decoration:none;box-shadow:0 3px 12px rgba(48,37,31,.06)}
.profile-card{padding:var(--m-card-space)}
.profile-row{display:flex;align-items:center;gap:14px}
.avatar-disc{display:grid;place-items:center;flex:none;width:56px;height:56px;border-radius:50%;background:var(--m-icon-disc);color:var(--brand-action);font-size:22px;font-weight:600;overflow:hidden}
.avatar-disc img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}
.profile-meta{display:grid;gap:2px;min-width:0;flex:1}
.profile-meta strong{font-size:18px;line-height:26px;font-weight:500;color:var(--text-primary)}
.profile-meta small{color:var(--text-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.auth-links{display:grid;gap:10px;margin-top:14px}
.auth-links .m-primary{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 16px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font-size:15px;font-weight:500;text-decoration:none}
.auth-links .m-secondary{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid var(--border-subtle);border-radius:var(--radius-control);background:var(--surface-card);color:var(--text-primary);font-size:14px;font-weight:500;text-decoration:none}
.devices-card .section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.section-heading h2{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--text-primary)}
.device-actions{display:flex;align-items:center;gap:12px}
.device-row{padding:12px 0;border-top:1px solid var(--border-subtle);text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px}
.row-main{display:grid;gap:2px;min-width:0;flex:1}
.row-main strong{font-size:15px;line-height:22px;font-weight:500;color:var(--text-primary)}
.row-main small{font-size:12px;line-height:18px;color:var(--text-secondary)}
.chevron{color:var(--text-secondary);font-size:18px;flex-shrink:0}
.device-empty{display:flex;align-items:center;gap:12px;padding:8px 0}
.device-empty img{width:64px;height:64px;object-fit:contain}
.device-empty p{margin:0;color:var(--text-secondary);font-size:13px}
.nav-card{padding:4px 18px}
.nav-card .m-list-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 0;border-top:1px solid var(--border-subtle);text-decoration:none;color:inherit}
.nav-card .m-list-row:first-child{border-top:0}
.desktop-entry{margin:14px 0 0;text-align:center}
.desktop-entry a{font-size:13px;color:var(--text-secondary);text-underline-offset:3px;text-decoration:none}
.logout-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin-top:14px;padding:0 16px;border:1px solid var(--border-subtle);border-radius:var(--m-radius-button);background:var(--surface-card);color:var(--danger-text);font:inherit;font-size:15px;font-weight:500;cursor:pointer}
.text-link{color:var(--brand-action);font-size:13px;font-weight:500;text-decoration:none}
</style>
