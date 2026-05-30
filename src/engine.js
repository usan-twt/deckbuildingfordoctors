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
let _searchPickResolver = null;
let _handTargetResolver = null;
let _pickingSymptom = false;
let _pickingDiscard = false;
let _searchOptions = [];
let _pickingHandTarget = false;

export const isTurnActive     = () => _turnActive;
export const isPlayingCard    = () => _playingCard;
export const isPickingSymptom = () => _pickingSymptom;
export const isPickingDiscard = () => _pickingDiscard;
export const isPickingHandTarget = () => _pickingHandTarget;
export const searchOptions    = () => _searchOptions;

export function loadData(cardsData, symptomsData) {
  CARDS = cardsData;
  BASE_SYMPTOMS = symptomsData;
}

let _savedCards        = null;
let _savedBaseSymptoms = null;
export function swapCards(patched)        { _savedCards = CARDS; CARDS = patched; }
export function restoreCards()            { if (_savedCards        != null) { CARDS         = _savedCards;        _savedCards        = null; } }
export function swapBaseSymptoms(patched) { _savedBaseSymptoms = BASE_SYMPTOMS; BASE_SYMPTOMS = patched; }
export function restoreBaseSymptoms()     { if (_savedBaseSymptoms != null) { BASE_SYMPTOMS = _savedBaseSymptoms; _savedBaseSymptoms = null; } }

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

export function resolveSearchPick(deckIdx) {
  if (!_searchPickResolver) return;
  const r = _searchPickResolver;
  _searchPickResolver = null;
  _searchOptions = [];
  r(deckIdx);
  emit('state:changed');
}

export function resolveHandTarget(idx) {
  if (!_pickingHandTarget) return;
  _pickingHandTarget = false;
  const r = _handTargetResolver;
  _handTargetResolver = null;
  r(idx);
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
    symptoms:  scenario.symptoms.map(name => ({
      name, sup: 0, neglect: 0, escalate: 0,
      diag: !(scenario.hidden || []).includes(name),
    })),
    deck:      shuffle([...deck]),
    discard: [], hand: [], turn: 0,
    treatBuff: 0, treatDebuff: 0, defTotal: 0, defReduce: 0, costReduce: 0,
    rapport: 0, yakchopUses: 0, lastTreatment: null,
    blockReactiv: 0, nextTurnDraw: 0, marked: null,
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
    if (s.sup > 0) {
      s.sup--; s.neglect = 0;
      if (s.sup === 0 && G.blockReactiv > 0) { s.sup = 1; }
    }
    else {
      s.neglect++;
      if (d.evolveAt && s.neglect >= d.evolveAt) {
        log(`  ⚠ ${s.name} ${d.evolveAt}턴 방치 → ${d.evolveTo} 진화!`);
        s.name = d.evolveTo; s.neglect = 0; s.escalate = 0;
      }
    }
  }
  if (G.blockReactiv > 0) G.blockReactiv--;
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
    G.symptoms.push({ name, sup: 0, neglect: 0, escalate: 0, diag: true });
    log(`  ${name} 부여`);
  }
}

function suppressTurns(base) {
  const sep = getSym('패혈증');
  if (sep && sep.sup === 0) return Math.max(1, base + (SYMPTOMS['패혈증'].suppressReduce || 0));
  return base;
}

function applySuppress(chosen, base) {
  const turns = suppressTurns(base);
  chosen.sup = turns; chosen.neglect = 0; chosen.escalate = 0;
  log(`  ${chosen.name} ${turns}턴 억제`);
  triggerSuppress(chosen.name);
}

async function doSuppress(effect) {
  const act = active();
  if (!act.length) { log('  억제할 활성 증상 없음'); return; }
  log('  증상을 클릭하여 선택하세요');
  const chosen = await waitSymptomPick(act);
  _pickingSymptom = false;
  if (!chosen) return;
  applySuppress(chosen, effect.turns || 2);
}

let _pickCandidates = [];
export const pickCandidates = () => _pickCandidates;

async function waitSymptomPick(candidates) {
  if (_simStrategy) return _simStrategy.pickSymptom(candidates, G, SYMPTOMS);
  _pickCandidates = candidates;
  _pickingSymptom = true;
  emit('state:changed');
  return new Promise(r => { _symptomPickResolver = r; });
}

async function doReveal(n) {
  for (let i = 0; i < n; i++) {
    const hidden = G.symptoms.filter(s => !s.diag);
    if (!hidden.length) return;
    const chosen = await waitSymptomPick(hidden);
    _pickingSymptom = false;
    if (!chosen) return;
    chosen.diag = true;
    log(`  ${chosen.name} 진단`);
  }
}

async function waitSearchPick(opts) {
  if (_simStrategy)
    return _simStrategy.pickSearch ? _simStrategy.pickSearch(opts, G, CARDS) : 0;
  _searchOptions = opts;
  emit('state:changed');
  return new Promise(r => { _searchPickResolver = r; });
}

