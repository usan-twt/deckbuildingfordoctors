from .state import BattleState, SymptomState

SYMPTOM_DATA = None

def load_symptoms(path):
    global SYMPTOM_DATA
    import json
    with open(path) as f:
        SYMPTOM_DATA = json.load(f)

def symptom_phase(st: BattleState):
    """턴 종료 시 증상 행동 단계."""
    data = SYMPTOM_DATA
    active = [s for s in st.symptoms if s.suppressed == 0]
    active_names = {s.name for s in active}

    # 전이형: 이번 턴 억제된 증상의 전이 효과 먼저 처리
    for s in st.symptoms:
        if s.suppressed == 1:  # 방금 이번 턴 억제됨 (suppressed가 이 턴에 설정된 것)
            pass  # 전이형은 suppress 시점에 trigger_suppress 호출로 처리됨

    # 강화형: 활성 증상의 수치 계산
    total_damage = 0
    for s in active:
        d = data.get(s.name, {})
        dmg = d.get("base_damage", 0)

        # 출혈 에스컬레이션
        if s.name == "출혈" and "escalate" in d:
            dmg += d["escalate"] * s.escalate_count
            s.escalate_count += 1

        # 강화형 중첩
        for amp_src, amp_val in d.get("amplified_by", {}).items():
            if amp_src and amp_src in active_names:
                dmg += amp_val

        # 패혈증 보너스
        if "패혈증" in active_names and s.name != "패혈증":
            bonus = data["패혈증"].get("all_symptoms_bonus", 0)
            dmg += bonus

        # 증상별 특수 효과
        if s.name == "탈수":
            reduce = d.get("defense_reduce", 0)
            if "출혈" in active_names:
                reduce += d.get("amplified_by", {}).get("출혈", 0)
            st.defense_reduce += reduce

        if s.name == "통증":
            st.treatment_debuff += d.get("treatment_debuff", 0)
            # 통증 → 호흡곤란 강화
            if "호흡곤란" in active_names:
                st.draw_reduce += 1

        if s.name == "호흡곤란":
            dr = d.get("draw_reduce", 0)
            st.draw_reduce += dr

        if s.name == "호흡부전":
            st.draw_reduce = 99  # fixed_draw 2 처리는 turn.py에서

        total_damage += dmg
        if dmg:
            st.msg(f"  {s.name}: 환자 -{dmg} HP")

    # 방어 적용
    defense = max(0, st.defense_total - st.defense_reduce)
    if st.SUPPRESSED_DEFENSE_NULLIFY if hasattr(st, 'SUPPRESSED_DEFENSE_NULLIFY') else False:
        defense = 0
    net = max(0, total_damage - defense)
    if defense:
        st.msg(f"  방어 {st.defense_total} - 감소 {st.defense_reduce} = {defense} 적용 → 실피해 {net}")
    st.patient_hp -= net
    st.defense_total = 0  # 방어 리셋

    # 억제 카운터 감소 + 방치 카운터 증가
    for s in st.symptoms:
        d = data.get(s.name, {})
        if s.suppressed > 0:
            s.suppressed -= 1
            s.neglect = 0  # 억제 중 리셋
        else:
            s.neglect += 1
            evolves_at = d.get("evolves_at")
            if evolves_at and s.neglect >= evolves_at:
                evolve_to = d.get("evolves_to")
                st.msg(f"  ⚠️  {s.name} {evolves_at}턴 방치 → {evolve_to} 진화!")
                s.name = evolve_to
                s.neglect = 0
                s.escalate_count = 0

def trigger_suppress(st: BattleState, suppressed_name: str):
    """억제 시점 촉발형·전이형 즉시 효과 (이번 턴 증상 페이즈에 반영)."""
    data = SYMPTOM_DATA
    d = data.get(suppressed_name, {})

    # 촉발형
    for tgt, effect in d.get("trigger_on_suppress", {}).items():
        if st.is_active(tgt):
            st.msg(f"  [촉발] {suppressed_name} 억제 → {tgt} 반응")
            if "treatment_debuff" in effect:
                st.treatment_debuff += effect["treatment_debuff"]

    # 전이형
    for tgt, effect in d.get("transfer_on_suppress", {}).items():
        st.msg(f"  [전이] {suppressed_name} 억제 → {tgt}로 전이")
        if "defense_reduce" in effect:
            st.defense_reduce += effect["defense_reduce"]
