<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import wordmark from '../assets/welcome/wordmark.png';
import blobs from '../assets/welcome/blobs.png';
import chatIcon from '../assets/welcome/chat.png';
import navJar from '../assets/welcome/nav-jar.png';
import jarDevice from '../assets/welcome/jar-device.png';
import jarData from '../assets/welcome/jar-data.png';
import chartRise from '../assets/welcome/chart-rise.png';
import chartTemp from '../assets/welcome/chart-temp.png';
import journalShot from '../assets/welcome/journal.png';
import jarDoctor from '../assets/welcome/jar-doctor.png';
import doctorCard from '../assets/welcome/doctor-card.png';
import timingDial from '../assets/welcome/timing-dial.png';
import jarTiming from '../assets/welcome/jar-timing.png';

const slides = [
  { id: 'device', label: 'Device', caption: '' },
  { id: 'data', label: 'Data', caption: 'Know when your starter is rising, peaking and ready.' },
  { id: 'journal', label: 'Journal', caption: 'Look back on every day of your starter’s journey.' },
  { id: 'doctor', label: 'Doctor', caption: 'Your sourdough starter’s personal doctor.' },
  { id: 'timing', label: 'Timing', caption: 'See when your starter is expected to peak.' }
];

const route = useRoute();
const router = useRouter();
const index = ref(0);
const slide = computed(() => slides[index.value]);
const panel = computed(() => (route.hash === '#stay' ? 'stay' : route.hash === '#contact' ? 'contact' : 'home'));

const stayEmail = ref('');
const stayError = ref('');
const stayDone = ref(false);
const contactEmail = ref('');
const contactName = ref('');
const contactMessage = ref('');
const contactError = ref('');
const contactDone = ref(false);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function show(id) {
  const next = slides.findIndex((item) => item.id === id);
  if (next >= 0) index.value = next;
}
function step(delta) {
  index.value = (index.value + delta + slides.length) % slides.length;
}
function openStay() {
  router.push({ path: '/', hash: '#stay' });
}
function openContact() {
  router.push({ path: '/', hash: '#contact' });
}
function backHome() {
  router.push({ path: '/' });
}

function submitStay() {
  stayError.value = '';
  const email = stayEmail.value.trim();
  if (!email) {
    stayError.value = 'Enter your email address.';
    return;
  }
  if (!emailPattern.test(email)) {
    stayError.value = 'Enter a valid email address.';
    return;
  }
  stayDone.value = true;
}
function submitContact() {
  contactError.value = '';
  if (!contactEmail.value.trim()) {
    contactError.value = 'Enter your email address.';
    return;
  }
  if (!emailPattern.test(contactEmail.value.trim())) {
    contactError.value = 'Enter a valid email address.';
    return;
  }
  if (!contactName.value.trim()) {
    contactError.value = 'Enter your name.';
    return;
  }
  if (!contactMessage.value.trim()) {
    contactError.value = 'Enter a message.';
    return;
  }
  contactDone.value = true;
}

let touchX = 0;
let touchY = 0;
function onTouchStart(event) {
  const point = event.changedTouches[0];
  touchX = point.clientX;
  touchY = point.clientY;
}
function onTouchEnd(event) {
  const point = event.changedTouches[0];
  const dx = point.clientX - touchX;
  const dy = point.clientY - touchY;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
  step(dx < 0 ? 1 : -1);
}
function onKeydown(event) {
  if (panel.value !== 'home') return;
  if (event.key === 'ArrowRight') step(1);
  if (event.key === 'ArrowLeft') step(-1);
}

const previousTitle = document.title;
const titles = { home: 'Ferjoo', stay: 'Stay updated', contact: 'Contact' };
watch(panel, (name) => {
  document.title = titles[name];
  if (name !== 'stay') stayDone.value = false;
  if (name !== 'contact') contactDone.value = false;
}, { immediate: true });
onMounted(() => { document.title = titles[panel.value]; });
onBeforeUnmount(() => { document.title = previousTitle; });
</script>

