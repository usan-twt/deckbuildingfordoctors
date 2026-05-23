// ─── DATA (loaded from JSON) ─────────────────────────────────────────────────

let CARDS = {};
let SYMPTOMS = {};

function buildCards(arr) {
  const out = {};
  for (const c of arr) out[c.id] = { cost: c.cost, type: c.type, effect: c.effect };
  return out;
}

function buildSymptoms(raw) {
  const out = {};
  for (const [name, d] of Object.entries(raw)) {
    const s = { dmg: d.base_damage || 0 };
    if (d.escalate       != null) s.escalate       = d.escalate;
    if (d.amplified_by)           s.amp             = d.amplified_by;
    if (d.defense_reduce != null) s.defReduce       = d.defense_reduce;
    if (d.treatment_debuff != null) s.treatDebuff   = d.treatment_debuff;
    if (d.draw_reduce    != null) s.drawReduce      = d.draw_reduce;
    if (d.treatment_half)         s.treatHalf       = true;
    if (d.defense_half)           s.defHalf         = true;
    if (d.all_symptoms_bonus != null) s.allBonus    = d.all_symptoms_bonus;
    if (d.suppress_reduce != null)  s.suppressReduce = d.suppress_reduce;
    if (d.fixed_draw     != null) s.fixedDraw       = d.fixed_draw;
    if (d.defense_nullify)        s.defNullify      = true;
    if (d.evolves_at     != null) s.evolveAt        = d.evolves_at;
    if (d.evolves_to)             s.evolveTo        = d.evolves_to;
    if (d.trigger_on_suppress) {
      s.triggerSuppress = {};
      for (const [tgt, ef] of Object.entries(d.trigger_on_suppress))
        s.triggerSuppress[tgt] = { treatDebuff: ef.treatment_debuff || 0 };
    }
    if (d.transfer_on_suppress) {
      s.transferSuppress = {};
      for (const [tgt, ef] of Object.entries(d.transfer_on_suppress))
        s.transferSuppress[tgt] = { defReduce: ef.defense_reduce || 0 };
    }
    out[name] = s;
  }
  return out;
}

// ─── STATE ───────────────────────────────────────────────────────────────────

let G;

function newGame(scenario) {
  G = {
    diseaseHp: scenario.disease_hp,
    patientHp: scenario.patient_hp,
    maxHp:     scenario.max_patient_hp,
    energyMax: scenario.energy_max,
    symptoms:  scenario.symptoms.map(name => ({ name, sup: 0, neglect: 0, escalate: 0 })),
    deck:      shuffle([...scenario.deck]),
    discard: [], hand: [], turn: 0,
    treatBuff: 0, treatDebuff: 0, defTotal: 0, defReduce: 0, costReduce: 0,
  };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function active() { return G.symptoms.filter(s => s.sup === 0); }
function activeNames() { return new Set(active().map(s => s.name)); }
function getSym(name) { return G.symptoms.find(s => s.name === name) || null; }

// ─── UI ──────────────────────────────────────────────────────────────────────

const logEl = document.getElementById('log');
const cmdEl = document.getElementById('cmd');
const btnEl = document.getElementById('btn');

function print(s = '') { logEl.textContent += s + '\n'; logEl.scrollTop = logEl.scrollHeight; }

let _resolve = null;

function waitInput() {
  cmdEl.disabled = false;
  cmdEl.focus();
  return new Promise(r => { _resolve = r; });
}

function submit() {
  if (!_resolve) return;
  const v = cmdEl.value.trim();
  cmdEl.value = '';
  cmdEl.disabled = true;
  print('> ' + (v || '(턴 종료)'));
  _resolve(v);
  _resolve = null;
}

btnEl.onclick = submit;
cmdEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

// ─── DRAW ────────────────────────────────────────────────────────────────────

function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (!G.deck.length) {
      if (!G.discard.length) break;
      G.deck = shuffle(G.discard.splice(0));
      print('  [덱 소진 → 버린 더미 셔플]');
    }
    G.hand.push(G.deck.shift());
  }
}

// ─── SYMPTOM PHASE ───────────────────────────────────────────────────────────

