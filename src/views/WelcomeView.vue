<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import logo from '../assets/welcome/logo-ferjoo.png';
import blobs from '../assets/welcome/blobs.jpg';
import jarDevice from '../assets/welcome/jar-device.webp';
import jarData from '../assets/welcome/jar-data.webp';
import jarDoctor from '../assets/welcome/jar-doctor.webp';
import jarTiming from '../assets/welcome/jar-timing.webp';
import chartRise from '../assets/welcome/chart-starter-rise.webp';
import chartTemp from '../assets/welcome/chart-temperature.webp';
import journalPhone from '../assets/welcome/journal-phone.webp';
import doctorCard from '../assets/welcome/doctor-card.webp';
import timingDial from '../assets/welcome/timing-dial.jpg';
import { submitWelcomeInquiry, welcomeInquiryPayload } from '../services/welcome-inquiry.service.js';

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
const stayEmail = ref('');
const contactEmail = ref('');
const contactName = ref('');
const contactMessage = ref('');
const stayError = ref('');
const contactError = ref('');
const stayBusy = ref(false);
const contactBusy = ref(false);
const stayDone = ref(false);
const contactDone = ref(false);
const current = computed(() => slides[index.value]);
const panel = computed(() => (route.hash === '#stay' ? 'stay' : route.hash === '#contact' ? 'contact' : 'home'));

const previousTitle = document.title;
watch(panel, (value) => {
  document.title = value === 'stay' ? 'Stay updated' : value === 'contact' ? 'Contact' : 'Ferjoo';
  if (value !== 'stay') stayDone.value = false;
  if (value !== 'contact') contactDone.value = false;
}, { immediate: true });
onBeforeUnmount(() => { document.title = previousTitle; });

function select(next) { index.value = next; }
function step(delta) {
  const next = index.value + delta;
  if (next >= 0 && next < slides.length) index.value = next;
}
function openStay() {
  stayError.value = '';
  router.push({ path: '/', hash: '#stay' });
}
function openContact() {
  contactError.value = '';
  router.push({ path: '/', hash: '#contact' });
}
function goHome() {
  router.push({ path: '/', hash: '' });
}
async function submitStay() {
  stayError.value = '';
  if (stayBusy.value) return;
  let row;
  try {
    row = welcomeInquiryPayload({ kind: 'stay', email: stayEmail.value });
  } catch (cause) {
    stayError.value = cause.message;
    return;
  }
  stayBusy.value = true;
  try {
    const saved = await submitWelcomeInquiry(row);
    if (!saved?.id) {
      stayError.value = 'This page could not save that email.';
      return;
    }
    stayDone.value = true;
  } catch (cause) {
    stayError.value = cause?.message || 'This page could not save that email.';
  } finally {
    stayBusy.value = false;
  }
}
async function submitContact() {
  contactError.value = '';
  if (contactBusy.value) return;
  let row;
  try {
    row = welcomeInquiryPayload({
      kind: 'contact',
      email: contactEmail.value,
      name: contactName.value,
      message: contactMessage.value
    });
  } catch (cause) {
    contactError.value = cause.message;
    return;
  }
  contactBusy.value = true;
  try {
    const saved = await submitWelcomeInquiry(row);
    if (!saved?.id) {
      contactError.value = 'This page could not save that message.';
      return;
    }
    contactDone.value = true;
  } catch (cause) {
    contactError.value = cause?.message || 'This page could not save that message.';
  } finally {
    contactBusy.value = false;
  }
}

let touchX = 0;
let touchY = 0;
function onTouchStart(event) {
  const touch = event.changedTouches[0];
  touchX = touch.clientX;
  touchY = touch.clientY;
}
function onTouchEnd(event) {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchX;
  const dy = touch.clientY - touchY;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
  step(dx < 0 ? 1 : -1);
}
function onSwitcherKeydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
}
</script>

