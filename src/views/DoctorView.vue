<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import ChoiceGroup from '../components/ChoiceGroup.vue';
import DiagnosisResult from '../components/DiagnosisResult.vue';
import { HEIGHTS, RATIOS, STAGES, parseStarterInput } from '../algorithms/index.js';
import { diagnoseFromForm } from '../services/diagnosis.service.js';
import { useAuth } from '../composables/useAuth.js';

const auth = useAuth();
const quickText = ref('');
const result = ref(null);
const advanced = ref(false);
const quickOpen = ref(false);
const tempEnabled = ref(false);
const elapsedEnabled = ref(false);
const loginRequired = ref(false);

onMounted(() => auth.init());

const form = reactive({
  stage: 'mature',
  ratio: '1:2:2',
  height: 'slight',
  tempC: 26,
  elapsedHours: 1,
  color: 'normal',
  smell: 'normal',
  ph: '',
  notes: ''
});

const stageOptions = STAGES.map((x) => ({
  ...x,
  description: {
    mature: '已经能重复建立稳定周期',
    start_d1: '刚混合面粉与水',
    start_active: '早期明显活跃但还不稳定',
    start_stable: '多个周期逐渐接近一致',
    revive: '从冷藏或低活性状态恢复',
    fridge: '当前处于低温维护'
  }[x.value]
}));

const ratioOptions = RATIOS.map((x) => ({
  ...x,
  description: x.value === 'deep_reset' ? '用于较大幅度稀释酸度/旧料' : '老种 : 水 : 面粉'
}));

const heightOptions = HEIGHTS.map((x) => ({
  ...x,
  description: {
    none: '起始线附近',
    slight: '有气泡或略有抬升',
    near: '还差一点到 2 倍',
    double: '达到约 2×',
    peak_plus: '超过 2× 且仍在高位',
    over3: '明显超过 3×',
    fallen: '罐壁留有峰值痕迹',
    hooch: '顶部出现酒精液层'
  }[x.value]
}));

const heightJarClass = computed(() => `height-${form.height}`);

function applyQuickText() {
  const parsed = parseStarterInput(quickText.value);
  Object.assign(form, parsed);
  if (parsed.tempC != null) tempEnabled.value = true;
  if (parsed.elapsedHours != null) elapsedEnabled.value = true;
}

async function runDiagnosis() {
  if (!auth.ready.value) await auth.init();
  if (!auth.user.value) {
    loginRequired.value = true;
    return;
  }
  const payload = {
    ...form,
    tempC: tempEnabled.value ? form.tempC : undefined,
    elapsedHours: elapsedEnabled.value ? form.elapsedHours : 1
  };
  result.value = diagnoseFromForm(payload);
  requestAnimationFrame(() => {
    if (window.innerWidth < 1080) document.querySelector('.result-panel')?.scrollIntoView({ behavior: 'smooth' });
  });
}
</script>

