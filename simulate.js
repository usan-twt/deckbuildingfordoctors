/**
 * §8 튜토리얼 시뮬레이션 — 능숙한 플레이 (4턴 승리) 자동 검증.
 * node simulate.js
 */
const path = require('path');
const { BattleState, SymptomState } = require('./engine/state');
const { loadCards, playCard, getCardData } = require('./engine/card');
const { loadSymptoms, symptomPhase } = require('./engine/symptom');

const ROOT = __dirname;
loadCards(path.join(ROOT, 'data/cards.json'));
loadSymptoms(path.join(ROOT, 'data/symptoms.json'));

function makeState() {
  return new BattleState({
    diseaseHp: 28, patientHp: 30, maxPatientHp: 30,
    energyMax: 2,
    symptoms: [new SymptomState('발열'), new SymptomState('탈수')],
    deck: [],
  });
}

async function fixedTurn(st, turnN, cards, suppressTargets = {}) {
  st.turn = turnN;
  st.energy = st.energyMax;
  st.treatmentBuff = 0;
  st.treatmentDebuff = 0;
  st.defenseReduce = 0;
  st.costReduceNext = 0;
  st.defenseTotal = 0;

  const symStr = st.symptoms.map(s =>
    s.suppressed > 0 ? `${s.name}[억제${s.suppressed}]` : `${s.name}[활성]`
  ).join(', ');
  console.log(`\n${'='.repeat(50)}`);
  console.log(`턴 ${turnN} | 에너지 ${st.energy} | 환자 HP ${st.patientHp} | 본체 HP ${st.diseaseHp}`);
  console.log(`증상: ${symStr}`);

  const CD = getCardData();
  for (const cardId of cards) {
    st.energy -= CD[cardId].cost;
    await playCard(st, cardId, null, suppressTargets[cardId] || null);
    if (st.diseaseHp <= 0) { console.log('  ★ 본체 HP 0 → 승리!'); return true; }
  }

  console.log('  [증상 페이즈]');
  symptomPhase(st);
  console.log(`  → 환자 HP ${st.patientHp} | 본체 HP ${st.diseaseHp}`);
  return false;
}

(async () => {
  console.log('=== §8 능숙한 플레이 (4턴 승리) ===');
  console.log('기대: 본체 28→20→14→6→0, 환자 30→28→25→25, 4턴 승리');

  const st = makeState();

  // 턴1: 청진+투약+수액
  await fixedTurn(st, 1, ['청진', '투약', '수액투여']);
  // 턴2: 대증처치(탈수 억제)+투약
  await fixedTurn(st, 2, ['대증처치', '투약'], { '대증처치': '탈수' });
  // 턴3: 청진+투약+경과관찰
  await fixedTurn(st, 3, ['청진', '투약', '경과관찰']);
  // 턴4: 응급시술
  await fixedTurn(st, 4, ['응급시술']);

  const ok = st.patientHp === 25 && st.diseaseHp <= 0;
  console.log(`\n최종: 환자 HP ${st.patientHp}/30 (기대 25)`);
  console.log(ok ? '✅ 검증 통과' : '❌ 검증 실패');
})();
