<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from '../components/AuthCard.vue';
import { useAuth } from '../composables/useAuth.js';
import { claimDevice } from '../services/device.service.js';
import { usesMobileAccountLayout } from '../lib/accountNavigation.js';

// 二维码落地页（冗余路径）：扫码打开 /claim?code=XXXX-XXXX 自动绑定；
// 未登录会先被路由守卫送去登录/注册，成功后带着 redirect 回到本页继续绑定。
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const mobile = computed(() => usesMobileAccountLayout(route, router));
const deviceId = ref('');
const destination = computed(() => !mobile.value ? '/history' : deviceId.value
  ? `/me/devices/${encodeURIComponent(deviceId.value)}`
  : '/me/devices');

const state = ref('input'); // input | working | success | already | error
const message = ref('');
const manualCode = ref('');
const confirmed = ref(false);
const normalizedCode = computed(() => manualCode.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));

onMounted(async () => {
  await auth.init();
  const code = typeof route.query.code === 'string' ? route.query.code.trim() : '';
  if (code) manualCode.value = code;
});

async function claim(code) {
  state.value = 'working';
  message.value = '';
  deviceId.value = '';
  try {
    const res = await claimDevice(code);
    deviceId.value = res.device_id || '';
    state.value = res.already_mine ? 'already' : 'success';
    if (mobile.value && deviceId.value) await router.replace(destination.value);
  } catch (e) {
    state.value = 'error';
    message.value = e?.message?.includes('INVALID_BIND_CODE')
      ? '绑定码无效或已失效，请核对设备上的 8 位绑定码。'
      : e?.message || '绑定失败，请稍后重试。';
    manualCode.value = code;
  }
}

async function submitManual() {
  const code = normalizedCode.value;
  if (!confirmed.value || !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) { message.value = '请输入有效的八位绑定码，并确认历史访问范围。'; state.value = 'error'; return; }
  await claim(code);
}

function goDevice() {
  router.push(destination.value);
}
</script>

<template>
  <main v-if="mobile" class="m-page claim-page">
    <section class="m-card">
      <h2>绑定设备</h2>
      <p class="m-muted">绑定后可查看设备全部历史采样。</p>

      <div v-if="state === 'working'" class="claim-status">
        <p class="m-muted">正在绑定，请稍候…</p>
      </div>

      <div v-else-if="state === 'success' || state === 'already'" class="claim-status">
        <p class="form-success" role="status">{{ state === 'already' ? '这台设备已经在你的列表中。' : '绑定成功，设备已加入你的列表。' }}</p>
        <button class="m-primary claim-action" type="button" @click="goDevice">
          {{ deviceId ? '查看设备详情' : '前往我的设备' }}
        </button>
      </div>

      <template v-else>
        <p v-if="state === 'error'" class="m-error" role="alert">{{ message }}</p>
        <form class="claim-form" @submit.prevent="submitManual">
          <label class="m-field">
            绑定码
            <input
              v-model.trim="manualCode"
              type="text"
              maxlength="12"
              placeholder="例如 ABCD-EFGH"
              autocomplete="off"
              required
            />
          </label>
          <label class="claim-confirm"><input v-model="confirmed" type="checkbox">我已了解：绑定后可查看设备全部历史采样。</label>
          <button class="m-primary claim-action" :disabled="!manualCode.trim() || !confirmed">绑定设备</button>
        </form>
        <p class="m-muted claim-hint">绑定码在设备标签或随附卡片上，也可扫码自动填写。</p>
      </template>
    </section>
  </main>

  <div v-else class="auth-page">
    <AuthCard eyebrow="DEVICE BINDING" title="绑定设备" description="绑定后可查看设备全部历史采样。">
      <div v-if="state === 'working'" class="claim-status">
        <p class="auth-description">正在绑定，请稍候…</p>
      </div>

      <div v-else-if="state === 'success' || state === 'already'" class="claim-status">
        <p class="form-success">{{ state === 'already' ? '这台设备已经在你的列表中。' : '绑定成功，设备已加入你的列表。' }}</p>
        <button class="diagnose-button" type="button" @click="goDevice">
          <span>{{ mobile ? (deviceId ? '查看设备详情' : '前往我的设备') : '前往数据看板' }}</span>
          <b>{{ mobile ? 'DEVICE →' : 'HISTORY →' }}</b>
        </button>
      </div>

      <template v-else>
        <p v-if="state === 'error'" class="form-error">{{ message }}</p>
        <form class="auth-form" @submit.prevent="submitManual">
          <label>
            <span>绑定码</span>
            <input
              v-model.trim="manualCode"
              type="text"
              maxlength="12"
              placeholder="例如 ABCD-EFGH"
              autocomplete="off"
              required
            />
          </label>
          <label><input v-model="confirmed" type="checkbox">我已了解：绑定后可查看设备全部历史采样。</label>
          <button class="diagnose-button" :disabled="!manualCode.trim() || !confirmed">
            <span>绑定设备</span>
            <b>BIND →</b>
          </button>
        </form>
        <p class="auth-switch">绑定码在设备标签或随附卡片上，也可扫码自动填写。</p>
      </template>
    </AuthCard>
  </div>
</template>
<style scoped>
.claim-page .m-card{display:grid;gap:var(--m-module-gap)}
.claim-page .m-card > h2{margin:0}
.claim-status{display:grid;gap:var(--m-module-gap)}
.claim-form{display:grid;gap:var(--m-module-gap)}
.claim-form .m-field{margin:0}
.claim-confirm{display:flex;align-items:flex-start;font-size:14px;line-height:1.6;color:var(--text-secondary)}
.claim-page .claim-action{width:100%}
.claim-hint{margin:0;font-size:13px;line-height:1.7}
</style>
