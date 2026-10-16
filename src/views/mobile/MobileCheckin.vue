<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { mobileOptions, fieldLabels, describeField, describeSource, parsePendingText, validateCheckin, generateMobileReport, storeSessionReport, loadSessionReport, loadObservationContext } from '../../services/mobile-diagnosis.service.js';
import { useStarterName } from '../../composables/useStarterName.js';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const accountId = computed(() => user.value?.id || 'guest');
const { draft, storageAvailable, persist, replace } = useCheckinDraft(accountId);
const { starterName } = useStarterName(accountId, computed(() => draft.value.starterId));
const errors = ref({});
const pending = ref({});
const notice = ref('');
const fatal = ref('');
const extra = ref(false);
const formElement = ref(null);
const steps = ['观察', '本轮', '核对'];
const step = computed(() => [1, 2, 3].includes(draft.value.step) ? draft.value.step : 1);
const summaryKeys = Object.keys(fieldLabels);
watch([accountId, () => route.query.starter], () => {
  if (typeof route.query.starter === 'string' && route.query.starter !== draft.value.starterId) {
    if (draft.value.starterId) replace({ starterId: route.query.starter });
    else draft.value.starterId = route.query.starter;
  }
  errors.value = {};
  pending.value = {};
}, { immediate: true });
if (route.query.edit === 'session') {
  const report = loadSessionReport(accountId.value);
  if (report) replace({ ...report.input, step: 1 });
}
let contextGeneration = 0;
watch([accountId, () => draft.value.starterId, () => route.query.feeding], async ([owner, starterId, feedingId]) => {
  const token = ++contextGeneration;
  if (owner === 'guest' || !starterId || route.query.edit === 'session') return;
  const target = draft.value;
  try {
    const { sample, link, feeding } = await loadObservationContext(owner, starterId, typeof feedingId === 'string' ? feedingId : undefined);
    if (token !== contextGeneration || target !== draft.value) return;
    function fill(key, value, source) {
      if (target[key] !== '' || value == null) return;
      target[key] = value;
      target.sources[key] = source;
    }
    if (sample?.temperature_c != null) fill('tempC', sample.temperature_c, `设备 Ferjoo Sensor · ${link.device_id} · 采样 ${new Date(sample.recorded_at).toLocaleString('zh-CN')}`);
    if (feeding) {
      fill('ratio', feeding.ratio, '来自喂养记录');
      const elapsed = (Date.now() - Date.parse(feeding.occurred_at)) / 3600000;
      if (Number.isFinite(elapsed) && elapsed >= 0) fill('elapsedHours', Number(elapsed.toFixed(1)), '来自喂养记录');
    }
  } catch { if (token === contextGeneration) notice.value = '预填信息暂不可用，可继续手工填写。'; }
}, { immediate: true });
onScopeDispose(() => { contextGeneration++; });
function markManual(key) {
  draft.value.sources[key] = draft.value.sources[key] ? '手工修改（原自动预填 / 确认值已修改）' : '本次手工确认';
}
function back() { draft.value.step = step.value === 3 && [draft.value.color, draft.value.smell].includes('suspicious') ? 1 : step.value - 1; }
onBeforeRouteLeave(() => { persist(); });
async function showErrors(value) {
  errors.value = value;
  await nextTick();
  formElement.value?.querySelector('[aria-invalid="true"]')?.focus();
}
function selectSafety(key) {
  errors.value = {};
  if (draft.value[key] === 'suspicious') draft.value.step = 3;
}
function next() {
  const all = validateCheckin(draft.value);
  const keys = step.value === 1 ? ['color', 'smell', 'height'] : ['stage', 'ratio', 'tempC', 'elapsedHours', 'ph'];
  const visible = Object.fromEntries(Object.entries(all).filter(([key]) => keys.includes(key)));
  if (Object.keys(visible).length) return showErrors(visible);
  draft.value.step = step.value === 1 && [draft.value.color, draft.value.smell].includes('unknown') ? 3 : Math.min(3, step.value + 1);
  errors.value = {};
}
function generate() {
  persist();
  fatal.value = '';
  try {
    const { report, errors: invalid } = generateMobileReport(draft.value, accountId.value);
    if (invalid) { draft.value.step = 1; return showErrors(invalid); }
    storeSessionReport(accountId.value, report);
    router.push('/reports/session');
  } catch (cause) { fatal.value = cause.message || '生成建议失败，请稍后重试。'; }
}
function parseText() {
  pending.value = parsePendingText(draft.value.quickText);
  notice.value = Object.keys(pending.value).length ? '以下只是识别建议，请逐项确认；绝不覆盖本次安全答案。未列出的字段未识别。' : '没有识别到字段。原文已保留，请改用逐项填写。';
}
function applyPending(key) {
  if (key === 'color' || key === 'smell') return;
  draft.value[key] = pending.value[key];
  draft.value.sources[key] = '一句话识别后逐项手工确认';
  delete pending.value[key];
}
</script>

