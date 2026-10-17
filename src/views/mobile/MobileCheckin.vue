<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { mobileOptions, fieldLabels, describeField, describeSource, parsePendingText, validateCheckin, generateMobileReport, storeSessionReport, loadSessionReport, loadObservationContext, emptyCheckin } from '../../services/mobile-diagnosis.service.js';
import { loadFeedingEvidence } from '../../services/feeding-analysis.service.js';
import { useStarterName } from '../../composables/useStarterName.js';

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
const formElement = ref(null);
const steps = ['观察', '本轮', '核对'];
const step = computed(() => [1, 2, 3].includes(draft.value.step) ? draft.value.step : 1);
const summaryKeys = computed(() => ['color', 'smell', ...Object.keys(fieldLabels).filter((key) => !['color', 'smell'].includes(key) && draft.value[key] !== '' && draft.value[key] != null)]);
const emptySummaryKeys = computed(() => Object.keys(fieldLabels).filter((key) => !summaryKeys.value.includes(key)));
watch([accountId, () => route.query.starter, () => route.query.mode, () => route.query.feeding], () => {
  if (diagnosisMode.value) replace({ ...emptyCheckin(), starterId: typeof route.query.starter === 'string' ? route.query.starter : '' });
  if (typeof route.query.starter === 'string' && route.query.starter !== draft.value.starterId) {
    if (draft.value.starterId) replace({ starterId: route.query.starter });
    else draft.value.starterId = route.query.starter;
  }
  errors.value = {};
  pending.value = {};
}, { immediate: true });
if (!diagnosisMode.value && route.query.edit === 'session') {
  const report = loadSessionReport(accountId.value);
  if (report) replace({ ...report.input, step: 1 });
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
      if (summary.height) fill('height', summary.height, `${summary.historicalRound ? '历史轮次' : '当前轮次'}传感器测量 · ${summary.latestMeasurementAt} · 有效高度 ${summary.heightCount} 个，起始样本 ${summary.baselineUsedCount} 个`);
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
    <p class="m-context m-muted">{{ diagnosisMode ? '传感器诊断确认' : steps[step - 1] }} · 第 {{ step }} / 3 步 · <span v-if="draft.starterId">当前酵种：{{ starterName }}</span><span v-else>尚未选择酵种，<RouterLink to="/today">去今天选择</RouterLink></span></p>
    <p v-if="fatal" class="m-error" role="alert">{{ fatal }}</p>
    <section v-if="diagnosisMode" class="m-card">
      <p>传感器不能判断颜色、气味或食品安全，请手动确认。</p>
      <template v-if="feedingEvidence"><p v-if="feedingEvidence.unavailableReason" class="m-muted">{{ feedingEvidence.unavailableReason }}</p><p class="m-muted">{{ feedingEvidence.summary.historicalRound ? `历史轮次，截点为下一次喂养 ${feedingEvidence.summary.windowTo}` : '当前轮次' }} · 起始高度：{{ feedingEvidence.summary.baselineHeightMm == null ? '样本不足' : `${feedingEvidence.summary.baselineHeightMm.toFixed(1)} mm` }} · {{ feedingEvidence.summary.baselinePending ? '暂定' : '窗口已结束' }} · {{ feedingEvidence.summary.baselineSource === 'manual' ? '手工修正' : '传感器窗口' }}</p><p class="m-muted">膨胀率：{{ feedingEvidence.summary.expansionPercent == null ? '证据不足' : `${feedingEvidence.summary.expansionPercent.toFixed(1)}%` }}。温度取本轮有效采样均值。{{ feedingEvidence.summary.heightStale || feedingEvidence.summary.temperatureStale ? '最新证据超过 40 分钟，未预填。' : '' }}</p></template>
      <p v-if="notice" role="status">{{ notice }}</p>
    </section>
    <p v-if="!storageAvailable" class="m-error" role="status">本机存储不可用，关闭页面可能丢失草稿。</p>
    <form ref="formElement" @submit.prevent="step === 3 ? generate() : next()">
      <section v-show="step === 1" class="m-card">
        <h2>{{ diagnosisMode ? '确认本轮安全与涨幅' : '先确认本次安全观察' }}</h2>
        <p class="m-muted">不要品尝生酵种；无法判断请选“不确定”。</p>
        <label v-for="key in ['color', 'smell']" :key="key" class="m-field">
          <span>{{ fieldLabels[key] }}</span>
          <select v-model="draft[key]" :aria-invalid="!!errors[key]" :aria-describedby="`${key}-help`" @change="selectSafety(key)">
            <option disabled value="">请主动选择</option><option value="normal">未见异常</option><option value="suspicious">{{ key === 'color' ? '彩色斑块 / 绒毛霉菌' : '明显腐败 / 恶臭' }}</option><option value="unknown">不确定</option>
          </select>
          <span :id="`${key}-help`" class="m-muted">{{ key === 'color' ? '看粉红、绿、蓝、黑斑块或绒毛。' : '区分酸香、酒精味与腐败味。' }}</span>
          <span v-if="errors[key]" class="m-error">{{ errors[key] }}</span>
        </label>
        <label class="m-field"><span>请选择最主要的涨幅表现</span><select v-model="draft.height" :aria-invalid="!!errors.height" @change="markManual('height')"><option disabled value="">请选择</option><option v-for="item in mobileOptions.height" :key="item.value" :value="item.value">{{ item.label }}</option><option value="unknown">不确定</option></select><span v-if="errors.height" class="m-error">{{ errors.height }}</span></label>
        <details><summary>一句话填写（可选）</summary><label class="m-field">原文<textarea v-model="draft.quickText" rows="4" placeholder="如：成熟种，1:2:2，轻微上涨，温度26°C，经过4小时" /></label><button type="button" class="m-secondary" @click="parseText">识别为待确认字段</button><p role="status">{{ notice }}</p><ul><li v-for="(value, key) in pending" :key="key">{{ fieldLabels[key] }}：{{ describeField(key, value) }} <strong v-if="key === 'color' || key === 'smell'">请在上方重新主动选择；识别未作为答案。</strong><button v-else type="button" class="m-secondary" @click="applyPending(key)">确认此字段</button></li></ul></details>
      </section>
      <section v-show="step === 2" class="m-card">
        <h2>{{ diagnosisMode ? '确认诊断背景' : '补充这一轮背景' }}</h2>
        <label v-for="key in ['stage', 'ratio']" :key="key" class="m-field"><span>{{ fieldLabels[key] }}</span><select v-model="draft[key]" :aria-invalid="!!errors[key]" @change="markManual(key)"><option disabled value="">请选择</option><option v-for="item in mobileOptions[key]" :key="item.value" :value="item.value">{{ item.label }}</option><option value="unknown">不确定</option></select><span class="m-muted">来源：{{ describeSource(draft, key) }}</span><span v-if="errors[key]" class="m-error">{{ errors[key] }}</span></label>
        <p class="m-muted">按重量，顺序为老种 : 水 : 面粉。</p>
        <label v-for="key in ['tempC', 'elapsedHours']" :key="key" class="m-field"><span>{{ fieldLabels[key] }}（可空）</span><input v-model="draft[key]" type="number" step="any" inputmode="decimal" :aria-invalid="!!errors[key]" placeholder="未测量 / 不记得请留空" @input="markManual(key)"><span class="m-muted">来源：{{ describeSource(draft, key) }}</span><span v-if="errors[key]" class="m-error">{{ errors[key] }}</span></label>
        <p class="m-muted">温度填酵种实测值；未知留空。</p>
        <button type="button" class="m-secondary" :aria-expanded="extra" @click="extra = !extra">{{ extra ? '收起' : '补充' }} pH 与备注（可选）</button>
        <div v-show="extra"><label class="m-field">pH<input v-model="draft.ph" type="number" step="any" inputmode="decimal" :aria-invalid="!!errors.ph"><span v-if="errors.ph" class="m-error">{{ errors.ph }}</span></label><label class="m-field">备注<textarea v-model="draft.notes" rows="3" /></label></div>
      </section>
      <section v-show="step === 3" class="m-card">
        <h2>核对本次输入</h2>
        <p class="m-muted">请核对安全答案与已填项。</p>
        <dl><template v-for="key in summaryKeys" :key="key"><dt>{{ fieldLabels[key] }}</dt><dd>{{ describeField(key, draft[key]) }}<small class="m-muted"> · 来源：{{ describeSource(draft, key) }}</small></dd></template></dl>
        <p v-if="draft.notes" class="note">备注（请特别核查其中的异常描述）：{{ draft.notes }}</p>
        <p v-if="draft.quickText" class="note">原始一句话：{{ draft.quickText }}</p>
        <details><summary>未填项与建议说明</summary><dl v-if="emptySummaryKeys.length"><template v-for="key in emptySummaryKeys" :key="key"><dt>{{ fieldLabels[key] }}</dt><dd>{{ describeField(key, draft[key]) }}</dd></template></dl><p class="m-muted">未提供项保持为空；修改后生成新报告，不改写旧快照。</p></details>
        <button type="button" class="m-secondary" @click="draft.step = 1">修改观察</button> <button type="button" class="m-secondary" @click="draft.step = 2">修改背景</button>
      </section>
      <p v-if="Object.keys(errors).length" class="m-error" role="alert">请检查标出的字段，已填写内容已保留。</p>
      <div class="m-actions"><button v-if="step > 1" type="button" class="m-secondary" @click="back">上一步</button><button type="submit" class="m-primary">{{ step === 3 ? '生成建议（尚未云端保存）' : '下一步' }}</button></div>
    </form>
  </main>
</template>

<style scoped>
.mobile-checkin{max-width:42rem;margin:auto}
.m-context{margin:0;overflow-wrap:anywhere}
.m-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}
.m-actions .m-primary{flex:1}
.note,dd,li{overflow-wrap:anywhere;white-space:pre-wrap}
dt{font-weight:600;margin-top:.75rem}
dd{margin-left:0}
summary{min-height:44px;padding:.65rem 0;box-sizing:border-box;cursor:pointer}
li{margin:.75rem 0}
[aria-invalid=true]{outline:2px solid var(--danger-text)}
</style>
