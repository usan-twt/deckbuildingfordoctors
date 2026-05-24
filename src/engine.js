import { bus } from './events.js';
import { buildSymptoms } from './data.js';

export let CARDS = {};
export let SYMPTOMS = {};
export let BASE_SYMPTOMS = {};
export let G = null;

let _simStrategy = null;
let _turnActive = false;
let _playingCard = false;
let _turnEndResolver = null;
let _symptomPickResolver = null;
let _discardPickResolver = null;
let _pickingSymptom = false;
let _pickingDiscard = false;

export const isTurnActive     = () => _turnActive;
export const isPlayingCard    = () => _playingCard;
export const isPickingSymptom = () => _pickingSymptom;
export const isPickingDiscard = () => _pickingDiscard;

export function loadData(cardsData, symptomsData) {
  CARDS = cardsData;
  BASE_SYMPTOMS = symptomsData;
}

export function setSimStrategy(s)  { _simStrategy = s; }
export function clearSimStrategy() { _simStrategy = null; }

function emit(type) {
  if (!_simStrategy) bus.dispatchEvent(new CustomEvent(type));
}

function log(msg) {
  if (!_simStrategy) bus.dispatchEvent(new CustomEvent('log', { detail: msg }));
}

export function resolveTurnEnd() {
  if (_turnActive && !_playingCard) _turnEndResolver?.('done');
}

export function resolveSymptomPick(sym) {
  if (!_symptomPickResolver) return;
  _pickingSymptom = false;
  const r = _symptomPickResolver;
  _symptomPickResolver = null;
  r(sym);
  emit('state:changed');
}

