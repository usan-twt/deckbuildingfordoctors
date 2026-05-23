import json, random
from dataclasses import dataclass, field
from typing import Optional

def load_json(path):
    with open(path) as f:
        return json.load(f)

@dataclass
class SymptomState:
    name: str
    suppressed: int = 0      # turns remaining suppressed
    neglect: int = 0         # neglect counter
    escalate_count: int = 0  # for 출혈 escalation

@dataclass
class BattleState:
    disease_hp: int
    patient_hp: int
    max_patient_hp: int
    energy_max: int
    energy: int
    symptoms: list           # list of SymptomState
    deck: list               # card id strings
    hand: list = field(default_factory=list)
    discard: list = field(default_factory=list)
    turn: int = 0
    # turn buffs
    treatment_buff: int = 0
    treatment_debuff: int = 0
    defense_reduce: int = 0
    cost_reduce_next: int = 0
    draw_reduce: int = 0
    defense_total: int = 0
    log: list = field(default_factory=list)

    def msg(self, s):
        self.log.append(s)
        print(s)

    def draw_cards(self, n):
        for _ in range(n):
            if not self.deck:
                if not self.discard:
                    break
                self.deck = self.discard[:]
                random.shuffle(self.deck)
                self.discard = []
                self.msg("  [덱 소진 → 버린 더미 셔플]")
            self.hand.append(self.deck.pop(0))

    def get_symptom(self, name) -> Optional[SymptomState]:
        for s in self.symptoms:
            if s.name == name:
                return s
        return None

    def is_active(self, name) -> bool:
        s = self.get_symptom(name)
        return s is not None and s.suppressed == 0
