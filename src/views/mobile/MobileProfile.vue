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
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '未设置';
}
const rows = computed(() => [
  { label: '性别', value: optionLabel(GENDER_OPTIONS, profile.value.gender) },
  { label: '出生日期', value: text(profile.value.birth_date) },
  { label: '身份', value: optionLabel(IDENTITY_OPTIONS, profile.value.profile_identity) },
  { label: '账号 ID', value: text(profile.value.system_user_id) },
  { label: '注册时间', value: formatDate(profile.value.created_at) }
]);
</script>

<template>
  <main class="m-page profile-view">
    <h1>个人资料</h1>
    <section class="m-card identity-card">
      <span class="avatar" aria-hidden="true">
        <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="" width="64" height="64" />
        <span v-else>{{ (profile.display_name || '我').slice(0, 1) }}</span>
      </span>
      <strong>{{ profile.display_name || '未设置' }}</strong>
      <RouterLink class="edit-link" to="/me/profile/edit">编辑资料</RouterLink>
      <dl>
        <div v-for="row in rows" :key="row.label">
          <dt><span class="field-icon" aria-hidden="true"></span>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
    </section>
    <p class="group-label">邀请与安全</p>
    <nav class="m-card link-card" aria-label="邀请与安全">
      <RouterLink to="/me/invite">我的邀请码 <span aria-hidden="true">›</span></RouterLink>
      <RouterLink to="/me/account">修改密码 <span aria-hidden="true">›</span></RouterLink>
    </nav>
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
.group-label{margin:8px 0 0;color:var(--text-secondary);font-size:14px;line-height:21px}
.identity-card{display:grid;justify-items:center;gap:8px;text-align:center}
.avatar{display:grid;place-items:center;width:64px;height:64px;overflow:hidden;border-radius:50%;background:var(--m-icon-disc);color:var(--brand-action);font-size:24px}
.avatar img{width:100%;height:100%;object-fit:cover}
.edit-link{display:inline-flex;align-items:center;justify-content:center;min-width:76px;min-height:44px;padding:0 16px;border-radius:22px;background:var(--brand-light);color:var(--text-primary);text-decoration:none;font-size:var(--text-sm);font-weight:500}
dl{width:100%;margin:12px 0 0;border-top:1px solid var(--border-warm)}
dl div{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px}
dt{display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:14px}
.field-icon{flex:none;width:32px;height:32px;border-radius:50%;background:var(--m-icon-disc)}
dd{margin:0;font-size:var(--text-sm);text-align:right}
.link-card{display:grid;padding:0 16px}
.link-card a{display:flex;align-items:center;justify-content:space-between;min-height:68px;border-top:1px solid var(--border-warm);color:inherit;text-decoration:none;font-size:var(--text-md);font-weight:500}
.link-card a:first-child{border-top:0}
</style>