<template>
  <main class="m-page mobile-checkin">
    <header><RouterLink class="m-secondary" to="/today">返回今天</RouterLink><h1>记录观察</h1><p class="m-muted">{{ steps[step - 1] }} · 第 {{ step }} / 3 步</p></header>
    <p v-if="fatal" class="m-error" role="alert">{{ fatal }}</p>
    <section class="m-card"><p v-if="draft.starterId">当前酵种：{{ starterName }}</p><p v-else>尚未选择酵种。可以仅生成建议，不保存云端；<RouterLink to="/today">去今天添加或选择酵种</RouterLink>。</p><p class="m-muted">生成与保存是两件事；云端保存需要登录并选择酵种。</p></section>
    <p v-if="!storageAvailable" class="m-error" role="status">本机存储不可用，暂在当前会话保留；关闭页面可能丢失，请及时完成任务。</p>
    <form ref="formElement" @submit.prevent="step === 3 ? generate() : next()">
      <section v-show="step === 1" class="m-card">
        <h2>先确认本次安全观察</h2>
        <p class="m-muted">不要品尝生酵种。无法看清或无法判断，请选“不确定”。</p>
        <label v-for="key in ['color', 'smell']" :key="key" class="m-field">
          <span>{{ fieldLabels[key] }}</span>
          <select v-model="draft[key]" :aria-invalid="!!errors[key]" :aria-describedby="`${key}-help`" @change="selectSafety(key)">
            <option disabled value="">请主动选择</option><option value="normal">未见异常</option><option value="suspicious">{{ key === 'color' ? '彩色斑块 / 绒毛霉菌' : '明显腐败 / 恶臭' }}</option><option value="unknown">不确定</option>
          </select>
          <span :id="`${key}-help`" class="m-muted">{{ key === 'color' ? '检查粉红、绿、蓝、黑等异常斑块和绒毛状霉菌。' : '区分正常酸香、酒精气味与明显腐败气味。' }}</span>
          <span v-if="errors[key]" class="m-error">{{ errors[key] }}</span>
        </label>
        <label class="m-field"><span>请选择最主要的涨幅表现</span><select v-model="draft.height" :aria-invalid="!!errors.height"><option disabled value="">请选择</option><option v-for="item in mobileOptions.height" :key="item.value" :value="item.value">{{ item.label }}</option><option value="unknown">不确定</option></select><span class="m-muted">相对喂养后起始高度；表面液层与涨幅本轮只能选最主要的一项。</span><span v-if="errors.height" class="m-error">{{ errors.height }}</span></label>
        <details><summary>一句话填写（可选）</summary><label class="m-field">原文<textarea v-model="draft.quickText" rows="4" placeholder="如：成熟种，1:2:2，轻微上涨，温度26°C，经过4小时" /></label><button type="button" class="m-secondary" @click="parseText">识别为待确认字段</button><p role="status">{{ notice }}</p><ul><li v-for="(value, key) in pending" :key="key">{{ fieldLabels[key] }}：{{ describeField(key, value) }} <strong v-if="key === 'color' || key === 'smell'">请在上方重新主动选择；识别未作为答案。</strong><button v-else type="button" class="m-secondary" @click="applyPending(key)">确认此字段</button></li></ul></details>
      </section>
      <section v-show="step === 2" class="m-card">
        <h2>补充这一轮背景</h2>
        <label v-for="key in ['stage', 'ratio']" :key="key" class="m-field"><span>{{ fieldLabels[key] }}</span><select v-model="draft[key]" :aria-invalid="!!errors[key]" @change="markManual(key)"><option disabled value="">请选择</option><option v-for="item in mobileOptions[key]" :key="item.value" :value="item.value">{{ item.label }}</option><option value="unknown">不确定</option></select><span v-if="errors[key]" class="m-error">{{ errors[key] }}</span></label>
        <p class="m-muted">比例按重量，顺序为老种 : 水 : 面粉；不将自定义比例映射为相近比例，不知道请选“不确定”。</p>
        <label v-for="key in ['tempC', 'elapsedHours']" :key="key" class="m-field"><span>{{ fieldLabels[key] }}（可空）</span><input v-model="draft[key]" type="number" step="any" inputmode="decimal" :aria-invalid="!!errors[key]" placeholder="未测量 / 不记得请留空" @input="markManual(key)"><span class="m-muted">来源：{{ describeSource(draft, key) }}</span><span v-if="errors[key]" class="m-error">{{ errors[key] }}</span></label>
        <p class="m-muted">温度指实测酵种温度，而非未经确认的设备环境温度；时间未知不伪造默认值。</p>
        <button type="button" class="m-secondary" :aria-expanded="extra" @click="extra = !extra">{{ extra ? '收起' : '补充' }} pH 与备注（可选）</button>
        <div v-show="extra"><label class="m-field">pH<input v-model="draft.ph" type="number" step="any" inputmode="decimal" :aria-invalid="!!errors.ph"><span v-if="errors.ph" class="m-error">{{ errors.ph }}</span></label><label class="m-field">备注<textarea v-model="draft.notes" rows="3" /></label></div>
      </section>
      <section v-show="step === 3" class="m-card">
        <h2>核对本次输入</h2><p class="m-muted">来源：本次手工填写 / 逐项确认。未提供项保持为空；修改后生成新报告，不改写旧快照。</p>
        <dl><template v-for="key in summaryKeys" :key="key"><dt>{{ fieldLabels[key] }}</dt><dd>{{ describeField(key, draft[key]) }}<small class="m-muted"> · 来源：{{ describeSource(draft, key) }}</small></dd></template></dl>
        <p v-if="draft.notes" class="note">备注（请特别核查其中的异常描述）：{{ draft.notes }}</p>
        <p v-if="draft.quickText" class="note">原始一句话：{{ draft.quickText }}</p>
        <p class="m-muted">仅在成熟阶段、实测温度可靠且已知时长时展示剩余经验估时；安全不确定时不会给出正常结论。</p>
        <button type="button" class="m-secondary" @click="draft.step = 1">修改观察</button> <button type="button" class="m-secondary" @click="draft.step = 2">修改背景</button>
      </section>
      <p v-if="Object.keys(errors).length" class="m-error" role="alert">请检查标出的字段，已填写内容已保留。</p>
      <div class="m-actions"><button v-if="step > 1" type="button" class="m-secondary" @click="back">上一步</button><button type="submit" class="m-primary">{{ step === 3 ? '生成建议（尚未云端保存）' : '下一步' }}</button></div>
    </form>
  </main>
