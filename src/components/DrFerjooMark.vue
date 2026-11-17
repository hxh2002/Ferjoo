<script setup>
import { computed } from 'vue';
import { classicAssets } from '../constants/classicAssets.js';

// 英文主标志 logo-df-en.png；中文辅助标志 logo-df-cn.png。白字透明底，底色沿用经典橙色以便在浅色界面上看见。
const props = defineProps({
  variant: { type: String, default: 'en' }
});
const src = computed(() => (props.variant === 'cn' ? classicAssets.logoChinese : classicAssets.logoEnglish));
</script>

<template>
  <span class="df-mark">
    <img :src="src" alt="" />
  </span>
</template>

<style>
.df-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 12px;
  background: #ff913f;
}
.df-mark img {
  display: block;
  height: 28px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
</style>
