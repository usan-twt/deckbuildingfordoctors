import { bus } from './src/events.js';
import { buildCards, buildSymptoms } from './src/data.js';
import { initPool, getDefaultDeck, setDeck, playerDeck } from './src/deck.js';
import * as engine from './src/engine.js';
import { renderPatient, showResult, renderDeckBuilder } from './src/render.js';

const SCENARIO_LIST = [
  { file: 'tutorial',          name: 'T-1: 급성 악화 감기', meta: '본체 28HP · 환자 30HP · 발열+탈수' },
  { file: 't2_food_poisoning', name: 'T-2: 시장 식중독',    meta: '본체 30HP · 환자 28HP · 발열+감염' },
  { file: 't3_laceration',     name: 'T-3: 작업장 열상',    meta: '본체 26HP · 환자 26HP · 출혈+통증' },
  { file: 't4_dock_fall',      name: 'T-4: 부두 낙상',      meta: '본체 28HP · 환자 26HP · 출혈+탈수' },
];

let _pendingScenario = null;

function log(msg) { bus.dispatchEvent(new CustomEvent('log', { detail: msg })); }

async function startScenario(idx) {
  const chosen = SCENARIO_LIST[idx];
  let scenario;
  try {
    scenario = await fetch(`./scenarios/${chosen.file}.json`).then(r => r.json());
  } catch (err) {
    alert('시나리오 로딩 실패: ' + err.message);
    return;
  }

  _pendingScenario = scenario;
  setDeck(getDefaultDeck());

  document.getElementById('scenario-overlay').classList.add('hidden');
  document.getElementById('db-scenario-label').textContent = chosen.name;
  document.getElementById('deck-builder').classList.remove('hidden');
  renderDeckBuilder();
}

async function runScenario(scenario) {
  engine.newGame(scenario, [...playerDeck]);
  renderPatient(scenario);

  log(`[ ${scenario.name} ]`);
  log('카드를 클릭해 플레이. 턴 종료 버튼으로 다음 단계.\n');

  while (true) {
    const result = await engine.runTurn();
    if (result === 'win') {
      showResult('치료 성공', `${engine.G.turn}턴 · 환자 HP ${engine.G.patientHp}/${engine.G.maxHp}`);
      break;
    }
    if (result === 'lose') {
      showResult('치료 실패', `${engine.G.turn}턴 · 환자 HP 0`);
      break;
    }
  }
}

(async () => {
  let cardsRaw, symptomsRaw;
  try {
    [cardsRaw, symptomsRaw] = await Promise.all([
      fetch('./data/cards.json').then(r => r.json()),
      fetch('./data/symptoms.json').then(r => r.json()),
    ]);
    engine.loadData(buildCards(cardsRaw), buildSymptoms(symptomsRaw));
    initPool();
  } catch (err) {
    document.getElementById('scenario-overlay').innerHTML =
      `<div style="padding:40px;font-family:monospace">데이터 로딩 실패: ${err.message}<br>서버에서 실행해주세요.</div>`;
    return;
  }

  const listEl = document.getElementById('scenario-list');
  SCENARIO_LIST.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'scenario-item';
    item.innerHTML = `<div class="s-name">${s.name}</div><div class="s-meta">${s.meta}</div>`;
    item.addEventListener('click', () => startScenario(i));
    listEl.appendChild(item);
  });

  document.getElementById('btn-turn-end').addEventListener('click', () => {
    engine.resolveTurnEnd();
  });
  document.getElementById('btn-log').addEventListener('click', () => {
    document.getElementById('log-panel').classList.remove('hidden');
  });
  document.getElementById('btn-close-log').addEventListener('click', () => {
    document.getElementById('log-panel').classList.add('hidden');
  });
  document.getElementById('btn-deck-view').addEventListener('click', () => {
    const G = engine.G;
    if (!G) return;
    const all = [...G.deck, ...G.discard, ...G.hand.filter(Boolean)].sort();
    log('\n[덱 전체] ' + all.join(', '));
    document.getElementById('log-panel').classList.remove('hidden');
  });

  document.getElementById('btn-default-deck').addEventListener('click', () => {
    setDeck(getDefaultDeck());
    renderDeckBuilder();
  });
  document.getElementById('btn-start-battle').addEventListener('click', () => {
    document.getElementById('deck-builder').classList.add('hidden');
    runScenario(_pendingScenario);
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('result-overlay').classList.add('hidden');
    document.getElementById('deck-builder').classList.remove('hidden');
    renderDeckBuilder();
  });
})();
