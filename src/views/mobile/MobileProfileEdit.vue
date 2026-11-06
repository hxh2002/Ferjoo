<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { removeAvatar, updateProfile, uploadAvatar } from '../../services/auth.service.js';
import { GENDER_OPTIONS, IDENTITY_OPTIONS } from '../../lib/profile-options.js';
import MActionSheet from '../../components/mobile/MActionSheet.vue';
import MConfirmDialog from '../../components/mobile/MConfirmDialog.vue';
import MRadioCard from '../../components/mobile/MRadioCard.vue';
import MSheet from '../../components/mobile/MSheet.vue';
import MToast from '../../components/mobile/MToast.vue';
import MWheelPicker from '../../components/mobile/MWheelPicker.vue';

const auth = useAuth();
const name = ref('');
const gender = ref('');
const identity = ref('');
const birth = ref({ year: '2000', month: '01', day: '01' });
const sheet = ref('');
const avatarOpen = ref(false);
const removeOpen = ref(false);
const fileInput = ref(null);
const cameraInput = ref(null);
const busy = ref(false);
const error = ref('');
const toast = ref('');
const yearNow = new Date().getFullYear();
const yearOptions = Array.from({ length: 100 }, (_, index) => {
  const year = String(yearNow - index);
  return { value: year, label: `${year} 年` };
});
const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: `${index + 1} 月` }));
const dayOptions = computed(() => {
  const count = new Date(Number(birth.value.year), Number(birth.value.month), 0).getDate();
  return Array.from({ length: count }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: `${index + 1} 日` }));
});
const birthLabel = computed(() => `${birth.value.year}-${birth.value.month}-${birth.value.day}`);

onMounted(async () => {
  await auth.init();
  const profile = auth.profile.value || {};
  name.value = profile.display_name || '';
  gender.value = profile.gender || '';
  identity.value = profile.profile_identity || '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile.birth_date || '');
  if (match) birth.value = { year: match[1], month: match[2], day: match[3] };
});

async function save() {
  if (busy.value || !auth.user.value) return;
  busy.value = true;
  error.value = '';
  try {
    await updateProfile(auth.user.value.id, { displayName: name.value, gender: gender.value, birthDate: birthLabel.value, identity: identity.value });
    await auth.refreshProfile();
    toast.value = '资料已保存';
  } catch (cause) {
    error.value = cause?.message || '资料没有保存。';
  } finally {
    busy.value = false;
  }
}
function pickAvatar(camera) {
  avatarOpen.value = false;
  (camera ? cameraInput : fileInput).value?.click();
}
function cropSquare(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const size = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 512, 512);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('头像裁剪失败。'))), 'image/png');
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这张图片。')); };
    image.src = url;
  });
}
async function onFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !auth.user.value) return;
  busy.value = true;
  error.value = '';
  try {
    const blob = await cropSquare(file);
    const url = await uploadAvatar(auth.user.value.id, blob);
    await updateProfile(auth.user.value.id, { avatarUrl: url });
    await auth.refreshProfile();
    toast.value = '资料已保存';
  } catch (cause) {
    error.value = cause?.message || '头像没有更新。';
  } finally {
    busy.value = false;
  }
}
async function confirmRemove() {
  removeOpen.value = false;
  if (!auth.user.value || !auth.profile.value?.avatar_url) return;
  busy.value = true;
  try {
    await removeAvatar(auth.user.value.id, auth.profile.value.avatar_url);
    await auth.refreshProfile();
    toast.value = '资料已保存';
  } catch (cause) {
    error.value = cause?.message || '头像没有移除。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="m-page profile-edit">
    <h1>编辑资料</h1>
    <section class="m-card">
      <button type="button" class="avatar-button" aria-label="更换头像" @click="avatarOpen = true">更换头像</button>
      <input ref="cameraInput" class="file" type="file" accept="image/*" capture="environment" aria-label="拍照" @change="onFile" />
      <input ref="fileInput" class="file" type="file" accept="image/*" aria-label="从相册选择" @change="onFile" />
      <label>用户名<input v-model="name" maxlength="40" /></label>
      <button type="button" class="choice" @click="sheet = 'gender'">性别 <strong>{{ GENDER_OPTIONS.find((item) => item.value === gender)?.label || '未设置' }}</strong></button>
      <button type="button" class="choice" @click="sheet = 'birth'">出生日期 <strong>{{ birthLabel }}</strong></button>
      <MRadioCard :model-value="identity" :options="IDENTITY_OPTIONS" label="身份" @update:model-value="identity = $event" />
      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
      <button type="button" class="m-primary" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存' }}</button>
    </section>
    <MActionSheet :open="avatarOpen" title="更换头像" :actions="[{ value: 'camera', label: '拍照' }, { value: 'library', label: '从相册选择' }, { value: 'remove', label: '移除', danger: true }]" @close="avatarOpen = false" @select="(value) => value === 'remove' ? (avatarOpen = false, removeOpen = true) : pickAvatar(value === 'camera')" />
    <MConfirmDialog :open="removeOpen" danger title="移除头像" message="移除后资料页会显示名字首字。" confirm-label="移除" @cancel="removeOpen = false" @confirm="confirmRemove" />
    <MSheet :open="sheet === 'gender'" title="性别" @close="sheet = ''">
      <MRadioCard :model-value="gender" :options="GENDER_OPTIONS" label="性别" @update:model-value="gender = $event; sheet = ''" />
    </MSheet>
    <MSheet :open="sheet === 'birth'" title="出生日期" @close="sheet = ''">
      <div class="wheels">
        <MWheelPicker :model-value="birth.year" :options="yearOptions" label="年" @update:model-value="birth.year = $event" />
        <MWheelPicker :model-value="birth.month" :options="monthOptions" label="月" @update:model-value="birth.month = $event" />
        <MWheelPicker :model-value="birth.day" :options="dayOptions" label="日" @update:model-value="birth.day = $event" />
      </div>
    </MSheet>
    <MToast :open="!!toast" :message="toast" tone="success" @close="toast = ''" />
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
label,.choice{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;font-size:var(--text-sm)}
.choice{width:100%;padding:0;border:0;border-top:1px solid var(--border-warm);background:transparent;color:inherit;text-align:left}
.avatar-button,.m-primary{min-height:44px}
.file{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.wheels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
</style>
