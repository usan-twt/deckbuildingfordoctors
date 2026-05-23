const { playCard, getCardData } = require('./card');
const { symptomPhase, getSymptomsData } = require('./symptom');

const DRAW_PER_TURN = 4;

async function runTurn(st, rl) {
  st.turn++;
  st.energy = st.energyMax;
  st.treatmentBuff = 0;
  st.treatmentDebuff = 0;
  st.defenseReduce = 0;
  st.costReduceNext = 0;
  st.defenseTotal = 0;

  // 드로우 수 계산
  const SD = getSymptomsData();
  let drawN = DRAW_PER_TURN;
  for (const s of st.symptoms) {
    if (s.suppressed === 0) {
      const d = SD[s.name] || {};
      if (d.fixed_draw) { drawN = d.fixed_draw; break; }
      drawN -= (d.draw_reduce || 0);
    }
  }
  drawN = Math.max(2, drawN);

  st.hand = [];
  st.drawCards(drawN);
  printStatus(st);

  // 카드 플레이 루프
  while (true) {
    const CD = getCardData();
    const handStr = st.hand.map((id, i) => `[${i}]${id}(${CD[id].cost})`).join('  ');
    console.log(`\n핸드: ${handStr}`);
    console.log(`에너지: ${st.energy}/${st.energyMax}`);

    const inp = await question(rl, '카드 번호 (공백 구분, 엔터=턴 종료): ');
    if (!inp.trim()) break;

    const indices = inp.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
    for (const idx of indices) {
      if (idx >= st.hand.length || st.hand[idx] === null) { console.log(`  ${idx} 없음`); continue; }
      const cardId = st.hand[idx];
      const cost = Math.max(0, CD[cardId].cost - st.costReduceNext);
      st.costReduceNext = 0;
      if (st.energy < cost) { console.log(`  에너지 부족 (${st.energy}/${cost})`); continue; }
      st.energy -= cost;
      st.hand[idx] = null;
      await playCard(st, cardId, rl);
      if (st.diseaseHp <= 0) return 'win';
    }
    // null 제거
    st.hand = st.hand.filter(c => c !== null);
  }

  st.discard.push(...st.hand);
  st.hand = [];

  console.log('\n--- 증상 페이즈 ---');
  symptomPhase(st);

  if (st.patientHp <= 0) return 'lose';

  st.msg(`턴 ${st.turn} 종료 | 환자 HP ${st.patientHp}/${st.maxPatientHp} | 본체 HP ${st.diseaseHp}`);
  return 'continue';
}

function printStatus(st) {
  const symStr = st.symptoms.map(s =>
    s.suppressed > 0 ? `${s.name}[억제${s.suppressed}턴]` : `${s.name}[활성(방치${s.neglect})]`
  ).join(', ');
  console.log('\n' + '='.repeat(60));
  console.log(`턴 ${st.turn} | 에너지 ${st.energy}/${st.energyMax} | 환자 HP ${st.patientHp}/${st.maxPatientHp} | 본체 HP ${st.diseaseHp}`);
  console.log(`증상: ${symStr}`);
  console.log('='.repeat(60));
}

function question(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

module.exports = { runTurn };