</template>

<style scoped>
.mobile-checkin{max-width:42rem;margin:auto;padding-bottom:calc(11rem + env(safe-area-inset-bottom))}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-field{display:grid;gap:.5rem;margin:1rem 0}.m-field input,.m-field select,.m-field textarea{box-sizing:border-box;width:100%;min-height:48px;padding:.75rem;font:inherit;border:1px solid #938d83;border-radius:0;background:#fff}.m-actions{position:fixed;bottom:calc(0px + env(safe-area-inset-bottom));left:0;right:0;z-index:20;display:flex;justify-content:center;gap:.75rem;padding:.75rem;background:#fffdf8;border-top:1px solid #d8d2c8}.m-primary,.m-secondary{min-height:44px;padding:.65rem 1rem;font:inherit;cursor:pointer}.m-primary{background:#a44213;color:white;border:1px solid #a44213}.m-secondary{border:1px solid #938d83;background:transparent;color:inherit}.m-error{color:#9b2920}.m-muted{color:#625e56;font-size:.92rem}.note,dd,li{overflow-wrap:anywhere;white-space:pre-wrap}dt{font-weight:600;margin-top:.75rem}dd{margin-left:0}summary{min-height:44px;cursor:pointer}li{margin:.75rem 0}[aria-invalid=true]{outline:2px solid #9b2920}
</style>
