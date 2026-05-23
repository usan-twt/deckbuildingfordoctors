const fs = require('fs');

function loadJSON(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

class SymptomState {
  constructor(name) {
    this.name = name;
    this.suppressed = 0;
    this.neglect = 0;
    this.escalateCount = 0;
  }
}

class BattleState {
  constructor({ diseaseHp, patientHp, maxPatientHp, energyMax, symptoms, deck }) {
    this.diseaseHp = diseaseHp;
    this.patientHp = patientHp;
    this.maxPatientHp = maxPatientHp;
    this.energyMax = energyMax;
    this.energy = energyMax;
    this.symptoms = symptoms;
    this.deck = deck;
    this.hand = [];
    this.discard = [];
    this.turn = 0;
    // turn buffs
    this.treatmentBuff = 0;
    this.treatmentDebuff = 0;
    this.defenseReduce = 0;
    this.costReduceNext = 0;
    this.defenseTotal = 0;
  }

  msg(s) { console.log(s); }

  drawCards(n) {
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) {
        if (!this.discard.length) break;
        this.deck = shuffle(this.discard.splice(0));
        this.msg('  [덱 소진 → 버린 더미 셔플]');
      }
      this.hand.push(this.deck.shift());
    }
  }

  getSymptom(name) { return this.symptoms.find(s => s.name === name) || null; }
  isActive(name) { const s = this.getSymptom(name); return s !== null && s.suppressed === 0; }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { BattleState, SymptomState, loadJSON, shuffle };
