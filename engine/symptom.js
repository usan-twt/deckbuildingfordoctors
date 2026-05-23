let SYMPTOM_DATA = null;

function loadSymptoms(path) {
  const { loadJSON } = require('./state');
  SYMPTOM_DATA = loadJSON(path);
}

function symptomPhase(st) {
  const active = st.symptoms.filter(s => s.suppressed === 0);
  const activeNames = new Set(active.map(s => s.name));

  let totalDamage = 0;

  for (const s of active) {
    const d = SYMPTOM_DATA[s.name] || {};
    let dmg = d.base_damage || 0;

    // 출혈 에스컬레이션
    if (s.name === '출혈' && d.escalate) {
      dmg += d.escalate * s.escalateCount;
      s.escalateCount++;
    }

    // 강화형
    for (const [src, val] of Object.entries(d.amplified_by || {})) {
      if (src && activeNames.has(src)) dmg += val;
    }

    // 패혈증 보너스
    if (activeNames.has('패혈증') && s.name !== '패혈증') {
      dmg += SYMPTOM_DATA['패혈증']?.all_symptoms_bonus || 0;
    }

    // 증상별 특수 효과
    if (s.name === '탈수') {
      let reduce = d.defense_reduce || 0;
      if (activeNames.has('출혈')) reduce += (d.amplified_by?.['출혈'] || 0);
      st.defenseReduce += reduce;
    }
    if (s.name === '통증') {
      st.treatmentDebuff += d.treatment_debuff || 0;
      if (activeNames.has('호흡곤란')) st.defenseReduce += 1;
    }
    if (s.name === '호흡곤란') {
      st.defenseReduce += d.draw_reduce || 0;
    }

    totalDamage += dmg;
    if (dmg) st.msg(`  ${s.name}: 환자 -${dmg} HP`);
  }

  // 방어 적용
  const defense = Math.max(0, st.defenseTotal - st.defenseReduce);
  const net = Math.max(0, totalDamage - defense);
  if (defense || st.defenseReduce) {
    st.msg(`  방어 ${st.defenseTotal} - 감소 ${st.defenseReduce} = ${defense} 적용 → 실피해 ${net}`);
  }
  st.patientHp -= net;
  st.defenseTotal = 0;

  // 억제 카운터 감소 + 방치 카운터 증가 + 진화
  for (const s of st.symptoms) {
    const d = SYMPTOM_DATA[s.name] || {};
    if (s.suppressed > 0) {
      s.suppressed--;
      s.neglect = 0;
    } else {
      s.neglect++;
      const evolvesAt = d.evolves_at;
      if (evolvesAt && s.neglect >= evolvesAt) {
        const evolveTo = d.evolves_to;
        st.msg(`  ⚠️  ${s.name} ${evolvesAt}턴 방치 → ${evolveTo} 진화!`);
        s.name = evolveTo;
        s.neglect = 0;
        s.escalateCount = 0;
      }
    }
  }
}

function triggerSuppress(st, suppressedName) {
  const d = SYMPTOM_DATA[suppressedName] || {};

  // 촉발형
  for (const [tgt, effect] of Object.entries(d.trigger_on_suppress || {})) {
    if (st.isActive(tgt)) {
      st.msg(`  [촉발] ${suppressedName} 억제 → ${tgt} 반응`);
      if (effect.treatment_debuff) st.treatmentDebuff += effect.treatment_debuff;
    }
  }

  // 전이형
  for (const [tgt, effect] of Object.entries(d.transfer_on_suppress || {})) {
    st.msg(`  [전이] ${suppressedName} 억제 → ${tgt}로 전이`);
    if (effect.defense_reduce) st.defenseReduce += effect.defense_reduce;
  }
}

module.exports = { loadSymptoms, symptomPhase, triggerSuppress, getSymptomsData: () => SYMPTOM_DATA };