export function resolveDiscardPick(idx) {
  if (!_pickingDiscard) return;
  const id = G.hand[idx];
  if (!id) return;
  G.hand[idx] = null;
  G.discard.push(id);
  G.hand = G.hand.filter(Boolean);
  log(`  ${id} 버림`);
  _pickingDiscard = false;
  const r = _discardPickResolver;
  _discardPickResolver = null;
  r(id);
  emit('state:changed');
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function active()      { return G.symptoms.filter(s => s.sup === 0); }
function activeNames() { return new Set(active().map(s => s.name)); }
function getSym(name)  { return G.symptoms.find(s => s.name === name) || null; }

export function newGame(scenario, deck) {
  SYMPTOMS = { ...BASE_SYMPTOMS };
  if (scenario.symptom_defs) Object.assign(SYMPTOMS, buildSymptoms(scenario.symptom_defs));

  G = {
    diseaseHp:    scenario.disease_hp,
    maxDiseaseHp: scenario.disease_hp,
    patientHp:    scenario.patient_hp,
    maxHp:        scenario.max_patient_hp,
    energyMax:    scenario.energy_max,
    symptoms:  scenario.symptoms.map(name => ({ name, sup: 0, neglect: 0, escalate: 0 })),
    deck:      shuffle([...deck]),
    discard: [], hand: [], turn: 0,
    treatBuff: 0, treatDebuff: 0, defTotal: 0, defReduce: 0, costReduce: 0,
  };
}

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

function addSymptom(name) {
  const existing = G.symptoms.find(s => s.name === name);
  if (existing) {
    if (existing.sup === 0) { log(`  ${name} 이미 활성`); return; }
    existing.sup = 0; log(`  ${name} 재활성화`);
  } else {
    G.symptoms.push({ name, sup: 0, neglect: 0, escalate: 0 });
    log(`  ${name} 부여`);
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

async function waitSymptomPick() {
  if (_simStrategy) return _simStrategy.pickSymptom(active(), G);
  _pickingSymptom = true;
  emit('state:changed');
  return new Promise(r => { _symptomPickResolver = r; });
}

async function waitDiscardPick() {
  if (_simStrategy) {
    const idx = _simStrategy.pickDiscard(G.hand, G, CARDS);
    if (idx !== -1 && idx < G.hand.length && G.hand[idx]) {
      const id = G.hand[idx];
      G.hand[idx] = null;
      G.discard.push(id);
      G.hand = G.hand.filter(Boolean);
    }
    return;
  }
  _pickingDiscard = true;
  emit('state:changed');
  return new Promise(r => { _discardPickResolver = r; });
}

async function playCard(id) {
  const c = CARDS[id]; const e = c.effect;
  log(`> ${id}`);

  if (c.type === 'treatment') {
    if (e.suppress_symptom) {
      const target = getSym(e.suppress_symptom);
      if (target && target.sup === 0) {
        let turns = e.suppress_turns || 2;
        const sep = getSym('패혈증');
        if (sep && sep.sup === 0) turns = Math.max(1, turns + (SYMPTOMS['패혈증'].suppressReduce || 0));
        target.sup = turns; target.neglect = 0; target.escalate = 0;
        log(`  ${e.suppress_symptom} ${turns}턴 억제`);
        triggerSuppress(e.suppress_symptom);
      } else {
        log(`  ${e.suppress_symptom} 비활성 (효과 반쪽)`);
      }
      if (e.add_symptom) addSymptom(e.add_symptom);
      return;
    }
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
    if (e.defense_if_active) {
      for (const [sym, bonus] of Object.entries(e.defense_if_active)) {
        if (activeNames().has(sym)) { G.defTotal += bonus; log(`  조건부 방어 +${bonus} (${sym} 활성)`); }
      }
    }
    if (e.heal) { G.patientHp = Math.min(G.maxHp, G.patientHp + e.heal); log(`  환자 +${e.heal} HP`); }

  } else if (c.type === 'support') {
    if (e.buff_next_treatment) { G.treatBuff += e.buff_next_treatment; log(`  다음 치료 +${e.buff_next_treatment}`); }
    if (e.cost_reduce_next)    { G.costReduce += e.cost_reduce_next;   log(`  다음 코스트 -${e.cost_reduce_next}`); }
    if (e.draw)                { drawCards(e.draw); log(`  ${e.draw}장 드로우`); }
    if (e.buff_treatment)      { G.treatBuff += e.buff_treatment;       log(`  이번 턴 치료 +${e.buff_treatment}`); }
    if (e.discard_from_hand) {
      if (G.hand.filter(Boolean).length > 0) {
        log('  버릴 카드를 클릭하세요');
        await waitDiscardPick();
      }
    }
  }
}

export async function handleCardClick(idx) {
  if (_pickingDiscard) {
    resolveDiscardPick(idx);
    return;
  }
  if (!_turnActive || _playingCard) return;
  const id = G.hand[idx];
  if (!id) return;
  const cost = Math.max(0, CARDS[id].cost - G.costReduce);
  if (G.energy < cost) { log(`에너지 부족 (필요 ${cost}, 남은 ${G.energy})`); return; }

  _playingCard = true;
  emit('state:changed');

  G.energy -= cost;
  G.costReduce = 0;
  G.hand[idx] = null;
  G.discard.push(id);

  await playCard(id);
  G.hand = G.hand.filter(Boolean);
  _playingCard = false;

  if (G.diseaseHp <= 0) {
    emit('state:changed');
    _turnEndResolver?.('win');
    return;
  }

  emit('state:changed');
}

export async function runTurn() {
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
  _turnActive = true;
  emit('state:changed');

  const result = await waitTurnEnd();
  _turnActive = false;

  if (result === 'win') return 'win';

  G.discard.push(...G.hand.filter(Boolean));
  G.hand = [];

  log('\n── 증상 페이즈 ──');
  symptomPhase();
  emit('state:changed');

  if (G.patientHp <= 0) return 'lose';
  return 'continue';
}

async function waitTurnEnd() {
  if (_simStrategy) {
    while (true) {
      if (G.diseaseHp <= 0) return 'win';
      const idx = _simStrategy.chooseCard(G, CARDS);
      if (idx === -1) break;
      const id = G.hand[idx];
      if (!id) break;
      const cost = Math.max(0, CARDS[id].cost - G.costReduce);
      if (G.energy < cost) break;
      G.energy -= cost; G.costReduce = 0; G.hand[idx] = null; G.discard.push(id);
      await playCard(id);
      G.hand = G.hand.filter(Boolean);
    }
    return G.diseaseHp <= 0 ? 'win' : 'done';
  }
  return new Promise(r => { _turnEndResolver = r; });
}

export function computeSymptomIntent(s) {
  if (s.sup > 0) return '';
  const an = activeNames();
  const d = SYMPTOMS[s.name] || {};
  const parts = [];

  let dmg = d.dmg || 0;
  if (d.escalate) dmg += d.escalate * s.escalate;
  for (const [src, val] of Object.entries(d.amp || {}))
    if (an.has(src)) dmg += val;
  if (an.has('패혈증') && s.name !== '패혈증')
    dmg += SYMPTOMS['패혈증']?.allBonus || 0;
  if (dmg > 0) parts.push(`HP -${dmg}`);

  if (d.defReduce || d.defReduceAmp) {
    let r = d.defReduce || 0;
    for (const [src, val] of Object.entries(d.defReduceAmp || {}))
      if (an.has(src)) r += val;
    if (r > 0) parts.push(`방어 -${r}`);
  }

  if (d.treatDebuff) parts.push(`치료 -${d.treatDebuff}`);
  if (d.drawReduce)  parts.push(`드로우 -${d.drawReduce}`);
  if (d.defHalf)     parts.push('방어 ½');
  if (d.treatHalf)   parts.push('치료 ½');
  if (d.defNullify)  parts.push('방어 무효');

  return parts.join('  ');
}
