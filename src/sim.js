import * as engine from './engine.js';

export const randomStrategy = {
  chooseCard(G, CARDS) {
    const playable = G.hand
      .map((id, idx) => ({ id, idx }))
      .filter(({ id }) => id && G.energy >= Math.max(0, CARDS[id].cost - G.costReduce));
    if (!playable.length) return -1;
    return playable[Math.floor(Math.random() * playable.length)].idx;
  },
  pickSymptom(active) {
    if (!active.length) return null;
    return active[Math.floor(Math.random() * active.length)];
  },
  pickDiscard(hand) {
    const valid = hand.map((id, idx) => ({ id, idx })).filter(x => x.id);
    if (!valid.length) return -1;
    return valid[Math.floor(Math.random() * valid.length)].idx;
  },
};

export const greedyStrategy = {
  chooseCard(G, CARDS) {
    const playable = G.hand
      .map((id, idx) => ({ id, idx, cost: Math.max(0, CARDS[id]?.cost - G.costReduce) }))
      .filter(({ id, cost }) => id && G.energy >= cost);
    if (!playable.length) return -1;
    playable.sort((a, b) =>
      (CARDS[b.id]?.effect?.damage || 0) - (CARDS[a.id]?.effect?.damage || 0) || b.cost - a.cost
    );
    return playable[0].idx;
  },
  pickSymptom(active) {
    if (!active.length) return null;
    return active[0];
  },
  pickDiscard(hand, G, CARDS) {
    const valid = hand.map((id, idx) => ({ id, idx })).filter(x => x.id);
    if (!valid.length) return -1;
    valid.sort((a, b) => (CARDS[a.id]?.cost || 0) - (CARDS[b.id]?.cost || 0));
    return valid[0].idx;
  },
};

export const suppressFirstStrategy = {
  chooseCard(G, CARDS) {
    const playable = G.hand
      .map((id, idx) => ({ id, idx, cost: Math.max(0, CARDS[id]?.cost - G.costReduce) }))
      .filter(({ id, cost }) => id && G.energy >= cost);
    if (!playable.length) return -1;
    const suppress = playable.filter(
      x => CARDS[x.id]?.effect?.suppress || CARDS[x.id]?.effect?.suppress_symptom
    );
    if (suppress.length) return suppress[0].idx;
    return greedyStrategy.chooseCard(G, CARDS);
  },
  pickSymptom: greedyStrategy.pickSymptom,
  pickDiscard: greedyStrategy.pickDiscard,
};

export async function runSim(scenario, deck, strategy, nRuns = 200) {
  engine.setSimStrategy(strategy);
  const results = [];

  for (let i = 0; i < nRuns; i++) {
    engine.newGame(scenario, [...deck]);
    let outcome = 'timeout';
    for (let t = 0; t < 30; t++) {
      const r = await engine.runTurn();
      if (r !== 'continue') { outcome = r; break; }
    }
    results.push({ outcome, turns: engine.G.turn, hp: engine.G.patientHp });
  }

  engine.clearSimStrategy();

  const wins  = results.filter(r => r.outcome === 'win');
  const loses = results.filter(r => r.outcome === 'lose');
  const avgTurns    = results.reduce((s, r) => s + r.turns, 0) / nRuns;
  const avgHpOnWin  = wins.length ? wins.reduce((s, r) => s + r.hp, 0) / wins.length : 0;
  const hps         = results.map(r => r.hp);

  return {
    runs:       nRuns,
    winRate:    (wins.length  / nRuns * 100).toFixed(1),
    loseRate:   (loses.length / nRuns * 100).toFixed(1),
    avgTurns:   avgTurns.toFixed(1),
    avgHpOnWin: avgHpOnWin.toFixed(1),
    minHp:      Math.min(...hps),
    maxHp:      Math.max(...hps),
  };
}
