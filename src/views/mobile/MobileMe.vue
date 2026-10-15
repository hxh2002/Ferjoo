<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';

const auth = useAuth();
const router = useRouter();
const name = computed(() => auth.profile.value?.display_name || auth.profile.value?.system_user_id || auth.user.value?.email || '');
async function logout() {
  await auth.logout();
  await router.push('/today');
}
onMounted(() => auth.init());
</script>

<template>
  <main class="m-page">
    <section class="m-card">
      <p class="m-eyebrow">我的</p>
      <h1>{{ name || '账号与低频设置' }}</h1>
      <p class="m-muted">设备、资料、邀请码与安全设置放在这里，不占用日常养护首屏。</p>
    </section>
    <nav class="m-card m-menu" aria-label="我的设置">
      <RouterLink v-if="auth.user.value" to="/profile"><span>个人资料与头像</span><b>›</b></RouterLink>
      <RouterLink v-if="auth.user.value" to="/me/devices"><span>我的设备</span><b>›</b></RouterLink>
      <RouterLink v-if="auth.user.value" to="/claim"><span>绑定设备二维码链接</span><b>›</b></RouterLink>
      <RouterLink v-if="!auth.user.value" :to="{ path: '/login', query: { redirect: '/me' } }"><span>登录</span><b>›</b></RouterLink>
      <RouterLink v-if="!auth.user.value" :to="{ path: '/register', query: { redirect: '/me' } }"><span>邀请码注册</span><b>›</b></RouterLink>
      <RouterLink to="/"><span>电脑端完整工具</span><b>›</b></RouterLink>
    </nav>
    <section v-if="auth.user.value" class="m-card">
      <h2>账号安全</h2>
      <p class="m-muted">密码修改和资料维护在资料页完成；退出不会把本机草稿迁移给下一账号。</p>
      <button class="m-secondary" type="button" @click="logout">退出登录</button>
    </section>
  </main>
</template>

<style scoped>
.m-page{max-width:42rem;margin:auto;padding-bottom:calc(8rem + env(safe-area-inset-bottom))}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-eyebrow{color:#a44213;font-weight:700}.m-menu a{display:flex;justify-content:space-between;align-items:center;min-height:56px;border-top:1px solid #eadfd6;color:inherit;text-decoration:none}.m-menu a:first-child{border-top:0}.m-menu b{color:#a44213}.m-secondary{min-height:48px;padding:.7rem 1rem;border:1px solid #938d83;background:transparent;font:inherit;cursor:pointer}.m-muted{color:#625e56;font-size:.92rem;line-height:1.55}
</style>
