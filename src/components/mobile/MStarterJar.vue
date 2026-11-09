<script>
export { JAR_MOODS, JAR_MOOD_LABELS, nextJarMood, starterJarGeometry } from './MStarterJar.js';
</script>

<script setup>
import { computed } from 'vue';
import { JAR_MOOD_NODES, jarFaceFloat, starterJarGeometry } from './MStarterJar.js';
import jarBody from '../../assets/device/jar-body.svg';
import jarPhoto from '../../assets/device/jar-face.png';
import jarHat from '../../assets/device/jar-hat.png';
import jarRiseIdle from '../../assets/device/jar-rise-idle.svg';
import jarRiseEating from '../../assets/device/jar-rise-eating.svg';
import jarRisePeak from '../../assets/device/jar-rise-peak.svg';
import jarRiseHungry from '../../assets/device/jar-rise-hungry.svg';
import jarFaceIdle from '../../assets/device/jar-face-idle.svg';
import jarFaceEating from '../../assets/device/jar-face-eating.svg';
import jarFacePeak from '../../assets/device/jar-face-peak.svg';
import jarFaceHungry from '../../assets/device/jar-face-hungry.svg';
import jarPeakTrace from '../../assets/device/jar-peak-trace.svg';

defineOptions({ name: 'MStarterJar' });
const props = defineProps({
  mood: { type: String, default: 'idle' },
  level: { type: Number, default: null },
  animate: { type: Boolean, default: true }
});
const mood = computed(() => JAR_MOOD_NODES[props.mood] ? props.mood : 'idle');
const assets = {
  idle: { rise: jarRiseIdle, face: jarFaceIdle },
  eating: { rise: jarRiseEating, face: jarFaceEating },
  peak: { rise: jarRisePeak, face: jarFacePeak },
  hungry: { rise: jarRiseHungry, face: jarFaceHungry }
};
const geometry = computed(() => starterJarGeometry(mood.value, props.level));
const designRiseHeight = computed(() => starterJarGeometry(mood.value).riseHeight);
const riseStyle = computed(() => ({ top: `${geometry.value.riseTop}px`, height: `${geometry.value.riseHeight}px` }));
const faceStyle = computed(() => ({ top: `${geometry.value.faceTop}px` }));
// 五官浮动量按各状态液面高度反推，保证五官始终贴在液面里，而不是固定 18px 冲出液面。
const faceMotionStyle = computed(() => {
  const float = jarFaceFloat(mood.value);
  return { '--jar-face-from': `${float.from}px`, '--jar-face-to': `${float.to}px` };
});
</script>

<template>
  <span class="starter-jar" :data-mood="mood" :data-measured="geometry.measured" :data-figma-node="JAR_MOOD_NODES[mood]">
    <span class="jar-photo-window">
      <img class="jar-photo" :src="jarPhoto" alt="" width="128" height="170" />
    </span>
    <img class="jar-ticks" :src="jarBody" alt="" width="180" height="180" />
    <span class="jar-window">
      <span class="jar-rise" :class="{ measured: geometry.measured, animated: animate }" :style="riseStyle" :data-figma-node="geometry.riseNode">
        <img :src="assets[mood].rise" alt="" :width="78" :height="designRiseHeight" />
      </span>
    </span>
    <img v-if="mood === 'hungry'" class="jar-peak-trace" :src="jarPeakTrace" alt="" width="78" height="6" data-figma-node="370:16242" />
    <span class="jar-face-viewport">
      <span class="jar-face" :style="faceStyle" :data-figma-node="geometry.faceNode">
        <span class="jar-face-motion" :class="{ animated: animate }" :style="faceMotionStyle">
        <Transition name="jar-mood" mode="out-in">
          <img :key="mood" :src="assets[mood].face" alt="" width="30" height="15" />
        </Transition>
        </span>
      </span>
    </span>
    <img class="jar-hat" :src="jarHat" alt="" width="147" height="98" />
  </span>
</template>

<style scoped>
.starter-jar{position:relative;display:block;width:180px;height:180px;margin:0 auto}
/* 照片在设计里位于「酵种表情」180×180 的裁切框内：128×170 从 (26,20) 起会越过罐底到 y=190，
   必须按画板裁到 y=180。单独包一层裁切框，避免把 .jar-photo 的静态坐标改掉。 */
.jar-photo-window{position:absolute;left:0;top:0;width:180px;height:180px;overflow:hidden;pointer-events:none}
.jar-photo{position:absolute;left:26px;top:20px;width:128px;height:170px;object-fit:cover;pointer-events:none}
.jar-ticks{position:absolute;inset:0;width:180px;height:180px;pointer-events:none}
/* 液面窗口负责横向 78 宽，以及底部 y=170（罐体开口）的硬裁切。
   Figma 动效元数据是 origin 50% 50% + translateY(9.1px)/scaleY(.65)，
   这一帧的液面底边会算到 y≈173；罐口以上不能有液体，必须靠这层裁切兜住。
   顶部保持 0：scaleY(1.25) 时 peak 的液面会升到 y≈90，窗口不能裁掉液面本身。 */
.jar-window{position:absolute;left:51px;top:0;width:78px;height:170px;overflow:hidden;pointer-events:none}
.jar-rise{position:absolute;left:0;width:78px;transform-origin:50% 50%;transition:top var(--motion-base) var(--ease-standard),height var(--motion-base) var(--ease-standard)}
.jar-rise.animated:not(.measured){animation:jar-rise 2s ease-in-out infinite alternate}
.jar-rise.measured{animation:none}
/* height:100% 让测量态的低液面（8px）跟着容器收缩；否则图片保持设计高度 34/51/74，
   会从 162 一路画到 196，越过 y=170 渗进罐底。 */
.jar-rise img{display:block;width:100%;height:100%;object-fit:fill}
.jar-face-viewport{position:absolute;left:51px;top:0;width:78px;height:180px;overflow:hidden;pointer-events:none}
.jar-face{position:absolute;left:24px;width:30px;height:15px;transition:top var(--motion-base) var(--ease-standard)}
.jar-face-motion{display:block;width:30px;height:15px}
.jar-face-motion.animated{animation:jar-face 2s ease-in-out infinite alternate}
.jar-face img{display:block;width:30px;height:15px}
.jar-peak-trace{position:absolute;left:51px;top:94px;width:78px;height:6px;pointer-events:none}
.jar-hat{position:absolute;left:18px;top:-9px;width:147px;height:98px;object-fit:contain;pointer-events:none}
.jar-mood-enter-active,.jar-mood-leave-active{transition:opacity var(--motion-fast) var(--ease-standard),scale var(--motion-fast) var(--ease-standard)}
.jar-mood-enter-from,.jar-mood-leave-to{opacity:0;scale:.9}
@keyframes jar-rise{from{transform:translateY(9.1px) scaleY(.65)}to{transform:translateY(-6.5px) scaleY(1.25)}}
/* 端点由 jarFaceFloat() 按各状态液面高度算出后以 CSS 变量注入（见 .jar-face-motion 的 style）。
   写死 -18px 只在 eating（51 高）刚好贴合液面顶部，待机/Peak/饿了 都会让五官冲出液面。 */
@keyframes jar-face{from{transform:translateY(var(--jar-face-from,0px))}to{transform:translateY(var(--jar-face-to,-18px))}}
@media (prefers-reduced-motion:reduce){.jar-rise,.jar-face,.jar-mood-enter-active,.jar-mood-leave-active{transition:none}.jar-rise.animated,.jar-face-motion.animated{animation:none}}
</style>