<template>
  <div class="start" :class="panel" lang="en" @keydown="onKeydown">
    <img v-if="panel !== 'contact'" class="blobs" :src="blobs" alt="" />

    <header class="bar">
      <RouterLink class="logo" to="/" aria-label="Ferjoo">
        <img :src="wordmark" alt="" width="94" height="36" />
      </RouterLink>
      <button v-if="panel === 'home'" class="chat" type="button" aria-label="Contact" @click="openContact">
        <img :src="chatIcon" alt="" width="32" height="32" />
      </button>
    </header>

    <main v-if="panel === 'home'" class="canvas">
      <div class="copy">
        <p class="name">SourMate</p>
        <h1>Understand your starter.</h1>
        <button class="pill" type="button" @click="openStay">
          Stay updated
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>

      <section class="stage" :aria-label="slide.label" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
        <div class="visual" :class="slide.id">
          <img v-if="slide.id === 'device'" class="hero-jar" :src="jarDevice" alt="Ferjoo jar of starter dough" />
          <template v-else-if="slide.id === 'data'">
            <img class="rise" :src="chartRise" alt="Starter rise chart" />
            <img class="temp" :src="chartTemp" alt="Temperature chart" />
            <img class="side-jar" :src="jarData" alt="" />
          </template>
          <img v-else-if="slide.id === 'journal'" class="phone" :src="journalShot" alt="Journal on a phone" />
          <template v-else-if="slide.id === 'doctor'">
            <img class="doctor-jar" :src="jarDoctor" alt="Ferjoo jar" />
            <img class="doctor-card" :src="doctorCard" alt="Recommendations for the starter" />
          </template>
          <template v-else>
            <img class="dial" :src="timingDial" alt="Time to peak, 02:35:00, estimated peak at 18:40" />
            <img class="timing-jar" :src="jarTiming" alt="" />
          </template>
        </div>
        <p v-if="slide.caption" class="caption">
          <span class="feature-title">{{ slide.label }}</span>
          <span>{{ slide.caption }}</span>
        </p>
      </section>

      <div class="switcher" role="tablist" aria-label="SourMate features">
        <button
          v-for="(item, itemIndex) in slides"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="itemIndex === index"
          :aria-label="item.label"
          :class="{ 'is-active': itemIndex === index }"
          @click="show(item.id)"
        >
          <img v-if="item.id === 'device'" class="nav-jar" :src="navJar" alt="" />
          <span v-else>{{ item.label }}</span>
          <i :class="itemIndex === index ? 'dash' : 'dot'" aria-hidden="true"></i>
        </button>
      </div>

      <div class="dots" role="tablist" aria-label="SourMate features">
        <button
          v-for="(item, itemIndex) in slides"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="itemIndex === index"
          :aria-label="item.label"
          :class="{ 'is-active': itemIndex === index, 'is-device': item.id === 'device' }"
          @click="show(item.id)"
        >
          <img v-if="item.id === 'device'" :src="navJar" alt="" />
        </button>
      </div>
    </main>

    <main v-else-if="panel === 'stay'" class="sheet">
      <button class="back" type="button" @click="backHome">‹ Back to home</button>
      <div class="stay-layout">
        <form class="card" @submit.prevent="submitStay">
          <p v-if="stayDone" class="done" role="status">We’ll keep you posted.</p>
          <template v-else>
            <label>
              Email address
              <input v-model="stayEmail" type="email" name="email" autocomplete="email" placeholder="name@example.com" :aria-invalid="Boolean(stayError)" />
            </label>
            <p v-if="stayError" class="error" role="alert">{{ stayError }}</p>
            <button class="send stay-send" type="submit">Keep me posted</button>
          </template>
          <p class="note">Only Ferjoo product updates and beta invitations. No spam.</p>
        </form>
        <div class="stay-copy">
          <h1>Stay updated with Ferjoo</h1>
          <p>Product news and beta invitations, delivered straight to your inbox.</p>
        </div>
      </div>
    </main>

    <main v-else class="sheet contact-sheet">
      <button class="back" type="button" @click="backHome">‹ Back to home</button>
      <form class="card contact-card" @submit.prevent="submitContact">
        <p v-if="contactDone" class="done" role="status">Thanks. We’ll reply to your email.</p>
        <template v-else>
          <label>
            Email address
            <input v-model="contactEmail" type="email" name="email" autocomplete="email" placeholder="name@example.com" :aria-invalid="contactError.startsWith('Enter your email') || contactError.startsWith('Enter a valid')" />
          </label>
          <label>
            Name
            <input v-model="contactName" type="text" name="name" autocomplete="name" placeholder="Your name" :aria-invalid="contactError === 'Enter your name.'" />
          </label>
          <label>
            Message
            <textarea v-model="contactMessage" name="message" rows="4" placeholder="Tell us about your question or idea…" :aria-invalid="contactError === 'Enter a message.'"></textarea>
          </label>
          <p v-if="contactError" class="error" role="alert">{{ contactError }}</p>
          <button class="send contact-send" type="submit">Send message</button>
        </template>
        <p class="note">The Ferjoo team will reply to your email.</p>
      </form>
    </main>
  </div>
