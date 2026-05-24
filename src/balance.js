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

async function runPersona(scenario, deck, persona, nRuns, onProgress, progressOffset, total) {
  const games = [];
  let currentGame = null;

  const strategy = {
    chooseCard:   (...a) => persona.chooseCard(...a),
    pickSymptom:  (...a) => persona.pickSymptom(...a),
    pickDiscard:  (...a) => persona.pickDiscard(...a),
    onTurnStart(snap) { if (currentGame) currentGame.hpTrace.push(snap); },
    onCardPlayed(turn, id) { if (currentGame) currentGame.cardLog.push({ turn, id }); },
  };

  engine.setSimStrategy(strategy);

  for (let i = 0; i < nRuns; i++) {
    currentGame = { hpTrace: [], cardLog: [], outcome: 'timeout', turns: 0, patientHp: 0 };
    engine.newGame(scenario, [...deck]);

    let outcome = 'timeout';
    for (let t = 0; t < 30; t++) {
      const r = await engine.runTurn();
      if (r !== 'continue') { outcome = r; break; }
    }

    currentGame.outcome   = outcome;
    currentGame.turns     = engine.G.turn;
    currentGame.patientHp = engine.G.patientHp;
    games.push(currentGame);

    onProgress?.((progressOffset + i + 1) / total);
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }

  engine.clearSimStrategy();
  return games;
}

export async function runBalance(baseScenario, deck, overrides, personaKeys, nRuns, onProgress) {
  const scenario = applyOverrides(baseScenario, overrides);
  const allResults = {};
  let offset = 0;
  const total = personaKeys.length * nRuns;

  for (const key of personaKeys) {
    const { persona, label, color } = PERSONAS[key];
    const games = await runPersona(scenario, deck, persona, nRuns, onProgress, offset, total);
    offset += nRuns;

    const wins  = games.filter(g => g.outcome === 'win');
    const loses = games.filter(g => g.outcome === 'lose');

    allResults[key] = {
      label, color, games,
      winRate:     wins.length  / nRuns,
      loseRate:    loses.length / nRuns,
      timeoutRate: (nRuns - wins.length - loses.length) / nRuns,
      avgTurns: games.reduce((s, g) => s + g.turns, 0) / nRuns,
      avgHp:    games.reduce((s, g) => s + g.patientHp, 0) / nRuns,
      cardStats: aggregateCardStats(games),
    };
  }

  return allResults;
}

export function aggregateCardStats(games) {
  // perCard[id] = { totalPlays, byTurn: {1:n, 2:n, ...} }
  const perCard = {};
  for (const game of games) {
    for (const { turn, id } of game.cardLog) {
      if (!perCard[id]) perCard[id] = { totalPlays: 0, byTurn: {} };
      perCard[id].totalPlays++;
      perCard[id].byTurn[turn] = (perCard[id].byTurn[turn] || 0) + 1;
    }
  }
  return perCard;
}

export async function runImpactAnalysis(baseScenario, deck, overrides, personaKey, nRuns, onProgress) {
  const scenario = applyOverrides(baseScenario, overrides);
  const { persona } = PERSONAS[personaKey];

  const uniqueIds = [...new Set(deck)];
  const total = nRuns * (uniqueIds.length + 1);

  // baseline
  const baseGames = await runPersona(scenario, deck, persona, nRuns, onProgress, 0, total);
  const baseWinRate = baseGames.filter(g => g.outcome === 'win').length / nRuns;
  const baseAvgHp   = baseGames.reduce((s, g) => s + g.patientHp, 0) / nRuns;

  const results = [];
  let offset = nRuns;

  for (const cardId of uniqueIds) {
    const deckWithout = [...deck];
    const removeIdx = deckWithout.indexOf(cardId);
    deckWithout.splice(removeIdx, 1);

    const games = await runPersona(scenario, deckWithout, persona, nRuns, onProgress, offset, total);
    offset += nRuns;

    const wr = games.filter(g => g.outcome === 'win').length / nRuns;
    const ah = games.reduce((s, g) => s + g.patientHp, 0) / nRuns;

    results.push({
      id: cardId,
      deltaWinRate: baseWinRate - wr,
      deltaAvgHp:   baseAvgHp   - ah,
    });
  }

  results.sort((a, b) => b.deltaWinRate - a.deltaWinRate);
  return { baseWinRate, baseAvgHp, cards: results };
}
