// ─── PERSONA WEIGHTS ────────────────────────────────────────────────────────

const WEIGHTS = {
  rush:      { dmg: 3.0, def: 0.3, heal: 0.2, sup: 0.5, tempo: 1.0,
               lowHpDefMult: 1.0, lowHpHealMult: 1.0, finishMult: 2.0, alwaysPlay: false },
  safe:      { dmg: 1.0, def: 2.5, heal: 2.0, sup: 1.0, tempo: 0.8,
               lowHpDefMult: 2.0, lowHpHealMult: 2.0, finishMult: 1.5, alwaysPlay: false },
  control:   { dmg: 0.5, def: 1.0, heal: 0.5, sup: 3.0, tempo: 0.8,
               lowHpDefMult: 1.5, lowHpHealMult: 1.0, finishMult: 1.5, alwaysPlay: false },
  efficient: { dmg: 1.5, def: 1.0, heal: 0.5, sup: 1.0, tempo: 2.5,
               lowHpDefMult: 1.5, lowHpHealMult: 1.0, finishMult: 2.0, alwaysPlay: true  },
};

// ─── SCORING ─────────────────────────────────────────────────────────────────

function symptomUrgency(s, SYMPTOMS) {
  const d = SYMPTOMS[s.name] || {};
  const baseDmg = d.dmg || 0;
  const aboutToEvolve = d.evolveAt && s.neglect >= d.evolveAt - 1;
  return baseDmg + s.neglect * 0.5 + (aboutToEvolve ? 10 : 0);
}

function scoreCard(id, G, CARDS, SYMPTOMS, w) {
  const c = CARDS[id];
  if (!c) return -Infinity;
  const e = c.effect;
  const an = new Set(G.symptoms.filter(s => s.sup === 0).map(s => s.name));

  let dmg = 0, def = 0, heal = 0, sup = 0, tempo = 0;

  if (c.type === 'treatment') {
    if (e.damage) {
      dmg = Math.max(0, e.damage + G.treatBuff - G.treatDebuff);
    }
    if (e.suppress) {
      const active = G.symptoms.filter(s => s.sup === 0);
      if (active.length) sup = Math.max(...active.map(s => symptomUrgency(s, SYMPTOMS)));
    }
    if (e.suppress_symptom) {
      const t = G.symptoms.find(s => s.name === e.suppress_symptom && s.sup === 0);
      sup = t ? symptomUrgency(t, SYMPTOMS) : 0;
    }
  }

  if (c.type === 'stabilize') {
    def = e.defense || 0;
    if (e.defense_if_active)
      for (const [sym, bonus] of Object.entries(e.defense_if_active))
        if (an.has(sym)) def += bonus;
    if (e.heal) heal = e.heal;
  }

  if (c.type === 'support') {
    if (e.cost_reduce_next)    tempo += e.cost_reduce_next * 2;
    if (e.buff_next_treatment) tempo += e.buff_next_treatment * 1.5;
    if (e.buff_treatment)      tempo += e.buff_treatment * 1.5;
  }

  // companion-pack effects (type-agnostic)
  if (e.yakchop) dmg += (G.yakchopUses || 0) * (e.yakchop.bonus_per_use || 0);
  if (e.repeat_last_treatment) {
    const lt = G.lastTreatment, rp = e.repeat_last_treatment;
    if (lt && rp.disciplines.includes(lt.discipline)) dmg += Math.max(0, lt.damage - (rp.penalty || 0));
  }
  if (e.draw)             tempo += e.draw * 1.5;
  if (e.deck_search)      tempo += (e.deck_search.take || 1) * 1.5;
  if (e.hand_cost_reduce) tempo += 2;
  if (e.reveal)           tempo += 0.5 * e.reveal;
  if (e.rapport_gain)     tempo += 0.5 * e.rapport_gain;
  if (e.rapport_spend && G.rapport >= e.rapport_spend.cost) tempo += (e.rapport_spend.draw || 0) * 1.5;
  if (e.rapport_bonus && G.rapport >= e.rapport_bonus.threshold) def += e.rapport_bonus.defense || 0;
  if (e.heal_if_low && G.patientHp / G.maxHp < e.heal_if_low.threshold) heal += e.heal_if_low.amount;
  if (e.next_turn_draw)   tempo += e.next_turn_draw;

  // context multipliers
  let wDmg = w.dmg, wDef = w.def, wHeal = w.heal, wSup = w.sup, wTempo = w.tempo;
  if (G.patientHp / G.maxHp < 0.3) { wDef *= w.lowHpDefMult; wHeal *= w.lowHpHealMult; }
  if (G.diseaseHp <= 10)             wDmg *= w.finishMult;
  // control: imminent evolution is critical
  if (w.sup >= 3) {
    const imminent = G.symptoms.some(s => {
      const d = SYMPTOMS[s.name] || {};
      return s.sup === 0 && d.evolveAt && s.neglect >= d.evolveAt - 1;
    });
    if (imminent && sup > 0) wSup *= 3;
  }

  return dmg * wDmg + def * wDef + heal * wHeal + sup * wSup + tempo * wTempo;
}

