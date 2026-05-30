export function buildCards(arr) {
  const out = {};
  for (const c of arr)
    out[c.id] = { cost: c.cost, type: c.type, discipline: c.discipline || '공통', pack: c.pack || null, desc: c.desc || '', effect: c.effect };
  return out;
}

export function buildSymptoms(raw) {
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
