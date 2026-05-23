// ─── DATA ────────────────────────────────────────────────────────────────────

const CARDS = {
  '투약':         { cost: 1, type: 'treatment', effect: { damage: 6 } },
  '응급시술':     { cost: 2, type: 'treatment', effect: { damage: 12 } },
  '대증처치':     { cost: 1, type: 'treatment', effect: { suppress: 'any', turns: 2 } },
  '수액투여':     { cost: 1, type: 'stabilize', effect: { defense: 6 } },
  '응급처치':     { cost: 1, type: 'stabilize', effect: { defense: 3, heal: 2 } },
  '활력징후확인': { cost: 0, type: 'stabilize', effect: { defense: 2 } },
  '경과관찰':     { cost: 0, type: 'stabilize', effect: { defense: 3 } },
  '청진':         { cost: 0, type: 'support',   effect: { buff_next_treatment: 2 } },
  '약재준비':     { cost: 1, type: 'support',   effect: { cost_reduce_next: 1 } },
  '간호사호출':   { cost: 1, type: 'support',   effect: { draw: 2 } },
  '환자면담':     { cost: 1, type: 'support',   effect: { reveal_all: true, buff_treatment: 2 } },
};

const SYMPTOMS = {
  '발열':     { dmg: 3, amp: { '감염': 2, '탈수': 2 }, evolveAt: 5, evolveTo: '고열경련' },
  '출혈':     { dmg: 3, escalate: 2, amp: { '감염': 2 }, triggerSuppress: { '통증': { treatDebuff: 1 } }, evolveAt: 3, evolveTo: '출혈성쇼크' },
  '감염':     { dmg: 1, evolveAt: 4, evolveTo: '패혈증' },
  '탈수':     { dmg: 1, defReduce: 2, amp: { '출혈': 1 }, transferSuppress: { '발열': { defReduce: 1 } }, evolveAt: 5, evolveTo: '장기부전' },
  '통증':     { dmg: 0, treatDebuff: 1 },
  '호흡곤란': { dmg: 0, drawReduce: 1, amp: { '통증': 1 }, evolveAt: 3, evolveTo: '호흡부전' },
  // 진화형
  '고열경련':   { dmg: 5, treatHalf: true },
  '출혈성쇼크': { dmg: 8, defHalf: true },
  '패혈증':     { dmg: 0, allBonus: 2, suppressReduce: 1 },
  '호흡부전':   { dmg: 3, fixedDraw: 2 },
  '장기부전':   { dmg: 4, defNullify: true },
};

const STARTER_DECK = [
  '투약', '투약', '대증처치', '대증처치', '응급시술',
  '수액투여', '수액투여', '응급처치', '활력징후확인', '경과관찰',
  '청진', '청진', '약재준비', '간호사호출', '환자면담',
];

// ─── STATE ───────────────────────────────────────────────────────────────────

let G; // 전투 상태

function newGame() {
  G = {
    diseaseHp: 28, patientHp: 30, maxHp: 30, energyMax: 2,
    symptoms: [
      { name: '발열',  sup: 0, neglect: 0, escalate: 0 },
      { name: '탈수',  sup: 0, neglect: 0, escalate: 0 },
    ],
    deck: shuffle([...STARTER_DECK]),
    discard: [], hand: [], turn: 0,
    // 턴 버프
    treatBuff: 0, treatDebuff: 0, defTotal: 0, defReduce: 0, costReduce: 0,
  };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function active() { return G.symptoms.filter(s => s.sup === 0); }
function activeNames() { return new Set(active().map(s => s.name)); }
function getSym(name) { return G.symptoms.find(s => s.name === name) || null; }

// ─── UI ──────────────────────────────────────────────────────────────────────

const logEl = document.getElementById('log');
const cmdEl = document.getElementById('cmd');
const btnEl = document.getElementById('btn');

function print(s = '') { logEl.textContent += s + '\n'; logEl.scrollTop = logEl.scrollHeight; }

let _resolve = null;

function waitInput() {
  cmdEl.disabled = false;
  cmdEl.focus();
  return new Promise(r => { _resolve = r; });
}

function submit() {
  if (!_resolve) return;
  const v = cmdEl.value.trim();
  cmdEl.value = '';
  cmdEl.disabled = true;
  print('> ' + (v || '(턴 종료)'));
  _resolve(v);
  _resolve = null;
}

btnEl.onclick = submit;
cmdEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

// ─── DRAW ────────────────────────────────────────────────────────────────────

function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (!G.deck.length) {
      if (!G.discard.length) break;
      G.deck = shuffle(G.discard.splice(0));
      print('  [덱 소진 → 버린 더미 셔플]');
    }
    G.hand.push(G.deck.shift());
  }
}

