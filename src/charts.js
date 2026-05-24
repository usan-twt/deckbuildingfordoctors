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
  const datasets = [];

  for (const r of Object.values(results)) {
    const sample = r.games.slice(0, 60);
    for (const game of sample) {
      datasets.push({
        label: r.label,
        data: game.hpTrace.map(s => ({ x: s.turn, y: s.patientHp })),
        borderColor: r.color + '50',
        borderWidth: 1,
        pointRadius: 0,
        showLine: true,
        fill: false,
        tension: 0.1,
      });
    }
  }

  // legend entries — one per persona (not per line)
  const legendDatasets = Object.values(results).map(r => ({
    label: r.label,
    borderColor: r.color,
    borderWidth: 2,
    data: [],
  }));

  _instances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { datasets: [...datasets, ...legendDatasets] },
    options: {
      animation: false,
      parsing: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: '턴' }, min: 0 },
        y: { title: { display: true, text: '환자 HP' }, min: 0 },
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { filter: item => item.datasetIndex >= datasets.length },
        },
        tooltip: { enabled: false },
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

export function drawCardImpact(canvasId, impactData) {
  destroy(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  const { cards, baseWinRate, baseAvgHp } = impactData;

  const labels   = cards.map(c => c.id);
  const winDelta = cards.map(c => +(c.deltaWinRate * 100).toFixed(1));
  const hpDelta  = cards.map(c => +c.deltaAvgHp.toFixed(2));

  _instances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '승률 기여 (%)',
          data: winDelta,
          backgroundColor: winDelta.map(v => v >= 0 ? '#27ae60cc' : '#c0392bcc'),
          yAxisID: 'yWin',
          order: 2,
        },
        {
          label: '환자HP 기여',
          data: hpDelta,
          type: 'line',
          borderColor: '#2980b9',
          backgroundColor: 'transparent',
          pointRadius: 5,
          tension: 0.1,
          yAxisID: 'yHp',
          order: 1,
        },
      ],
    },
    options: {
      animation: false,
      scales: {
        x: { ticks: { font: { size: 11 } } },
        yWin: {
          position: 'left',
          title: { display: true, text: '승률 기여 (%)' },
        },
        yHp: {
          position: 'right',
          title: { display: true, text: 'HP 기여' },
          grid: { drawOnChartArea: false },
        },
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterTitle: () => `기준: 승률 ${(baseWinRate * 100).toFixed(1)}% / HP ${baseAvgHp.toFixed(1)}`,
          },
        },
      },
    },
  });
}
