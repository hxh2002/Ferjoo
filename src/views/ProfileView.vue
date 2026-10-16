<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';
import {
  changePassword,
  deleteAvatarFile,
  removeAvatar,
  updateProfile,
  uploadAvatar
} from '../services/auth.service.js';

const VIEW = 320;
const EXPORT = 512;

const auth = useAuth();
const profile = computed(() => auth.profile.value);
const userId = computed(() => auth.user.value?.id || '');

const form = reactive({ displayName: '', gender: '', birthDate: '', identity: '' });
const infoBusy = ref(false);
const infoError = ref('');
const infoSuccess = ref('');

const pwForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });
const pwBusy = ref(false);
const pwError = ref('');
const pwSuccess = ref('');

const copied = ref(false);

// ---- 头像裁剪 ----
const avatarInput = ref(null);
const cropCanvas = ref(null);
const cropperOpen = ref(false);
const img = ref(null);
const zoom = ref(1);
const cropError = ref('');
const avatarBusy = ref(false);
const pos = reactive({ x: 0, y: 0 });
const dragging = ref(false);
let dragPointer = null;
let objectUrl = null;

const GENDER_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'secret', label: '保密' }
];

const IDENTITY_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'secondary', label: '中学生' },
  { value: 'college', label: '大学生' },
  { value: 'graduate', label: '研究生' },
  { value: 'working', label: '已工作' },
  { value: 'other', label: '其他' }
];

const accountName = computed(
  () =>
    profile.value?.display_name ||
    profile.value?.system_user_id ||
    auth.user.value?.email ||
    ''
);
const accountInitial = computed(() => (accountName.value.trim().charAt(0) || '?').toUpperCase());
const isAdmin = computed(() => profile.value?.role === 'A');
const registeredAt = computed(() => {
  if (!profile.value?.created_at) return '—';
  return new Date(profile.value.created_at).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});
const inviteUsed = computed(() => profile.value?.invited_count ?? 0);
const inviteTotal = computed(() => profile.value?.invite_quota ?? 1);
const inviteRemaining = computed(() => Math.max(0, inviteTotal.value - inviteUsed.value));
const invitePercent = computed(() =>
  inviteTotal.value > 0 ? Math.min(100, (inviteUsed.value / inviteTotal.value) * 100) : 0
);

function syncForm() {
  const p = profile.value;
  if (!p) return;
  form.displayName = p.display_name || '';
  form.gender = p.gender || '';
  form.birthDate = p.birth_date || '';
  form.identity = p.profile_identity || '';
}

watch(profile, syncForm);

onMounted(async () => {
  await auth.init();
  if (auth.configured && !auth.profile.value) await auth.refreshProfile();
  syncForm();
});

async function saveInfo() {
  if (!userId.value) return;
  infoBusy.value = true;
  infoError.value = '';
  infoSuccess.value = '';
  try {
    await updateProfile(userId.value, {
      displayName: form.displayName,
      gender: form.gender,
      birthDate: form.birthDate || null,
      identity: form.identity
    });
    await auth.refreshProfile();
    infoSuccess.value = '资料已保存。';
  } catch (e) {
    infoError.value = e?.message || '保存失败，请稍后重试。';
  } finally {
    infoBusy.value = false;
  }
}

async function submitPassword() {
  pwError.value = '';
  pwSuccess.value = '';
  if (!pwForm.oldPassword) {
    pwError.value = '请输入旧密码。';
    return;
  }
  if (pwForm.newPassword.length < 6) {
    pwError.value = '新密码至少需要 6 位。';
    return;
  }
  if (pwForm.newPassword !== pwForm.confirm) {
    pwError.value = '两次输入的新密码不一致。';
    return;
  }
  pwBusy.value = true;
  try {
    await changePassword({ oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword });
    Object.assign(pwForm, { oldPassword: '', newPassword: '', confirm: '' });
    pwSuccess.value = '密码已修改，下次登录请使用新密码。';
  } catch (e) {
    pwError.value = e?.message || '密码修改失败，请稍后重试。';
  } finally {
    pwBusy.value = false;
  }
}

async function copyInvite() {
  const code = profile.value?.invite_code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = code;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1600);
}

async function onPickFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    cropError.value = '请选择图片文件（PNG / JPEG / WEBP）。';
    return;
  }
  cropError.value = '';
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = url;
    img.value = image;
    zoom.value = 1;
    resetPos();
    cropperOpen.value = true;
    nextTick(draw);
  };
  image.src = url;
}

function scaledSize() {
  if (!img.value) return { w: 0, h: 0 };
  const base = Math.max(VIEW / img.value.naturalWidth, VIEW / img.value.naturalHeight);
  const scale = base * zoom.value;
  return { w: img.value.naturalWidth * scale, h: img.value.naturalHeight * scale };
}

