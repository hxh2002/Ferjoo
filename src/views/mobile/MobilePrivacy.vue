<script setup>
const sections = [
  { title: '数据可见性', body: '个人观察、备注和报告只属于当前账号，不会因为邀请或设备共享自动公开。' },
  { title: '设备共享', body: '设备成员可以查看该设备的全部历史采样。绑定前请确认这个范围。' },
  { title: '草稿存储', body: '喂养和观察草稿保存在当前浏览器。退出登录不会自动上传尚未确认的草稿。' },
  { title: '权限用途', body: '通知权限只用于高度提醒。相机和相册只在你主动更换头像时使用，不会在后台读取。' }
];
</script>

<template>
  <main class="m-page">
    <h1>隐私与权限</h1>
    <section v-for="section in sections" :key="section.title" class="m-card">
      <h2>{{ section.title }}</h2>
      <p>{{ section.body }}</p>
    </section>
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
h2{margin:0 0 8px;font-size:18px;line-height:26px;font-weight:500}
p{margin:0;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
</style>
