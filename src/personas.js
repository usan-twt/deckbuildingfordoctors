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

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export const PERSONAS = {
  rush:      { label: '러쉬',   color: '#c0392b', persona: makePersona(WEIGHTS.rush) },
  safe:      { label: '안정',   color: '#2980b9', persona: makePersona(WEIGHTS.safe) },
  control:   { label: '컨트롤', color: '#8e44ad', persona: makePersona(WEIGHTS.control) },
  efficient: { label: '효율',   color: '#27ae60', persona: makePersona(WEIGHTS.efficient) },
};