<template>
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">SOURDOUGH STARTER DIAGNOSTIC</p>
      <h1>让每一次发酵，<br><span>都有迹可循。</span></h1>
      <p class="hero-lead">Ferment with joy.</p>
    </div>
  </section>

  <section class="diagnostic-layout">
    <form class="panel input-panel" @submit.prevent="runDiagnosis">
      <div class="panel-heading">
        <div>
          <p class="eyebrow dark">FERMENTATION CHECK-IN</p>
          <div class="panel-heading-title">
            <h2>这一轮，发生了什么？</h2>
            <button class="quick-text-entry" type="button" @click="quickOpen = true">一句话快速填写</button>
          </div>
        </div>
        <span class="step-pill">01 / INPUT</span>
      </div>

      <ChoiceGroup v-model="form.stage" label="01 · 你的酵种处在哪个阶段？" :options="stageOptions" />
      <ChoiceGroup class="ratio-group" v-model="form.ratio" label="02 · 这一轮的刷新比例？" hint="老种 : 水 : 面粉" :options="ratioOptions" />

      <fieldset class="field-block height-field">
        <legend><span>03 · 现在涨到哪里了？</span><small>以刷新后的起始高度为 1×</small></legend>
        <div class="height-layout">
          <div class="choice-grid height-choices">
            <button
              v-for="item in heightOptions"
              :key="item.value"
              class="choice-card compact"
              :class="{ selected: form.height === item.value }"
              type="button"
              @click="form.height = item.value"
            >
              <span class="choice-dot"></span>
              <span class="choice-copy"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
            </button>
          </div>
          <div class="height-visual" aria-hidden="true">
            <div class="mini-jar">
              <span class="level level-3">3×</span>
              <span class="level level-2">2×</span>
              <span class="level level-1">1×</span>
              <span class="starter-fill" :class="heightJarClass"></span>
              <span v-if="form.height === 'fallen'" class="peak-mark"></span>
              <span v-if="form.height === 'hooch'" class="hooch-layer"></span>
            </div>
          </div>
        </div>
      </fieldset>

      <div class="slider-grid">
        <fieldset class="field-block slider-field">
          <legend>
            <span>04 · 温度</span>
            <label class="switch">
              <input v-model="tempEnabled" type="checkbox" aria-label="是否提供环境温度" />
              <i></i>
            </label>
          </legend>
          <div class="slider-card">
            <div class="temp-control">
              <div class="range-value">
                <strong>{{ `${form.tempC}°C` }}</strong>
                <span>{{ tempEnabled ? '已提供' : '未提供时默认' }}</span>
              </div>
              <input
                v-model.number="form.tempC"
                class="range"
                type="range"
                min="8"
                max="40"
                step="1"
                :disabled="!tempEnabled"
              />
              <div class="range-scale"><span>8°C</span><span>24°C</span><span>40°C</span></div>
            </div>
          </div>
        </fieldset>

        <fieldset class="field-block slider-field">
          <legend>
            <span>05 · 喂养后经过时间</span>
            <label class="switch">
              <input v-model="elapsedEnabled" type="checkbox" aria-label="是否提供喂养后经过时间" />
              <i></i>
            </label>
          </legend>
          <div class="slider-card">
            <div class="temp-control">
              <div class="range-value">
                <strong>{{ `${form.elapsedHours} h` }}</strong>
                <span>{{ elapsedEnabled ? '已提供' : '默认 1h' }}</span>
              </div>
              <input
                v-model.number="form.elapsedHours"
                class="range"
                type="range"
                min="0"
                max="48"
                step="1"
                :disabled="!elapsedEnabled"
              />
              <div class="range-scale"><span>0h</span><span>24h</span><span>48h</span></div>
            </div>
          </div>
        </fieldset>
      </div>

      <div class="select-grid">
        <label>
          <span>外观 / 颜色</span>
          <select v-model="form.color">
            <option value="normal">米白 / 麦色 / 正常</option>
            <option value="suspicious">粉红、橙红、绿、蓝、黑或绒毛霉菌</option>
          </select>
        </label>
        <label>
          <span>气味</span>
          <select v-model="form.smell">
            <option value="normal">酸香、果香、酵母、酒香或正常</option>
            <option value="suspicious">明显腐败、恶臭或霉味</option>
          </select>
        </label>
      </div>

      <button class="advanced-toggle" type="button" @click="advanced = !advanced">
        {{ advanced ? '收起高级信息' : '添加 pH 与观察备注' }} <span>{{ advanced ? '−' : '+' }}</span>
      </button>

      <div v-if="advanced" class="advanced-grid">
        <label>
          <span>pH（可选）</span>
          <input v-model="form.ph" type="number" min="2" max="8" step="0.1" placeholder="例如 3.8" />
        </label>
        <label>
          <span>观察备注</span>
          <textarea v-model="form.notes" rows="3" placeholder="例如：顶部出现绿色绒毛、今天换了全麦粉……"></textarea>
        </label>
      </div>

      <button class="diagnose-button" type="submit">
        <span>开始诊断</span>
        <b>DIAGNOSE →</b>
      </button>
      <p v-if="!auth.user.value" class="login-gate-note">诊断功能需要登录账号后使用，点击“开始诊断”后将提示登录。</p>
    </form>

    <DiagnosisResult :result="result" />
  </section>

  <Teleport to="body">
    <div v-if="quickOpen" class="modal-backdrop" @click.self="quickOpen = false">
      <section class="quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-title">
        <button class="modal-close" type="button" aria-label="关闭" @click="quickOpen = false">×</button>
        <p class="eyebrow dark">QUICK INPUT</p>
        <h2 id="quick-title">一句话告诉我这一轮状态</h2>
        <p class="quick-modal-lead">支持识别阶段、比例、高度、温度、已过时间、pH 与明显污染描述。</p>
        <input
          id="quickText"
          v-model="quickText"
          class="quick-modal-input"
          type="text"
          placeholder="例如：成熟酵种 1:2:2，26°C，4 小时，接近翻倍，pH 3.8"
          @keydown.enter.prevent="applyQuickText(); quickOpen = false"
        />
        <div class="quick-modal-actions">
          <button class="ghost-button" type="button" @click="quickOpen = false">取消</button>
          <button class="small-primary" type="button" @click="applyQuickText(); quickOpen = false">解析并带入</button>
        </div>
      </section>
    </div>
    <div v-if="loginRequired" class="modal-backdrop" @click.self="loginRequired = false">
      <section class="gate-modal" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" aria-label="关闭" @click="loginRequired = false">×</button>
        <p class="eyebrow dark">LOGIN REQUIRED</p>
        <h2>请先登录账号</h2>
        <p class="gate-text">未登录账号无法使用诊断功能。登录或创建账号后即可继续，感谢你的理解。</p>
        <div class="gate-actions">
          <RouterLink class="small-primary gate-login" to="/login">去登录</RouterLink>
          <RouterLink class="ghost-button" to="/register">创建账号</RouterLink>
        </div>
      </section>
    </div>
  </Teleport>
</template>
