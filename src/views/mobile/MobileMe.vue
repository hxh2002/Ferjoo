<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { confirmDialog } from '../../platform/dialog.js';
const auth = useAuth(); const router = useRouter(); const devices = ref([]); const error = ref('');
const name = computed(() => auth.profile.value?.display_name || auth.profile.value?.system_user_id || auth.user.value?.email || '我的');
watch(() => auth.user.value?.id, async (id) => { devices.value = []; if (!id) return; try { const service = await mobileDeviceService(); const rows = await service.listDevices(id); if (id === auth.user.value?.id) devices.value = rows; } catch { error.value = '设备暂时无法读取，请到我的设备重试。'; } }, { immediate: true });
async function logout() { if (!await confirmDialog('确认退出登录？尚未同步的观察和喂养草稿会保留在本机当前账号下，不会自动上传。')) return; try { await auth.logout(); await router.push('/today'); } catch { error.value = '退出失败，请稍后重试。'; } }
onMounted(() => auth.init());
</script>
<template>
<main class="m-page">
<header class="me-heading"><p class="m-eyebrow">我的</p><h1>{{ name }}</h1></header>
<p v-if="error" class="m-error" role="alert">{{ error }}</p>
<section class="m-card profile-card">
  <div class="profile-row">
    <img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="头像" width="56" height="56">
    <div v-else class="avatar-fallback" aria-hidden="true">{{ name.slice(0, 1) }}</div>
    <div class="profile-meta">
      <strong>{{ name }}</strong>
      <small v-if="auth.user.value">{{ auth.profile.value?.system_user_id }} · 注册于 {{ new Date(auth.user.value.created_at).toLocaleDateString('zh-CN') }}</small>
      <small v-else>尚未登录</small>
    </div>
    <RouterLink v-if="auth.user.value" class="m-secondary compact-link" to="/profile">编辑资料</RouterLink>
  </div>
  <div v-if="!auth.user.value" class="auth-links"><RouterLink class="m-primary" :to="{path:'/login',query:{redirect:'/me'}}">登录</RouterLink><RouterLink class="m-secondary" :to="{path:'/register',query:{redirect:'/me'}}">邀请码注册</RouterLink></div>
</section>
<section v-if="auth.user.value" class="m-card">
  <div class="section-heading"><h2>设备</h2><RouterLink class="text-link" to="/me/devices">管理 ›</RouterLink></div>
  <RouterLink v-for="device in devices" :key="device.device_id" class="m-list-row" :to="`/me/devices/${encodeURIComponent(device.device_id)}`">
    <span class="row-main"><strong>{{ device.name || device.device_id }}</strong><small>{{ device.my_role === 'owner' ? '所有者' : '成员' }} · 最近接收 {{ device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('zh-CN', { hour12: false }) : '从未接收' }}</small></span><span class="chevron" aria-hidden="true">›</span>
  </RouterLink>
  <p v-if="!devices.length" class="m-muted">暂无设备。无需设备也可完整记录观察。</p>
  <RouterLink class="m-secondary bind-link" to="/claim">绑定新设备</RouterLink>
</section>
<nav class="m-card nav-card" aria-label="更多">
  <RouterLink v-if="auth.user.value" class="m-list-row" to="/me/invite"><span class="row-main"><strong>邀请好友</strong></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
  <RouterLink class="m-list-row" to="/me/help"><span class="row-main"><strong>帮助与关于</strong></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
  <RouterLink class="m-list-row" :to="{path:'/',query:{view:'desktop'}}"><span class="row-main"><strong>电脑端完整工具</strong><small>在浏览器中打开</small></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
  <RouterLink v-if="auth.user.value" class="m-list-row" to="/me/account"><span class="row-main"><strong>账号安全</strong></span><span class="chevron" aria-hidden="true">›</span></RouterLink>
</nav>
<button v-if="auth.user.value" class="m-secondary logout" @click="logout">退出登录</button>
</main>
</template>
<style scoped>
.m-page{max-width:42rem;margin:auto;padding-bottom:calc(8rem + env(safe-area-inset-bottom))}
.me-heading{margin:.25rem 0 1rem}.me-heading h1{margin:.2rem 0;font-size:1.5rem;font-weight:600}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem}.section-heading h2{margin:0;font-size:1.05rem}
.profile-row{display:flex;align-items:center;gap:14px}.profile-row img{border:1px solid var(--border-default,#d8d2c8)}
.avatar-fallback{display:grid;place-items:center;width:56px;height:56px;background:var(--orange-soft,#ffe0c5);color:var(--brand-action,#a54214);font-size:1.4rem;font-weight:700;flex-shrink:0}
.profile-meta{display:grid;gap:2px;min-width:0;flex:1}.profile-meta small{color:var(--text-secondary,#75665b);font-size:.82rem;overflow-wrap:anywhere}
.compact-link{min-height:40px;padding:.4rem .8rem;font-size:.85rem;flex-shrink:0}
.auth-links{display:grid;gap:.625rem;margin-top:1rem}
.row-main{display:grid;gap:2px;min-width:0}
.chevron{color:var(--text-secondary,#75665b);font-size:1.1rem;flex-shrink:0}
.bind-link{margin-top:.75rem;font-size:.9rem;min-height:44px}
.nav-card{padding:4px 18px}
.logout{width:100%;margin-top:1rem}
.text-link{color:var(--brand-action,#a54214);font-size:.875rem;text-decoration:none}
</style>
