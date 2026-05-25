import * as engine from './engine.js';
import { runBalance, runImpactAnalysis, applyOverrides } from './balance.js';
import { drawScatter, drawWinRate, drawHpCurves, drawCardUsage, drawCardHeatmap, drawCardImpact } from './charts.js';
import { PERSONAS } from './personas.js';
import { initEditTab, renderEditTab, getCardOverrides, getSymptomOverrides, getEditCount } from './edit-ui.js';

let _baseScenario = null;
let _deck = null;
let _lastResults = null;

// ─── OPEN / CLOSE ─────────────────────────────────────────────────────────────

export function openBalanceStudio(scenario, deck) {
  _baseScenario = scenario;
  _deck = deck;
  resetSetupTab(scenario);
  switchTab('setup');
  document.getElementById('balance-studio').classList.remove('hidden');
}

export function closeBalanceStudio() {
  document.getElementById('balance-studio').classList.add('hidden');
  _lastResults = null;
  _updateEditIndicator();
}

// ─── INIT (called once on page load) ─────────────────────────────────────────

export function initBalanceStudio() {
  // slider live value display
  document.querySelectorAll('.bs-range-wrap input[type=range]').forEach(el => {
    el.addEventListener('input', () => syncRangeDisplay(el));
  });

  document.getElementById('bs-close').addEventListener('click', closeBalanceStudio);
  document.getElementById('bs-reset').addEventListener('click', () => {
    if (_baseScenario) resetSetupTab(_baseScenario);
  });
  document.getElementById('bs-run').addEventListener('click', runSimulation);

  document.querySelectorAll('.bs-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // card analysis view toggle
  document.querySelectorAll('input[name="cardview"]').forEach(radio => {
    radio.addEventListener('change', () => refreshCardAnalysisView());
  });
  document.getElementById('bs-heatmap-persona').addEventListener('change', () => refreshCardAnalysisView());

  // impact tab
  document.getElementById('bs-impact-run').addEventListener('click', runImpact);
  document.getElementById('bs-impact-nruns').addEventListener('input', e => {
    syncRangeDisplay(e.target);
  });

  // edit tab
  initEditTab(runSimulation);
  document.addEventListener('edit:changed', _updateEditIndicator);
}

// ─── SETUP TAB ───────────────────────────────────────────────────────────────

function resetSetupTab(scenario) {
  setRange('bs-disease-hp', scenario.disease_hp);
  setRange('bs-patient-hp', scenario.patient_hp);
  setRange('bs-energy-max', scenario.energy_max);
  renderSymptomChecks(scenario.symptoms);
  document.getElementById('bs-scenario-label').textContent = scenario.name;
  document.getElementById('bs-status').textContent = '';
}

function renderSymptomChecks(active) {
  const names = Object.keys(engine.BASE_SYMPTOMS);
  const container = document.getElementById('bs-symptom-checks');
  container.innerHTML = '';
  for (const name of names) {
    const label = document.createElement('label');
    label.className = 'bs-sym-label';
    label.innerHTML = `<input type="checkbox" value="${name}" ${active.includes(name) ? 'checked' : ''}> ${name}`;
    container.appendChild(label);
  }
}

function getOverrides() {
  return {
    diseaseHp: +document.getElementById('bs-disease-hp').value,
    patientHp: +document.getElementById('bs-patient-hp').value,
    energyMax: +document.getElementById('bs-energy-max').value,
    symptoms:  [...document.querySelectorAll('#bs-symptom-checks input:checked')].map(el => el.value),
  };
}

function getPersonaKeys() {
  return [...document.querySelectorAll('.bs-persona-check:checked')].map(el => el.value);
}

function getNRuns() {
  return +document.getElementById('bs-nruns').value;
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

function switchTab(id) {
  document.querySelectorAll('.bs-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id)
  );
  document.querySelectorAll('.bs-tab-pane').forEach(p =>
    p.classList.toggle('hidden', p.dataset.tab !== id)
  );
  if (id === 'edit') renderEditTab();
}

function _updateEditIndicator() {
  const count = getEditCount();
  const btn = document.querySelector('.bs-tab-btn[data-tab="edit"]');
  if (!btn) return;
  if (count > 0) {
    btn.innerHTML = `편집 <span class="bs-edit-badge">${count}</span>`;
  } else {
    btn.textContent = '편집';
  }
}

// ─── RUN ─────────────────────────────────────────────────────────────────────

let _simRunning = false;

function _setAllRunBtns(disabled) {
  document.getElementById('bs-run').disabled        = disabled;
  document.getElementById('bs-edit-run').disabled   = disabled;
  document.getElementById('bs-impact-run').disabled = disabled;
}

async function runSimulation() {
  if (_simRunning) return;
  const overrides    = getOverrides();
  const personaKeys  = getPersonaKeys();
  const nRuns        = getNRuns();

  if (!personaKeys.length) { alert('페르소나를 하나 이상 선택하세요.'); return; }

  const fill     = document.getElementById('bs-progress-fill');
  const progress = document.getElementById('bs-progress');

  _simRunning = true;
  _setAllRunBtns(true);
  progress.classList.remove('hidden');
  fill.style.width = '0%';

  let results;
  try {
    results = await runBalance(
      _baseScenario, _deck, overrides, personaKeys, nRuns,
      pct => { fill.style.width = `${(pct * 100).toFixed(0)}%`; },
      getCardOverrides(), getSymptomOverrides()
    );
  } catch (err) {
    console.error('runBalance error:', err);
    alert(`시뮬레이션 오류: ${err.message}`);
    return;
  } finally {
    _simRunning = false;
    _setAllRunBtns(false);
    progress.classList.add('hidden');
  }

  _lastResults = results;
  syncHeatmapPersonaOptions(personaKeys);

  const totalGames = personaKeys.length * nRuns;
  document.getElementById('bs-status').textContent =
    `${nRuns}판 × ${personaKeys.length}페르소나 · 총 ${totalGames}게임 완료`;

  // switchTab first so canvases are visible when Chart.js measures dimensions
  switchTab('scatter');
  drawScatter('bs-scatter-canvas', results);
  drawWinRate('bs-winrate-canvas', results);
  drawHpCurves('bs-hpcurve-canvas', results);
  drawCardUsage('bs-cardusage-canvas', results);
}

function syncHeatmapPersonaOptions(personaKeys) {
  const sel = document.getElementById('bs-heatmap-persona');
  for (const opt of sel.options) {
    opt.disabled = !personaKeys.includes(opt.value);
  }
  // select first available
  const first = [...sel.options].find(o => !o.disabled);
  if (first) sel.value = first.value;
}

function refreshCardAnalysisView() {
  const view = document.querySelector('input[name="cardview"]:checked')?.value || 'usage';
  const usageArea   = document.getElementById('bs-usage-area');
  const heatmapArea = document.getElementById('bs-heatmap-area');
  const personaSel  = document.getElementById('bs-heatmap-persona');

  if (view === 'usage') {
    usageArea.classList.remove('hidden');
    heatmapArea.classList.add('hidden');
    personaSel.classList.add('hidden');
  } else {
    usageArea.classList.add('hidden');
    heatmapArea.classList.remove('hidden');
    personaSel.classList.remove('hidden');
    if (_lastResults) {
      const key = personaSel.value;
      const r   = _lastResults[key];
      if (r) {
        const maxTurn = Math.max(...r.games.map(g => g.turns), 1);
        drawCardHeatmap('bs-heatmap-container', r.cardStats, maxTurn);
      }
    }
  }
}

async function runImpact() {
  if (_simRunning) return;
  if (!_lastResults) { alert('먼저 시뮬레이션을 실행하세요.'); return; }
  const overrides  = getOverrides();
  const personaKey = document.getElementById('bs-impact-persona').value;
  const nRuns      = +document.getElementById('bs-impact-nruns').value;

  const fill     = document.getElementById('bs-impact-progress-fill');
  const progress = document.getElementById('bs-impact-progress');

  _simRunning = true;
  _setAllRunBtns(true);
  progress.classList.remove('hidden');
  fill.style.width = '0%';

  let impactData;
  try {
    impactData = await runImpactAnalysis(
      _baseScenario, _deck, overrides, personaKey, nRuns,
      pct => { fill.style.width = `${(pct * 100).toFixed(0)}%`; },
      getCardOverrides(), getSymptomOverrides()
    );
  } catch (err) {
    console.error('runImpactAnalysis error:', err);
    alert(`임팩트 분석 오류: ${err.message}`);
    return;
  } finally {
    _simRunning = false;
    _setAllRunBtns(false);
    progress.classList.add('hidden');
  }

  drawCardImpact('bs-impact-canvas', impactData);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function setRange(id, val) {
  const el = document.getElementById(id);
  el.value = val;
  syncRangeDisplay(el);
}

function syncRangeDisplay(el) {
  const display = el.parentElement.querySelector('.bs-range-val');
  if (display) display.textContent = el.value;
}
