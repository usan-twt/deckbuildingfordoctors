from .state import BattleState
from .symptom import trigger_suppress

CARD_DATA = None

def load_cards(path):
    global CARD_DATA
    import json
    with open(path) as f:
        CARD_DATA = {c["id"]: c for c in json.load(f)}

def play_card(st: BattleState, card_id: str):
    c = CARD_DATA[card_id]
    e = c["effect"]
    ctype = c["type"]

    st.msg(f"  > {card_id} 사용")

    if ctype == "treatment":
        dmg = e.get("damage", 0)
        # 반감 효과 체크 (고열경련)
        from .symptom import SYMPTOM_DATA
        for s in st.symptoms:
            if s.suppressed == 0 and SYMPTOM_DATA.get(s.name, {}).get("treatment_half"):
                dmg //= 2
                st.msg(f"    [{s.name}] 치료 효과 반감")
                break
        # 버프/디버프 적용
        dmg = max(0, dmg + st.treatment_buff - st.treatment_debuff)
        st.treatment_buff = 0  # 소모성 버프

        if "suppress" in e:
            _do_suppress(st, e)
        elif dmg:
            st.disease_hp -= dmg
            st.msg(f"    본체 -{dmg} HP → {st.disease_hp}")

    elif ctype == "stabilize":
        def_val = e.get("defense", 0)
        heal = e.get("heal", 0)
        st.defense_total += def_val
        if heal:
            st.patient_hp = min(st.max_patient_hp, st.patient_hp + heal)
            st.msg(f"    환자 +{heal} HP → {st.patient_hp}")
        if def_val:
            st.msg(f"    방어 +{def_val} (누적 {st.defense_total})")
        if e.get("reveal"):
            _reveal(st, e["reveal"])
        if e.get("reveal_all"):
            st.msg("    모든 증상 의도 확인")

    elif ctype == "support":
        if "buff_next_treatment" in e:
            st.treatment_buff += e["buff_next_treatment"]
            st.msg(f"    다음 치료 카드 +{e['buff_next_treatment']}")
        if "cost_reduce_next" in e:
            st.cost_reduce_next += e["cost_reduce_next"]
            st.msg(f"    다음 카드 코스트 -{e['cost_reduce_next']}")
        if "draw" in e:
            st.draw_cards(e["draw"])
            st.msg(f"    {e['draw']}장 드로우")
        if "buff_treatment_this_turn" in e:
            st.treatment_buff += e["buff_treatment_this_turn"]
            st.msg(f"    이번 턴 치료 카드 +{e['buff_treatment_this_turn']}")
        if e.get("reveal_all"):
            st.msg("    모든 증상 의도 확인")

def _do_suppress(st: BattleState, effect):
    from .symptom import SYMPTOM_DATA
    target = effect.get("suppress")
    turns = effect.get("turns", 2)

    active = [s for s in st.symptoms if s.suppressed == 0]
    if not active:
        st.msg("    억제할 활성 증상 없음")
        return

    if target == "any":
        # CLI: 플레이어 선택
        print("    억제할 증상 선택:")
        for i, s in enumerate(active):
            print(f"      {i}. {s.name}")
        while True:
            try:
                idx = int(input("      번호: "))
                chosen = active[idx]
                break
            except (ValueError, IndexError):
                print("      다시 입력")
    else:
        chosen = next((s for s in active if s.name == target), None)
        if not chosen:
            st.msg(f"    {target} 활성 아님")
            return

    # 패혈증 suppress_reduce
    from .symptom import SYMPTOM_DATA as SD
    for s in st.symptoms:
        if s.name == "패혈증" and s.suppressed == 0:
            turns = max(1, turns + SD["패혈증"].get("suppress_reduce", 0))

    chosen.suppressed = turns
    chosen.neglect = 0
    chosen.escalate_count = 0
    st.msg(f"    {chosen.name} {turns}턴 억제")
    trigger_suppress(st, chosen.name)

def _reveal(st: BattleState, n: int):
    hidden = [s for s in st.symptoms if True]  # 모든 증상은 알려진 것으로 처리
    st.msg(f"    증상 {n}개 의도 확인")
