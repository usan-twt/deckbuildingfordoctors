const readline = require('readline');
const path = require('path');
const { BattleState, SymptomState, loadJSON, shuffle } = require('./engine/state');
const { loadCards } = require('./engine/card');
const { loadSymptoms } = require('./engine/symptom');
const { runTurn } = require('./engine/turn');

const ROOT = __dirname;
loadCards(path.join(ROOT, 'data/cards.json'));
loadSymptoms(path.join(ROOT, 'data/symptoms.json'));

const scenarioPath = process.argv[2] || path.join(ROOT, 'scenarios/tutorial.json');
const sc = loadJSON(scenarioPath);

console.log(`\n[ ${sc.name} ]`);

const deck = shuffle(sc.deck.slice());
const st = new BattleState({
  diseaseHp: sc.disease_hp,
  patientHp: sc.patient_hp,
  maxPatientHp: sc.max_patient_hp,
  energyMax: sc.energy_max,
  symptoms: sc.symptoms.map(n => new SymptomState(n)),
  deck,
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

(async () => {
  while (true) {
    const result = await runTurn(st, rl);
    if (result === 'win') {
      console.log(`\n치료 성공! ${st.turn}턴 | 환자 HP ${st.patientHp}/${st.maxPatientHp}`);
      break;
    } else if (result === 'lose') {
      console.log(`\n치료 실패. 환자 HP 0. ${st.turn}턴`);
      break;
    }
  }
  rl.close();
})();
