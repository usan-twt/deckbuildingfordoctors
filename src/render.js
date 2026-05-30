import { bus } from './events.js';
import * as engine from './engine.js';
import { playerPool, playerDeck, selectedPack, PACK_NAMES, setPack, setDeck, getDefaultDeck } from './deck.js';

bus.addEventListener('log', e => {
  const el = document.getElementById('log-content');
  if (el) { el.textContent += e.detail + '\n'; el.scrollTop = el.scrollHeight; }
});

bus.addEventListener('state:changed', () => {
  if (engine.G) renderAll();
});

export function renderAll() {
  renderInfo();
  renderVitals();
  renderDeck();
  renderHand();
  renderSearch();
  document.getElementById('btn-turn-end').disabled =
    !(engine.isTurnActive() && !engine.isPlayingCard() && !engine.isPickingDiscard());
}

function renderSearch() {
  const opts = engine.searchOptions();
  let ov = document.getElementById('search-overlay');
  if (!opts.length) { if (ov) ov.remove(); return; }
  const CARDS = engine.CARDS;
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'search-overlay';
    ov.className = 'result-overlay';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="result-box">
    <div class="result-title">수소문 — 회수할 카드</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px">
      ${opts.map(o => `
        <div class="hand-card disc-${CARDS[o.id]?.discipline}" data-idx="${o.idx}">
          <div class="cost">${CARDS[o.id]?.cost}</div>
          <div class="card-name">${o.id}</div>
          <div class="effect">${(CARDS[o.id]?.desc || '').replace(/\n/g, ' ')}</div>
        </div>`).join('')}
    </div>
  </div>`;
  ov.querySelectorAll('[data-idx]').forEach(el =>
    el.addEventListener('click', () => engine.resolveSearchPick(+el.dataset.idx)));
}

function renderInfo() {
  const G = engine.G;
  document.getElementById('turn-info').textContent =
    `턴 ${G.turn}  ·  에너지 ${G.energy} / ${G.energyMax}`;
}

function renderVitals() {
  const G = engine.G;
  const panel = document.getElementById('vitals-panel');
  const pPct = Math.max(0, (G.patientHp / G.maxHp) * 100).toFixed(1);
  const dPct = Math.max(0, (G.diseaseHp / G.maxDiseaseHp) * 100).toFixed(1);
  const picking = engine.isPickingSymptom();

  const cands = engine.pickCandidates();
  const condRows = G.symptoms.map((s, i) => {
    const isActive = s.sup === 0;
    const canPick = picking && cands.includes(s);
    const stateClass = isActive ? 'is-active' : 'is-suppressed';
    const pickClass = canPick ? ' pickable' : '';
    const timer = isActive ? `방치 ${s.neglect}턴` : `억제 ${s.sup}턴 남음`;
    const intent = engine.computeSymptomIntent(s);
    const dispName = s.diag ? s.name : '?';
    return `<div class="cond ${stateClass}${pickClass}" data-idx="${i}">
      <div class="cond-row">
        <span class="cond-name">${dispName}</span>
        <span class="timer">${timer}</span>
      </div>
      ${intent ? `<div class="cond-intent">${intent}</div>` : ''}
    </div>`;
  }).join('');

  const debuff = G.treatDebuff > 0
    ? `<div class="debuff-notice">⚠ 치료 효과 −${G.treatDebuff}</div>` : '';

  panel.className = 'vitals-panel' + (picking ? ' picking' : '');
  panel.innerHTML = `
    <div class="hp-block">
      <div class="hp-row">
        <span class="label">환자 HP</span>
        <span class="num">${G.patientHp} / ${G.maxHp}</span>
      </div>
      <div class="hp-bar"><div class="fill" style="width:${pPct}%"></div></div>
    </div>
    <div class="hp-block">
      <div class="hp-row">
        <span class="label">본체 HP</span>
        <span class="num disease">${G.diseaseHp} / ${G.maxDiseaseHp}</span>
      </div>
      <div class="hp-bar disease"><div class="fill" style="width:${dPct}%"></div></div>
    </div>
    <div class="conditions-title">상태이상</div>
    ${condRows}
    ${debuff}
  `;

  if (picking) {
    panel.querySelectorAll('.cond.pickable').forEach(el => {
      el.addEventListener('click', () => {
        const sym = G.symptoms[+el.dataset.idx];
        if (sym && cands.includes(sym)) engine.resolveSymptomPick(sym);
      });
    });
  }
}

function renderDeck() {
  const G = engine.G;
  document.getElementById('deck-panel').innerHTML = `
    <div>
      <div class="turn-badge">턴 ${G.turn}</div>
      <div class="energy-display">
        <div class="e-label">에너지</div>
        <div class="e-num">${G.energy} / ${G.energyMax}</div>
      </div>
    </div>
    <div>
      <div class="pile-row"><span>덱</span><span>${G.deck.length}</span></div>
      <div class="pile-row"><span>버린더미</span><span>${G.discard.length}</span></div>
    </div>
  `;
}

function renderHand() {
  const G = engine.G;
  const CARDS = engine.CARDS;
  const handEl = document.getElementById('hand');
  handEl.innerHTML = '';
  const pickMode = engine.isPickingDiscard() || engine.isPickingHandTarget();

  G.hand.forEach((id, idx) => {
    if (!id) return;
    const c = CARDS[id];
    const markCut = G.marked?.id === id ? G.marked.cost : 0;
    const cost = Math.max(0, c.cost - G.costReduce - markCut);
    const canPlay = engine.isTurnActive() && !engine.isPlayingCard() && G.energy >= cost;

    const card = document.createElement('div');
    card.className = `hand-card disc-${c.discipline}` +
      (pickMode ? ' discard-pick' : (canPlay ? '' : ' disabled'));
    card.innerHTML = `
      <div class="cost">${cost}</div>
      <div class="attr">${c.discipline}</div>
      <div class="card-name">${id}</div>
      <div class="effect">${c.desc}</div>
    `;
    if (pickMode || canPlay) card.addEventListener('click', () => engine.handleCardClick(idx));
    handEl.appendChild(card);
  });
}

export function renderPatient(scenario) {
  const p = scenario.patient || {};
  document.getElementById('scenario-name').textContent = scenario.name;
  document.getElementById('patient-name').textContent = p.name || '환자';
  document.getElementById('patient-layer').textContent = p.info || '—';
  document.getElementById('patient-complaint').textContent = p.chief_complaint || '—';
}

export function showResult(title, detail) {
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-detail').textContent = detail;
  document.getElementById('result-overlay').classList.remove('hidden');
}

export function renderDeckBuilder() {
  const CARDS = engine.CARDS;

  const packBar = document.getElementById('db-pack-bar');
  if (packBar) {
    packBar.innerHTML = `<span class="db-pack-label">동료 팩</span>` +
      PACK_NAMES.map(p =>
        `<button class="db-pack-btn${selectedPack === p ? ' active' : ''}" data-pack="${p}">${p}</button>`
      ).join('');
    packBar.querySelectorAll('[data-pack]').forEach(el =>
      el.addEventListener('click', () => {
        setPack(el.dataset.pack);
        setDeck(getDefaultDeck());
        renderDeckBuilder();
      }));
  }

  const inDeckCount = {};
  for (const id of playerDeck) inDeckCount[id] = (inDeckCount[id] || 0) + 1;

  // ── 보유 카드 풀 ──
  const poolEl = document.getElementById('db-pool');
  poolEl.innerHTML = '';

  for (const disc of ['공통', '내과', '외과']) {
    const cardIds = Object.keys(playerPool).filter(id => CARDS[id]?.discipline === disc);
    if (!cardIds.length) continue;

    const grp = document.createElement('div');
    grp.className = 'db-disc-group';
    grp.innerHTML = `<div class="db-disc-label disc-${disc}">${disc}</div>`;

    for (const id of cardIds) {
      const avail = playerPool[id] - (inDeckCount[id] || 0);
      const c = CARDS[id];
      const el = document.createElement('div');
      el.className = 'db-pool-card' + (avail <= 0 ? ' exhausted' : '');
      el.innerHTML = `
        <span class="db-pc-cost">${c.cost}</span>
        <span class="db-pc-info">
          <span class="db-pc-name">${id}</span>
          <span class="db-pc-desc">${c.desc.replace(/\n/g, ' ')}</span>
        </span>
        <span class="db-pc-avail">${avail > 0 ? `+${avail}` : '—'}</span>
      `;
      if (avail > 0) el.addEventListener('click', () => { playerDeck.push(id); renderDeckBuilder(); });
      grp.appendChild(el);
    }
    poolEl.appendChild(grp);
  }

  // ── 현재 덱 ──
  const listEl = document.getElementById('db-deck-list');
  listEl.innerHTML = '';

  const grouped = {};
  for (const id of playerDeck) grouped[id] = (grouped[id] || 0) + 1;

  const discOrder = { 공통: 0, 내과: 1, 외과: 2 };
  const sorted = Object.entries(grouped).sort(([a], [b]) =>
    (discOrder[CARDS[a]?.discipline] || 0) - (discOrder[CARDS[b]?.discipline] || 0) ||
    a.localeCompare(b, 'ko')
  );

  for (const [id, cnt] of sorted) {
    const c = CARDS[id];
    const item = document.createElement('div');
    item.className = 'db-deck-item';
    item.innerHTML = `
      <span class="db-di-dot disc-dot-${c.discipline}"></span>
      <span class="db-di-name">${id}${cnt > 1 ? ` ×${cnt}` : ''}</span>
      <button class="db-di-remove">✕</button>
    `;
    item.querySelector('.db-di-remove').addEventListener('click', () => {
      const idx = playerDeck.lastIndexOf(id);
      if (idx !== -1) playerDeck.splice(idx, 1);
      renderDeckBuilder();
    });
    listEl.appendChild(item);
  }

  const n = playerDeck.length;
  const countEl = document.getElementById('db-deck-count');
  countEl.textContent = `${n}장`;
  countEl.className = n < 10 ? 'warn' : '';
  document.getElementById('btn-start-battle').disabled = n < 10;
}
