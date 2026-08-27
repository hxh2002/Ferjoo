(() => {
  'use strict';
  const D = window.StarterDoctor;
  const $ = (id) => document.getElementById(id);
  const state = { stage:'mature', ratio:'1:1:1', height:null, temp:null, elapsed:null };

  function choose(containerId, value) {
    const el = $(containerId);
    if (!el) return;
    el.querySelectorAll('[data-value]').forEach(btn => btn.classList.toggle('selected', btn.dataset.value === value));
  }

  function bindChoice(containerId, key) {
    $(containerId).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (!btn) return;
      state[key] = btn.dataset.value;
      choose(containerId, state[key]);
      $('validationMessage').textContent = '';
    });
  }

  function updateTempUi() {
    const custom = $('tempToggle').checked;
    $('tempRange').disabled = !custom;
    state.temp = custom ? Number($('tempRange').value) : null;
    if (custom) {
      const t = D.normalizeTemp(state.temp);
      $('tempValue').textContent = state.temp;
      $('tempNote').textContent = t ? t.note : '';
    } else {
      $('tempValue').textContent = '25–28';
      $('tempNote').textContent = '未提供时默认';
    }
  }

  function updateElapsedUi() {
    const custom = $('elapsedToggle').checked;
    $('elapsedRange').disabled = !custom;
    state.elapsed = custom ? Number($('elapsedRange').value) : null;
    if (custom) {
      $('elapsedValue').textContent = state.elapsed;
      $('elapsedNote').textContent = '已提供';
    } else {
      $('elapsedValue').textContent = '1';
      $('elapsedNote').textContent = '未提供时默认';
    }
  }

  function buildInput() {
    return {
      stage: state.stage,
      ratio: state.ratio,
      height: state.height,
      temp: state.temp,
      elapsedHours: state.elapsed,
      smell: $('smell').value,
      color: $('color').value,
      notes: $('notes').value
    };
  }

  function timingInsight(result) {
    const el = $('timingInsight');
    el.className = 'insight-card is-hidden';
    if (result.elapsedHours == null) return;
    const e = result.elapsedHours;
    let msg = '', cls = '';
    if (e < result.expectedMin) {
      msg = `已观察 <b>${e} 小时</b>：还没到经验窗口起点（约 ${result.expectedMin} 小时）。现在更适合继续观察，而不是急着加餐。`;
    } else if (e <= result.expectedMax) {
      msg = `已观察 <b>${e} 小时</b>：正落在该比例与温度的经验窗口（约 ${result.expectedMin}–${result.expectedMax} 小时）。`;
      cls = ' ok';
    } else {
      msg = `已观察 <b>${e} 小时</b>：已经超过经验窗口上限（约 ${result.expectedMax} 小时），若仍未明显上升，偏慢判断更可信。`;
      cls = ' warn';
    }
    el.className = `insight-card${cls}`;
    el.innerHTML = msg;
  }

  function phInsight() {
    const raw = $('phValue').value;
    const el = $('phInsight');
    el.className = 'insight-card is-hidden';
    if (raw === '') return;
    const ph = Number(raw);
    let msg = '', cls = '';
    if (!Number.isFinite(ph) || ph < 2.5 || ph > 7) {
      msg = 'pH 数值看起来异常，请先核对测量或输入。';
      cls = ' warn';
    } else if (ph < 3.3) {
      msg = `pH <b>${ph.toFixed(1)}</b>：低于品牌知识库的 3.3–3.8 目标区间，酸度偏高。结合是否回落/饥饿判断，不单独把 pH 当作安全结论。`;
      cls = ' warn';
    } else if (ph <= 3.8) {
      msg = `pH <b>${ph.toFixed(1)}</b>：落在品牌知识库给出的 3.3–3.8 目标区间内；其中 3.5 是该知识库的经验目标点。`;
      cls = ' ok';
    } else if (ph < 4.6) {
      msg = `pH <b>${ph.toFixed(1)}</b>：高于品牌目标区间，但已经低于 4.6 这一常用酸化安全参考线。成熟度仍需结合活性与污染观察。`;
    } else {
      msg = `pH <b>${ph.toFixed(1)}</b>：尚高于 4.6 的酸化参考线。若是起种早期可继续建立菌群；若已声称成熟，建议继续规律喂养并复测。`;
      cls = ' warn';
    }
    el.className = `insight-card${cls}`;
    el.innerHTML = msg + '<br><small>pH 仅作辅助；生面粉/生酵种不应直接食用，最终仍需充分烘烤。</small>';
  }

  function renderResult(result) {
    $('emptyResult').classList.add('is-hidden');
    $('resultContent').classList.remove('is-hidden');
    $('statusBadge').className = `status-badge ${result.level}`;
    const labels = {ok:'良好', warn:'需注意', danger:'需处理', info:'观察'};
    $('statusBadge').textContent = labels[result.level] || result.level;
    $('stateTitle').textContent = result.state;
    $('stageMetric').textContent = result.stageLabel;
    $('ratioMetric').textContent = result.ratioLabel;
    $('hoursMetric').textContent = result.expectedHours;
    $('tempMetric').textContent = result.tempLabel + (result.tempNote ? ` · ${result.tempNote}` : '');
    $('reasonsList').innerHTML = result.reasons.map(x => `<li>${escapeHtml(x)}</li>`).join('');
    $('actionsList').innerHTML = result.actions.map(x => `<li>${escapeHtml(x)}</li>`).join('');
    const safety = $('safetyBox');
    if (result.safety.length) {
      safety.classList.remove('is-hidden');
      $('safetyList').innerHTML = result.safety.map(x => `<li>${escapeHtml(x)}</li>`).join('');
    } else {
      safety.classList.add('is-hidden');
      $('safetyList').innerHTML = '';
    }
    timingInsight(result);
    phInsight();
    window.__lastDiagnosis = result;
    resultPanelFlash(result.level);
  }

  function resultPanelFlash(level) {
    const panel = document.querySelector('.result-panel');
    panel.animate(
      [{transform:'translateY(3px)', boxShadow:'0 18px 60px rgba(108,49,17,.12)'},{transform:'translateY(0)', boxShadow:'0 24px 80px rgba(108,49,17,.18)'}],
      {duration:280,easing:'ease-out'}
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function diagnose() {
    if (!state.height) {
      $('validationMessage').textContent = '请先选择当前高度状态；这是判断活性位置的关键输入。';
      $('heightChoices').scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }
    $('validationMessage').textContent = '';
    renderResult(D.diagnoseStarter(buildInput()));
    if (window.innerWidth < 1080) document.querySelector('.result-panel').scrollIntoView({behavior:'smooth', block:'start'});
  }

  function parseNatural() {
    const text = $('naturalInput').value.trim();
    if (!text) {
      $('parseFeedback').textContent = '先输入一句描述，例如“成熟种，1:1:1，26℃，5小时接近翻倍”。';
      return;
    }
    const parsed = D.parseStarterInput(text);
    let n = 0;
    if (parsed.stage) { state.stage = parsed.stage; choose('stageChoices', parsed.stage); n++; }
    if (parsed.ratio) { state.ratio = parsed.ratio; choose('ratioChoices', parsed.ratio); n++; }
    if (parsed.height) { state.height = parsed.height; choose('heightChoices', parsed.height); n++; }
    if (parsed.temp != null) {
      $('tempToggle').checked = true;
      const tempNum = typeof parsed.temp === 'number' ? parsed.temp : null;
      if (tempNum != null) $('tempRange').value = Math.min(40, Math.max(8, tempNum));
      updateTempUi(); n++;
    }
    if (parsed.elapsedHours != null) {
      $('elapsedToggle').checked = true;
      $('elapsedRange').value = Math.min(48, Math.max(0, parsed.elapsedHours));
      updateElapsedUi(); n++;
    }
    if (parsed.ph != null) { $('phValue').value = parsed.ph; n++; }
    $('parseFeedback').textContent = n ? `已识别并填入 ${n} 项信息，你可以继续手动调整。` : '没有识别到明确的阶段/比例/高度/温度，请改用下面的选项填写。';
  }

  function reset() {
    state.stage = 'mature'; state.ratio = '1:1:1'; state.height = null; state.temp = null; state.elapsed = null;
    choose('stageChoices','mature'); choose('ratioChoices','1:1:1');
    $('heightChoices').querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
    $('tempToggle').checked = false; $('tempRange').value = 26; updateTempUi();
    $('elapsedToggle').checked = false; $('elapsedRange').value = 1; updateElapsedUi();
    ['naturalInput','phValue','notes'].forEach(id => $(id).value = '');
    $('smell').value = ''; $('color').value = '';
    $('parseFeedback').textContent = '';
    $('validationMessage').textContent = '';
    $('emptyResult').classList.remove('is-hidden'); $('resultContent').classList.add('is-hidden');
    window.__lastDiagnosis = null;
  }

  async function copyReport() {
    const result = window.__lastDiagnosis;
    if (!result) return;
    let text = D.formatAdvice(result);
    const ph = $('phValue').value;
    if (ph) text += `\n辅助 pH：${ph}`;
    try {
      await navigator.clipboard.writeText(text);
      $('copyBtn').textContent = '已复制';
      setTimeout(() => $('copyBtn').textContent = '复制', 1300);
    } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      $('copyBtn').textContent = '已复制';
      setTimeout(() => $('copyBtn').textContent = '复制', 1300);
    }
  }

  bindChoice('stageChoices','stage');
  bindChoice('ratioChoices','ratio');
  bindChoice('heightChoices','height');
  $('tempToggle').addEventListener('change', updateTempUi);
  $('tempRange').addEventListener('input', updateTempUi);
  $('elapsedToggle').addEventListener('change', updateElapsedUi);
  $('elapsedRange').addEventListener('input', updateElapsedUi);
  $('parseBtn').addEventListener('click', parseNatural);
  $('naturalInput').addEventListener('keydown', e => { if (e.key === 'Enter') parseNatural(); });
  $('diagnoseBtn').addEventListener('click', diagnose);
  $('resetBtn').addEventListener('click', reset);
  $('copyBtn').addEventListener('click', copyReport);

  const howModal = $('howModal');
  function openHow() { howModal.classList.remove('is-hidden'); document.body.style.overflow = 'hidden'; }
  function closeHow() { howModal.classList.add('is-hidden'); document.body.style.overflow = ''; }
  $('howEntry').addEventListener('click', openHow);
  $('howClose').addEventListener('click', closeHow);
  howModal.addEventListener('click', (e) => { if (e.target === howModal) closeHow(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !howModal.classList.contains('is-hidden')) closeHow(); });

  const aboutModal = $('aboutModal');
  function openAbout() { aboutModal.classList.remove('is-hidden'); document.body.style.overflow = 'hidden'; }
  function closeAbout() { aboutModal.classList.add('is-hidden'); document.body.style.overflow = ''; }
  $('aboutEntry').addEventListener('click', openAbout);
  $('aboutClose').addEventListener('click', closeAbout);
  aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) closeAbout(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !aboutModal.classList.contains('is-hidden')) closeAbout(); });

  updateTempUi();
  updateElapsedUi();
})();