<template>
  <div class="start" :class="`panel-${panel}`" lang="en">
    <img v-if="panel === 'home'" class="blob blob-wide" :src="blobs" alt="" />
    <div v-if="panel === 'home'" class="blob-narrow" aria-hidden="true"><img :src="blobs" alt="" /></div>
    <img v-if="panel === 'stay'" class="blob blob-stay" :src="blobs" alt="" />

    <header class="bar">
      <button type="button" class="logo" aria-label="Ferjoo" @click="goHome">
        <img :src="logo" alt="" />
      </button>
      <button v-if="panel === 'home'" type="button" class="chat" aria-label="Contact" @click="openContact">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16.2 5.5c-6.4 0-11.2 4.2-11.2 9.3 0 3 1.8 5.6 4.6 7.2l-.7 4.2 4.4-2.4c.9.2 1.9.3 2.9.3 6.4 0 11.2-4.2 11.2-9.3S22.6 5.5 16.2 5.5z" />
          <circle cx="11.2" cy="14.8" r="1.15" />
          <circle cx="16.2" cy="14.8" r="1.15" />
          <circle cx="21.2" cy="14.8" r="1.15" />
        </svg>
      </button>
    </header>

    <button v-if="panel !== 'home'" type="button" class="back" @click="goHome">
      <svg viewBox="0 0 8 14" aria-hidden="true"><path d="M7 1 1 7l6 6" /></svg>
      Back to home
    </button>

    <main v-if="panel === 'home'" class="home">
      <div class="copy">
        <p class="name">SourMate</p>
        <h1>Understand your starter.</h1>
        <button type="button" class="pill" @click="openStay">
          Stay updated
          <svg viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" /></svg>
        </button>
      </div>

      <div class="stage" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
        <div class="visual" :class="current.id">
          <img v-show="current.id === 'device'" class="shot jar-device" :src="jarDevice" alt="SourMate jar with starter" />
          <template v-if="current.id === 'data'">
            <img class="shot chart-rise" :src="chartRise" alt="Starter rise chart, peak 2.63×" />
            <img class="shot chart-temp" :src="chartTemp" alt="Temperature chart, average 27.2°C" />
            <img class="shot jar-data" :src="jarData" alt="" />
          </template>
          <img v-show="current.id === 'journal'" class="shot journal" :src="journalPhone" alt="Journal on a phone" />
          <template v-if="current.id === 'doctor'">
            <img class="shot jar-doctor" :src="jarDoctor" alt="" />
            <img class="shot doctor-card" :src="doctorCard" alt="Recommendations for the starter" />
          </template>
          <template v-if="current.id === 'timing'">
            <img class="shot dial" :src="timingDial" alt="Time to peak, 02:35:00" />
            <img class="shot jar-timing" :src="jarTiming" alt="" />
          </template>
        </div>
        <div v-if="current.caption" class="feature-copy">
          <p class="feature-title">{{ current.label }}</p>
          <p class="caption">{{ current.caption }}</p>
        </div>
      </div>

      <div class="switcher" role="tablist" aria-label="SourMate features" @keydown="onSwitcherKeydown">
        <button v-for="(item, itemIndex) in slides" :key="item.id" type="button" role="tab" :aria-selected="itemIndex === index" :aria-label="item.label" :class="{ 'is-active': itemIndex === index }" @click="select(itemIndex)">
          <svg v-if="item.id === 'device'" class="jar-glyph" viewBox="0 0 13 17" aria-hidden="true">
            <rect x="4" y="0.8" width="5" height="2.1" rx="0.6" />
            <rect x="1.1" y="3.4" width="10.8" height="12.6" rx="2.4" />
          </svg>
          <span v-else>{{ item.label }}</span>
          <i :class="itemIndex === index ? 'dash' : 'dot'" />
        </button>
      </div>

      <div class="pager" role="tablist" aria-label="SourMate features">
        <button type="button" role="tab" :aria-selected="index === 0" aria-label="Device" :class="{ 'is-active': index === 0 }" @click="select(0)">
          <svg class="jar-glyph" viewBox="0 0 13 17" aria-hidden="true">
            <rect x="4" y="0.8" width="5" height="2.1" rx="0.6" />
            <rect x="1.1" y="3.4" width="10.8" height="12.6" rx="2.4" />
          </svg>
        </button>
        <button v-for="(item, itemIndex) in slides.slice(1)" :key="item.id" type="button" role="tab" :aria-selected="index === itemIndex + 1" :aria-label="item.label" :class="{ 'is-active': index === itemIndex + 1 }" @click="select(itemIndex + 1)">
          <i></i>
        </button>
      </div>
    </main>

    <main v-else-if="panel === 'stay'" class="sheet stay-sheet">
      <form class="card" novalidate @submit.prevent="submitStay">
        <div v-if="stayDone" class="success" role="status">
          <p>Received. Your email has been saved.</p>
        </div>
        <template v-else>
          <label>
            Email address
            <input v-model="stayEmail" type="email" name="email" autocomplete="email" placeholder="name@example.com" :aria-invalid="Boolean(stayError)" :disabled="stayBusy" />
          </label>
          <p v-if="stayError" class="form-error" role="alert">{{ stayError }}</p>
          <button type="submit" class="submit" :disabled="stayBusy">{{ stayBusy ? 'Saving…' : 'Keep me posted' }}</button>
        </template>
        <p class="note">This form saves the address in Ferjoo. It does not send email.</p>
      </form>
      <div class="stay-copy">
        <h1>Stay updated with Ferjoo</h1>
        <p>Product news and beta invitations. Emails submitted here are saved for that list.</p>
      </div>
    </main>

    <main v-else class="sheet contact-sheet">
      <form class="card" novalidate @submit.prevent="submitContact">
        <div v-if="contactDone" class="success" role="status">
          <p>Received. Your message has been saved.</p>
        </div>
        <template v-else>
          <label>
            Email address
            <input v-model="contactEmail" type="email" name="email" autocomplete="email" placeholder="name@example.com" :disabled="contactBusy" :aria-invalid="contactError.startsWith('Enter your email') || contactError.startsWith('Enter a valid')" />
          </label>
          <label>
            Name
            <input v-model="contactName" type="text" name="name" autocomplete="name" placeholder="Your name" :disabled="contactBusy" :aria-invalid="contactError.startsWith('Enter your name') || contactError.startsWith('Enter a shorter name')" />
          </label>
          <label>
            Message
            <textarea v-model="contactMessage" name="message" rows="4" placeholder="Tell us about your question or idea…" :disabled="contactBusy" :aria-invalid="contactError.startsWith('Enter a message') || contactError.startsWith('Enter a shorter message')"></textarea>
          </label>
          <p v-if="contactError" class="form-error" role="alert">{{ contactError }}</p>
          <button type="submit" class="submit" :disabled="contactBusy">{{ contactBusy ? 'Saving…' : 'Send message' }}</button>
        </template>
        <p class="note">This form saves the message in Ferjoo. It does not send email.</p>
      </form>
    </main>
  </div>
