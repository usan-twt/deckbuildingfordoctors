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
