<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from '../components/AuthCard.vue';
import { useAuth } from '../composables/useAuth.js';
import { claimDevice } from '../services/device.service.js';

// 二维码落地页（冗余路径）：扫码打开 /claim?code=XXXX-XXXX 自动绑定；
// 未登录会先被路由守卫送去登录/注册，成功后带着 redirect 回到本页继续绑定。
const auth = useAuth();
const route = useRoute();
const router = useRouter();

const state = ref('input'); // input | working | success | already | error
const message = ref('');
const manualCode = ref('');

onMounted(async () => {
  await auth.init();
  const code = String(route.query.code || '').trim();
  if (code) await claim(code);
});

async function claim(code) {
  state.value = 'working';
  message.value = '';
  try {
    const res = await claimDevice(code);
    state.value = res.already_mine ? 'already' : 'success';
  } catch (e) {
    state.value = 'error';
    message.value = e?.message?.includes('INVALID_BIND_CODE')
      ? '绑定码无效或已失效，请核对设备上的 8 位绑定码。'
      : e?.message || '绑定失败，请稍后重试。';
    manualCode.value = code;
  }
}

async function submitManual() {
  const code = manualCode.value.trim();
  if (!code) return;
  await claim(code);
}

function goHistory() {
  router.push('/history');
}
</script>

<template>
  <div class="auth-page">
    <AuthCard eyebrow="DEVICE BINDING" title="绑定设备" description="输入设备上的 8 位绑定码，即可把设备绑到你的账号。持有即拥有，设备数据不算敏感信息。">
      <div v-if="state === 'working'" class="claim-status">
        <p class="auth-description">正在绑定，请稍候…</p>
      </div>

      <div v-else-if="state === 'success'" class="claim-status">
        <p class="form-success">绑定成功，设备已加入你的列表。</p>
        <button class="diagnose-button" type="button" @click="goHistory">
          <span>前往数据看板</span>
          <b>HISTORY →</b>
        </button>
      </div>

      <div v-else-if="state === 'already'" class="claim-status">
        <p class="form-success">这台设备已经在你的列表中。</p>
        <button class="diagnose-button" type="button" @click="goHistory">
          <span>前往数据看板</span>
          <b>HISTORY →</b>
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
          <button class="diagnose-button" :disabled="!manualCode.trim()">
            <span>绑定设备</span>
            <b>BIND →</b>
          </button>
        </form>
        <p class="auth-switch">绑定码在设备标签或随附卡片上，也可以直接扫码自动填写。</p>
      </template>
    </AuthCard>
  </div>
</template>