</template>

<style>
body { margin: 0; background: #fffaf5; }
</style>

<style scoped>
.start, .start *, .start *::before, .start *::after { box-sizing: border-box; }
.start {
  --orange: #ff6f28;
  --mark: #ff6b25;
  --ink: #30251f;
  --muted: #75665b;
  --narrow-ink: #33211a;
  --narrow-muted: #755e52;
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  color: var(--ink);
  background: #fffaf5;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
.start :focus-visible { outline: 2px solid var(--mark); outline-offset: 3px; }

.blob { position: absolute; pointer-events: none; user-select: none; }
.blob-wide { display: none; }
.blob-narrow { position: absolute; left: 6px; top: 151px; width: 376px; height: 600px; overflow: hidden; opacity: .15; pointer-events: none; }
.blob-narrow img { position: absolute; left: 50%; top: 50%; width: 600px; max-width: none; height: 376px; transform: translate(-50%, -50%) rotate(-90deg); }
.blob-stay { display: none; }

.bar { position: absolute; z-index: 2; top: 30px; right: 24px; left: 30px; display: flex; align-items: center; justify-content: space-between; }
.logo, .chat, .back, .pill, .switcher button, .pager button, .submit { border: 0; background: transparent; font: inherit; color: inherit; cursor: pointer; }
.logo { padding: 0; }
.logo img { display: block; width: 80px; height: 30px; object-fit: contain; }
.chat { width: 24px; height: 24px; padding: 0; }
.chat svg { width: 24px; height: 24px; fill: none; stroke: var(--orange); stroke-width: 1.8; }
.chat circle { fill: var(--orange); stroke: none; }
.back { position: absolute; z-index: 2; top: 118px; left: 25px; display: inline-flex; align-items: center; gap: 8px; padding: 0; color: var(--orange); font-size: 15px; line-height: 1; }
.back svg { width: 8px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.home { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; padding: 96px 30px 24px; }
.copy { position: relative; z-index: 1; }
.name { margin: 18px 0 0; color: var(--orange); font-size: 22px; font-weight: 500; line-height: 1.15; }
.home h1 { margin: 8px 0 0; max-width: 16em; color: var(--orange); font-size: 26px; font-weight: 500; line-height: 1.2; letter-spacing: -.02em; }
.pill { display: inline-flex; align-items: center; gap: 8px; height: 42px; margin-top: 16px; padding: 0 18px 0 20px; border-radius: 21px; background: rgb(255 191 159 / 30%); color: var(--orange); font-size: 15px; }
.pill svg { width: 6px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.stage { position: relative; z-index: 1; display: flex; flex: 1; flex-direction: column; min-height: 0; }
.visual { position: relative; flex: 1; min-height: 280px; }
.shot { position: absolute; object-fit: contain; }
.jar-device { left: 8%; top: 2%; width: 78%; height: 92%; transform: rotate(5.16deg); }
.chart-rise { top: 0; right: 2%; width: 62%; }
.chart-temp { right: 2%; bottom: 18%; width: 62%; }
.jar-data { top: 12%; left: 0; width: 48%; height: 70%; object-fit: contain; transform: rotate(-5.14deg); opacity: .8; }
.journal { top: 0; left: 50%; width: min(196px, 62%); height: 92%; transform: translateX(-50%); }
.jar-doctor { top: 0; left: 2%; width: 46%; height: 88%; }
.doctor-card { top: 28%; right: 0; width: 54%; border-radius: 12px; box-shadow: 4px 4px 5px rgb(0 0 0 / 10%); }
.dial { top: 6%; left: 0; width: 62%; border-radius: 50%; box-shadow: -4px 4px 7.5px rgb(0 0 0 / 10%); }
.jar-timing { top: 10%; right: 0; width: 42%; height: 72%; transform: rotate(5.59deg); }
.feature-copy { position: relative; z-index: 1; text-align: center; }
.feature-title { margin: 8px 0 0; color: var(--mark); font-size: 22px; font-weight: 500; line-height: 1.2; }
.caption { max-width: 220px; margin: 4px auto 8px; color: var(--ink); font-size: 14px; line-height: 1.35; }

.switcher { display: none; }
.pager { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 0; margin-top: 8px; }
.pager button { display: grid; width: 14px; height: 28px; place-items: center; padding: 0; }
.pager .jar-glyph { width: 6px; height: 8px; fill: none; stroke: var(--orange); stroke-width: 1.2; opacity: .5; }
.pager button.is-active .jar-glyph { opacity: 1; }
.pager i { width: 5px; height: 5px; border-radius: 50%; background: var(--orange); opacity: .5; }
.pager button.is-active i { opacity: 1; }

.sheet { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 28px; min-height: 100vh; min-height: 100dvh; padding: 168px 20px 40px; }
.stay-copy { order: -1; }
.stay-copy h1 { margin: 0; color: var(--mark); font-size: 20px; font-weight: 500; line-height: 1.25; letter-spacing: -.02em; }
.stay-copy p { max-width: 16em; margin: 12px 0 0; color: var(--orange); font-size: 16px; line-height: 1.4; }
.card { display: flex; flex-direction: column; gap: 14px; padding: 22px 22px 18px; border: 1px solid #eaddd2; border-radius: 24px; background: #fff; }
.card label { display: grid; gap: 8px; color: var(--narrow-muted); font-size: 14px; }
.card input, .card textarea { width: 100%; box-sizing: border-box; border: 1px solid #eaddd2; border-radius: 16px; background: #fff1e7; color: var(--ink); font: inherit; font-size: 16px; }
.card input { height: 46px; padding: 0 16px; }
.card textarea { min-height: 112px; padding: 14px 16px; resize: vertical; }
.card input::placeholder, .card textarea::placeholder { color: var(--narrow-muted); }
.submit { height: 52px; border-radius: 26px; background: #ffa24f; color: var(--narrow-ink); font-size: 16px; }
.submit:disabled { opacity: .65; }
.stay-sheet .submit { background: #ffb05a; color: var(--ink); }
.note { margin: 0; color: var(--narrow-muted); font-size: 12px; line-height: 1.4; text-align: center; }
.form-error { margin: 0; color: #9a352a; font-size: 14px; }
.success { display: grid; min-height: 120px; place-items: center; color: var(--ink); font-size: 18px; text-align: center; }
.success p { margin: 0; }

@media (min-width: 900px) {
  .blob-wide { display: block; left: 39px; top: 44px; width: 1362px; height: 851px; opacity: .12; transform: scaleX(-1); }
  .blob-narrow { display: none; }
  .blob-stay { display: block; left: 720px; top: 76px; width: 681px; height: 851px; opacity: .18; transform: none; }
  .panel-stay { background: #fff9f3; }
  .bar { top: 41px; right: 92px; left: 85px; }
  .logo img { width: 94px; height: 36px; }
  .chat { width: 32px; height: 32px; }
  .chat svg { width: 32px; height: 32px; }
  .back { top: 145px; left: 85px; font-size: 16px; }
  .panel-stay .back { color: var(--mark); }

  .home { display: grid; grid-template-columns: minmax(280px, 434px) minmax(320px, 1fr) 174px; align-items: center; column-gap: 12px; min-height: 100vh; min-height: 100dvh; padding: 120px clamp(40px, 6vw, 92px) 56px clamp(40px, 6vw, 85px); }
  .name { margin: 0; font-size: 30px; }
  .home h1 { max-width: 12em; font-size: 34px; line-height: 1.15; }
  .pill { height: 56px; margin-top: 22px; padding: 0 22px 0 30px; border-radius: 28px; font-size: 18px; }
  .pill svg { width: 8px; height: 14px; }
  .stage { height: min(704px, calc(100dvh - 150px)); }
  .visual { min-height: 0; height: calc(100% - 36px); }
  .feature-title { display: none; }
  .caption { max-width: 28rem; margin: 10px 0 0; font-size: 16px; line-height: 22px; text-align: center; }
  .jar-device { left: 16%; width: 68%; height: 100%; }
  .chart-rise { top: 4%; right: 4%; width: 58%; }
  .chart-temp { right: 4%; bottom: 12%; width: 58%; }
  .jar-data { top: 16%; left: 0; width: 46%; height: 68%; }
  .journal { width: min(364px, 70%); }
  .jar-doctor { left: 4%; width: 44%; height: 92%; }
  .doctor-card { top: 32%; right: 2%; width: 48%; border-radius: 0; box-shadow: none; }
  .dial { top: 10%; left: 4%; width: 56%; }
  .jar-timing { top: 8%; right: 2%; width: 40%; height: 78%; }
  .pager { display: none; }
  .switcher { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 0; align-self: center; }
  .switcher button { display: grid; grid-template-columns: max-content 11px; align-items: center; justify-content: end; column-gap: 12px; height: 39px; min-height: 0; padding: 0; color: var(--mark); font-size: 16px; line-height: 1; }
  .switcher button:not(.is-active) span,
  .switcher button:not(.is-active) .jar-glyph { opacity: .5; }
  .switcher .jar-glyph { width: 11px; height: 14px; justify-self: end; fill: none; stroke: var(--orange); stroke-width: 1.2; }
  .switcher .dash, .switcher .dot { justify-self: center; }
  .switcher .dash { width: 11px; height: 4px; border-radius: 2px; background: var(--mark); }
  .switcher .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--mark); opacity: .5; }
  .switcher button.is-active .dot { opacity: 1; }

  .sheet { display: grid; align-items: center; min-height: 100vh; min-height: 100dvh; padding: 180px 80px 64px; }
  .stay-sheet { grid-template-columns: minmax(280px, 520px) minmax(240px, 1fr); gap: 64px; }
  .stay-copy { order: 0; }
  .stay-copy h1 { font-size: 40px; line-height: 1.15; }
  .stay-copy p { max-width: 18em; font-size: 22px; line-height: 1.35; }
  .contact-sheet { justify-items: center; }
  .contact-sheet .card { width: min(768px, 100%); }
  .card { gap: 16px; padding: 32px 40px 24px; border: 0; border-radius: 24px; box-shadow: 0 8px 12px rgb(48 37 31 / 7%); }
  .card label { color: var(--ink); font-size: 16px; }
  .card input { height: 58px; border-radius: 18px; }
  .card textarea { min-height: 154px; border-radius: 18px; }
  .card input::placeholder, .card textarea::placeholder { color: var(--muted); }
  .stay-sheet .submit { background: #ffb05a; color: var(--ink); }
  .submit { height: 58px; border-radius: 29px; font-size: 18px; }
  .note { color: var(--muted); font-size: 14px; }
  .success { color: var(--ink); font-size: 22px; }
}

@media (prefers-reduced-motion: reduce) {
  .shot { transition: none; }
}
</style>
