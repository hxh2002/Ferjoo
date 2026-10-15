<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { classicAssets } from '../constants/classicAssets.js';

const auth = useAuth();
const router = useRouter();
const modal = ref(null);
const busy = ref(false);

const socials = [
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/share/18v7fhWTYX/?mibextid=wwXIfr',
    icon: 'facebook'
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/ferjoooooo/',
    icon: 'instagram'
  },
  {
    name: '小红书',
    href: 'https://xhslink.cn/o/71W7wzdhmIV',
    icon: 'xiaohongshu'
  }
];

onMounted(() => auth.init());

const accountName = computed(
  () =>
    auth.profile.value?.display_name ||
    auth.profile.value?.system_user_id ||
    auth.user.value?.email ||
    ''
);
const accountInitial = computed(() => (accountName.value.trim().charAt(0) || '?').toUpperCase());

async function logout() {
  busy.value = true;
  try {
    await auth.logout();
    await router.push('/');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <header class="site-header">
    <RouterLink class="brand-lockup" to="/" aria-label="返回 Ferjoo 诊断首页">
      <img class="brand-cn" :src="classicAssets.logoChinese" alt="酵种医生" />
      <img class="brand-en" :src="classicAssets.logoEnglish" alt="Dr. Ferjoo" />
    </RouterLink>

    <nav class="page-switch" aria-label="页面切换">
      <RouterLink to="/" class="page-switch-link">DIAGNOSE</RouterLink>
      <RouterLink v-if="auth.user.value" to="/history" class="page-switch-link">HISTORY</RouterLink>
      <RouterLink to="/today" class="page-switch-link">手机端</RouterLink>
    </nav>

    <div class="header-nav" aria-label="辅助导航">
      <nav class="header-links" aria-label="了解项目">
        <button class="nav-link nav-button" type="button" @click="modal = 'how'">HOW IT WORKS</button>
        <button class="nav-link nav-button" type="button" @click="modal = 'about'">ABOUT US</button>
      </nav>

      <template v-if="auth.user.value">
        <RouterLink class="account-chip" to="/profile" :title="`我的资料 · ${accountName}`">
          <span class="chip-avatar">
            <img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="头像" />
            <template v-else>{{ accountInitial }}</template>
          </span>
          <span class="chip-text">
            <strong class="chip-name">{{ accountName }}</strong>
            <small class="chip-sub">我的资料</small>
          </span>
        </RouterLink>
        <button
          class="icon-button"
          type="button"
          title="退出登录"
          aria-label="退出登录"
          :disabled="busy"
          @click="logout"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </template>
      <RouterLink v-else to="/login" class="login-cta">LOG IN</RouterLink>
    </div>
  </header>

  <Teleport to="body">
    <div v-if="modal" class="modal-backdrop" @click.self="modal = null">
      <section
        class="classic-modal"
        :class="{ 'about-modal': modal === 'about' }"
        role="dialog"
        aria-modal="true"
      >
        <button class="modal-close" type="button" aria-label="关闭" @click="modal = null">×</button>

        <template v-if="modal === 'how'">
          <p class="eyebrow dark">HOW IT WORKS</p>
          <h2>它如何判断你的酵种</h2>
          <p class="modal-lead">把你看到的变化放回发酵过程里理解，而不是只盯着某一个数字。</p>
          <div class="how-grid">
            <article><strong>01</strong><h3>先排查风险</h3><p>先确认没有霉变、异味等安全信号，再谈发酵节奏。</p></article>
            <article><strong>02</strong><h3>确认所处阶段</h3><p>新起种、成熟种、冷藏复活期的节奏不同，同样的表现含义也不同。</p></article>
            <article><strong>03</strong><h3>结合涨幅与时间</h3><p>把体积变化和已过时间放在一起，再结合温度与喂养比例判断快慢。</p></article>
            <article><strong>04</strong><h3>给出下一步</h3><p>继续等待、按节奏喂养或调整温度，都会给出明确方向。</p></article>
          </div>
          <div class="think-tip">
            <strong>一个更有用的观察习惯</strong>
            <p>连续记录 2–3 个喂养周期，比只看某一次是否翻倍更能说明酵种是否稳定。</p>
          </div>
          <div class="safety-note">
            <strong>食品安全提醒</strong>
            <span>不直接品尝生面粉或生酵种。</span>
            <span>出现彩色或绒毛状霉菌、明显腐败气味时，整份直接丢弃。</span>
          </div>
        </template>

        <template v-else>
          <img class="about-logo" :src="classicAssets.logoBrand" alt="Dr. Ferjoo" />
          <h2>让每一次发酵，都有迹可循。</h2>

          <div class="social-links" aria-label="Ferjoo 社交媒体">
            <a
              v-for="social in socials"
              :key="social.name"
              class="social-link"
              :href="social.href"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="social.name"
              :title="social.name"
            >
              <svg v-if="social.icon === 'facebook'" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13.7 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3h2.8v8h3.4Z"/>
              </svg>

              <svg v-else-if="social.icon === 'instagram'" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" ry="5.2" fill="none" stroke="currentColor" stroke-width="2"/>
                <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="2"/>
                <circle cx="17.4" cy="6.8" r="1.1"/>
              </svg>

              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5.2 4.2h13.6A2.2 2.2 0 0 1 21 6.4v11.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.6V6.4a2.2 2.2 0 0 1 2.2-2.2Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <path d="M7 8h3.5v2H9.4v5.8H7V8Zm4.5 0h2.3l1.2 2.2L16.2 8h2.3l-2.3 3.7 2.5 4.1h-2.4L15 13.3l-1.4 2.5h-2.4l2.6-4.1L11.5 8Z"/>
              </svg>
              <span>{{ social.name }}</span>
            </a>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>
