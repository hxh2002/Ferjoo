<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AdminDrawer from '../../components/admin/AdminDrawer.vue';
import AdminPager from '../../components/admin/AdminPager.vue';
import MConfirmDialog from '../../components/mobile/MConfirmDialog.vue';
import { useAuth } from '../../composables/useAuth.js';
import { ADMIN_PAGE_SIZE, canChangeRole, formatAdminTime, isSuperAdminProfile, memberRoleLabel, personLabel, roleLabel } from '../../lib/admin-access.js';
import { GENDER_OPTIONS, IDENTITY_OPTIONS, optionLabel } from '../../lib/profile-options.js';
import { createAccount, getUser, listUsers, setUserRole } from '../../services/admin.service.js';

const auth = useAuth();
const superAdmin = computed(() => isSuperAdminProfile(auth.profile.value));
const rows = ref([]);
const total = ref(0);
const page = ref(0);
const query = ref('');
const role = ref('all');
const loading = ref(true);
const error = ref('');
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
const selectedId = ref('');
const creating = ref(false);
const created = ref('');
const createError = ref('');
const saving = ref(false);
const form = reactive({ email: '', displayName: '', password: '', confirm: '' });
const pendingRole = ref(null);
let timer;

const roleAction = computed(() => {
  const profile = detail.value?.profile;
  if (!canChangeRole(auth.profile.value, profile)) return null;
  return profile.role === 'A'
    ? { role: 'U', label: '取消管理员', title: '取消这位管理员？', message: '对方会回到普通用户，系统 ID 会按普通用户重新分配。已有的设备、绑定和发酵记录不会断开。', danger: true }
    : { role: 'A', label: '设为管理员', title: '设为管理员？', message: '对方可以进入后台查阅并处理日常运营，但不能任命其他管理员，也不能手工创建账号。系统 ID 会按管理员重新分配。', danger: false };
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await listUsers({ query: query.value, role: role.value, page: page.value });
    rows.value = result.rows;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loading.value = false;
  }
}
function search() {
  clearTimeout(timer);
  timer = setTimeout(() => { page.value = 0; load(); }, 250);
}
watch(role, () => { page.value = 0; load(); });
function turn(next) { page.value = next; load(); }

