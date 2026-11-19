<script setup>
import { computed } from 'vue';
import { classicAssets } from '../constants/classicAssets.js';

// 英文主标志 logo-df-en.png；中文辅助标志 logo-df-cn.png。白字透明底。
// 托底由几团大小不同的暖色组成。每团从自己周期上的随机一点开始，所以每次打开形状都不一样。
// plain 去掉光团，把白字染成品牌橙，用在导航这种会反复出现的位置。
const props = defineProps({
  variant: { type: String, default: 'en' },
  plain: { type: Boolean, default: false }
});
const src = computed(() => (props.variant === 'cn' ? classicAssets.logoChinese : classicAssets.logoEnglish));
const plainStyle = computed(() => (props.plain ? { '--df-src': `url("${src.value}")` } : undefined));
const blobSeconds = [9, 11, 7, 13, 10];
const blobs = blobSeconds.map((seconds) => ({
  seconds,
  delay: `-${Math.random() * seconds}s`
}));
</script>

<template>
  <span class="df-mark" :class="{ 'is-plain': plain }" :style="plainStyle">
    <span v-if="!plain" class="df-mark-field" aria-hidden="true">
      <span v-for="blob in blobs" :key="blob.seconds" :style="{ animationDuration: `${blob.seconds}s`, animationDelay: blob.delay }"></span>
    </span>
    <img :src="src" alt="" />
  </span>
</template>

<style>
.df-mark {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  box-sizing: border-box;
  max-width: 100%;
  padding: 6px 10px;
  background: none;
  border: 0;
  box-shadow: none;
}
.df-mark-field {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 0;
  width: 360px;
  height: 220px;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.df-mark-field span {
  position: absolute;
  display: block;
  filter: blur(22px);
  will-change: transform, border-radius;
}
.df-mark-field span:nth-child(1) {
  width: 250px;
  height: 108px;
  left: 58px;
  top: 58px;
  background: linear-gradient(115deg, rgba(255, 214, 164, 0.95), rgba(255, 112, 28, 0.92) 58%, rgba(255, 168, 90, 0.35));
  animation: df-blob-a ease-in-out infinite;
}
.df-mark-field span:nth-child(2) {
  width: 170px;
  height: 150px;
  left: 168px;
  top: -8px;
  background: linear-gradient(160deg, rgba(255, 236, 210, 0.95), rgba(255, 140, 60, 0.55) 70%, transparent);
  animation: df-blob-b ease-in-out infinite;
}
.df-mark-field span:nth-child(3) {
  width: 156px;
  height: 140px;
  left: 8px;
  top: 72px;
  background: linear-gradient(200deg, rgba(196, 62, 8, 0.88), rgba(255, 150, 72, 0.4) 68%, transparent);
  animation: df-blob-c ease-in-out infinite;
}
.df-mark-field span:nth-child(4) {
  width: 140px;
  height: 96px;
  left: 36px;
  top: 4px;
  background: linear-gradient(40deg, rgba(255, 244, 226, 0.9), rgba(255, 176, 96, 0.25) 75%, transparent);
  animation: df-blob-d ease-in-out infinite;
}
.df-mark-field span:nth-child(5) {
  width: 190px;
  height: 88px;
  left: 120px;
  top: 124px;
  background: linear-gradient(20deg, rgba(255, 122, 36, 0.85), rgba(255, 210, 160, 0.35) 72%, transparent);
  animation: df-blob-e ease-in-out infinite;
}
.df-mark img {
  position: relative;
  z-index: 1;
  display: block;
  height: 36px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
.df-mark.is-plain {
  padding: 0;
  background: var(--brand-primary, #ff6b25);
  -webkit-mask: var(--df-src) center / contain no-repeat;
  mask: var(--df-src) center / contain no-repeat;
}
.df-mark.is-plain img {
  opacity: 0;
}
@keyframes df-blob-a {
  0% { border-radius: 62% 38% 46% 54% / 42% 66% 34% 58%; transform: translate(0, 0) rotate(-8deg); }
  50% { border-radius: 34% 66% 70% 30% / 68% 36% 64% 32%; transform: translate(18px, 12px) rotate(7deg); }
  100% { border-radius: 62% 38% 46% 54% / 42% 66% 34% 58%; transform: translate(0, 0) rotate(-8deg); }
}
@keyframes df-blob-b {
  0% { border-radius: 70% 30% 58% 42% / 36% 64% 40% 60%; transform: translate(0, 0) rotate(10deg); }
  50% { border-radius: 40% 60% 28% 72% / 62% 30% 70% 38%; transform: translate(-28px, 22px) rotate(-8deg); }
  100% { border-radius: 70% 30% 58% 42% / 36% 64% 40% 60%; transform: translate(0, 0) rotate(10deg); }
}
@keyframes df-blob-c {
  0% { border-radius: 48% 52% 72% 28% / 60% 40% 36% 64%; transform: translate(0, 0) rotate(6deg); }
  50% { border-radius: 66% 34% 40% 60% / 32% 70% 48% 52%; transform: translate(24px, -16px) rotate(-14deg); }
  100% { border-radius: 48% 52% 72% 28% / 60% 40% 36% 64%; transform: translate(0, 0) rotate(6deg); }
}
@keyframes df-blob-d {
  0% { border-radius: 36% 64% 44% 56% / 58% 42% 66% 34%; transform: translate(0, 0) rotate(-12deg); }
  50% { border-radius: 58% 42% 30% 70% / 40% 60% 34% 66%; transform: translate(20px, 18px) rotate(8deg); }
  100% { border-radius: 36% 64% 44% 56% / 58% 42% 66% 34%; transform: translate(0, 0) rotate(-12deg); }
}
@keyframes df-blob-e {
  0% { border-radius: 64% 36% 52% 48% / 34% 66% 42% 58%; transform: translate(0, 0) rotate(4deg); }
  50% { border-radius: 30% 70% 46% 54% / 62% 38% 70% 30%; transform: translate(-16px, -14px) rotate(-10deg); }
  100% { border-radius: 64% 36% 52% 48% / 34% 66% 42% 58%; transform: translate(0, 0) rotate(4deg); }
}
@media (prefers-reduced-motion: reduce) {
  .df-mark-field span { animation: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .df-mark-field span { filter: blur(18px); }
}
</style>
