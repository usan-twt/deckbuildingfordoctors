import * as engine from './engine.js';
import { runBalance, applyOverrides } from './balance.js';
import { drawScatter, drawWinRate, drawHpCurves } from './charts.js';
import { PERSONAS } from './personas.js';

let _baseScenario = null;
let _deck = null;

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
}

// ─── RUN ─────────────────────────────────────────────────────────────────────

async function runSimulation() {
  const overrides    = getOverrides();
  const personaKeys  = getPersonaKeys();
  const nRuns        = getNRuns();

  if (!personaKeys.length) { alert('페르소나를 하나 이상 선택하세요.'); return; }

  const btn      = document.getElementById('bs-run');
  const fill     = document.getElementById('bs-progress-fill');
  const progress = document.getElementById('bs-progress');

  btn.disabled = true;
  progress.classList.remove('hidden');
  fill.style.width = '0%';

  const results = await runBalance(
    _baseScenario, _deck, overrides, personaKeys, nRuns,
    pct => { fill.style.width = `${(pct * 100).toFixed(0)}%`; }
  );

  btn.disabled = false;
  progress.classList.add('hidden');

  const totalGames = personaKeys.length * nRuns;
  document.getElementById('bs-status').textContent =
    `${nRuns}판 × ${personaKeys.length}페르소나 · 총 ${totalGames}게임 완료`;

  drawScatter('bs-scatter-canvas', results);
  drawWinRate('bs-winrate-canvas', results);
  drawHpCurves('bs-hpcurve-canvas', results);

  switchTab('scatter');
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
