const readline = require('readline');
const { triggerSuppress, getSymptomsData } = require('./symptom');

let CARD_DATA = null;

function loadCards(path) {
  const { loadJSON } = require('./state');
  const arr = loadJSON(path);
  CARD_DATA = {};
  for (const c of arr) CARD_DATA[c.id] = c;
}

function getCardData() { return CARD_DATA; }

async function playCard(st, cardId, rl, autoSuppressTarget = null) {
  const c = CARD_DATA[cardId];
  const e = c.effect;
  const SD = getSymptomsData();

  st.msg(`  > ${cardId} 사용`);

  if (c.type === 'treatment') {
    let dmg = e.damage || 0;
    // 반감 (고열경련)
    for (const s of st.symptoms) {
      if (s.suppressed === 0 && SD?.[s.name]?.treatment_half) {
        dmg = Math.floor(dmg / 2);
        st.msg(`    [${s.name}] 치료 효과 반감`);
        break;
      }
    }
    dmg = Math.max(0, dmg + st.treatmentBuff - st.treatmentDebuff);
    st.treatmentBuff = 0;

    if (e.suppress) {
      await doSuppress(st, e, rl, autoSuppressTarget);
    } else if (dmg) {
      st.diseaseHp -= dmg;
      st.msg(`    본체 -${dmg} HP → ${st.diseaseHp}`);
    }

  } else if (c.type === 'stabilize') {
    if (e.defense) {
      st.defenseTotal += e.defense;
      st.msg(`    방어 +${e.defense} (누적 ${st.defenseTotal})`);
    }
    if (e.heal) {
      st.patientHp = Math.min(st.maxPatientHp, st.patientHp + e.heal);
      st.msg(`    환자 +${e.heal} HP → ${st.patientHp}`);
    }
    if (e.reveal) st.msg(`    증상 ${e.reveal}개 의도 확인`);
    if (e.reveal_all) st.msg(`    모든 증상 의도 확인`);

  } else if (c.type === 'support') {
    if (e.buff_next_treatment) {
      st.treatmentBuff += e.buff_next_treatment;
      st.msg(`    다음 치료 카드 +${e.buff_next_treatment}`);
    }
    if (e.cost_reduce_next) {
      st.costReduceNext += e.cost_reduce_next;
      st.msg(`    다음 카드 코스트 -${e.cost_reduce_next}`);
    }
    if (e.draw) {
      st.drawCards(e.draw);
      st.msg(`    ${e.draw}장 드로우`);
    }
    if (e.buff_treatment_this_turn) {
      st.treatmentBuff += e.buff_treatment_this_turn;
      st.msg(`    이번 턴 치료 카드 +${e.buff_treatment_this_turn}`);
    }
    if (e.reveal_all) st.msg(`    모든 증상 의도 확인`);
  }
}

async function doSuppress(st, effect, rl, autoTarget = null) {
  const SD = getSymptomsData();
  const turns_base = effect.turns || 2;
  const active = st.symptoms.filter(s => s.suppressed === 0);
  if (!active.length) { st.msg('    억제할 활성 증상 없음'); return; }

  let chosen;
  if (effect.suppress === 'any') {
    if (autoTarget) {
      chosen = active.find(s => s.name === autoTarget);
    } else {
      console.log('    억제할 증상 선택:');
      active.forEach((s, i) => console.log(`      ${i}. ${s.name}`));
      const ans = await question(rl, '      번호: ');
      chosen = active[parseInt(ans)];
    }
    if (!chosen) { st.msg('    잘못된 입력'); return; }
  } else {
    chosen = active.find(s => s.name === effect.suppress);
    if (!chosen) { st.msg(`    ${effect.suppress} 활성 아님`); return; }
  }

  // 패혈증 suppress_reduce
  let turns = turns_base;
  for (const s of st.symptoms) {
    if (s.name === '패혈증' && s.suppressed === 0) {
      turns = Math.max(1, turns + (SD['패혈증']?.suppress_reduce || 0));
    }
  }

  chosen.suppressed = turns;
  chosen.neglect = 0;
  chosen.escalateCount = 0;
  st.msg(`    ${chosen.name} ${turns}턴 억제`);
  triggerSuppress(st, chosen.name);
}

function question(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

module.exports = { loadCards, playCard, getCardData, doSuppress };
