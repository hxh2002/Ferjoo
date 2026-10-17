<script setup>
import { onMounted, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
const auth = useAuth(); const notice = ref('');
onMounted(() => auth.init());
async function copy() { try { await navigator.clipboard.writeText(auth.profile.value.invite_code); notice.value = '邀请码已复制。'; } catch { notice.value = '复制失败，请长按邀请码复制。'; } }
</script>
<template><main class="m-page invite-page"><section><h2>我的邀请码</h2><p class="code">{{ auth.profile.value?.invite_code || '正在读取…' }}</p><button :disabled="!auth.profile.value?.invite_code" @click="copy">复制邀请码</button><p>已邀请 {{ auth.profile.value?.invited_count ?? 0 }} / {{ auth.profile.value?.invite_quota ?? 1 }} 人</p><p role="status">{{ notice }}</p><p>好友注册时填写此邀请码，不会共享你的记录或设备。</p></section></main></template>
<style scoped>.invite-page{max-width:42rem;margin:auto;padding:20px}section{padding:16px;margin-top:16px;border:1px solid #d8d2c8;background:#fffdf8}.code{font-size:28px;overflow-wrap:anywhere;user-select:all}button{min-height:48px;padding:8px 16px;font:inherit;border:1px solid #938d83;background:transparent}</style>