function clampPos() {
  const { w, h } = scaledSize();
  pos.x = Math.min(0, Math.max(VIEW - w, pos.x));
  pos.y = Math.min(0, Math.max(VIEW - h, pos.y));
}

function resetPos() {
  const { w, h } = scaledSize();
  pos.x = (VIEW - w) / 2;
  pos.y = (VIEW - h) / 2;
}

function draw() {
  if (!cropCanvas.value || !img.value) return;
  const ctx = cropCanvas.value.getContext('2d');
  const { w, h } = scaledSize();
  clampPos();
  ctx.clearRect(0, 0, VIEW, VIEW);
  ctx.drawImage(img.value, pos.x, pos.y, w, h);
}

function onZoom() {
  clampPos();
  draw();
}

function startDrag(event) {
  if (!img.value) return;
  dragging.value = true;
  dragPointer = { x: event.clientX, y: event.clientY };
  cropCanvas.value?.setPointerCapture?.(event.pointerId);
}

function onDrag(event) {
  if (!dragging.value || !dragPointer) return;
  const scale = VIEW / cropCanvas.value.getBoundingClientRect().width;
  pos.x += (event.clientX - dragPointer.x) * scale;
  pos.y += (event.clientY - dragPointer.y) * scale;
  dragPointer = { x: event.clientX, y: event.clientY };
  draw();
}

function endDrag() {
  dragging.value = false;
  dragPointer = null;
}

function closeCropper() {
  cropperOpen.value = false;
  img.value = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function exportBlob() {
  return new Promise((resolve, reject) => {
    if (!img.value) return reject(new Error('NO_IMAGE'));
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT;
    canvas.height = EXPORT;
    const ctx = canvas.getContext('2d');
    const { w, h } = scaledSize();
    const factor = EXPORT / VIEW;
    ctx.drawImage(img.value, pos.x * factor, pos.y * factor, w * factor, h * factor);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('EXPORT_FAILED'))), 'image/png');
  });
}

async function confirmCrop() {
  if (!userId.value) return;
  avatarBusy.value = true;
  cropError.value = '';
  try {
    const blob = await exportBlob();
    const url = await uploadAvatar(userId.value, blob);
    const oldUrl = profile.value?.avatar_url;
    await updateProfile(userId.value, { avatarUrl: url });
    await auth.refreshProfile();
    if (oldUrl && oldUrl !== url) {
      deleteAvatarFile(userId.value, oldUrl).catch(() => {});
    }
    closeCropper();
    infoSuccess.value = '头像已更新。';
  } catch (e) {
    cropError.value = e?.message || '头像上传失败，请稍后重试。';
  } finally {
    avatarBusy.value = false;
  }
}

async function clearAvatar() {
  if (!userId.value || !profile.value?.avatar_url) return;
  infoBusy.value = true;
  infoError.value = '';
  infoSuccess.value = '';
  try {
    await removeAvatar(userId.value, profile.value.avatar_url);
    await auth.refreshProfile();
    infoSuccess.value = '已移除头像。';
  } catch (e) {
    infoError.value = e?.message || '移除头像失败。';
  } finally {
    infoBusy.value = false;
  }
}
</script>

