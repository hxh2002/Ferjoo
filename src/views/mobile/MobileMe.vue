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
<main class="m-page"><h1>我的</h1><p v-if="error" role="alert">{{ error }}</p>
<section class="m-card"><img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="头像" width="64" height="64"><h2>{{ name }}</h2><p v-if="auth.user.value">{{ auth.profile.value?.system_user_id }} · 注册于 {{ new Date(auth.user.value.created_at).toLocaleDateString() }}</p><RouterLink v-if="auth.user.value" to="/profile">编辑资料</RouterLink><template v-else><RouterLink :to="{path:'/login',query:{redirect:'/me'}}">登录</RouterLink> · <RouterLink :to="{path:'/register',query:{redirect:'/me'}}">邀请码注册</RouterLink></template></section>
<section v-if="auth.user.value" class="m-card"><h2>我的设备</h2><RouterLink v-for="device in devices" :key="device.device_id" class="m-row" :to="`/me/devices/${encodeURIComponent(device.device_id)}`"><strong>{{ device.name || device.device_id }}</strong><small>{{ device.my_role === 'owner' ? '所有者' : '成员' }} · 最近接收 {{ device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : '从未接收' }}</small></RouterLink><p v-if="!devices.length">无需设备也可完整记录观察。</p><RouterLink to="/me/devices">管理设备</RouterLink> · <RouterLink to="/claim">绑定新设备</RouterLink></section>
<nav class="m-card"><RouterLink v-if="auth.user.value" class="m-row" to="/me/invite">邀请好友 ›</RouterLink><RouterLink class="m-row" to="/me/help">帮助与关于 ›</RouterLink><RouterLink class="m-row" :to="{path:'/',query:{view:'desktop'}}">电脑端完整工具（在浏览器中打开） ›</RouterLink><RouterLink v-if="auth.user.value" class="m-row" to="/me/account">账号安全 ›</RouterLink><button v-if="auth.user.value" @click="logout">退出登录</button></nav></main>
</template>
<style scoped>.m-page{max-width:42rem;margin:auto;padding-bottom:calc(8rem + env(safe-area-inset-bottom))}.m-card{margin:16px 0;padding:16px;border:1px solid #d8d2c8;background:#fffdf8}.m-row{display:grid;gap:4px;align-content:center;min-height:56px;color:inherit;border-bottom:1px solid #d8d2c8;text-decoration:none}small{color:#75665b}button{min-height:48px;padding:8px 16px;margin-top:16px;border:1px solid #938d83;background:transparent;font:inherit}</style>
