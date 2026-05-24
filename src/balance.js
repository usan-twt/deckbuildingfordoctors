import * as engine from './engine.js';
import { PERSONAS } from './personas.js';

export function applyOverrides(base, ov) {
  const s = { ...base };
  if (ov.diseaseHp != null) s.disease_hp = ov.diseaseHp;
  if (ov.patientHp != null) { s.patient_hp = ov.patientHp; s.max_patient_hp = ov.patientHp; }
  if (ov.energyMax != null) s.energy_max = ov.energyMax;
  if (ov.symptoms  != null) s.symptoms = ov.symptoms;
  return s;
}

export async function runBalance(baseScenario, deck, overrides, personaKeys, nRuns, onProgress) {
  const scenario = applyOverrides(baseScenario, overrides);
  const allResults = {};
  let done = 0;
  const total = personaKeys.length * nRuns;

  for (const key of personaKeys) {
    const { persona, label, color } = PERSONAS[key];
    const games = [];
    let currentGame = null;

    const strategy = {
      chooseCard:   (...a) => persona.chooseCard(...a),
      pickSymptom:  (...a) => persona.pickSymptom(...a),
      pickDiscard:  (...a) => persona.pickDiscard(...a),
      onTurnStart(snap) { if (currentGame) currentGame.hpTrace.push(snap); },
    };

    engine.setSimStrategy(strategy);

    for (let i = 0; i < nRuns; i++) {
      currentGame = { hpTrace: [], outcome: 'timeout', turns: 0, patientHp: 0 };
      engine.newGame(scenario, [...deck]);

      let outcome = 'timeout';
      for (let t = 0; t < 30; t++) {
        const r = await engine.runTurn();
        if (r !== 'continue') { outcome = r; break; }
      }

      currentGame.outcome = outcome;
      currentGame.turns   = engine.G.turn;
      currentGame.patientHp = engine.G.patientHp;
      games.push(currentGame);

      done++;
      onProgress?.(done / total);
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    engine.clearSimStrategy();

    const wins  = games.filter(g => g.outcome === 'win');
    const loses = games.filter(g => g.outcome === 'lose');

    allResults[key] = {
      label, color, games,
      winRate:     wins.length  / nRuns,
      loseRate:    loses.length / nRuns,
      timeoutRate: (nRuns - wins.length - loses.length) / nRuns,
      avgTurns: games.reduce((s, g) => s + g.turns, 0) / nRuns,
      avgHp:    games.reduce((s, g) => s + g.patientHp, 0) / nRuns,
    };
  }

  return allResults;
}
