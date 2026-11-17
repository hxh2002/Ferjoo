<script setup>
import { classicAssets } from '../constants/classicAssets.js';

// 这两张是仓库里的 Dr. Ferjoo 专用字标（白字、透明底），不是 Ferjoo 通用标志配文字。
// 底色沿用经典界面的橙色，字标本身不重新上色、不另加可见文字。
</script>

<template>
  <span class="df-mark">
    <img :src="classicAssets.logoChinese" alt="" />
    <img :src="classicAssets.logoEnglish" alt="" />
  </span>
</template>

<style>
.df-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 100%;
  padding: 6px 8px;
  border-radius: 12px;
  background: #ff913f;
}
.df-mark img {
  display: block;
  height: 28px;
  width: auto;
  object-fit: contain;
}
</style>