function symptomPhase() {
  const an = activeNames();
  let totalDmg = 0;

  for (const s of active()) {
    const d = SYMPTOMS[s.name] || {};
    let dmg = d.dmg || 0;

    if (d.escalate) { dmg += d.escalate * s.escalate; s.escalate++; }
    for (const [src, val] of Object.entries(d.amp || {}))
      if (an.has(src)) dmg += val;
    if (an.has('패혈증') && s.name !== '패혈증')
      dmg += SYMPTOMS['패혈증'].allBonus || 0;

    if (s.name === '탈수') {
      let r = d.defReduce || 0;
      if (an.has('출혈')) r += d.amp?.['출혈'] || 0;
      G.defReduce += r;
    }
    if (s.name === '통증') {
      G.treatDebuff += d.treatDebuff || 0;
      if (an.has('호흡곤란')) G.defReduce += 1;
    }
    if (s.name === '호흡곤란') G.defReduce += d.drawReduce || 0;

    totalDmg += dmg;
    if (dmg) print(`  ${s.name}: 환자 -${dmg} HP`);
  }

  const def = SYMPTOMS[G.symptoms.find(s => s.name === '장기부전' && s.sup === 0)?.name]?.defNullify
    ? 0 : Math.max(0, G.defTotal - G.defReduce);
  const net = Math.max(0, totalDmg - def);
  if (G.defTotal || G.defReduce)
    print(`  방어 ${G.defTotal} - 감소 ${G.defReduce} = ${def} → 실피해 ${net}`);

  G.patientHp -= net;
  G.defTotal = 0;

  for (const s of G.symptoms) {
    const d = SYMPTOMS[s.name] || {};
    if (s.sup > 0) { s.sup--; s.neglect = 0; }
    else {
      s.neglect++;
      if (d.evolveAt && s.neglect >= d.evolveAt) {
        print(`  ⚠️  ${s.name} ${d.evolveAt}턴 방치 → ${d.evolveTo} 진화!`);
        s.name = d.evolveTo; s.neglect = 0; s.escalate = 0;
      }
    }
  }
}

function triggerSuppress(name) {
  const d = SYMPTOMS[name] || {};
  for (const [tgt, ef] of Object.entries(d.triggerSuppress || {})) {
    if (activeNames().has(tgt)) {
      print(`  [촉발] ${name} 억제 → ${tgt} 반응`);
      if (ef.treatDebuff) G.treatDebuff += ef.treatDebuff;
    }
  }
  for (const [, ef] of Object.entries(d.transferSuppress || {})) {
    print(`  [전이] ${name} 억제 → 전이 효과`);
    if (ef.defReduce) G.defReduce += ef.defReduce;
  }
}

// ─── PLAY CARD ───────────────────────────────────────────────────────────────

async function playCard(id) {
  const c = CARDS[id]; const e = c.effect;
  print(`  > ${id}`);

  if (c.type === 'treatment') {
    if (e.suppress) { await doSuppress(e); return; }
    let dmg = e.damage || 0;
    for (const s of G.symptoms)
      if (s.sup === 0 && SYMPTOMS[s.name]?.treatHalf) { dmg = Math.floor(dmg / 2); break; }
    dmg = Math.max(0, dmg + G.treatBuff - G.treatDebuff);
    G.treatBuff = 0;
    G.diseaseHp -= dmg;
    print(`    본체 -${dmg} HP → ${G.diseaseHp}`);

  } else if (c.type === 'stabilize') {
    if (e.defense) { G.defTotal += e.defense; print(`    방어 +${e.defense} (누적 ${G.defTotal})`); }
    if (e.heal)    { G.patientHp = Math.min(G.maxHp, G.patientHp + e.heal); print(`    환자 +${e.heal} HP → ${G.patientHp}`); }

  } else if (c.type === 'support') {
    if (e.buff_next_treatment) { G.treatBuff += e.buff_next_treatment; print(`    다음 치료 +${e.buff_next_treatment}`); }
    if (e.cost_reduce_next)    { G.costReduce += e.cost_reduce_next;   print(`    다음 카드 코스트 -${e.cost_reduce_next}`); }
    if (e.draw)                { drawCards(e.draw); print(`    ${e.draw}장 드로우`); }
    if (e.buff_treatment)      { G.treatBuff += e.buff_treatment;       print(`    이번 턴 치료 +${e.buff_treatment}`); }
  }
}

