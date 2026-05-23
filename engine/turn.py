from .state import BattleState
from .card import CARD_DATA, play_card
from .symptom import SYMPTOM_DATA, symptom_phase

DRAW_PER_TURN = 4

def run_turn(st: BattleState) -> str:
    """한 턴 실행. 반환값: 'win'|'lose'|'continue'"""
    st.turn += 1
    st.energy = st.energy_max
    st.treatment_buff = 0
    st.treatment_debuff = 0
    st.defense_reduce = 0
    st.cost_reduce_next = 0
    st.draw_reduce = 0

    # 호흡곤란/호흡부전 드로우 감소는 증상 페이즈 후 이미 반영됨
    # 드로우: 전 턴 draw_reduce를 여기서 적용
    draw_n = DRAW_PER_TURN
    for s in st.symptoms:
        if s.suppressed == 0:
            d = SYMPTOM_DATA.get(s.name, {})
            if d.get("fixed_draw"):
                draw_n = d["fixed_draw"]
                break
            draw_n -= d.get("draw_reduce", 0)
    draw_n = max(2, draw_n)  # 최소 2

    st.hand = []
    st.draw_cards(draw_n)

    _print_status(st)

    # 카드 플레이 루프
    played_ids = []
    while True:
        print(f"\n핸드: " + ", ".join(
            f"[{i}]{cid}({CARD_DATA[cid]['cost']})" for i, cid in enumerate(st.hand)
        ))
        inp = input("카드 번호 (공백 구분, 엔터=턴 종료): ").strip()
        if not inp:
            break
        try:
            indices = [int(x) for x in inp.split()]
        except ValueError:
            print("숫자만 입력하세요.")
            continue

        for idx in indices:
            if idx >= len(st.hand):
                print(f"  {idx} 없음")
                continue
            card_id = st.hand[idx]
            cost = CARD_DATA[card_id]["cost"]
            cost = max(0, cost - st.cost_reduce_next)
            st.cost_reduce_next = 0
            if st.energy < cost:
                print(f"  에너지 부족 ({st.energy}/{cost})")
                continue
            st.energy -= cost
            play_card(st, card_id)
            played_ids.append(card_id)
            st.hand[idx] = None  # 플레이한 카드 마킹
            if st.disease_hp <= 0:
                return "win"

        # 플레이한 카드 제거
        played = [c for c in st.hand if c is None]
        remaining = [c for c in st.hand if c is not None]
        st.discard.extend(played_ids[-len(played):])
        st.hand = remaining

    # 턴 종료 → 버린 더미로
    st.discard.extend(st.hand)
    st.hand = []

    st.msg(f"\n--- 증상 페이즈 ---")
    symptom_phase(st)

    if st.patient_hp <= 0:
        return "lose"

    st.msg(f"턴 {st.turn} 종료 | 환자 HP {st.patient_hp}/{st.max_patient_hp} | 본체 HP {st.disease_hp}")
    return "continue"

def _print_status(st: BattleState):
    symptom_str = []
    for s in st.symptoms:
        status = f"억제{s.suppressed}턴" if s.suppressed > 0 else f"활성(방치{s.neglect})"
        symptom_str.append(f"{s.name}[{status}]")
    print(f"\n{'='*60}")
    print(f"턴 {st.turn} | 에너지 {st.energy}/{st.energy_max} | 환자 HP {st.patient_hp}/{st.max_patient_hp} | 본체 HP {st.disease_hp}")
    print(f"증상: {', '.join(symptom_str)}")
    print(f"{'='*60}")