<template>
  <section class="profile-page">
    <div class="profile-heading">
      <div>
        <p class="eyebrow">PERSONAL PROFILE</p>
        <h1>个人资料</h1>
      </div>
      <div v-if="profile" class="profile-plate">
        <small>FERJOO ID</small>
        <strong>{{ profile.system_user_id || '—' }}</strong>
        <span>{{ isAdmin ? '管理员' : '普通用户' }} · {{ registeredAt }} 注册</span>
      </div>
    </div>

    <template v-if="auth.configured && profile">
      <div class="profile-grid">
        <div class="panel profile-card">
          <div class="panel-heading compact-heading">
            <div><p class="eyebrow dark">BASIC INFO</p><h2>基本资料</h2></div>
          </div>

          <div class="profile-top">
            <div class="avatar-editor">
              <div class="avatar-frame">
                <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="头像" />
                <span v-else class="avatar-placeholder">{{ accountInitial }}</span>
              </div>
              <input
                ref="avatarInput"
                class="avatar-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change="onPickFile"
              />
              <button class="small-primary" type="button" @click="avatarInput?.click()">
                {{ profile.avatar_url ? '更换头像' : '上传头像' }}
              </button>
              <button
                v-if="profile.avatar_url"
                class="text-button"
                type="button"
                :disabled="infoBusy"
                @click="clearAvatar"
              >
                移除头像
              </button>
              <small class="avatar-hint">将裁切为正方形显示。</small>
            </div>

            <dl class="meta-list">
              <div><dt>注册日期</dt><dd>{{ registeredAt }}</dd></div>
              <div><dt>用户 ID</dt><dd>{{ profile.system_user_id }}</dd></div>
              <div><dt>角色</dt><dd>{{ isAdmin ? '管理员' : '普通用户' }}</dd></div>
              <div><dt>邮箱</dt><dd>{{ profile.email }}</dd></div>
            </dl>
          </div>

          <form class="profile-form" @submit.prevent="saveInfo">
            <label>
              <span>用户名</span>
              <input v-model.trim="form.displayName" type="text" maxlength="80" placeholder="你的显示名称" />
            </label>
            <label>
              <span>性别</span>
              <select v-model="form.gender">
                <option v-for="option in GENDER_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              <span>出生年月日</span>
              <input v-model="form.birthDate" type="date" :max="new Date().toISOString().slice(0, 10)" />
            </label>
            <label>
              <span>身份</span>
              <select v-model="form.identity">
                <option v-for="option in IDENTITY_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <p v-if="infoError" class="form-error">{{ infoError }}</p>
            <p v-if="infoSuccess" class="form-success">{{ infoSuccess }}</p>
            <button class="diagnose-button profile-submit" :disabled="infoBusy">
              <span>{{ infoBusy ? '保存中…' : '保存资料' }}</span>
            </button>
          </form>
        </div>

        <div class="profile-side">
          <div class="panel profile-card invite-card">
            <div class="panel-heading compact-heading">
              <div><p class="eyebrow dark">INVITE</p><h2>我的邀请码</h2></div>
            </div>
            <div class="invite-hero">
              <div class="invite-code">{{ profile.invite_code || '—' }}</div>
              <button class="small-primary" type="button" @click="copyInvite">
                {{ copied ? '已复制' : '复制邀请码' }}
              </button>
            </div>
            <div class="invite-meter">
              <div class="invite-meter-row">
                <span>已邀请 {{ inviteUsed }} 人</span>
                <span>上限 {{ inviteTotal }} 人</span>
              </div>
              <div class="meter-track">
                <div class="meter-fill" :style="{ width: `${invitePercent}%` }"></div>
              </div>
              <small v-if="inviteRemaining > 0">还可邀请 {{ inviteRemaining }} 人。</small>
              <small v-else class="invite-exhausted">邀请名额已用完。</small>
            </div>
            <p class="invite-note">
              新用户可邀请人数默认为 1，如需调整，请联系管理员修改。
            </p>
          </div>

          <div class="panel profile-card password-card">
            <div class="panel-heading compact-heading">
              <div><p class="eyebrow dark">SECURITY</p><h2>修改密码</h2></div>
            </div>
            <form class="profile-form" @submit.prevent="submitPassword">
              <label>
                <span>旧密码</span>
                <input v-model="pwForm.oldPassword" type="password" autocomplete="current-password" required />
              </label>
              <label>
                <span>新密码</span>
                <input v-model="pwForm.newPassword" type="password" autocomplete="new-password" required />
              </label>
              <label>
                <span>确认新密码</span>
                <input v-model="pwForm.confirm" type="password" autocomplete="new-password" required />
              </label>
              <p v-if="pwError" class="form-error">{{ pwError }}</p>
              <p v-if="pwSuccess" class="form-success">{{ pwSuccess }}</p>
              <button class="diagnose-button profile-submit" :disabled="pwBusy">
                <span>{{ pwBusy ? '修改中…' : '修改密码' }}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="!auth.configured" class="panel config-warning profile-warning">
      当前未配置 Supabase，个人资料不可用。请先配置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。
    </div>
  </section>

  <Teleport to="body">
    <div v-if="cropperOpen" class="modal-backdrop" @click.self="closeCropper">
      <section class="crop-modal" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" aria-label="关闭" @click="closeCropper">×</button>
        <p class="eyebrow dark">AVATAR CROP</p>
        <h2>裁剪头像</h2>
        <p class="crop-tip">拖动图片调整位置，使用滑块缩放，保存时自动裁切为正方形。</p>
        <div class="crop-stage">
          <canvas
            ref="cropCanvas"
            class="crop-canvas"
            width="320"
            height="320"
            @pointerdown="startDrag"
            @pointermove="onDrag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          ></canvas>
        </div>
        <label class="crop-zoom">
          <span>缩放</span>
          <input v-model.number="zoom" class="range" type="range" min="1" max="4" step="0.01" @input="onZoom" />
        </label>
        <p v-if="cropError" class="form-error">{{ cropError }}</p>
        <div class="crop-actions">
          <button class="ghost-button" type="button" @click="closeCropper">取消</button>
          <button class="small-primary" type="button" :disabled="avatarBusy" @click="confirmCrop">
            {{ avatarBusy ? '保存中…' : '保存头像' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.crop-modal{box-sizing:border-box;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow-y:auto}.crop-stage{width:min(320px,100%);max-width:100%;margin:auto}.crop-canvas{display:block;width:100%;height:auto;touch-action:none}.crop-actions{display:flex;flex-wrap:wrap;gap:8px}.crop-actions button{min-height:44px}.profile-form input,.profile-form select{min-width:0;max-width:100%;box-sizing:border-box;font-size:16px}
</style>
