<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { mobileOptions, fieldLabels, describeField, describeSource, parsePendingText, validateCheckin, generateMobileReport, storeSessionReport, loadSessionReport, loadObservationContext, emptyCheckin } from '../../services/mobile-diagnosis.service.js';
import { loadFeedingEvidence } from '../../services/feeding-analysis.service.js';
import { heightBand } from '../../lib/height-band.js';
import { useStarterName } from '../../composables/useStarterName.js';
import MRadioCard from '../../components/mobile/MRadioCard.vue';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const accountId = computed(() => user.value?.id || 'guest');
const diagnosisMode = computed(() => route.query.mode === 'diagnosis');
const observationDraft = useCheckinDraft(accountId);
const diagnosisDraft = useCheckinDraft(accountId, { kind: 'diagnosis' });
const activeDraft = computed(() => diagnosisMode.value ? diagnosisDraft : observationDraft);
const draft = computed(() => activeDraft.value.draft.value);
const storageAvailable = computed(() => activeDraft.value.storageAvailable.value);
const persist = () => activeDraft.value.persist();
const replace = (value) => activeDraft.value.replace(value);
const { starterName } = useStarterName(accountId, computed(() => draft.value.starterId));
const errors = ref({});
const pending = ref({});
const notice = ref('');
const fatal = ref('');
const feedingEvidence = ref(null);
const extra = ref(false);
const heightMoreOpen = ref(false);
const observePart = ref(1);
const safetyOptions = {
  color: [{ value: 'normal', label: '未见异常' }, { value: 'suspicious', label: '彩色斑块 / 绒毛霉菌' }, { value: 'unknown', label: '不确定' }],
  smell: [{ value: 'normal', label: '未见异常' }, { value: 'suspicious', label: '明显腐败 / 恶臭' }, { value: 'unknown', label: '不确定' }]
};
const primaryHeights = computed(() => mobileOptions.height.filter((item) => ['none', 'slight', 'near', 'double'].includes(item.value)));
const moreHeights = computed(() => [...mobileOptions.height.filter((item) => !['none', 'slight', 'near', 'double'].includes(item.value)), { value: 'unknown', label: '不确定' }]);
const showMoreHeights = computed(() => heightMoreOpen.value || moreHeights.value.some((item) => item.value === draft.value.height));
const formElement = ref(null);
const steps = ['观察', '本轮', '核对'];
const step = computed(() => [1, 2, 3].includes(draft.value.step) ? draft.value.step : 1);
// 安全答案可疑或不确定时，「本轮背景」会被跳过；步骤数必须跟着实际路径走。
const skipsBackground = computed(() => [draft.value.color, draft.value.smell].some((value) => value === 'suspicious' || value === 'unknown'));
const stepMeta = computed(() => {
  const label = steps[step.value - 1];
  if (!skipsBackground.value) return { label, index: step.value, total: 3 };
  return { label, index: step.value === 1 ? 1 : 2, total: 2 };
});
// 诊断页只按“最新高度 / 起始高度”的区间给默认值，用户仍可改成其他涨幅或“不确定”。
const autoHeight = computed(() => {
  if (!diagnosisMode.value) return null;
  const summary = feedingEvidence.value?.summary;
  return summary ? heightBand(summary.baselineHeightMm, summary.currentHeightMm) : null;
});
const heightOverridden = computed(() => !!autoHeight.value && draft.value.height !== autoHeight.value.value);
const reviewKeys = computed(() => diagnosisMode.value ? ['color', 'smell', 'height', 'ratio', 'elapsedHours'] : Object.keys(fieldLabels));
const diagnosisReviewLabels = { color: '颜色 / 霉斑', smell: '气味', height: '涨幅表现', ratio: '喂养比例', elapsedHours: '喂养后经过' };
const summaryKeys = computed(() => ['color', 'smell', ...Object.keys(fieldLabels).filter((key) => !['color', 'smell'].includes(key) && draft.value[key] !== '' && draft.value[key] != null)]);
const emptySummaryKeys = computed(() => Object.keys(fieldLabels).filter((key) => !summaryKeys.value.includes(key)));
watch([accountId, () => route.query.starter, () => route.query.mode, () => route.query.feeding], () => {
  if (diagnosisMode.value && route.query.edit !== 'session') replace({ ...emptyCheckin(), starterId: typeof route.query.starter === 'string' ? route.query.starter : '' });
  if (typeof route.query.starter === 'string' && route.query.starter !== draft.value.starterId) {
    if (draft.value.starterId) replace({ starterId: route.query.starter });
    else draft.value.starterId = route.query.starter;
  }
  errors.value = {};
  pending.value = {};
}, { immediate: true });
if (route.query.edit === 'session') {
  const report = loadSessionReport(accountId.value);
  if (report) replace({ ...report.input, starterId: report.starterId || report.input?.starterId || '', step: diagnosisMode.value ? 3 : 1 });
}
let contextGeneration = 0;
watch([accountId, () => draft.value.starterId, () => route.query.feeding, () => route.query.mode], async ([owner, starterId, feedingId]) => {
  const token = ++contextGeneration;
  feedingEvidence.value = null;
  if (owner === 'guest' || !starterId || (!diagnosisMode.value && route.query.edit === 'session')) return;
  const target = draft.value;
  try {
    if (diagnosisMode.value && typeof feedingId !== 'string') throw new Error('缺少本轮喂养记录，请从喂养记录进入诊断。');
    const evidence = diagnosisMode.value && typeof feedingId === 'string'
      ? await loadFeedingEvidence(owner, starterId, feedingId)
      : null;
    const { sample, link, feeding } = evidence || await loadObservationContext(owner, starterId, typeof feedingId === 'string' ? feedingId : undefined);
    if (token !== contextGeneration || target !== draft.value) return;
    function fill(key, value, source) {
      if (target[key] !== '' || value == null) return;
      target[key] = value;
      target.sources[key] = source;
    }
    feedingEvidence.value = evidence;
    const summary = evidence?.summary;
    if (diagnosisMode.value && summary) {
      target.feedingId = feeding.id;
      target.evidenceSnapshot = { source: 'feeding-analysis.service', feedingId: feeding.id, measuredAt: evidence.now, windowFrom: summary.windowFrom, windowTo: summary.windowTo, latestMeasurementAt: summary.latestMeasurementAt, latestTemperatureAt: summary.latestTemperatureAt, baselineHeightMm: summary.baselineHeightMm, baselineSource: summary.baselineSource, expansionPercent: summary.expansionPercent, expansionSource: summary.latestMeasurementAt ? `height:${summary.latestMeasurementAt}` : null, heightStale: summary.heightStale, temperatureStale: summary.temperatureStale };
      if (summary.tempC != null) fill('tempC', Number(summary.tempC.toFixed(1)), `传感器轮次平均 · ${summary.temperatureCount} 个有效样本 · ${summary.latestTemperatureAt}`);
      if (summary.elapsedHours != null) fill('elapsedHours', Number(summary.elapsedHours.toFixed(1)), summary.historicalRound ? `历史轮次截至下一次喂养 ${summary.windowTo}` : `喂养至测量截点 ${summary.windowTo}`);
      if (summary.height) {
        const band = heightBand(summary.baselineHeightMm, summary.currentHeightMm);
        fill('height', summary.height, `自动区间计算 · ${band.ratio.toFixed(2)} 倍（${band.range}）· ${summary.historicalRound ? '历史轮次' : '当前轮次'}设备测量 · ${summary.latestMeasurementAt}`);
      }
      if (summary.heightStale || summary.temperatureStale) notice.value = '最新高度或温度证据已超过 40 分钟，未作为当前值预填；请重新测量或手工确认。';
    } else if (sample?.temperature_c != null) fill('tempC', sample.temperature_c, `设备 Ferjoo Sensor · ${link.device_id} · 采样 ${new Date(sample.recorded_at).toLocaleString('zh-CN')}`);
    if (feeding) {
      fill('ratio', feeding.ratio, '来自喂养记录');
      if (!diagnosisMode.value) {
        const elapsed = (Date.now() - Date.parse(feeding.occurred_at)) / 3600000;
        if (Number.isFinite(elapsed) && elapsed >= 0) fill('elapsedHours', Number(elapsed.toFixed(1)), '来自喂养记录');
      }
    }
  } catch { if (token === contextGeneration) notice.value = '预填信息暂不可用，可继续手工填写。'; }
}, { immediate: true });
onScopeDispose(() => { contextGeneration++; });
function markManual(key) {
  draft.value.sources[key] = draft.value.sources[key] ? '手工修改（原自动预填 / 确认值已修改）' : '本次手工确认';
}
function restoreAutoHeight() {
  if (!autoHeight.value) return;
  draft.value.height = autoHeight.value.value;
  draft.value.sources.height = `自动区间计算 · ${autoHeight.value.ratio.toFixed(2)} 倍 · 已恢复自动值`;
}
function observationReady(part = observePart.value) {
  if (part === 1) return ['normal', 'suspicious', 'unknown'].includes(draft.value.color);
  if (part === 2) return ['normal', 'suspicious', 'unknown'].includes(draft.value.smell);
  return draft.value.height !== '' && draft.value.height != null;
}
const canAdvance = computed(() => step.value > 1 || observationReady());
function reviewLabel(key) {
  return diagnosisMode.value ? diagnosisReviewLabels[key] || fieldLabels[key] : fieldLabels[key];
}
function reviewValue(key) {
  const value = draft.value[key];
  if (value === '' || value == null) return '未选择';
  if (diagnosisMode.value && safetyOptions[key]) return safetyOptions[key].find((item) => item.value === value)?.label || describeField(key, value);
  if (diagnosisMode.value && key === 'elapsedHours') return `${value} 小时`;
  return describeField(key, value);
}
function back() {
  if (step.value === 1 && observePart.value > 1) { observePart.value -= 1; return; }
  draft.value.step = step.value === 3 && skipsBackground.value ? 1 : step.value - 1;
  if (draft.value.step === 1) observePart.value = skipsBackground.value ? 1 : 3;
}
onBeforeRouteLeave(() => { persist(); });
async function showErrors(value) {
  errors.value = value;
  await nextTick();
  formElement.value?.querySelector('[aria-invalid="true"]')?.focus();
}
function selectSafety(key, value) {
  draft.value[key] = value;
  errors.value = {};
  if (value === 'suspicious' || value === 'unknown') draft.value.step = 3;
}
function selectHeight(value) {
  draft.value.height = value;
  markManual('height');
}
function backgroundOptions(key) {
  return [...(mobileOptions[key] || []), { value: 'unknown', label: '不确定' }];
}
function selectBackground(key, value) {
  draft.value[key] = value;
  markManual(key);
}
function next() {
  if (step.value === 1 && !skipsBackground.value && observePart.value < 3) {
    if (!observationReady()) return;
    observePart.value += 1;
    errors.value = {};
    return;
  }
  const all = validateCheckin(draft.value);
  const keys = step.value === 1 ? ['color', 'smell', 'height'] : ['stage', 'ratio', 'tempC', 'elapsedHours', 'ph'];
  const visible = Object.fromEntries(Object.entries(all).filter(([key]) => keys.includes(key)));
  if (Object.keys(visible).length) return showErrors(visible);
  // 可疑与不确定都必须直接核对，不能把安全优先的路径退回背景填写。
  draft.value.step = step.value === 1 && skipsBackground.value ? 3 : Math.min(3, step.value + 1);
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
  <main class="m-page mobile-checkin" :data-mode="diagnosisMode ? 'diagnosis' : 'observation'">
    <header class="checkin-head">
      <h1 v-if="!diagnosisMode">观察记录</h1>
      <span v-if="step === 1" class="observe-index">观察 {{ observePart }} / {{ skipsBackground ? 2 : 3 }}</span>
      <span v-if="draft.starterId" class="checkin-starter">{{ starterName }}</span>
    </header>
    <ol v-if="!(diagnosisMode && (step === 1 || step === 3))" class="step-track" :aria-label="`第 ${stepMeta.index} 步，共 ${stepMeta.total} 步`">
      <li v-for="n in stepMeta.total" :key="n" :class="{ active: n === stepMeta.index, done: n < stepMeta.index }">
        <span class="step-dot" aria-hidden="true"></span>
        <span class="step-label">{{ n === 1 ? '观察' : n === 2 && stepMeta.total === 3 ? '本轮' : '核对' }}</span>
      </li>
    </ol>
    <p v-if="!(diagnosisMode && (step === 1 || step === 3))" class="m-context m-muted"><span v-if="diagnosisMode" class="mode-tag">本轮诊断</span>{{ stepMeta.label }} · 第 {{ stepMeta.index }} / {{ stepMeta.total }} 步<span v-if="!draft.starterId"> · 尚未选择酵种，<RouterLink to="/device">去设备页选择</RouterLink></span></p>
    <p v-if="fatal" class="m-error" role="alert">{{ fatal }}</p>
    <section v-if="diagnosisMode && feedingEvidence" class="m-card">
      <p>传感器不能判断颜色、气味或食品安全，请手动确认。</p>
      <template v-if="feedingEvidence"><p v-if="feedingEvidence.unavailableReason" class="m-muted">{{ feedingEvidence.unavailableReason }}</p><p class="m-muted">{{ feedingEvidence.summary.historicalRound ? `历史轮次，截点为下一次喂养 ${feedingEvidence.summary.windowTo}` : '当前轮次' }} · 起始高度：{{ feedingEvidence.summary.baselineHeightMm == null ? '样本不足' : `${feedingEvidence.summary.baselineHeightMm.toFixed(1)} mm` }} · {{ feedingEvidence.summary.baselinePending ? '暂定' : '窗口已结束' }} · {{ feedingEvidence.summary.baselineSource === 'manual' ? '手工修正' : '传感器窗口' }}</p><p class="m-muted">膨胀率：{{ feedingEvidence.summary.expansionPercent == null ? '证据不足' : `${feedingEvidence.summary.expansionPercent.toFixed(1)}%` }}。温度取本轮有效采样均值。{{ feedingEvidence.summary.heightStale || feedingEvidence.summary.temperatureStale ? '最新证据超过 40 分钟，未预填。' : '' }}</p></template>
      <p v-if="notice" role="status">{{ notice }}</p>
    </section>
    <p v-if="!storageAvailable" class="m-error" role="status">本机存储不可用，关闭页面可能丢失草稿。</p>
    <form ref="formElement" @submit.prevent="step === 3 ? generate() : next()">
      <section v-show="step === 1" :class="diagnosisMode ? 'observe-step' : 'm-card'">
        <template v-if="!diagnosisMode">
          <h2>先确认本次安全观察</h2>
          <p class="m-muted">不要品尝生酵种；无法判断请选“不确定”。</p>
        </template>
        <div v-if="observePart === 1" :aria-invalid="!!errors.color" tabindex="-1">
          <h2>酵种表面看起来怎么样？</h2>
          <span id="color-help" class="m-muted">看粉红、绿、蓝、黑斑块或绒毛。</span>
          <MRadioCard :model-value="draft.color" :options="safetyOptions.color" label="颜色与霉斑" marker="end" @update:model-value="selectSafety('color', $event)" />
          <span v-if="errors.color" class="m-error">{{ errors.color }}</span>
        </div>
        <div v-else-if="observePart === 2" :aria-invalid="!!errors.smell" tabindex="-1">
          <h2>酵种闻起来怎么样？</h2>
          <span id="smell-help" class="m-muted">无法判断时，请选择“不确定”。</span>
          <MRadioCard :model-value="draft.smell" :options="safetyOptions.smell" label="气味" marker="end" @update:model-value="selectSafety('smell', $event)" />
          <span v-if="errors.smell" class="m-error">{{ errors.smell }}</span>
        </div>
        <div v-else :aria-invalid="!!errors.height" tabindex="-1">
          <h2>这次发酵的涨幅如何？</h2>
          <p class="height-note">设备数据可供参考，也可以手动修改。</p>
          <MRadioCard :model-value="draft.height" :options="primaryHeights" :columns="2" label="主要涨幅表现" marker="end" @update:model-value="selectHeight" />
          <button type="button" class="more-heights" :aria-expanded="showMoreHeights" @click="heightMoreOpen = !heightMoreOpen">{{ showMoreHeights ? '收起更多情况' : '查看更多情况' }}</button>
          <MRadioCard v-if="showMoreHeights" :model-value="draft.height" :options="moreHeights" :columns="2" label="更多涨幅情况" marker="end" @update:model-value="selectHeight" />
          <span v-if="autoHeight" class="m-muted">自动：{{ autoHeight.ratio.toFixed(2) }} 倍（{{ autoHeight.baselineHeightMm.toFixed(1) }} → {{ autoHeight.currentHeightMm.toFixed(1) }} mm），落在 {{ autoHeight.range }} 区间。<button v-if="heightOverridden" type="button" class="link-button" @click="restoreAutoHeight">恢复自动值</button></span>
          <span v-else-if="diagnosisMode && feedingEvidence" class="m-muted">缺少有效起始高度或最新高度，无法自动计算，请手动选择。</span>
          <span v-if="errors.height" class="m-error">{{ errors.height }}</span>
        </div>
        <p v-if="observePart === 1" class="safety-note"><strong>请勿品尝生酵种。</strong><span>设备不能判断颜色、气味或食品安全，请逐项确认。</span></p>
        <details><summary>一句话填写（可选）</summary><label class="m-field">原文<textarea v-model="draft.quickText" rows="4" placeholder="如：成熟种，1:2:2，轻微上涨，温度26°C，经过4小时" /></label><button type="button" class="m-secondary" @click="parseText">识别为待确认字段</button><p role="status">{{ notice }}</p><ul><li v-for="(value, key) in pending" :key="key">{{ fieldLabels[key] }}：{{ describeField(key, value) }} <strong v-if="key === 'color' || key === 'smell'">请在上方重新主动选择；识别未作为答案。</strong><button v-else type="button" class="m-secondary" @click="applyPending(key)">确认此字段</button></li></ul></details>
      </section>
      <section v-show="step === 2" class="m-card">
        <h2>{{ diagnosisMode ? '确认诊断背景' : '补充这一轮背景' }}</h2>
        <div v-for="key in ['stage', 'ratio']" :key="key" :aria-invalid="!!errors[key]" tabindex="-1">
          <MRadioCard :model-value="draft[key]" :options="backgroundOptions(key)" :columns="key === 'ratio' ? 2 : 1" :label="fieldLabels[key]" @update:model-value="selectBackground(key, $event)" />
          <span class="m-muted">来源：{{ describeSource(draft, key) }}</span>
          <span v-if="errors[key]" class="m-error">{{ errors[key] }}</span>
        </div>
        <p class="m-muted">按重量，顺序为老种 : 水 : 面粉。</p>
        <label v-for="key in ['tempC', 'elapsedHours']" :key="key" class="m-field"><span>{{ fieldLabels[key] }}（可空）</span><input v-model="draft[key]" type="number" step="any" inputmode="decimal" :aria-invalid="!!errors[key]" placeholder="未测量 / 不记得请留空" @input="markManual(key)"><span class="m-muted">来源：{{ describeSource(draft, key) }}</span><span v-if="errors[key]" class="m-error">{{ errors[key] }}</span></label>
        <p class="m-muted">温度填酵种实测值；未知留空。</p>
        <button type="button" class="m-secondary" :aria-expanded="extra" @click="extra = !extra">{{ extra ? '收起' : '补充' }} pH 与备注（可选）</button>
        <div v-show="extra"><label class="m-field">pH<input v-model="draft.ph" type="number" step="any" inputmode="decimal" :aria-invalid="!!errors.ph"><span v-if="errors.ph" class="m-error">{{ errors.ph }}</span></label><label class="m-field">备注<textarea v-model="draft.notes" rows="3" /></label></div>
      </section>
      <section v-show="step === 3" class="review-step">
        <p v-if="diagnosisMode" class="observe-index">最后一步</p>
        <h2>确认本次信息</h2>
        <p v-if="diagnosisMode" class="m-muted">请核对后再生成建议。</p>
        <div class="review-card">
        <p v-if="skipsBackground" class="skip-note">安全答案需要优先处理，已跳过后续观察；本次不会生成常规养护结论。</p>
        <dl><template v-for="key in reviewKeys" :key="key"><dt>{{ reviewLabel(key) }}</dt><dd>{{ reviewValue(key) }}<small v-if="!diagnosisMode" class="m-muted"> · 来源：{{ describeSource(draft, key) }}</small></dd></template></dl>
        </div>
        <p class="sample-note">示例数据 · 可返回修改</p>
        <p v-if="draft.quickText" class="note">原始一句话：{{ draft.quickText }}</p>
        <button type="button" class="m-secondary" @click="draft.step = 1; observePart = 1">修改观察</button> <button v-if="!skipsBackground" type="button" class="m-secondary" @click="draft.step = 2">修改背景</button>
      </section>
      <p v-if="Object.keys(errors).length" class="m-error" role="alert">请检查标出的字段，已填写内容已保留。</p>
      <div class="m-actions"><button v-if="step > 1 || observePart > 1" type="button" class="m-secondary" @click="back">上一步</button><button type="submit" class="m-primary" :disabled="step < 3 && !canAdvance">{{ step === 3 ? '生成建议' : '下一步' }}</button></div>
    </form>
  </main>
</template>

<style scoped>
.mobile-area .m-page.mobile-checkin{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 24px);gap:0}
.checkin-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;margin:0 0 12px}
.checkin-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em;color:var(--text-primary)}
.observe-index{flex:none;color:var(--text-secondary);font-size:13px;line-height:19px}
.checkin-starter{flex:none;display:inline-flex;align-items:center;min-height:28px;padding:0 12px;border-radius:14px;background:var(--m-icon-disc);color:var(--brand-action);font-size:13px;font-weight:500;max-width:50vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.review-step h2{margin:8px 0;font-size:21px;line-height:31px;font-weight:500}
.review-step > .m-muted{display:block;margin:0 0 16px;font-size:13px;line-height:19px}
.review-card{padding:8px 16px 16px;border-radius:20px;background:var(--surface-card)}
.review-card dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px 12px;margin:12px 0 0;align-items:baseline}
.review-card dt{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.review-card dd{margin:0;font-size:14px;line-height:21px;font-weight:500;text-align:right}
.sample-note{margin:12px 0 8px;color:var(--text-secondary);font-size:12px;line-height:18px}
.observe-step h2{margin:18px 0 8px;font-size:21px;line-height:31px;font-weight:500;letter-spacing:0}
.observe-step .m-muted{display:block;margin:0 0 16px;font-size:13px;line-height:19px}
.safety-note{display:grid;gap:2px;margin:16px 0 0;padding:12px 14px;border-radius:15px;background:var(--m-icon-disc);color:var(--text-primary)}
.safety-note strong{font-size:13px;line-height:19px;font-weight:500}
.safety-note span{font-size:11px;line-height:16px;color:var(--text-secondary);font-weight:400}
.height-note{display:block;margin:0 0 16px;color:var(--text-secondary);font-size:13px;line-height:19px}
.more-heights{min-height:44px;margin:8px 0;padding:0;border:0;background:transparent;color:var(--brand-action);font:inherit;font-size:var(--text-sm);cursor:pointer}
.step-track{display:flex;align-items:center;gap:0;list-style:none;margin:0 0 12px;padding:0}
.step-track li{display:flex;align-items:center;gap:6px;flex:1;font-size:12px;color:var(--text-secondary)}
.step-track li:last-child{flex:0 0 auto}
.step-track li:not(:last-child)::after{content:'';flex:1;height:2px;margin:0 8px;background:var(--border-subtle);border-radius:1px}
.step-track li.done:not(:last-child)::after{background:var(--brand-action)}
.step-dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--border-subtle)}
.step-track li.active .step-dot{background:var(--brand-action);box-shadow:0 0 0 4px var(--m-icon-disc)}
.step-track li.done .step-dot{background:var(--brand-action)}
.step-track li.active{color:var(--brand-action);font-weight:500}
.step-label{white-space:nowrap}
.mobile-checkin .m-card{padding:var(--m-card-space);margin-bottom:12px}
.m-context{margin:0 0 12px;overflow-wrap:anywhere;font-size:13px;line-height:19px}
.m-context a{color:var(--brand-action);text-decoration:none;font-weight:500}
.m-actions{position:sticky;bottom:0;z-index:5;display:flex;gap:12px;margin-top:16px;padding:12px 0 calc(12px + env(safe-area-inset-bottom));background:var(--surface-page)}
.m-actions .m-primary{flex:1;display:flex;align-items:center;justify-content:center;min-height:60px;padding:0 16px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;font-weight:500;cursor:pointer}
.m-actions .m-primary:active:not(:disabled){background:var(--brand-accent)}
.m-actions .m-primary:disabled{background:color-mix(in srgb, var(--brand-light) 42%, var(--surface-page));color:var(--text-secondary);cursor:not-allowed}
.m-actions .m-secondary{min-height:44px;padding:0 16px;border:1px solid var(--border-subtle);border-radius:var(--radius-control);background:var(--surface-card);color:var(--text-primary);font:inherit;font-size:14px;font-weight:500;cursor:pointer}
.note,dd,li{overflow-wrap:anywhere;white-space:pre-wrap}
dt{font-weight:600;margin-top:.75rem}
dd{margin-left:0}
summary{min-height:44px;padding:.65rem 0;box-sizing:border-box;cursor:pointer}
li{margin:.75rem 0}
[aria-invalid=true]{outline:2px solid var(--danger-text)}
.link-button{padding:0;border:0;background:none;font:inherit;color:var(--brand-action);text-decoration:underline;cursor:pointer}
.mode-tag{display:inline-block;margin-right:.35rem;padding:.05rem .4rem;border-radius:var(--radius-badge);background:var(--m-icon-disc);color:var(--brand-action);font-size:.68rem;font-weight:700}
.skip-note{margin:.35rem 0 0;font-size:.72rem;line-height:1.5;color:var(--warning-text)}
</style>
