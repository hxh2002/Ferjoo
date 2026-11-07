<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import MConfirmDialog from '../../components/mobile/MConfirmDialog.vue';
const auth = useAuth(); const router = useRouter(); const devices = ref([]); const error = ref(''); const logoutOpen = ref(false);
const name = computed(() => auth.profile.value?.display_name || auth.profile.value?.system_user_id || auth.user.value?.email || '我的');
const initial = computed(() => name.value.trim().slice(0, 1).toUpperCase() || '我');
watch(() => auth.user.value?.id, async (id) => { devices.value = []; if (!id) return; try { const service = await mobileDeviceService(); const rows = await service.listDevices(id); if (id === auth.user.value?.id) devices.value = rows; } catch { error.value = '设备暂时无法读取，请到我的设备重试。'; } }, { immediate: true });
async function logout() { logoutOpen.value = false; try { await auth.logout(); await router.push('/device'); } catch { error.value = '退出失败，请稍后重试。'; } }
onMounted(() => auth.init());
</script>

<template>
  <main class="m-page mobile-me">
    <header class="me-head">
      <h1>我的</h1>
    </header>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>

    <p class="group-label">个人资料</p>
    <component :is="auth.user.value ? 'RouterLink' : 'section'" class="m-card profile-card" :to="auth.user.value ? '/me/profile' : undefined">
      <span class="avatar-disc" aria-hidden="true">
        <img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="" width="56" height="56" />
        <span v-else>{{ initial }}</span>
      </span>
      <span class="profile-meta">
        <strong>{{ name }}</strong>
        <small v-if="!auth.user.value">尚未登录</small>
      </span>
      <svg v-if="auth.user.value" class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </component>
    <div v-if="!auth.user.value" class="auth-links">
      <RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/me' } }">登录</RouterLink>
      <RouterLink class="m-secondary" :to="{ path: '/register', query: { redirect: '/me' } }">邀请码注册</RouterLink>
    </div>

    <template v-if="auth.user.value">
      <p class="group-label">我的设备</p>
      <RouterLink class="m-card device-entry" to="/me/devices">
        <span class="device-disc" aria-hidden="true"><img src="../../assets/icons/nav-device.svg" alt="" width="20" height="20" /></span>
        <span class="profile-meta">
          <strong>设备绑定</strong>
          <small>管理已绑定的设备</small>
        </span>
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </RouterLink>
    </template>

    <p class="group-label">设置</p>
    <nav class="m-card nav-card" aria-label="设置">
      <RouterLink v-if="auth.user.value" class="m-list-row" to="/me/notifications"><span class="row-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 20a2 2 0 0 0 4 0" /></svg></span><span class="row-main"><strong>通知设置</strong></span><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></RouterLink>
      <RouterLink class="m-list-row" to="/me/help"><span class="row-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 1.9V14" /><path d="M12 17h.01" /></svg></span><span class="row-main"><strong>关于与帮助</strong></span><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></RouterLink>
    </nav>

    <p class="desktop-entry"><RouterLink :to="{ path: '/', query: { view: 'desktop' } }">访问电脑端</RouterLink></p>
    <button v-if="auth.user.value" type="button" class="logout-btn" @click="logoutOpen = true">退出登录</button>
    <MConfirmDialog :open="logoutOpen" danger title="确认退出登录？" message="尚未同步的观察和喂养草稿会保留在本机当前账号下，不会自动上传。" confirm-label="退出登录" cancel-label="取消" @cancel="logoutOpen = false" @confirm="logout" />
  </main>
</template>

<style scoped>
.mobile-area .m-page.mobile-me{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 24px);gap:0}
.mobile-area .mobile-main .m-page.mobile-me > .m-card{margin-block:0 12px}
.group-label{margin:18px 0 8px;color:var(--text-secondary);font-size:14px;line-height:21px}
.profile-card,.device-entry{display:flex;align-items:center;gap:12px;min-height:88px;color:inherit;text-decoration:none}
.device-entry{min-height:76px}
.device-disc,.row-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:20px;background:var(--m-disc);color:var(--brand-action)}
.device-disc img{width:28px;height:18.2px}
.row-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.me-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;margin:0 0 14px}
.me-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em;color:var(--text-primary)}
.me-edit{flex:none;display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:16px;background:var(--surface-card);color:var(--brand-action);font-size:13px;font-weight:500;text-decoration:none;box-shadow:0 3px 12px rgba(48,37,31,.06)}
.mobile-area .mobile-main .m-page.mobile-me > .profile-card{padding:15px var(--m-card-space)}
.mobile-area .mobile-main .m-page.mobile-me > .device-entry{box-sizing:border-box;height:76px;padding:0 var(--m-card-space)}
.profile-row{display:flex;align-items:center;gap:14px}
.avatar-disc{display:grid;place-items:center;flex:none;width:56px;height:56px;border-radius:50%;background:var(--m-icon-disc);color:var(--brand-action);font-size:22px;font-weight:600;overflow:hidden}
.avatar-disc img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}
.profile-meta{display:grid;gap:2px;min-width:0;flex:1}
.profile-meta strong{font-size:16px;line-height:24px;font-weight:500;color:var(--text-primary)}
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
.chevron{flex:none;width:20px;height:20px;fill:none;stroke:var(--brand-action);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.device-empty{display:flex;align-items:center;gap:12px;padding:8px 0}
.device-empty img{width:64px;height:64px;object-fit:contain}
.device-empty p{margin:0;color:var(--text-secondary);font-size:13px}
.nav-card{padding:0 16px}
.nav-card .m-list-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:68px;padding:0;border-top:0;text-decoration:none;color:inherit}
.row-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:20px;background:var(--m-disc);color:var(--brand-action)}
.nav-card .m-list-row + .m-list-row::before{content:'';position:absolute;top:0;left:52px;right:0;height:1px;background:var(--m-row-divider)}
.desktop-entry{margin:14px 0 0;text-align:center}
.desktop-entry a{font-size:13px;color:var(--text-secondary);text-underline-offset:3px;text-decoration:none}
.logout-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin-top:14px;padding:0 16px;border:1px solid var(--border-subtle);border-radius:var(--m-radius-button);background:var(--surface-card);color:var(--danger-text);font:inherit;font-size:15px;font-weight:500;cursor:pointer}
.text-link{color:var(--brand-action);font-size:13px;font-weight:500;text-decoration:none}
</style>
