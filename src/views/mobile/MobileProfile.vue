<script setup>
import { computed, onMounted } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { GENDER_OPTIONS, IDENTITY_OPTIONS, optionLabel } from '../../lib/profile-options.js';

const auth = useAuth();
onMounted(() => auth.init());
const profile = computed(() => auth.profile.value || {});
function text(value) {
  return value ? String(value) : '未设置';
}
function formatDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '未设置';
}
const inviteLeft = computed(() => Math.max(0, Number(profile.value.invite_quota ?? 1) - Number(profile.value.invited_count ?? 0)));
const rows = computed(() => [
  { label: '性别', icon: 'user', value: optionLabel(GENDER_OPTIONS, profile.value.gender) },
  { label: '出生日期', icon: 'calendar', value: text(profile.value.birth_date) },
  { label: '身份', icon: 'card', value: optionLabel(IDENTITY_OPTIONS, profile.value.profile_identity) },
  { label: '账号 ID', icon: 'hash', value: text(profile.value.system_user_id) },
  { label: '注册时间', icon: 'check', value: formatDate(profile.value.created_at) }
]);
</script>

<template>
  <main class="m-page profile-view">
    <h1>个人资料</h1>
    <section class="m-card identity-card">
      <div class="identity-row">
        <span class="avatar" aria-hidden="true">
          <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="" width="64" height="64" />
          <span v-else>{{ (profile.display_name || '我').slice(0, 1) }}</span>
        </span>
        <strong>{{ profile.display_name || '未设置' }}</strong>
        <RouterLink class="edit-link" to="/me/profile/edit">编辑资料</RouterLink>
      </div>
      <dl>
        <div v-for="row in rows" :key="row.label">
          <dt><span class="field-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path v-if="row.icon === 'user'" d="M10 10.2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.2 5.3a5.4 5.4 0 0 1 10.4 0" /><path v-else-if="row.icon === 'calendar'" d="M5 4.5h10v11H5v-11Zm0 3.5h10M7.5 3v2.5M12.5 3v2.5" /><path v-else-if="row.icon === 'card'" d="M4 6.5h12v8H4v-8Zm0 2.5h12M6.5 12h3" /><path v-else-if="row.icon === 'hash'" d="M8 4.5 6.8 15.5M13.2 4.5 12 15.5M4.8 8h11M4.2 12h11" /><path v-else d="M5 4.5h10v11H5v-11Zm0 3.5h10M7.2 12.2 9 14l3.8-4" /></svg></span>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
    </section>
    <nav class="m-card link-card" aria-label="邀请与安全">
      <RouterLink to="/me/invite"><span>我的邀请码<small>还可邀请 {{ inviteLeft }} 人</small></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg></RouterLink>
      <RouterLink to="/me/account"><span>修改密码</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg></RouterLink>
    </nav>
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
.identity-card{display:grid;gap:20px;padding:20px}
.identity-row{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:12px}
.avatar{display:grid;place-items:center;width:64px;height:64px;overflow:hidden;border-radius:50%;background:var(--m-icon-disc);color:var(--brand-action);font-size:28px;line-height:36px;font-weight:500}
.avatar img{width:100%;height:100%;object-fit:cover}
.identity-row strong{font-size:18px;line-height:26px;font-weight:500}
.edit-link{display:inline-flex;align-items:center;justify-content:center;width:76px;min-height:44px;border-radius:22px;background:var(--m-icon-disc);color:var(--brand-action);text-decoration:none;font-size:14px;font-weight:500}
dl{display:grid;gap:8px;width:100%;margin:0;padding-top:12px;border-top:1px solid var(--border-warm)}
dl div{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px}
dt{display:flex;align-items:center;gap:8px;width:112px;color:var(--text-secondary);font-size:14px;line-height:21px}
.field-icon{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;background:var(--m-icon-disc);color:var(--brand-action)}
.field-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
dd{margin:0;flex:1;font-size:14px;line-height:21px;text-align:right}
.link-card{display:grid;margin-top:12px;padding:0 20px}
.link-card a{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:68px;border-top:1px solid var(--border-warm);color:inherit;text-decoration:none;font-size:16px;line-height:24px;font-weight:500}
.link-card a:first-child{border-top:0}
.link-card span{display:grid;gap:2px}
.link-card small{color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.link-card svg{flex:none;width:20px;height:20px;fill:none;stroke:var(--brand-action);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
</style>
