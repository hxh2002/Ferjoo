<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService, mobileError } from '../../services/mobile-device.service.js';

const route = useRoute();
const auth = useAuth();
const device = ref(null);
const members = ref([]);
const error = ref('');
function formatTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '未提供';
}
onMounted(async () => {
  await auth.init();
  const userId = auth.user.value?.id;
  if (!userId) return;
  try {
    const service = await mobileDeviceService();
    device.value = await service.getDevice(route.params.deviceId, userId);
    if (!device.value) { error.value = '设备不存在或共享权限已变化。'; return; }
    if (device.value.my_role === 'owner' || auth.profile.value?.role === 'A') members.value = await service.members(route.params.deviceId) || [];
  } catch (cause) {
    error.value = mobileError(cause);
  }
});
</script>

<template>
  <main class="m-page">
    <h1>设备信息</h1>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <section v-else-if="device" class="m-card">
      <p><span>名称</span><strong>{{ device.name || '未设置' }}</strong></p>
      <p><span>编号</span><strong>{{ device.device_id }}</strong></p>
      <p><span>固件版本</span><strong>{{ device.firmware_version || '未提供' }}</strong></p>
      <p><span>绑定时间</span><strong>{{ formatTime(device.created_at) }}</strong></p>
      <h2>成员</h2>
      <p v-if="!members.length" class="m-muted">成员列表仅所有者可见。</p>
      <p v-for="member in members" :key="member.system_user_id">{{ member.system_user_id }} · {{ member.member_role === 'owner' ? '所有者' : '成员' }}</p>
    </section>
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
p{display:flex;justify-content:space-between;gap:12px;min-height:40px;align-items:center;margin:0;border-top:1px solid var(--border-warm);font-size:var(--text-sm)}
p:first-of-type{border-top:0}
span{color:var(--text-secondary)}
h2{margin:16px 0 8px;font-size:18px;line-height:26px;font-weight:500}
</style>