// ─── SYMPTOM PHASE ───────────────────────────────────────────────────────────

function symptomPhase() {
  const an = activeNames();
  let totalDmg = 0;

  for (const s of active()) {
    const d = SYMPTOMS[s.name] || {};
    let dmg = d.dmg || 0;

    if (d.escalate) { dmg += d.escalate * s.escalate; s.escalate++; }
    for (const [src, val] of Object.entries(d.amp || {}))
      if (an.has(src)) dmg += val;
    if (an.has('패혈증') && s.name !== '패혈증')
      dmg += SYMPTOMS['패혈증'].allBonus || 0;

    if (s.name === '탈수') {
      let r = d.defReduce || 0;
      if (an.has('출혈')) r += d.amp?.['출혈'] || 0;
      G.defReduce += r;
    }
    if (s.name === '통증') {
      G.treatDebuff += d.treatDebuff || 0;
      if (an.has('호흡곤란')) G.defReduce += 1;
    }
    if (s.name === '호흡곤란') G.defReduce += d.drawReduce || 0;

    totalDmg += dmg;
    if (dmg) print(`  ${s.name}: 환자 -${dmg} HP`);
  }

  const def = SYMPTOMS[G.symptoms.find(s => s.name === '장기부전' && s.sup === 0)?.name]?.defNullify
    ? 0 : Math.max(0, G.defTotal - G.defReduce);
  const net = Math.max(0, totalDmg - def);
  if (G.defTotal || G.defReduce)
    print(`  방어 ${G.defTotal} - 감소 ${G.defReduce} = ${def} → 실피해 ${net}`);

  G.patientHp -= net;
  G.defTotal = 0;

  // 억제 카운트다운 + 방치 진화
  for (const s of G.symptoms) {
    const d = SYMPTOMS[s.name] || {};
    if (s.sup > 0) { s.sup--; s.neglect = 0; }
    else {
      s.neglect++;
      if (d.evolveAt && s.neglect >= d.evolveAt) {
        print(`  ⚠️  ${s.name} ${d.evolveAt}턴 방치 → ${d.evolveTo} 진화!`);
        s.name = d.evolveTo; s.neglect = 0; s.escalate = 0;
      }
    }
  }
}

function triggerSuppress(name) {
  const d = SYMPTOMS[name] || {};
  for (const [tgt, ef] of Object.entries(d.triggerSuppress || {})) {
    if (activeNames().has(tgt)) {
      print(`  [촉발] ${name} 억제 → ${tgt} 반응`);
      if (ef.treatDebuff) G.treatDebuff += ef.treatDebuff;
    }
  }
  for (const [, ef] of Object.entries(d.transferSuppress || {})) {
    print(`  [전이] ${name} 억제 → 전이 효과`);
    if (ef.defReduce) G.defReduce += ef.defReduce;
  }
}

// ─── PLAY CARD ───────────────────────────────────────────────────────────────

async function playCard(id) {
  const c = CARDS[id]; const e = c.effect;
  print(`  > ${id}`);

  if (c.type === 'treatment') {
    if (e.suppress) { await doSuppress(e); return; }
    let dmg = e.damage || 0;
    for (const s of G.symptoms)
      if (s.sup === 0 && SYMPTOMS[s.name]?.treatHalf) { dmg = Math.floor(dmg / 2); break; }
    dmg = Math.max(0, dmg + G.treatBuff - G.treatDebuff);
    G.treatBuff = 0;
    G.diseaseHp -= dmg;
    print(`    본체 -${dmg} HP → ${G.diseaseHp}`);

  } else if (c.type === 'stabilize') {
    if (e.defense) { G.defTotal += e.defense; print(`    방어 +${e.defense} (누적 ${G.defTotal})`); }
    if (e.heal) { G.patientHp = Math.min(G.maxHp, G.patientHp + e.heal); print(`    환자 +${e.heal} HP → ${G.patientHp}`); }

  } else if (c.type === 'support') {
    if (e.buff_next_treatment) { G.treatBuff += e.buff_next_treatment; print(`    다음 치료 +${e.buff_next_treatment}`); }
    if (e.cost_reduce_next)    { G.costReduce += e.cost_reduce_next;   print(`    다음 카드 코스트 -${e.cost_reduce_next}`); }
    if (e.draw)                { drawCards(e.draw); print(`    ${e.draw}장 드로우`); }
    if (e.buff_treatment)      { G.treatBuff += e.buff_treatment;       print(`    이번 턴 치료 +${e.buff_treatment}`); }
  }
}