async function doSearch(look, take) {
  if (!G.deck.length && G.discard.length) G.deck = shuffle(G.discard.splice(0));
  if (!G.deck.length) { log('  덱이 비어 수소문 불발'); return; }
  shuffle(G.deck);
  for (let t = 0; t < take; t++) {
    const n = Math.min(look, G.deck.length);
    if (!n) break;
    const opts = G.deck.slice(0, n).map((id, i) => ({ id, idx: i }));
    log('  카드를 클릭하여 회수');
    const idx = await waitSearchPick(opts);
    if (idx == null || idx < 0 || idx >= G.deck.length) continue;
    const [card] = G.deck.splice(idx, 1);
    G.hand.push(card);
    log(`  ${card} 손으로`);
  }
}

async function waitHandTargetPick() {
  if (_simStrategy) {
    if (_simStrategy.pickHandTarget) return _simStrategy.pickHandTarget(G.hand, G, CARDS);
    const cand = G.hand.map((id, i) => ({ id, i })).filter(x => x.id)
      .sort((a, b) => (CARDS[b.id]?.cost || 0) - (CARDS[a.id]?.cost || 0));
    return cand.length ? cand[0].i : -1;
  }
  _pickingHandTarget = true;
  emit('state:changed');
  return new Promise(r => { _handTargetResolver = r; });
}

async function doHandTarget(e) {
  if (!G.hand.filter(Boolean).length) return;
  log('  코스트를 줄일 카드를 클릭하세요');
  const idx = await waitHandTargetPick();
  if (idx == null || idx < 0 || !G.hand[idx]) return;
  const id = G.hand[idx];
  const isTreat = CARDS[id]?.type === 'treatment';
  G.marked = { id, cost: e.amount || 1, bonus: isTreat ? (e.treatment_bonus || 0) : 0 };
  log(`  ${id} 코스트 -${G.marked.cost}${G.marked.bonus ? `, 치료 +${G.marked.bonus}` : ''}`);
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
  _simStrategy?.onCardPlayed?.(G.turn, id);

  const wasMarked = G.marked?.id === id;
  const markBonus = wasMarked ? G.marked.bonus : 0;
  if (wasMarked) G.marked = null;

  function dealDamage(base) {
    let dmg = base;
    for (const s of G.symptoms)
      if (s.sup === 0 && SYMPTOMS[s.name]?.treatHalf) { dmg = Math.floor(dmg / 2); break; }
    dmg = Math.max(0, dmg + G.treatBuff + markBonus - G.treatDebuff);
    G.treatBuff = 0;
    G.diseaseHp -= dmg;
    G.lastTreatment = { discipline: c.discipline, damage: dmg };
    log(`  본체 -${dmg} HP → ${G.diseaseHp}`);
  }

  if (c.type === 'treatment') {
    if (e.suppress_symptom) {
      const target = getSym(e.suppress_symptom);
      if (target && target.sup === 0) applySuppress(target, e.suppress_turns || 2);
      else log(`  ${e.suppress_symptom} 비활성 (효과 반쪽)`);
      if (e.add_symptom) addSymptom(e.add_symptom);
      return;
    }
    if (e.suppress) { await doSuppress(e); return; }
    let base = e.damage || 0;
    if (e.yakchop) {
      const bonus = G.yakchopUses * (e.yakchop.bonus_per_use || 0);
      if (bonus) log(`  약첩 누적 +${bonus}`);
      base += bonus;
      G.yakchopUses++;
    }
    dealDamage(base);

  } else if (c.type === 'stabilize') {
    if (e.defense) { G.defTotal += e.defense; log(`  방어 +${e.defense} (누적 ${G.defTotal})`); }
    if (e.defense_if_active) {
      for (const [sym, bonus] of Object.entries(e.defense_if_active)) {
        if (activeNames().has(sym)) { G.defTotal += bonus; log(`  조건부 방어 +${bonus} (${sym} 활성)`); }
      }
    }
    if (e.rapport_bonus) {
      const rb = e.rapport_bonus;
      if (G.rapport >= rb.threshold) {
        if (rb.defense) { G.defTotal += rb.defense; log(`  라포 보너스 방어 +${rb.defense} (누적 ${G.defTotal})`); }
        for (let i = 0; i < (rb.suppress_any || 0); i++) {
          const act = active();
          if (act.length) applySuppress(act[0], 1);
        }
      }
    }
    if (e.heal) { G.patientHp = Math.min(G.maxHp, G.patientHp + e.heal); log(`  환자 +${e.heal} HP`); }
    if (e.heal_if_low && G.patientHp / G.maxHp < e.heal_if_low.threshold) {
      G.patientHp = Math.min(G.maxHp, G.patientHp + e.heal_if_low.amount);
      log(`  위급 추가 회복 +${e.heal_if_low.amount}`);
    }
    if (e.draw) { drawCards(e.draw); log(`  ${e.draw}장 드로우`); }
    if (e.block_reactivation) { G.blockReactiv = e.block_reactivation; log(`  ${e.block_reactivation}턴간 재활성화 차단`); }
    if (e.next_turn_draw) { G.nextTurnDraw += e.next_turn_draw; log(`  다음 턴 드로우 ${e.next_turn_draw}`); }
    if (e.random_status && Math.random() < e.random_status.chance) {
      const pool = ['발열', '출혈', '감염', '탈수', '통증', '호흡곤란'];
      addSymptom(pool[Math.floor(Math.random() * pool.length)]);
    }

  } else if (c.type === 'support') {
    if (e.buff_next_treatment) { G.treatBuff += e.buff_next_treatment; log(`  다음 치료 +${e.buff_next_treatment}`); }
    if (e.cost_reduce_next)    { G.costReduce += e.cost_reduce_next;   log(`  다음 코스트 -${e.cost_reduce_next}`); }
    if (e.draw)                { drawCards(e.draw); log(`  ${e.draw}장 드로우`); }
    if (e.buff_treatment)      { G.treatBuff += e.buff_treatment;       log(`  이번 턴 치료 +${e.buff_treatment}`); }
    if (e.deck_search)         { await doSearch(e.deck_search.look, e.deck_search.take || 1); }
    if (e.hand_cost_reduce)    { await doHandTarget(e.hand_cost_reduce); }
    if (e.repeat_last_treatment) {
      const lt = G.lastTreatment, rp = e.repeat_last_treatment;
      if (lt && rp.disciplines.includes(lt.discipline)) {
        const dmg = Math.max(0, lt.damage - (rp.penalty || 0));
        G.diseaseHp -= dmg;
        log(`  따라하기: 본체 -${dmg} HP → ${G.diseaseHp}`);
      } else log('  따라할 치료 없음');
    }
    if (e.rapport_spend) {
      const rs = e.rapport_spend;
      if (G.rapport >= rs.cost) {
        G.rapport -= rs.cost;
        log(`  라포 -${rs.cost} (남은 ${G.rapport})`);
        if (rs.draw) { drawCards(rs.draw); log(`  ${rs.draw}장 드로우`); }
        if (rs.cost_reduce_next) { G.costReduce += rs.cost_reduce_next; log(`  다음 코스트 -${rs.cost_reduce_next}`); }
      } else if (rs.partial_draw) {
        drawCards(rs.partial_draw); log(`  라포 부족 → ${rs.partial_draw}장만 드로우`);
      }
    }
    if (e.discard_from_hand) {
      if (G.hand.filter(Boolean).length > 0) {
        log('  버릴 카드를 클릭하세요');
        await waitDiscardPick();
      }
    }
  }

  if (e.reveal)     await doReveal(e.reveal);
  if (e.reveal_all) { for (const s of G.symptoms) s.diag = true; log('  모든 증상 진단'); }
  if (e.rapport_gain) { G.rapport += e.rapport_gain; log(`  라포 +${e.rapport_gain} (현재 ${G.rapport})`); }
}

