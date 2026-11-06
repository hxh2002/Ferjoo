<script setup>
import { ref } from 'vue';

const open = ref([]);
const items = [
  { id: 'invite', title: '邀请名额', body: '每份账号有固定邀请名额。好友注册时填写邀请码，不会因此看到你的喂养、观察或设备数据。名额用完后需要等产品调整，页面上的已邀请人数以个人资料为准。' },
  { id: 'notify', title: '通知排查', body: '收不到提醒时，先确认本机推送已开启、系统通知没有静音、酵种已关联正在上传的设备，且所选高度阈值本轮还没有提醒过。iPhone 需要从主屏幕图标打开后再授权。' },
  { id: 'device', title: '设备与趋势', body: '绑定设备后为酵种关联设备。日记里的趋势只展示关联时间段；设备设置中的趋势展示这台设备的采样。' },
  { id: 'safety', title: '食品安全', body: '异常颜色、绒毛或腐败异味应优先处理。不要品尝可疑酵种或生面粉。建议不能代替食品安全判断。' }
];
function toggle(id) {
  open.value = open.value.includes(id) ? open.value.filter((item) => item !== id) : [...open.value, id];
}
</script>

<template>
  <main class="m-page">
    <h1>常见问题</h1>
    <section class="m-card">
      <div v-for="item in items" :key="item.id" class="item">
        <button type="button" :aria-expanded="open.includes(item.id)" @click="toggle(item.id)">{{ item.title }}</button>
        <p v-if="open.includes(item.id)">{{ item.body }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
.item{border-top:1px solid var(--border-warm)}
.item:first-child{border-top:0}
button{display:flex;align-items:center;width:100%;min-height:56px;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-size:var(--text-md);font-weight:500;text-align:left}
p{margin:0 0 12px;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
</style>