// ─── PERSONA FACTORY ─────────────────────────────────────────────────────────

function makePersona(w) {
  return {
    chooseCard(G, CARDS, SYMPTOMS) {
      const playable = G.hand
        .map((id, idx) => ({ id, idx }))
        .filter(({ id }) => id && G.energy >= Math.max(0, CARDS[id].cost - G.costReduce));
      if (!playable.length) return -1;
      const scored = playable
        .map(({ id, idx }) => ({ idx, score: scoreCard(id, G, CARDS, SYMPTOMS, w) }))
        .sort((a, b) => b.score - a.score);
      if (w.alwaysPlay) return scored[0].idx;
      return scored[0].score > 0 ? scored[0].idx : -1;
    },
    pickSymptom(active, G, SYMPTOMS) {
      if (!active.length) return null;
      return active.reduce((best, s) =>
        symptomUrgency(s, SYMPTOMS) > symptomUrgency(best, SYMPTOMS) ? s : best
      );
    },
    pickDiscard(hand, G, CARDS) {
      const valid = hand.map((id, idx) => ({ id, idx })).filter(x => x.id);
      if (!valid.length) return -1;
      valid.sort((a, b) => (CARDS[a.id]?.cost || 0) - (CARDS[b.id]?.cost || 0));
      return valid[0].idx;
    },
  };
}

// ─── PLANNER (turn-search + symptom-phase lookahead) ────────────────────────
// A near-optimal "skilled player": searches all play orderings this turn
// (capturing buff→treatment, reducer→big-card, finisher combos) and scores each
// outcome by simulating the upcoming symptom phase (survival, disease progress,
// evolution risk). Heavier than the weighted personas but plays markedly better.

function symDamage(s, SYM, an) {
  const d = SYM[s.name] || {};
  let x = d.dmg || 0;
  if (d.escalate) x += d.escalate * s.escalate;
  for (const [k, v] of Object.entries(d.amp || {})) if (an.has(k)) x += v;
  if (an.has('패혈증') && s.name !== '패혈증') x += SYM['패혈증']?.allBonus || 0;
  return x;
}

function phaseLoss(active, defTotal, SYM) {
  const an = new Set(active.map(s => s.name));
  let total = 0, dr = 0;
  for (const s of active) {
    total += symDamage(s, SYM, an);
    const d = SYM[s.name] || {};
    if (s.name === '탈수') {
      let r = d.defReduce || 0;
      for (const [k, v] of Object.entries(d.defReduceAmp || {})) if (an.has(k)) r += v;
      dr += r;
    }
    if (s.name === '호흡곤란') dr += d.drawReduce || 0;
  }
  const nul = active.some(s => SYM[s.name]?.defNullify);
  const def = nul ? 0 : Math.max(0, defTotal - dr);
  return Math.max(0, total - def);
}

function bestSupTarget(G, sup, SYM) {
  const an = new Set(G.symptoms.filter(s => s.sup === 0).map(s => s.name));
  let best = null, bv = -1;
  for (const s of G.symptoms) {
    if (s.sup !== 0 || sup.has(s.name)) continue;
    const d = SYM[s.name] || {};
    const v = symDamage(s, SYM, an) + (d.evolveAt && s.neglect >= d.evolveAt - 1 ? 1000 : 0);
    if (v > bv) { bv = v; best = s.name; }
  }
  return best;
}

