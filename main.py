import json, random, sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from engine.state import BattleState, SymptomState
from engine.card import load_cards
from engine.symptom import load_symptoms
from engine.turn import run_turn

def load_scenario(path):
    with open(path) as f:
        return json.load(f)

def main():
    scenario_path = ROOT / "scenarios" / "tutorial.json"
    if len(sys.argv) > 1:
        scenario_path = Path(sys.argv[1])

    load_cards(ROOT / "data" / "cards.json")
    load_symptoms(ROOT / "data" / "symptoms.json")

    sc = load_scenario(scenario_path)
    print(f"\n[ {sc['name']} ]")

    deck = sc["deck"][:]
    random.shuffle(deck)

    st = BattleState(
        disease_hp=sc["disease_hp"],
        patient_hp=sc["patient_hp"],
        max_patient_hp=sc["max_patient_hp"],
        energy_max=sc["energy_max"],
        energy=sc["energy_max"],
        symptoms=[SymptomState(name=n) for n in sc["symptoms"]],
        deck=deck,
    )

    while True:
        result = run_turn(st)
        if result == "win":
            print(f"\n🏥 치료 성공! {st.turn}턴 | 환자 HP {st.patient_hp}/{st.max_patient_hp}")
            break
        elif result == "lose":
            print(f"\n💀 치료 실패. 환자 HP 0. {st.turn}턴")
            break

if __name__ == "__main__":
    main()