export async function handleCardClick(idx) {
  if (_pickingDiscard) {
    resolveDiscardPick(idx);
    return;
  }
  if (_pickingHandTarget) {
    resolveHandTarget(idx);
    return;
  }
  if (!_turnActive || _playingCard) return;
  const id = G.hand[idx];
  if (!id) return;
  const markCut = G.marked?.id === id ? G.marked.cost : 0;
  const cost = Math.max(0, CARDS[id].cost - G.costReduce - markCut);
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
  G.treatBuff = 0; G.defTotal = 0; G.defReduce = 0; G.costReduce = 0; G.marked = null;
  G.treatDebuff = active().reduce((sum, s) => sum + (SYMPTOMS[s.name]?.treatDebuff || 0), 0);

  let drawN = 4;
  for (const s of G.symptoms) {
    if (s.sup !== 0) continue;
    const d = SYMPTOMS[s.name] || {};
    if (d.fixedDraw) { drawN = d.fixedDraw; break; }
    drawN -= d.drawReduce || 0;
  }
  drawN += G.nextTurnDraw; G.nextTurnDraw = 0;
  drawN = Math.max(2, drawN);
  G.hand = [];
  drawCards(drawN);

  _simStrategy?.onTurnStart?.({ turn: G.turn, patientHp: G.patientHp, diseaseHp: G.diseaseHp });
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
      const idx = _simStrategy.chooseCard(G, CARDS, SYMPTOMS);
      if (idx === -1) break;
      const id = G.hand[idx];
      if (!id) break;
      const markCut = G.marked?.id === id ? G.marked.cost : 0;
      const cost = Math.max(0, CARDS[id].cost - G.costReduce - markCut);
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
  if (!s.diag) return '?';
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
