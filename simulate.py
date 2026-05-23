"""
§8 튜토리얼 시뮬레이션 — 능숙한 플레이 (4턴 승리) 자동 재현.
핸드를 고정하여 문서 수치와 일치하는지 검증.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from engine.state import BattleState, SymptomState
import engine.card as ec
from engine.card import load_cards, play_card
from engine.symptom import load_symptoms, symptom_phase, trigger_suppress

ROOT = Path(__file__).parent
load_cards(ROOT / "data" / "cards.json")
load_symptoms(ROOT / "data" / "symptoms.json")

def make_state():
    return BattleState(
        disease_hp=28, patient_hp=30, max_patient_hp=30,
        energy_max=2, energy=2,
        symptoms=[SymptomState("발열"), SymptomState("탈수")],
        deck=[], hand=[], discard=[],
    )

def reset_turn_buffs(st):
    st.energy = st.energy_max
    st.treatment_buff = 0
    st.treatment_debuff = 0
    st.defense_reduce = 0
    st.cost_reduce_next = 0
    st.draw_reduce = 0
    st.defense_total = 0

def run_fixed_turn(st, turn_n, hand, cards_to_play, suppress_target=None):
    st.turn = turn_n
    reset_turn_buffs(st)
    st.hand = hand[:]
    print(f"\n{'='*50}")
    print(f"턴 {turn_n} | 에너지 {st.energy} | 환자 HP {st.patient_hp} | 본체 HP {st.disease_hp}")
    syms = ', '.join(f"{s.name}[{'억제'+str(s.suppressed)+'턴' if s.suppressed else '활성'}]" for s in st.symptoms)
    print(f"증상: {syms}")

    # suppress_target 전달
    _orig_suppress = ec._do_suppress
    if suppress_target:
        def patched_suppress(st2, effect):
            turns = effect.get("turns", 2)
            for s in st2.symptoms:
                if s.name == suppress_target and s.suppressed == 0:
                    s.suppressed = turns
                    s.neglect = 0
                    st2.msg(f"    {s.name} {turns}턴 억제")
                    trigger_suppress(st2, s.name)
                    return
            st2.msg(f"    {suppress_target} 활성 아님")
        ec._do_suppress = patched_suppress

    for cid in cards_to_play:
        cost = ec.CARD_DATA[cid]["cost"]
        st.energy -= cost
        play_card(st, cid)
        if st.disease_hp <= 0:
            print(f"  ★ 본체 HP 0 → 승리!")
            ec._do_suppress = _orig_suppress
            return True

    ec._do_suppress = _orig_suppress

    print(f"  [증상 페이즈]")
    symptom_phase(st)
    print(f"  → 환자 HP {st.patient_hp} | 본체 HP {st.disease_hp}")
    return False

print("=== §8 능숙한 플레이 (4턴 승리) ===")
print("기대: 본체 28→20→14→6→0, 환자 30→28→25→25→25, 4턴 승리")

st = make_state()

# 턴1: 청진(0)+투약(1)+수액(1) | 기대: 본체 20, 방어 4, 피해 2, 환자 28
run_fixed_turn(st, 1, ["청진","투약","수액투여"], ["청진","투약","수액투여"])

# 턴2: 대증처치(1,탈수억제)+투약(1) | 기대: 본체 14, 피해 3, 환자 25
run_fixed_turn(st, 2, ["대증처치","투약"], ["대증처치","투약"], suppress_target="탈수")

# 턴3: 청진(0)+투약(1)+경과관찰(0) | 기대: 본체 6, 방어 3, 피해 0, 환자 25
run_fixed_turn(st, 3, ["청진","투약","경과관찰"], ["청진","투약","경과관찰"])

# 턴4: 응급시술(2) | 기대: 본체 0 → 승리
run_fixed_turn(st, 4, ["응급시술"], ["응급시술"])

print(f"\n최종: 환자 HP {st.patient_hp}/30 (기대 25)")
