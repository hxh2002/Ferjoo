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
      ph: $('phValue').value,
      notes: $('notes').value
    };
  }

  function timingInsight(result) {
    const el = $('timingInsight');
    el.className = 'insight-card is-hidden';
    if (result.elapsedHours == null) return;
    const e = result.elapsedHours;
    let msg = '', cls = '';
    if (!result.expectedReliable) {
      if (result.expectedReason === 'high-temperature-nonlinear') {
        msg = `已观察 <b>${e} 小时</b>，但当前温度过高，不适合继续按常规时间估算；先降温后重新计时。`;
        cls = ' warn';
      } else {
        msg = `已记录 <b>${e} 小时</b>；当前阶段使用阶段专属判断，不套用成熟种的统一翻倍时间表。`;
      }
    } else if (e < result.expectedMin) {
      msg = `已观察 <b>${e} 小时</b>：还没到常见时间范围的起点（约 ${result.expectedMin} 小时）。现在更适合继续观察，而不是急着加餐。`;
    } else if (e <= result.expectedMax) {
      msg = `已观察 <b>${e} 小时</b>：正落在该比例与温度的常见时间范围（约 ${result.expectedMin}–${result.expectedMax} 小时）。`;
      cls = ' ok';
    } else {
      msg = `已观察 <b>${e} 小时</b>：已经超过常见时间范围上限（约 ${result.expectedMax} 小时），若仍未明显上升，偏慢判断更可信。`;
      cls = ' warn';
    }
    el.className = `insight-card${cls}`;
    el.innerHTML = msg;
  }

  function phInsight(result) {
    const el = $('phInsight');
    el.className = 'insight-card is-hidden';
    if (!result.phAssessment) return;
    const assessment = result.phAssessment;
    const cls = assessment.level === 'ok' ? ' ok' : assessment.level === 'warn' ? ' warn' : '';
    const shown = assessment.value == null ? '输入无效' : Number(assessment.value).toFixed(1);
    el.className = `insight-card${cls}`;
    el.innerHTML = `pH <b>${escapeHtml(shown)}</b>：${escapeHtml(assessment.message)}<br><small>pH 仅作辅助；生面粉/生酵种不应直接食用，最终仍需充分烘烤。</small>`;
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
    const evidence = (Array.isArray(result.citations) ? result.citations : [])
      .filter(item => item && item.public !== false && item.type !== 'unresolved');
    $('evidenceSection').classList.toggle('is-hidden', evidence.length === 0);
    $('evidenceList').innerHTML = evidence.map(item => {
      const kind = item.kind || ({'primary-research':'原始研究','peer-reviewed-review':'综述','official-extension-guidance':'官方指南','regulatory-guidance':'官方指南'}[item.type] || '资料');
      const meta = [item.authorsShort, item.source, item.year].filter(Boolean).map(escapeHtml).join(' · ');
      const title = escapeHtml(item.title || item.citation || '');
      const note = item.displayNote ? `<p class="reference-note">${escapeHtml(item.displayNote)}</p>` : '';
      const link = item.url
        ? `<a class="reference-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">查看原文 ↗</a>`
        : '';
      return `<article class="reference-card">
        <div class="reference-card-top">
          <span class="reference-type">${escapeHtml(kind)}</span>
          <span class="reference-meta">${meta}</span>
        </div>
        <strong class="reference-title">${title}</strong>
        ${note}
        ${link}
      </article>`;
    }).join('');
    timingInsight(result);
    phInsight(result);
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
    const input = buildInput();
    const result = D.diagnoseStarter(input);
    if (result.state === '已污染（不可使用）') {
      $('validationMessage').textContent = '';
      renderResult(result);
      return;
    }
    if (!state.height) {
      $('validationMessage').textContent = '尚未选择高度状态：已先给出“信息不足/阶段基线”判断；补充体积变化后可获得更精确结论。';
      renderResult(result);
      return;
    }
    $('validationMessage').textContent = '';
    renderResult(result);
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
      const tempNum = typeof parsed.temp === 'number'
        ? parsed.temp
        : (parsed.tempC != null ? Number(parsed.tempC) : null);
      if (tempNum != null && Number.isFinite(tempNum)) {
        $('tempRange').value = Math.min(40, Math.max(8, tempNum));
        updateTempUi();
      } else {
        const tempObj = D.normalizeTemp(parsed.temp);
        const midpoint = {
          t_lt15: 12, t_15_18: 17, t_18_22: 20, t_22_25: 24,
          t_25_28: 26, t_28_32: 30, t_gt32: 35
        };
        $('tempRange').disabled = false;
        if (tempObj && midpoint[tempObj.value] != null) $('tempRange').value = midpoint[tempObj.value];
        state.temp = tempObj ? tempObj.value : parsed.temp;
        $('tempValue').textContent = tempObj ? tempObj.label.replace('℃', '') : String(parsed.temp);
        $('tempNote').textContent = tempObj ? `${tempObj.note} · 文本识别为温区` : '文本识别为温区';
      }
      n++;
    }
    if (parsed.elapsedHours != null) {
      $('elapsedToggle').checked = true;
      $('elapsedRange').value = Math.min(48, Math.max(0, parsed.elapsedHours));
      updateElapsedUi(); n++;
    }
    if (parsed.ph != null) { $('phValue').value = parsed.ph; n++; }
    if (parsed.color) { $('color').value = parsed.color; n++; }
    if (parsed.smell) { $('smell').value = parsed.smell; n++; }
    if (parsed.contaminationNotes) { $('notes').value = parsed.contaminationNotes; }
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
    const text = D.formatAdvice(result);
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