function applyPlan(S, id, c, e, SYM, G) {
  const N = { ...S, sup: new Set(S.sup) };
  N.energy -= Math.max(0, c.cost - N.costRed);
  N.costRed = 0;
  if (c.type === 'treatment') {
    if (e.suppress_symptom) {
      const s = G.symptoms.find(x => x.name === e.suppress_symptom && x.sup === 0);
      if (s) N.sup.add(s.name);
    } else if (e.suppress) {
      const t = bestSupTarget(G, N.sup, SYM); if (t) N.sup.add(t);
    } else if (e.damage != null) {
      let d = e.damage + N.buff;
      if (G.symptoms.some(s => s.sup === 0 && !N.sup.has(s.name) && SYM[s.name]?.treatHalf)) d = Math.floor(d / 2);
      d = Math.max(0, d);
      if (e.yakchop) d += (G.yakchopUses || 0) * (e.yakchop.bonus_per_use || 0);
      N.diseaseHp -= d; N.buff = 0;
    }
  } else if (c.type === 'stabilize') {
    if (e.defense) N.defTotal += e.defense;
    if (e.defense_if_active)
      for (const [k, b] of Object.entries(e.defense_if_active))
        if (G.symptoms.some(s => s.sup === 0 && !N.sup.has(s.name) && s.name === k)) N.defTotal += b;
    if (e.heal) N.heal += e.heal;
    if (e.heal_if_low && G.patientHp / G.maxHp < e.heal_if_low.threshold) N.heal += e.heal_if_low.amount;
    if (e.suppress_symptom) {
      const s = G.symptoms.find(x => x.name === e.suppress_symptom && x.sup === 0);
      if (s) N.sup.add(s.name);
    }
  } else if (c.type === 'support') {
    if (e.buff_next_treatment) N.buff += e.buff_next_treatment;
    if (e.buff_treatment) N.buff += e.buff_treatment;
    if (e.cost_reduce_next) N.costRed += e.cost_reduce_next;
    if (e.draw) N.drew += e.draw;
    if (e.repeat_last_treatment && G.lastTreatment &&
        e.repeat_last_treatment.disciplines.includes(G.lastTreatment.discipline))
      N.diseaseHp -= Math.max(0, G.lastTreatment.damage - (e.repeat_last_treatment.penalty || 0));
  }
  return N;
}

function evalPlan(S, G, SYM) {
  let sc = (G.diseaseHp - S.diseaseHp) * 1.0;
  if (S.diseaseHp <= 0) return sc + 10000;
  const active = G.symptoms.filter(s => s.sup === 0 && !S.sup.has(s.name));
  const net = phaseLoss(active, S.defTotal, SYM);
  const pa = Math.min(G.maxHp, G.patientHp + S.heal) - net;
  if (pa <= 0) return sc - 10000;
  sc += pa * 0.8;
  for (const s of active) {
    const d = SYM[s.name] || {};
    if (d.evolveAt && s.neglect + 1 >= d.evolveAt) sc -= 15;
  }
  const an = new Set(G.symptoms.filter(z => z.sup === 0).map(z => z.name));
  for (const nm of S.sup) {
    const s = G.symptoms.find(x => x.name === nm);
    if (s) sc += symDamage(s, SYM, an) * 0.5;
  }
  sc -= S.energy * 0.5;
  sc += S.drew * 1.0;
  return sc;
}

export const plannerPersona = {
  chooseCard(G, CARDS, SYM) {
    const hand = G.hand.filter(Boolean);
    const base = { energy: G.energy, costRed: G.costReduce, buff: G.treatBuff,
      diseaseHp: G.diseaseHp, defTotal: G.defTotal, heal: 0, sup: new Set(), drew: 0 };
    function rec(S, h, depth) {
      let bv = evalPlan(S, G, SYM), bm = -1;
      if (depth >= 5) return { v: bv, m: -1 };
      const seen = new Set();
      for (let i = 0; i < h.length; i++) {
        const id = h[i];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const c = CARDS[id], e = c.effect;
        if (Math.max(0, c.cost - S.costRed) > S.energy) continue;
        const NS = applyPlan(S, id, c, e, SYM, G);
        const rest = h.slice(); rest.splice(i, 1);
        const sub = rec(NS, rest, depth + 1);
        if (sub.v > bv) { bv = sub.v; bm = i; }
      }
      return { v: bv, m: bm };
    }
    return rec(base, hand, 0).m;
  },
  pickSymptom(active, G, SYM) {
    if (!active.length) return null;
    const an = new Set(G.symptoms.filter(s => s.sup === 0).map(s => s.name));
    const urg = s => symDamage(s, SYM, an) +
      ((SYM[s.name]?.evolveAt && s.neglect >= SYM[s.name].evolveAt - 1) ? 1000 : 0);
    return active.reduce((b, s) => urg(s) > urg(b) ? s : b);
  },
  pickDiscard(hand, G, CARDS) {
    const valid = hand.map((id, idx) => ({ id, idx })).filter(x => x.id);
    if (!valid.length) return -1;
    valid.sort((a, b) => (CARDS[a.id]?.cost || 0) - (CARDS[b.id]?.cost || 0));
    return valid[0].idx;
  },
  pickSearch(opts) { return opts[0]?.idx ?? -1; },
  pickHandTarget(hand) { return hand.findIndex(x => x); },
};

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export const PERSONAS = {
  rush:      { label: '러쉬',   color: '#c0392b', persona: makePersona(WEIGHTS.rush) },
  safe:      { label: '안정',   color: '#2980b9', persona: makePersona(WEIGHTS.safe) },
  control:   { label: '컨트롤', color: '#8e44ad', persona: makePersona(WEIGHTS.control) },
  efficient: { label: '효율',   color: '#27ae60', persona: makePersona(WEIGHTS.efficient) },
  planner:   { label: '숙련',   color: '#d4860b', persona: plannerPersona },
};