async function doSuppress(effect) {
  const act = active();
  if (!act.length) { print('    억제할 활성 증상 없음'); return; }

  print('    억제할 증상:');
  act.forEach((s, i) => print(`      ${i}. ${s.name}`));
  const ans = await waitInput();
  const chosen = act[parseInt(ans)];
  if (!chosen) { print('    잘못된 입력'); return; }

  let turns = effect.turns || 2;
  const sep = getSym('패혈증');
  if (sep && sep.sup === 0) turns = Math.max(1, turns + (SYMPTOMS['패혈증'].suppressReduce || 0));

  chosen.sup = turns; chosen.neglect = 0; chosen.escalate = 0;
  print(`    ${chosen.name} ${turns}턴 억제`);
  triggerSuppress(chosen.name);
}

// ─── TURN ────────────────────────────────────────────────────────────────────

async function runTurn() {
  G.turn++;
  G.energy = G.energyMax;
  G.treatBuff = 0; G.treatDebuff = 0;
  G.defTotal = 0;  G.defReduce = 0; G.costReduce = 0;

  // 드로우 수
  let drawN = 4;
  for (const s of G.symptoms) {
    if (s.sup !== 0) continue;
    const d = SYMPTOMS[s.name] || {};
    if (d.fixedDraw) { drawN = d.fixedDraw; break; }
    drawN -= d.drawReduce || 0;
  }
  drawN = Math.max(2, drawN);
  G.hand = [];
  drawCards(drawN);

  printStatus();

  // 카드 플레이 루프
  while (true) {
    printHand();
    const inp = await waitInput();
    if (!inp) break;

    const indices = inp.split(/\s+/).map(Number).filter(n => !isNaN(n) && n < G.hand.length && G.hand[n] !== null);
    for (const idx of indices) {
      const id = G.hand[idx];
      if (!id) continue;
      const cost = Math.max(0, CARDS[id].cost - G.costReduce);
      G.costReduce = 0;
      if (G.energy < cost) { print(`  에너지 부족 (필요 ${cost}, 남은 ${G.energy})`); continue; }
      G.energy -= cost;
      G.hand[idx] = null;
      await playCard(id);
      if (G.diseaseHp <= 0) return 'win';
    }
    G.hand = G.hand.filter(Boolean);
  }

  G.discard.push(...G.hand.filter(Boolean));
  G.hand = [];

  print('\n─── 증상 페이즈 ───');
  symptomPhase();

  if (G.patientHp <= 0) return 'lose';
  print(`턴 ${G.turn} 종료 | 환자 HP ${G.patientHp}/${G.maxHp} | 본체 HP ${G.diseaseHp}\n`);
  return 'continue';
}

function printStatus() {
  const symStr = G.symptoms.map(s =>
    s.sup > 0 ? `${s.name}[억제${s.sup}턴]` : `${s.name}[활성·방치${s.neglect}]`
  ).join('  ');
  print('═'.repeat(56));
  print(`턴 ${G.turn} | 에너지 ${G.energy}/${G.energyMax} | 환자 HP ${G.patientHp}/${G.maxHp} | 본체 HP ${G.diseaseHp}`);
  print(`증상: ${symStr}`);
  print('═'.repeat(56));
}

function printHand() {
  const hand = G.hand.map((id, i) => id ? `[${i}] ${id}(${CARDS[id].cost})` : null).filter(Boolean);
  print('핸드: ' + hand.join('  ') + `  | 에너지 ${G.energy}/${G.energyMax}`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

(async () => {
  newGame();
  print('[ INTERN 전투 프로토타입 — 급성 악화 감기 ]');
  print('카드 번호를 공백으로 구분해 입력. 빈 입력 = 턴 종료.\n');

  while (true) {
    const result = await runTurn();
    if (result === 'win') {
      print(`\n✅ 치료 성공! ${G.turn}턴 | 환자 HP ${G.patientHp}/${G.maxHp}`);
      break;
    }
    if (result === 'lose') {
      print(`\n❌ 치료 실패. 환자 HP 0. ${G.turn}턴`);
      break;
    }
  }

  print('\n─ 새 게임: 페이지 새로고침 ─');
  cmdEl.disabled = true;
})();
