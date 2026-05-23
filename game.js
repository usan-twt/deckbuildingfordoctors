// ─── DATA ────────────────────────────────────────────────────────────────────

let CARDS = {};
let SYMPTOMS = {};
let BASE_SYMPTOMS = {};

function buildCards(arr) {
  const out = {};
  for (const c of arr) out[c.id] = { cost: c.cost, type: c.type, desc: c.desc || '', effect: c.effect };
  return out;
}

function buildSymptoms(raw) {
  const out = {};
  for (const [name, d] of Object.entries(raw)) {
    const s = { dmg: d.base_damage || 0 };
    if (d.escalate           != null) s.escalate      = d.escalate;
    if (d.amplified_by)               s.amp            = d.amplified_by;
    if (d.defense_reduce     != null) s.defReduce      = d.defense_reduce;
    if (d.defense_reduce_amp)         s.defReduceAmp   = d.defense_reduce_amp;
    if (d.treatment_debuff   != null) s.treatDebuff    = d.treatment_debuff;
    if (d.draw_reduce        != null) s.drawReduce     = d.draw_reduce;
    if (d.treatment_half)             s.treatHalf      = true;
    if (d.defense_half)               s.defHalf        = true;
    if (d.all_symptoms_bonus != null) s.allBonus       = d.all_symptoms_bonus;
    if (d.suppress_reduce    != null) s.suppressReduce = d.suppress_reduce;
    if (d.fixed_draw         != null) s.fixedDraw      = d.fixed_draw;
    if (d.defense_nullify)            s.defNullify     = true;
    if (d.evolves_at         != null) s.evolveAt       = d.evolves_at;
    if (d.evolves_to)                 s.evolveTo       = d.evolves_to;
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
  SYMPTOMS = { ...BASE_SYMPTOMS };
  if (scenario.symptom_defs) Object.assign(SYMPTOMS, buildSymptoms(scenario.symptom_defs));

  G = {
    diseaseHp:    scenario.disease_hp,
    maxDiseaseHp: scenario.disease_hp,
    patientHp:    scenario.patient_hp,
    maxHp:        scenario.max_patient_hp,
    energyMax:    scenario.energy_max,
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

// ─── LOG ─────────────────────────────────────────────────────────────────────

function log(s = '') {
  const el = document.getElementById('log-content');
  if (el) { el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; }
}

// ─── INTERACTION ─────────────────────────────────────────────────────────────

let _turnActive = false;
let _playingCard = false;
let _turnEndResolver = null;
let _symptomPickResolver = null;
let _pickingSymptom = false;

function waitTurnEnd() {
  return new Promise(r => { _turnEndResolver = r; });
}

function waitSymptomPick() {
  _pickingSymptom = true;
  renderVitals();
  return new Promise(r => { _symptomPickResolver = r; });
}

function setTurnActive(on) {
  _turnActive = on;
  document.getElementById('btn-turn-end').disabled = !on;
  renderHand();
}

async function handleCardClick(idx) {
  if (!_turnActive || _playingCard) return;
  const id = G.hand[idx];
  if (!id) return;
  const cost = Math.max(0, CARDS[id].cost - G.costReduce);
  if (G.energy < cost) { log(`에너지 부족 (필요 ${cost}, 남은 ${G.energy})`); return; }

  _playingCard = true;
  document.getElementById('btn-turn-end').disabled = true;

  G.energy -= cost;
  G.costReduce = 0;
  G.hand[idx] = null;
  G.discard.push(id);

  await playCard(id);
  G.hand = G.hand.filter(Boolean);
  _playingCard = false;

  if (G.diseaseHp <= 0) { _turnEndResolver?.('win'); return; }

  renderAll();
  document.getElementById('btn-turn-end').disabled = false;
}

// ─── DRAW ─────────────────────────────────────────────────────────────────────

function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (!G.deck.length) {
      if (!G.discard.length) break;
      G.deck = shuffle(G.discard.splice(0));
      log('[덱 소진 → 버린 더미 셔플]');
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
      dmg += SYMPTOMS['패혈증']?.allBonus || 0;

    if (s.name === '탈수') {
      let r = d.defReduce || 0;
      for (const [src, val] of Object.entries(d.defReduceAmp || {}))
        if (an.has(src)) r += val;
      G.defReduce += r;
    }
    if (s.name === '호흡곤란') G.defReduce += d.drawReduce || 0;

    totalDmg += dmg;
    if (dmg) log(`  ${s.name}: 환자 -${dmg} HP`);
  }

  const def = SYMPTOMS[G.symptoms.find(s => s.name === '장기부전' && s.sup === 0)?.name]?.defNullify
    ? 0 : Math.max(0, G.defTotal - G.defReduce);
  const net = Math.max(0, totalDmg - def);
  if (G.defTotal || G.defReduce)
    log(`  방어 ${G.defTotal} - 감소 ${G.defReduce} = ${def} → 실피해 ${net}`);

  G.patientHp -= net;
  G.defTotal = 0;

  for (const s of G.symptoms) {
    const d = SYMPTOMS[s.name] || {};
    if (s.sup > 0) { s.sup--; s.neglect = 0; }
    else {
      s.neglect++;
      if (d.evolveAt && s.neglect >= d.evolveAt) {
        log(`  ⚠ ${s.name} ${d.evolveAt}턴 방치 → ${d.evolveTo} 진화!`);
        s.name = d.evolveTo; s.neglect = 0; s.escalate = 0;
      }
    }
  }
}

function triggerSuppress(name) {
  const d = SYMPTOMS[name] || {};
  for (const [tgt, ef] of Object.entries(d.triggerSuppress || {})) {
    if (activeNames().has(tgt)) {
      log(`  [촉발] ${name} 억제 → ${tgt} 반응`);
      if (ef.treatDebuff) G.treatDebuff += ef.treatDebuff;
    }
  }
  for (const [, ef] of Object.entries(d.transferSuppress || {})) {
    log(`  [전이] ${name} 억제 → 전이 효과`);
    if (ef.defReduce) G.defReduce += ef.defReduce;
  }
}

// ─── PLAY CARD ───────────────────────────────────────────────────────────────

async function playCard(id) {
  const c = CARDS[id]; const e = c.effect;
  log(`> ${id}`);

  if (c.type === 'treatment') {
    if (e.suppress) { await doSuppress(e); return; }
    let dmg = e.damage || 0;
    for (const s of G.symptoms)
      if (s.sup === 0 && SYMPTOMS[s.name]?.treatHalf) { dmg = Math.floor(dmg / 2); break; }
    dmg = Math.max(0, dmg + G.treatBuff - G.treatDebuff);
    G.treatBuff = 0;
    G.diseaseHp -= dmg;
    log(`  본체 -${dmg} HP → ${G.diseaseHp}`);

  } else if (c.type === 'stabilize') {
    if (e.defense) { G.defTotal += e.defense; log(`  방어 +${e.defense} (누적 ${G.defTotal})`); }
    if (e.heal)    { G.patientHp = Math.min(G.maxHp, G.patientHp + e.heal); log(`  환자 +${e.heal} HP`); }

  } else if (c.type === 'support') {
    if (e.buff_next_treatment) { G.treatBuff += e.buff_next_treatment; log(`  다음 치료 +${e.buff_next_treatment}`); }
    if (e.cost_reduce_next)    { G.costReduce += e.cost_reduce_next;   log(`  다음 코스트 -${e.cost_reduce_next}`); }
    if (e.draw)                { drawCards(e.draw); log(`  ${e.draw}장 드로우`); }
    if (e.buff_treatment)      { G.treatBuff += e.buff_treatment;       log(`  이번 턴 치료 +${e.buff_treatment}`); }
  }
}

async function doSuppress(effect) {
  const act = active();
  if (!act.length) { log('  억제할 활성 증상 없음'); return; }

  log('  증상을 클릭하여 선택하세요');
  const chosen = await waitSymptomPick();
  _pickingSymptom = false;
  if (!chosen) return;

  let turns = effect.turns || 2;
  const sep = getSym('패혈증');
  if (sep && sep.sup === 0) turns = Math.max(1, turns + (SYMPTOMS['패혈증'].suppressReduce || 0));

  chosen.sup = turns; chosen.neglect = 0; chosen.escalate = 0;
  log(`  ${chosen.name} ${turns}턴 억제`);
  triggerSuppress(chosen.name);
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

const TYPE_LABEL = { treatment: '치료', stabilize: '안정', support: '지원' };

function renderAll() {
  renderInfo();
  renderVitals();
  renderDeck();
  renderHand();
}

function renderInfo() {
  document.getElementById('turn-info').textContent =
    `턴 ${G.turn}  ·  에너지 ${G.energy} / ${G.energyMax}`;
}

function renderVitals() {
  const panel = document.getElementById('vitals-panel');
  const pPct = Math.max(0, (G.patientHp / G.maxHp) * 100).toFixed(1);
  const dPct = Math.max(0, (G.diseaseHp / G.maxDiseaseHp) * 100).toFixed(1);

  const condRows = G.symptoms.map(s => {
    const isActive = s.sup === 0;
    const canPick = _pickingSymptom && isActive;
    const stateClass = isActive ? 'is-active' : 'is-suppressed';
    const pickClass = canPick ? ' pickable' : '';
    const timer = isActive ? `방치 ${s.neglect}턴` : `억제 ${s.sup}턴 남음`;
    const sym = s.name;
    return `<div class="cond ${stateClass}${pickClass}" data-sym="${sym}">
      <span class="cond-name">${sym}</span>
      <span class="timer">${timer}</span>
    </div>`;
  }).join('');

  const debuff = G.treatDebuff > 0
    ? `<div class="debuff-notice">⚠ 치료 효과 −${G.treatDebuff}</div>` : '';

  panel.className = 'vitals-panel' + (_pickingSymptom ? ' picking' : '');
  panel.innerHTML = `
    <div class="hp-block">
      <div class="hp-row">
        <span class="label">환자 HP</span>
        <span class="num">${G.patientHp} / ${G.maxHp}</span>
      </div>
      <div class="hp-bar"><div class="fill" style="width:${pPct}%"></div></div>
    </div>
    <div class="hp-block">
      <div class="hp-row">
        <span class="label">본체 HP</span>
        <span class="num disease">${G.diseaseHp} / ${G.maxDiseaseHp}</span>
      </div>
      <div class="hp-bar disease"><div class="fill" style="width:${dPct}%"></div></div>
    </div>
    <div class="conditions-title">상태이상</div>
    ${condRows}
    ${debuff}
  `;

  if (_pickingSymptom) {
    panel.querySelectorAll('.cond.pickable').forEach(el => {
      el.addEventListener('click', () => {
        const sym = G.symptoms.find(s => s.name === el.dataset.sym && s.sup === 0);
        if (sym && _symptomPickResolver) {
          const resolve = _symptomPickResolver;
          _symptomPickResolver = null;
          resolve(sym);
        }
      });
    });
  }
}

function renderDeck() {
  document.getElementById('deck-panel').innerHTML = `
    <div>
      <div class="turn-badge">턴 ${G.turn}</div>
      <div class="energy-display">
        <div class="e-label">에너지</div>
        <div class="e-num">${G.energy} / ${G.energyMax}</div>
      </div>
    </div>
    <div>
      <div class="pile-row"><span>덱</span><span>${G.deck.length}</span></div>
      <div class="pile-row"><span>버린더미</span><span>${G.discard.length}</span></div>
    </div>
  `;
}

function renderHand() {
  const handEl = document.getElementById('hand');
  handEl.innerHTML = '';

  G.hand.forEach((id, idx) => {
    if (!id) return;
    const c = CARDS[id];
    const cost = Math.max(0, c.cost - G.costReduce);
    const canPlay = _turnActive && !_playingCard && G.energy >= cost;

    const card = document.createElement('div');
    card.className = `hand-card type-${c.type}${canPlay ? '' : ' disabled'}`;
    card.innerHTML = `
      <div class="cost">${cost}</div>
      <div class="attr">${TYPE_LABEL[c.type] || c.type}</div>
      <div class="card-name">${id}</div>
      <div class="effect">${c.desc}</div>
    `;
    if (canPlay) card.addEventListener('click', () => handleCardClick(idx));
    handEl.appendChild(card);
  });
}

function renderPatient(scenario) {
  const p = scenario.patient || {};
  document.getElementById('scenario-name').textContent = scenario.name;
  document.getElementById('patient-name').textContent = p.name || '환자';
  document.getElementById('patient-layer').textContent = p.info || '—';
  document.getElementById('patient-complaint').textContent = p.chief_complaint || '—';
}

function showResult(title, detail) {
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-detail').textContent = detail;
  document.getElementById('result-overlay').classList.remove('hidden');
}

// ─── TURN ────────────────────────────────────────────────────────────────────

async function runTurn() {
  G.turn++;
  G.energy = G.energyMax;
  G.treatBuff = 0; G.defTotal = 0; G.defReduce = 0; G.costReduce = 0;
  G.treatDebuff = active().reduce((sum, s) => sum + (SYMPTOMS[s.name]?.treatDebuff || 0), 0);

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

  log(`\n── 턴 ${G.turn} ──`);
  renderAll();
  setTurnActive(true);

  const result = await waitTurnEnd();
  setTurnActive(false);

  if (result === 'win') return 'win';

  G.discard.push(...G.hand.filter(Boolean));
  G.hand = [];

  log('\n── 증상 페이즈 ──');
  symptomPhase();
  renderAll();

  if (G.patientHp <= 0) return 'lose';
  return 'continue';
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const SCENARIO_LIST = [
  { file: 'tutorial',          name: 'T-1: 급성 악화 감기', meta: '본체 28HP · 환자 30HP · 발열+탈수' },
  { file: 't2_food_poisoning', name: 'T-2: 시장 식중독',   meta: '본체 30HP · 환자 28HP · 발열+감염' },
  { file: 't3_laceration',     name: 'T-3: 작업장 열상',   meta: '본체 26HP · 환자 26HP · 출혈+통증' },
  { file: 't4_dock_fall',      name: 'T-4: 부두 낙상',     meta: '본체 28HP · 환자 26HP · 출혈+탈수' },
];

(async () => {
  // 글로벌 데이터 로드
  let cardsRaw, symptomsRaw;
  try {
    [cardsRaw, symptomsRaw] = await Promise.all([
      fetch('./data/cards.json').then(r => r.json()),
      fetch('./data/symptoms.json').then(r => r.json()),
    ]);
    CARDS         = buildCards(cardsRaw);
    BASE_SYMPTOMS = buildSymptoms(symptomsRaw);
  } catch (err) {
    document.getElementById('scenario-overlay').innerHTML =
      `<div style="padding:40px;font-family:monospace">데이터 로딩 실패: ${err.message}<br>서버에서 실행해주세요.</div>`;
    return;
  }

  // 시나리오 목록 렌더
  const listEl = document.getElementById('scenario-list');
  SCENARIO_LIST.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'scenario-item';
    item.innerHTML = `<div class="s-name">${s.name}</div><div class="s-meta">${s.meta}</div>`;
    item.addEventListener('click', () => startScenario(i));
    listEl.appendChild(item);
  });

  // 버튼 이벤트
  document.getElementById('btn-turn-end').addEventListener('click', () => {
    if (!_turnActive || _playingCard) return;
    _turnEndResolver?.('done');
  });
  document.getElementById('btn-log').addEventListener('click', () => {
    document.getElementById('log-panel').classList.remove('hidden');
  });
  document.getElementById('btn-close-log').addEventListener('click', () => {
    document.getElementById('log-panel').classList.add('hidden');
  });
  document.getElementById('btn-deck-view').addEventListener('click', () => {
    const all = [...G.deck, ...G.discard, ...G.hand.filter(Boolean)].sort();
    log('\n[덱 전체] ' + all.join(', '));
    document.getElementById('log-panel').classList.remove('hidden');
  });
})();

async function startScenario(idx) {
  const chosen = SCENARIO_LIST[idx];
  let scenario;
  try {
    scenario = await fetch(`./scenarios/${chosen.file}.json`).then(r => r.json());
  } catch (err) {
    alert('시나리오 로딩 실패: ' + err.message);
    return;
  }

  document.getElementById('scenario-overlay').classList.add('hidden');
  newGame(scenario);
  renderPatient(scenario);

  log(`[ ${chosen.name} ]`);
  log('카드를 클릭해 플레이. 턴 종료 버튼으로 다음 단계.\n');

  while (true) {
    const result = await runTurn();
    if (result === 'win') {
      showResult('치료 성공', `${G.turn}턴 · 환자 HP ${G.patientHp}/${G.maxHp}`);
      break;
    }
    if (result === 'lose') {
      showResult('치료 실패', `${G.turn}턴 · 환자 HP 0`);
      break;
    }
  }
}
