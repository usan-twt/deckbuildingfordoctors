// Chart.js is loaded as UMD global via CDN script tag in index.html

const _instances = {};

function destroy(id) {
  if (_instances[id]) { _instances[id].destroy(); delete _instances[id]; }
}

export function drawScatter(canvasId, results) {
  destroy(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  const datasets = Object.values(results).map(r => ({
    label: r.label,
    data: r.games.filter(g => g.outcome === 'win').map(g => ({ x: g.turns, y: g.patientHp })),
    backgroundColor: r.color + 'aa',
    pointRadius: 5,
    pointHoverRadius: 7,
  }));

  _instances[canvasId] = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      animation: false,
      scales: {
        x: { title: { display: true, text: '소모 턴' }, min: 0, ticks: { stepSize: 1 } },
        y: { title: { display: true, text: '남은 환자 HP' }, min: 0 },
      },
      plugins: { legend: { position: 'top' },
                 tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x}턴, HP ${ctx.parsed.y}` } } },
    },
  });
}

export function drawWinRate(canvasId, results) {
  destroy(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  const labels = Object.values(results).map(r => r.label);

  _instances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '승리', data: Object.values(results).map(r => +(r.winRate * 100).toFixed(1)),     backgroundColor: '#27ae60' },
        { label: '패배', data: Object.values(results).map(r => +(r.loseRate * 100).toFixed(1)),    backgroundColor: '#c0392b' },
        { label: '시간초과', data: Object.values(results).map(r => +(r.timeoutRate * 100).toFixed(1)), backgroundColor: '#7f8c8d' },
      ],
    },
    options: {
      animation: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, min: 0, max: 100, title: { display: true, text: '%' } },
      },
      plugins: { legend: { position: 'top' } },
    },
  });
}

export function drawHpCurves(canvasId, results) {
  destroy(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');

  function pct(arr, p) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const i = (p / 100) * (s.length - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }

  const datasets = [];
  for (const r of Object.values(results)) {
    const byTurn = {};
    for (const game of r.games) {
      for (const snap of game.hpTrace) {
        if (!byTurn[snap.turn]) byTurn[snap.turn] = [];
        byTurn[snap.turn].push(snap.patientHp);
      }
    }
    const turns = Object.keys(byTurn).map(Number).sort((a, b) => a - b);
    const p25  = turns.map(t => ({ x: t, y: pct(byTurn[t], 25) }));
    const med  = turns.map(t => ({ x: t, y: pct(byTurn[t], 50) }));
    const p75  = turns.map(t => ({ x: t, y: pct(byTurn[t], 75) }));

    // p25 lower bound (fill target)
    datasets.push({ label: `_${r.label}_lo`, data: p25, borderColor: 'transparent',
      backgroundColor: 'transparent', pointRadius: 0, fill: false, showLine: true });
    // p75 upper bound fills down to p25
    datasets.push({ label: `_${r.label}_hi`, data: p75, borderColor: 'transparent',
      backgroundColor: r.color + '28', pointRadius: 0, fill: '-1', showLine: true });
    // median line
    datasets.push({ label: r.label, data: med, borderColor: r.color,
      backgroundColor: 'transparent', borderWidth: 2.5,
      pointRadius: 0, fill: false, showLine: true });
  }

  _instances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      animation: false,
      parsing: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: '턴' }, min: 1, ticks: { stepSize: 1 } },
        y: { title: { display: true, text: '환자 HP (중앙값 ± IQR)' }, min: 0 },
      },
      plugins: {
        legend: { position: 'top',
          labels: { filter: item => !item.text.startsWith('_') } },
        tooltip: { mode: 'index', intersect: false,
          filter: item => !item.dataset.label.startsWith('_') },
      },
    },
  });
}

// ─── STAGE 2: CARD ANALYSIS ──────────────────────────────────────────────────

export function drawCardUsage(canvasId, results) {
  destroy(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');

  // collect all card ids across all personas
  const allCards = new Set();
  for (const r of Object.values(results))
    for (const id of Object.keys(r.cardStats)) allCards.add(id);
  const labels = [...allCards].sort();
  const nGames = Object.values(results)[0]?.games.length || 1;

  const datasets = Object.values(results).map(r => ({
    label: r.label,
    data: labels.map(id => +(((r.cardStats[id]?.totalPlays || 0) / nGames).toFixed(2))),
    backgroundColor: r.color + 'cc',
  }));

  _instances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      animation: false,
      indexAxis: 'y',
      scales: {
        x: { title: { display: true, text: '평균 사용 횟수/판' }, min: 0 },
        y: { ticks: { font: { size: 11 } } },
      },
      plugins: { legend: { position: 'top' } },
    },
  });
}

export function drawCardHeatmap(containerId, cardStats, maxTurn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const cardIds = Object.keys(cardStats).sort();
  const cols = Math.min(maxTurn || 15, 15);
  const totalPlays = Object.values(cardStats).reduce((s, v) => s + v.totalPlays, 0);
  const globalMax = totalPlays > 0
    ? Math.max(...Object.values(cardStats).flatMap(v => Object.values(v.byTurn)))
    : 1;

  const table = document.createElement('table');
  table.className = 'bs-heatmap-table';

  // header row
  const thead = table.createTHead();
  const hrow = thead.insertRow();
  hrow.insertCell().textContent = '카드 \\ 턴';
  for (let t = 1; t <= cols; t++) {
    const th = document.createElement('th');
    th.textContent = t;
    hrow.appendChild(th);
  }

  // data rows
  const tbody = table.createTBody();
  for (const id of cardIds) {
    const row = tbody.insertRow();
    const nameCell = row.insertCell();
    nameCell.textContent = id;
    nameCell.className = 'bs-heatmap-label';
    for (let t = 1; t <= cols; t++) {
      const cell = row.insertCell();
      const count = cardStats[id]?.byTurn[t] || 0;
      const intensity = globalMax > 0 ? count / globalMax : 0;
      cell.style.background = `rgba(180, 120, 60, ${intensity.toFixed(3)})`;
      cell.title = `${id} · 턴${t}: ${count}회`;
      cell.textContent = count > 0 ? count : '';
    }
  }

  container.innerHTML = '';
  container.appendChild(table);
}

export function drawCardImpact(containerId, impactData) {
  destroy(containerId + '-win');
  destroy(containerId + '-hp');

  const container = document.getElementById(containerId);
  if (!container) return;

  const { cards, baseWinRate, baseAvgHp } = impactData;
  const sorted   = [...cards].sort((a, b) => Math.abs(b.deltaWinRate) - Math.abs(a.deltaWinRate));
  const labels   = sorted.map(c => c.id);
  const winDelta = sorted.map(c => +(c.deltaWinRate * 100).toFixed(1));
  const hpDelta  = sorted.map(c => +c.deltaAvgHp.toFixed(2));

  container.innerHTML = `
    <div class="bs-impact-kpi">
      기준 — 승률 <strong>${(baseWinRate * 100).toFixed(1)}%</strong> &nbsp;·&nbsp; 평균 환자 HP <strong>${baseAvgHp.toFixed(1)}</strong>
      &nbsp;<span class="bs-impact-kpi-note">(카드 제거 시 각 지표의 변화량)</span>
    </div>
    <div class="bs-impact-charts">
      <div class="bs-impact-half"><canvas id="${containerId}-win"></canvas></div>
      <div class="bs-impact-half"><canvas id="${containerId}-hp"></canvas></div>
    </div>`;

  function makeChart(id, data, yLabel, title) {
    const ctx = document.getElementById(id).getContext('2d');
    _instances[id] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: data.map(v => v >= 0 ? '#27ae60cc' : '#c0392bcc'),
        }],
      },
      options: {
        animation: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: title, font: { size: 12 }, padding: { bottom: 8 } },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y} ${yLabel}` } },
        },
        scales: {
          x: { ticks: { font: { size: 11 } } },
          y: { title: { display: true, text: yLabel },
               ticks: { callback: v => (v > 0 ? '+' : '') + v } },
        },
      },
    });
  }

  makeChart(containerId + '-win', winDelta, '%',   '카드 제거 시 승률 변화 (%)');
  makeChart(containerId + '-hp',  hpDelta,  'HP',  '카드 제거 시 평균 환자 HP 변화');
}