</template>

<style>
body { margin: 0; background: #fffaf5; }
</style>

<style scoped>
.start {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: clip;
  color: #30251f;
  background: #fffaf5;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
.start.stay { background: #fff9f3; }
.start :focus-visible { outline: 2px solid #ff6b25; outline-offset: 3px; }
.blobs {
  position: absolute;
  z-index: 0;
  left: 50%;
  top: 48%;
  width: min(1280px, 130vw);
  height: auto;
  transform: translate(-50%, -46%) scaleX(-1);
  opacity: .42;
  pointer-events: none;
  user-select: none;
}
.bar, .canvas, .sheet { position: relative; z-index: 1; }
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30px 35px 0 30px;
}
/* 首屏是一整张画布：顶栏浮在上面，下面只放文案、画面和切换。
   宽屏三栏，窄屏自上而下。Stay / Contact 仍是普通文档流。 */
.start.home { height: 100dvh; overflow: hidden; }
.start.home .bar { position: absolute; inset: 0 0 auto; }
.logo img { display: block; width: 80px; height: 30px; object-fit: contain; object-position: left center; }
.chat {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.chat img { width: 19px; height: 19px; object-fit: contain; }

.canvas {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding: 136px 33px 36px;
}
.copy { max-width: 20rem; flex: none; }
.name, .canvas h1, .stay-copy h1, .caption .feature-title, .pill {
  color: #ff6f28;
  font-weight: 500;
}
.name { margin: 0; font-size: 19px; line-height: 24px; letter-spacing: -.02em; }
.canvas h1 { margin: 13px 0 0; font-size: 24px; line-height: 28px; letter-spacing: -.03em; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  margin-top: 16px;
  padding: 0 16px 0 21px;
  border: 0;
  border-radius: 21px;
  background: rgba(255, 191, 159, .3);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.pill svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.stage { display: flex; flex: 1; flex-direction: column; justify-content: flex-end; min-height: 0; margin-top: 8px; }
.visual { position: relative; flex: 1; min-height: 0; }
.visual img { position: absolute; object-fit: contain; }
.hero-jar { left: 8%; top: 0; width: 86%; height: 100%; }
.data .rise { right: 0; top: 6%; width: 68%; height: 42%; }
.data .temp { right: 0; bottom: 8%; width: 68%; height: 34%; }
.data .side-jar { left: -4%; top: 16%; width: 52%; height: 68%; }
.phone { left: 50%; top: 0; width: auto; height: 100%; max-width: 78%; transform: translateX(-50%); }
.doctor-jar { left: 0; top: 4%; width: 52%; height: 88%; }
.doctor-card { right: 0; top: 28%; width: 58%; height: auto; }
.dial { left: 0; top: 12%; width: 68%; height: 76%; }
.timing-jar { right: -2%; top: 8%; width: 46%; height: 78%; }
.caption {
  display: grid;
  justify-items: center;
  gap: 4px;
  margin: 12px 0 8px;
  color: #30251f;
  font-size: 15px;
  line-height: 20px;
  text-align: center;
}
.feature-title { font-size: 22px; line-height: 28px; }
.switcher { display: none; }
.dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin: 8px 0 4px;
}
.dots button {
  display: grid;
  place-items: center;
  width: 8px;
  height: 8px;
  padding: 10px;
  border: 0;
  border-radius: 99px;
  background: transparent;
  cursor: pointer;
}
.dots button::after {
  content: "";
  width: 5px;
  height: 5px;
  border-radius: 99px;
  background: #ff6b25;
  opacity: .45;
}
.dots button.is-active::after { opacity: 1; transform: scale(1.35); }
.dots button.is-device { width: 18px; }
.dots button.is-device::after { display: none; }
.dots img { width: 14px; height: 18px; object-fit: contain; opacity: .45; }
.dots .is-active img { opacity: 1; }

.sheet { padding: 18px 20px 40px; }
.back {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin: 12px 4px 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #ff6b25;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
}
.stay-layout, .contact-card { margin-top: 8px; }
.stay-copy { margin-bottom: 22px; }
.stay-copy h1 { margin: 0; font-size: 28px; line-height: 34px; letter-spacing: -.03em; }
.stay-copy p { margin: 10px 0 0; max-width: 26rem; color: #ff6f28; font-size: 16px; line-height: 24px; }
.card {
  display: grid;
  gap: 14px;
  padding: 22px 20px 18px;
  border: 1px solid #eaddd2;
  border-radius: 24px;
  background: #fff;
}
.card label { display: grid; gap: 8px; color: #30251f; font-size: 15px; }
.card input, .card textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #eaddd2;
  border-radius: 18px;
  background: #fff1e7;
  color: #30251f;
  font: inherit;
  font-size: 16px;
}
.card input { height: 50px; padding: 0 16px; }
.card textarea { min-height: 112px; padding: 14px 16px; resize: vertical; }
.card input::placeholder, .card textarea::placeholder { color: #75665b; }
.send {
  height: 52px;
  border: 0;
  border-radius: 26px;
  color: #30251f;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
}
.stay-send { background: #ffb05a; }
.contact-send { background: #ffa24f; }
.note, .done { margin: 0; color: #75665b; font-size: 13px; line-height: 18px; text-align: center; }
.done { color: #30251f; font-size: 18px; line-height: 26px; }
.error { margin: -4px 0 0; color: #9a352a; font-size: 14px; }

@media (min-width: 900px) {
  .bar { padding: 41px 95px 0 85px; }
  .logo img { width: 94px; height: 36px; }
  .chat img { width: 25px; height: 25px; }
  .canvas {
    display: grid;
    grid-template-columns: minmax(280px, 390px) minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr);
    align-items: center;
    height: 100%;
    padding: 0 89px 0 85px;
  }
  .copy { align-self: center; max-width: none; }
  .name { font-size: 25px; line-height: 30px; }
  .canvas h1 { margin-top: 26px; font-size: 32px; line-height: 38px; }
  .pill { height: 56px; margin-top: 20px; padding: 0 24px 0 31px; border-radius: 28px; font-size: 20px; }
  .stage { align-self: stretch; justify-content: center; height: 100%; margin: 0; }
  .visual { flex: none; height: min(640px, 70vh); }
  .caption { margin-top: 18px; font-size: 16px; line-height: 22px; }
  .feature-title { display: none; }
  .dots { display: none; }
  .switcher {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 17px;
    justify-self: end;
    align-self: center;
  }
  .switcher button {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #ff6b25;
    font: inherit;
    font-size: 16px;
    line-height: 22px;
    opacity: .5;
    cursor: pointer;
  }
  .switcher button.is-active { opacity: 1; }
  .nav-jar { width: 16px; height: 20px; object-fit: contain; }
  .dash, .dot { display: block; background: #ff6b25; }
  .dash { width: 11px; height: 4px; border-radius: 2px; }
  .dot { width: 5px; height: 5px; border-radius: 99px; }
  .sheet { max-width: 1180px; margin: 0 auto; padding: 8px 72px 64px 85px; }
  .back { margin-top: 28px; font-size: 18px; }
  .stay-layout {
    display: grid;
    grid-template-columns: minmax(320px, 520px) minmax(280px, 520px);
    gap: 64px;
    align-items: center;
    margin-top: 36px;
  }
  .stay-copy { order: 2; margin: 0; }
  .stay-copy h1 { font-size: 40px; line-height: 48px; }
  .stay-copy p { font-size: 18px; line-height: 28px; }
  .card { gap: 16px; padding: 32px 40px 24px; }
  .contact-card { max-width: 768px; margin: 28px auto 0; }
  .card input { height: 58px; }
  .card textarea { min-height: 154px; }
  .send { height: 58px; border-radius: 29px; }
}
@media (prefers-reduced-motion: reduce) {
  .visual img { transition: none; }
}
</style>
