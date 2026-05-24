import * as engine from './engine.js';

let _cardOverrides    = {};
let _symptomOverrides = {};
let _onRun = null;

// Only numeric fields that are meaningful to tune
const EFFECT_LABELS = {
  damage:              '데미지',
  defense:             '방어',
  heal:                '회복',
  draw:                '드로우',
  turns:               '억제턴',
  suppress_turns:      '억제턴',
  buff_next_treatment: '치료버프',
  buff_treatment:      '치료버프',
  cost_reduce_next:    '코스트↓',
};

const SYM_LABELS = {
  dmg:           '피해',
  escalate:      '증폭',
  defReduce:     '방어↓',
  treatDebuff:   '치료↓',
  drawReduce:    '드로우↓',
  allBonus:      '전체+',
  suppressReduce:'억제↓',
  fixedDraw:     '고정드로',
  evolveAt:      '진화턴',
};

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export function initEditTab(onRun) {
  _onRun = onRun;
  document.getElementById('bs-reset-all-cards').addEventListener('click', () => {
    _cardOverrides = {};
    renderCardEditor();
    _notify();
  });
  document.getElementById('bs-reset-all-symptoms').addEventListener('click', () => {
    _symptomOverrides = {};
    renderSymptomEditor();
    _notify();
  });
  document.getElementById('bs-edit-run').addEventListener('click', () => _onRun?.());
}

export function renderEditTab() {
  renderCardEditor();
  renderSymptomEditor();
}

export function getCardOverrides()    { return _isEmpty(_cardOverrides)    ? null : _cardOverrides; }
export function getSymptomOverrides() { return _isEmpty(_symptomOverrides) ? null : _symptomOverrides; }

export function getEditCount() {
  let n = 0;
  for (const ov of Object.values(_cardOverrides)) {
    if (ov.cost != null) n++;
    n += Object.keys(ov.effect || {}).length;
  }
  for (const ov of Object.values(_symptomOverrides))
    n += Object.keys(ov).length;
  return n;
}

// ─── CARD EDITOR ─────────────────────────────────────────────────────────────

function renderCardEditor() {
  const container = document.getElementById('bs-card-editor');
  container.innerHTML = '';

  for (const [id, c] of Object.entries(engine.CARDS)) {
    const cardOv   = _cardOverrides[id];
    const effectOv = cardOv?.effect || {};
    const isModified = !!cardOv;

    const row = document.createElement('div');
    row.className = 'bs-editor-row' + (isModified ? ' bs-modified' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'bs-editor-name';
    nameEl.textContent = id;
    row.appendChild(nameEl);

    const fieldsEl = document.createElement('div');
    fieldsEl.className = 'bs-editor-fields';

    // cost
    _addField(fieldsEl, '비용', c.cost, cardOv?.cost ?? c.cost, (newVal) => {
      _ensureCard(id);
      if (newVal === c.cost) delete _cardOverrides[id].cost;
      else _cardOverrides[id].cost = newVal;
      _cleanCard(id);
      row.classList.toggle('bs-modified', !!_cardOverrides[id]);
      _notify();
    });

    // numeric effect fields in EFFECT_LABELS
    for (const [k, v] of Object.entries(c.effect)) {
      if (typeof v !== 'number' || !EFFECT_LABELS[k]) continue;
      const curVal = effectOv[k] ?? v;
      _addField(fieldsEl, EFFECT_LABELS[k], v, curVal, (newVal) => {
        _ensureCard(id);
        (_cardOverrides[id].effect ||= {});
        if (newVal === v) delete _cardOverrides[id].effect[k];
        else _cardOverrides[id].effect[k] = newVal;
        if (_isEmpty(_cardOverrides[id].effect)) delete _cardOverrides[id].effect;
        _cleanCard(id);
        row.classList.toggle('bs-modified', !!_cardOverrides[id]);
        _notify();
      });
    }

    row.appendChild(fieldsEl);

    // per-row reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'bs-row-reset';
    resetBtn.title = '초기화';
    resetBtn.textContent = '⟲';
    resetBtn.addEventListener('click', () => {
      delete _cardOverrides[id];
      renderCardEditor();
      _notify();
    });
    row.appendChild(resetBtn);

    container.appendChild(row);
  }
}

// ─── SYMPTOM EDITOR ──────────────────────────────────────────────────────────

function renderSymptomEditor() {
  const container = document.getElementById('bs-symptom-editor');
  container.innerHTML = '';

  for (const [name, s] of Object.entries(engine.BASE_SYMPTOMS)) {
    const symOv      = _symptomOverrides[name];
    const isModified = !!symOv;

    const row = document.createElement('div');
    row.className = 'bs-editor-row' + (isModified ? ' bs-modified' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'bs-editor-name';
    nameEl.textContent = name;
    row.appendChild(nameEl);

    const fieldsEl = document.createElement('div');
    fieldsEl.className = 'bs-editor-fields';

    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== 'number' || !SYM_LABELS[k]) continue;
      const curVal = symOv?.[k] ?? v;
      _addField(fieldsEl, SYM_LABELS[k], v, curVal, (newVal) => {
        (_symptomOverrides[name] ||= {});
        if (newVal === v) delete _symptomOverrides[name][k];
        else _symptomOverrides[name][k] = newVal;
        if (_isEmpty(_symptomOverrides[name])) delete _symptomOverrides[name];
        row.classList.toggle('bs-modified', !!_symptomOverrides[name]);
        _notify();
      });
    }

    row.appendChild(fieldsEl);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'bs-row-reset';
    resetBtn.title = '초기화';
    resetBtn.textContent = '⟲';
    resetBtn.addEventListener('click', () => {
      delete _symptomOverrides[name];
      renderSymptomEditor();
      _notify();
    });
    row.appendChild(resetBtn);

    container.appendChild(row);
  }
}

// ─── SHARED FIELD BUILDER ────────────────────────────────────────────────────

function _addField(container, label, origVal, curVal, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'bs-field-wrap' + (curVal !== origVal ? ' bs-modified' : '');

  const labelEl = document.createElement('span');
  labelEl.className = 'bs-field-label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type  = 'number';
  input.className = 'bs-field-input';
  input.value = curVal;
  input.min   = 0;
  input.max   = 99;
  input.step  = 1;

  input.addEventListener('change', () => {
    const newVal = +input.value;
    onChange(newVal);
    wrap.classList.toggle('bs-modified', newVal !== origVal);
  });

  wrap.appendChild(labelEl);
  wrap.appendChild(input);
  container.appendChild(wrap);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _isEmpty(obj) { return Object.keys(obj).length === 0; }
function _notify()     { document.dispatchEvent(new CustomEvent('edit:changed')); }
function _ensureCard(id) { if (!_cardOverrides[id]) _cardOverrides[id] = {}; }
function _cleanCard(id) {
  const ov = _cardOverrides[id];
  if (!ov) return;
  if (ov.cost == null && _isEmpty(ov.effect || {})) delete _cardOverrides[id];
}