async function doSuppress(effect) {
  const act = active();
  if (!act.length) { print('    억제할 활성 증상 없음'); return; }

  print('    억제할 증상:');
  act.forEach((s, i) => print(`      ${i}. ${s.name}`));
  const ans = await waitInput();
  const chosen = act[parseInt(ans)];
  if (!chosen) { print('    잘못된 입력'); return; }

  let turns = effect.turns || 2;
  const sep = getSym('패혈증');
  if (sep && sep.sup === 0) turns = Math.max(1, turns + (SYMPTOMS['패혈증'].suppressReduce || 0));

  chosen.sup = turns; chosen.neglect = 0; chosen.escalate = 0;
  print(`    ${chosen.name} ${turns}턴 억제`);
  triggerSuppress(chosen.name);
}

// ─── TURN ────────────────────────────────────────────────────────────────────

async function runTurn() {
  G.turn++;
  G.energy = G.energyMax;
  G.treatBuff = 0; G.treatDebuff = 0;
  G.defTotal = 0;  G.defReduce = 0; G.costReduce = 0;

  let drawN = 4;
  for (const s of G.symptoms) {
    if (s.sup !== 0) continue;
    const d = SYMPTOMS[s.name] || {};
    if (d.fixedDraw) { drawN = d.fixedDraw; break; }
    drawN -= d.drawReduce || 0;
  }
  drawN = Math.max(2, drawN);
  G.hand = [];
  drawCards(drawN);

  printStatus();

  while (true) {
    printHand();
    const inp = await waitInput();
    if (!inp) break;

    const indices = inp.split(/\s+/).map(Number).filter(n => !isNaN(n) && n < G.hand.length && G.hand[n] !== null);
    for (const idx of indices) {
      const id = G.hand[idx];
      if (!id) continue;
      const cost = Math.max(0, CARDS[id].cost - G.costReduce);
      G.costReduce = 0;
      if (G.energy < cost) { print(`  에너지 부족 (필요 ${cost}, 남은 ${G.energy})`); continue; }
      G.energy -= cost;
      G.hand[idx] = null;
      G.discard.push(id);
      await playCard(id);
      if (G.diseaseHp <= 0) return 'win';
    }
    G.hand = G.hand.filter(Boolean);
  }

  G.discard.push(...G.hand.filter(Boolean));
  G.hand = [];

  print('\n─── 증상 페이즈 ───');
  symptomPhase();

  if (G.patientHp <= 0) return 'lose';
  print(`턴 ${G.turn} 종료 | 환자 HP ${G.patientHp}/${G.maxHp} | 본체 HP ${G.diseaseHp}\n`);
  return 'continue';
}

function printStatus() {
  const symStr = G.symptoms.map(s =>
    s.sup > 0 ? `${s.name}[억제${s.sup}턴]` : `${s.name}[활성·방치${s.neglect}]`
  ).join('  ');
  print('═'.repeat(56));
  print(`턴 ${G.turn} | 에너지 ${G.energy}/${G.energyMax} | 환자 HP ${G.patientHp}/${G.maxHp} | 본체 HP ${G.diseaseHp}`);
  print(`증상: ${symStr}`);
  print('═'.repeat(56));
}

function printHand() {
  const hand = G.hand.map((id, i) => id ? `[${i}] ${id}(${CARDS[id].cost})` : null).filter(Boolean);
  print('핸드: ' + hand.join('  ') + `  | 에너지 ${G.energy}/${G.energyMax}`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const [cardsRaw, symptomsRaw, scenario] = await Promise.all([
      fetch('./data/cards.json').then(r => r.json()),
      fetch('./data/symptoms.json').then(r => r.json()),
      fetch('./scenarios/tutorial.json').then(r => r.json()),
    ]);
    CARDS    = buildCards(cardsRaw);
    SYMPTOMS = buildSymptoms(symptomsRaw);
    newGame(scenario);
  } catch (err) {
    print('데이터 로딩 실패: ' + err.message);
    print('서버에서 실행해주세요 (file:// 비지원).');
    cmdEl.disabled = true;
    return;
  }

  print('[ INTERN 전투 프로토타입 — 급성 악화 감기 ]');
  print('카드 번호를 공백으로 구분해 입력. 빈 입력 = 턴 종료.\n');

  while (true) {
    const result = await runTurn();
    if (result === 'win') {
      print(`\n✅ 치료 성공! ${G.turn}턴 | 환자 HP ${G.patientHp}/${G.maxHp}`);
      break;
    }
    if (result === 'lose') {
      print(`\n❌ 치료 실패. 환자 HP 0. ${G.turn}턴`);
      break;
    }
  }

  print('\n─ 새 게임: 페이지 새로고침 ─');
  cmdEl.disabled = true;
})();