async function openUser(row) {
  selectedId.value = row.id;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try { detail.value = await getUser(row.id); }
  catch (cause) { detailError.value = cause.message; }
  finally { detailLoading.value = false; }
}
function closeDetail() {
  selectedId.value = '';
  detail.value = null;
  pendingRole.value = null;
}
async function applyRole() {
  const action = pendingRole.value;
  const id = detail.value?.profile?.id;
  pendingRole.value = null;
  if (!action || !id) return;
  saving.value = true;
  detailError.value = '';
  try {
    await setUserRole(id, action.role);
    await openUser({ id });
    await load();
  } catch (cause) {
    detailError.value = cause.message;
  } finally {
    saving.value = false;
  }
}
async function submitAccount() {
  createError.value = '';
  created.value = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { createError.value = '请填写有效的邮箱。'; return; }
  if (form.password.length < 6 || form.password.length > 72) { createError.value = '初始密码至少 6 位，且不超过 72 位。'; return; }
  if (form.password !== form.confirm) { createError.value = '两次输入的密码不一致。'; return; }
  saving.value = true;
  try {
    const createdAccount = await createAccount({ email: form.email, password: form.password, displayName: form.displayName });
    created.value = `已创建 ${createdAccount.email}，系统 ID ${createdAccount.system_user_id}。请把初始密码安全地交给对方；对方登录后可在「修改密码」中更换。`;
    form.email = '';
    form.displayName = '';
    form.password = '';
    form.confirm = '';
    creating.value = false;
    page.value = 0;
    await load();
  } catch (cause) {
    createError.value = cause.message;
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section>
    <p class="admin-lead">查看账号、角色和邀请关系。任命管理员与手工建号只属于首位管理员。</p>
    <div class="admin-toolbar">
      <input v-model="query" type="search" placeholder="搜索邮箱、用户名或系统 ID" aria-label="搜索账号" @input="search">
      <select v-model="role" aria-label="按角色筛选">
        <option value="all">全部角色</option>
        <option value="U">用户</option>
        <option value="A">管理员</option>
      </select>
      <button v-if="superAdmin" type="button" class="m-primary" @click="creating = !creating">{{ creating ? '收起建号' : '新建账号' }}</button>
    </div>
    <form v-if="superAdmin && creating" class="admin-form" @submit.prevent="submitAccount">
      <p class="admin-note">新账号立即可以登录，不消耗邀请码。初始密码只在这里设置一次，不会保存在页面上。</p>
      <label class="admin-field"><span>邮箱</span><input v-model="form.email" type="email" autocomplete="off" required></label>
      <label class="admin-field"><span>用户名（可选）</span><input v-model="form.displayName" type="text" maxlength="80" autocomplete="off"></label>
      <label class="admin-field"><span>初始密码</span><input v-model="form.password" type="password" autocomplete="new-password" minlength="6" required></label>
      <label class="admin-field"><span>确认密码</span><input v-model="form.confirm" type="password" autocomplete="new-password" minlength="6" required></label>
      <p v-if="createError" class="m-error" role="alert">{{ createError }}</p>
      <div class="admin-actions"><button class="m-primary" type="submit" :disabled="saving">{{ saving ? '创建中…' : '创建账号' }}</button></div>
    </form>
    <p v-if="created" class="admin-note" role="status">{{ created }}</p>
    <p v-if="loading" class="admin-note" role="status">正在读取账号…</p>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="m-secondary" @click="load">重试</button></p>
    <p v-else-if="!rows.length" class="admin-note">没有符合条件的账号。</p>
    <div v-else class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>账号</th><th>系统 ID</th><th>角色</th><th>邀请</th><th>注册时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :class="{ 'is-selected': selectedId === row.id }">
            <td><strong>{{ personLabel(row) }}</strong><br><span class="admin-note">{{ row.email }}</span></td>
            <td>{{ row.system_user_id }}</td>
            <td><span class="admin-badge" :class="{ 'is-muted': row.role !== 'A' }">{{ roleLabel(row) }}</span></td>
            <td>{{ row.invited_count }} / {{ row.invite_quota }}</td>
            <td>{{ formatAdminTime(row.created_at) }}</td>
            <td><button type="button" class="m-secondary" @click="openUser(row)">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <AdminPager :page="page" :total="total" :page-size="ADMIN_PAGE_SIZE" @page="turn" />

    <AdminDrawer :open="Boolean(selectedId)" :title="detail?.profile ? personLabel(detail.profile) : '账号详情'" @close="closeDetail">
      <p v-if="detailLoading" class="admin-note" role="status">正在读取详情…</p>
      <p v-else-if="detailError" class="m-error" role="alert">{{ detailError }}</p>
      <template v-else-if="detail">
        <dl class="admin-facts">
          <div><dt>系统 ID</dt><dd>{{ detail.profile.system_user_id }}</dd></div>
          <div><dt>邮箱</dt><dd>{{ detail.profile.email }}</dd></div>
          <div><dt>角色</dt><dd>{{ roleLabel(detail.profile) }}</dd></div>
          <div><dt>性别</dt><dd>{{ optionLabel(GENDER_OPTIONS, detail.profile.gender) }}</dd></div>
          <div><dt>身份</dt><dd>{{ optionLabel(IDENTITY_OPTIONS, detail.profile.profile_identity) }}</dd></div>
          <div><dt>出生日期</dt><dd>{{ detail.profile.birth_date || '未设置' }}</dd></div>
          <div><dt>邀请人</dt><dd>{{ detail.inviter ? `${personLabel(detail.inviter)}（${detail.inviter.system_user_id}）` : '无' }}</dd></div>
          <div><dt>邀请名额</dt><dd>已用 {{ detail.profile.invited_count }} / {{ detail.profile.invite_quota }}。名额调整仍在数据库中进行。</dd></div>
          <div><dt>喂养轮次</dt><dd>{{ detail.feedingCount }}</dd></div>
        </dl>
        <div v-if="roleAction" class="admin-actions">
          <button type="button" class="m-secondary" :class="{ 'admin-danger': roleAction.danger }" :disabled="saving" @click="pendingRole = roleAction">{{ roleAction.label }}</button>
        </div>
        <p v-else-if="detail.profile.is_super_admin" class="admin-note">首位管理员的权限不能在这里更改。</p>
        <section class="admin-section">
          <h3>绑定的设备</h3>
          <p v-if="!detail.bindings.length" class="admin-note">还没有绑定设备。</p>
          <ul v-else>
            <li v-for="item in detail.bindings" :key="item.device_id">{{ item.device?.name || item.device_id }} · {{ memberRoleLabel(item.role) }}<br><span class="admin-note">{{ item.device_id }}</span></li>
          </ul>
        </section>
        <section class="admin-section">
          <h3>酵种</h3>
          <p v-if="!detail.starters.length" class="admin-note">还没有酵种。</p>
          <ul v-else>
            <li v-for="item in detail.starters" :key="item.id">{{ item.name }}<span v-if="item.archived_at"> · 已归档</span></li>
          </ul>
        </section>
      </template>
    </AdminDrawer>
    <MConfirmDialog
      :open="Boolean(pendingRole)"
      :danger="Boolean(pendingRole?.danger)"
      :title="pendingRole?.title || ''"
      :message="pendingRole?.message || ''"
      :confirm-label="pendingRole?.label || '确认'"
      cancel-label="取消"
      @cancel="pendingRole = null"
      @confirm="applyRole"
    />
  </section>
</template>
