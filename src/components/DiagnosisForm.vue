<script setup>
import { reactive, ref } from 'vue';
import ChoiceGroup from './ChoiceGroup.vue';
import { diagnosisService } from '../services/diagnosis.service.js';

const emit = defineEmits(['diagnosed']);
const options = diagnosisService.getOptions();

const naturalText = ref('');
const parseFeedback = ref('');
const form = reactive({
  stage: 'mature',
  ratio: '1:1:1',
  height: null,
  temp: 26,
  elapsedHours: '',
  smell: '',
  color: '',
  ph: '',
  notes: ''
});

function parseNatural() {
  if (!naturalText.value.trim()) {
    parseFeedback.value = '先输入一句描述，例如“成熟种，1:1:1，26℃，5小时接近翻倍”。';
    return;
  }

  const parsed = diagnosisService.parseNaturalLanguage(naturalText.value);
  let count = 0;
  for (const key of ['stage', 'ratio', 'height', 'temp', 'elapsedHours', 'smell', 'color', 'ph']) {
    if (parsed[key] != null && parsed[key] !== '') {
      form[key] = parsed[key];
      count += 1;
    }
  }
  if (parsed.contaminationNotes) form.notes = parsed.contaminationNotes;
  parseFeedback.value = count ? `已识别并填入 ${count} 项信息。` : '没有识别到明确字段，请继续手动填写。';
}

function diagnose() {
  emit('diagnosed', diagnosisService.diagnose({
    ...form,
    temp: form.temp === '' ? null : Number(form.temp),
    elapsedHours: form.elapsedHours === '' ? null : Number(form.elapsedHours),
    ph: form.ph === '' ? null : Number(form.ph)
  }));
}

function reset() {
  Object.assign(form, {
    stage: 'mature',
    ratio: '1:1:1',
    height: null,
    temp: 26,
    elapsedHours: '',
    smell: '',
    color: '',
    ph: '',
    notes: ''
  });
  naturalText.value = '';
  parseFeedback.value = '';
  emit('diagnosed', null);
}
</script>

<template>
  <section class="panel form-panel">
    <div class="section-title">
      <div>
        <p class="eyebrow">Diagnosis</p>
        <h2>告诉我这轮酵种发生了什么</h2>
      </div>
      <button class="text-button" type="button" @click="reset">重置</button>
    </div>

    <div class="natural-box">
      <label for="natural">一句话描述</label>
      <textarea
        id="natural"
        v-model="naturalText"
        rows="3"
        placeholder="例如：成熟种，1:1:1，26℃，5小时接近翻倍，酸香正常"
      />
      <div class="inline-actions">
        <button class="button ghost" type="button" @click="parseNatural">智能填入</button>
        <small>{{ parseFeedback }}</small>
      </div>
    </div>

    <div class="field-block">
      <label>当前阶段</label>
      <ChoiceGroup v-model="form.stage" :options="options.stages" :columns="2" />
    </div>

    <div class="field-block">
      <label>喂养比例</label>
      <ChoiceGroup v-model="form.ratio" :options="options.ratios" :columns="2" />
    </div>

    <div class="field-block">
      <label>体积 / 高度状态</label>
      <ChoiceGroup v-model="form.height" :options="options.heights" :columns="2" />
    </div>

    <div class="two-column">
      <label class="input-field">
        <span>温度（℃）</span>
        <input v-model="form.temp" type="number" min="0" max="45" step="0.1" />
      </label>
      <label class="input-field">
        <span>已观察小时</span>
        <input v-model="form.elapsedHours" type="number" min="0" max="96" step="0.5" placeholder="可留空" />
      </label>
    </div>

    <div class="three-column">
      <label class="input-field">
        <span>pH</span>
        <input v-model="form.ph" type="number" min="2.5" max="7" step="0.1" placeholder="可留空" />
      </label>
      <label class="input-field">
        <span>气味</span>
        <select v-model="form.smell">
          <option value="">未提供</option>
          <option value="酸香">酸香</option>
          <option value="酒精味">酒精味</option>
          <option value="腐臭">腐臭</option>
          <option value="氨味">氨味</option>
          <option value="霉味">霉味</option>
        </select>
      </label>
      <label class="input-field">
        <span>颜色 / 表面</span>
        <select v-model="form.color">
          <option value="">未提供</option>
          <option value="正常">正常</option>
          <option value="粉红">粉红</option>
          <option value="橙色">橙色</option>
          <option value="黑色斑点">黑色斑点</option>
          <option value="绿色斑点">绿色斑点</option>
          <option value="发霉长毛">发霉长毛</option>
        </select>
      </label>
    </div>

    <label class="input-field">
      <span>补充备注</span>
      <textarea v-model="form.notes" rows="3" placeholder="可补充气泡、液体层、霉变、面粉或维护情况" />
    </label>

    <button class="button primary wide" type="button" @click="diagnose">开始诊断</button>
  </section>
</template>
