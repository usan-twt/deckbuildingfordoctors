# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**INTERN Combat Prototype** — a browser-based deck-building card game with a medical theme, written entirely in Korean. The player is a doctor who plays cards each turn to damage a disease's "본체" (core HP) while keeping the patient alive against active symptoms. Beyond the playable game, the project includes a **Balance Studio**: an in-browser simulation tool that runs AI "personas" over hundreds of games and visualizes win rates, HP curves, card usage, and per-card impact with Chart.js.

This is a Vite project using native ES modules. No framework, no transpilation beyond Vite's dev server / bundler.

## Running the Project

```bash
npm install        # installs Vite (the only dependency)
npm run dev        # Vite dev server with hot reload
npm run build      # production build via Vite
```

Because `index.html` uses `<script type="module">` and the app `fetch()`es JSON from `data/` and `scenarios/` at runtime, you **must serve it** — opening `index.html` from `file://` will fail with a data-loading error. Use `npm run dev` (or any static server).

There are no tests, no linter, and no CI.

## Architecture

The codebase splits into two cooperating systems that share one engine: the **playable game** (human input, DOM rendering) and the **Balance Studio** (headless simulation, charts). The same `engine.js` runs both — the difference is whether a *sim strategy* is installed.

### Entry point and data flow

`main.js` is the orchestrator. On load it `fetch`es `data/cards.json` + `data/symptoms.json`, passes them through `buildCards`/`buildSymptoms` (`src/data.js`) into `engine.loadData()`, then wires up the DOM buttons. Game flow: scenario select → deck builder → `runScenario()`, which loops `await engine.runTurn()` until win/lose.

| File | Responsibility |
|---|---|
| `main.js` | Top-level wiring, scenario list, DOM event handlers, the play loop |
| `src/engine.js` | **The game rules.** All mutable state (`G`), turn loop, card resolution, symptom phase. The single source of truth for mechanics. |
| `src/data.js` | Translates the JSON schema (snake_case design format) into the engine's compact runtime shape (camelCase) |
| `src/deck.js` | Player card pool and current deck (`playerPool`, `playerDeck`) |
| `src/events.js` | A shared `EventTarget` bus — the engine emits `log` and `state:changed`; UI subscribes |
| `src/render.js` | Renders game state to the DOM (vitals, hand, deck builder), reacts to `state:changed` |
| `src/sim.js` | Simple baseline strategies (random/greedy/suppress-first) and a basic `runSim` |
| `src/personas.js` | Four weighted AI strategies (러쉬/안정/컨트롤/효율) built from `scoreCard` heuristics |
| `src/balance.js` | Runs personas over N games, aggregates stats, impact analysis, applies card/symptom/scenario overrides |
| `src/balance-ui.js` | The Balance Studio modal: tabs, run buttons, progress |
| `src/edit-ui.js` | Card/symptom editor tab; produces override objects fed back into `balance.js` |
| `src/charts.js` | Chart.js renderers (scatter, win rate, HP curves, card usage, heatmap, impact) |
| `vendor/chart.umd.min.js` | Chart.js, loaded as a global `<script>` (not bundled) |

### The engine's dual-mode design (key concept)

`engine.js` is normally **async and event-driven**: `runTurn()` awaits `waitTurnEnd()`, which returns a Promise resolved when the human clicks "턴 종료" (`resolveTurnEnd`). Card clicks, symptom picks, and discard picks all resolve pending Promises the same way, and the UI is driven by `emit('state:changed')` events on the bus.

When a **sim strategy** is installed via `setSimStrategy(strategy)`, the *same functions* short-circuit: `emit`/`log` are silenced, and instead of awaiting human input the engine calls `strategy.chooseCard / pickSymptom / pickDiscard` synchronously in a loop. This is what lets `balance.js` run hundreds of games headlessly without touching the DOM. When editing the engine, **preserve both code paths** — every interactive `await waitXxx()` has an `if (_simStrategy)` branch that must stay in sync.

### Game state (`G` in `engine.js`)

```
diseaseHp, maxDiseaseHp, patientHp, maxHp, energyMax, energy, turn
symptoms[]  — { name, sup (suppress turns left, 0 = active), neglect, escalate }
deck[], discard[], hand[]   — arrays of card-id strings
treatBuff, treatDebuff, defTotal, defReduce, costReduce  — per-turn accumulators, reset in runTurn()
```

### Card and symptom mechanics

Cards have a `type` that selects the resolution branch in `playCard()`:
- `treatment` — `damage` to `diseaseHp`, `suppress` (pick any active symptom), or `suppress_symptom` (a specific named one, optionally `add_symptom`)
- `stabilize` — `defense` (added to `defTotal`, consumed in the symptom phase), `defense_if_active`, or `heal`
- `support` — `draw`, `cost_reduce_next`, `buff_next_treatment` / `buff_treatment`, `discard_from_hand`

Symptoms are **active** (`sup === 0`) or **suppressed** (`sup > 0`, counts down each symptom phase). Active symptoms deal `dmg` each turn; neglected ones evolve after `evolveAt` turns into a stronger form (`evolveTo`). Several have cross-effects: `amplified_by` (extra damage when another symptom is active), `escalate` (ramps each turn), `defense_reduce`, `treatment_debuff`, `draw_reduce`, and 패혈증's `all_symptoms_bonus`. The full damage math lives in `symptomPhase()`; `computeSymptomIntent()` mirrors it to show the player's "intent" preview — **keep the two in sync**.

### Data files: JSON is the source of truth

Unlike older single-file prototypes, `data/cards.json`, `data/symptoms.json`, and `scenarios/*.json` **are loaded at runtime** and are authoritative — the engine holds no hardcoded card/symptom data. To add or rebalance a card/symptom/scenario, edit the JSON. `src/data.js` maps the JSON's snake_case design schema to the engine's runtime keys; a new JSON field needs a corresponding line there to take effect.

Scenarios define `disease_hp`, `patient_hp`, `max_patient_hp`, `energy_max`, the starting `symptoms[]`, and patient flavor. The `deck` field in scenario JSON is legacy/flavor — the actual play deck comes from the deck builder (`deck.js`), not the scenario.

---

## Behavioral Guidelines

**Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them.

**Simplicity first.** Minimum code that solves the problem. No speculative features, no extra abstractions.

**Surgical changes.** Touch only what you must. Match existing style. Don't clean up adjacent code.

**Goal-driven.** Define verifiable success criteria before implementing. For multi-step tasks, state a brief plan.

**Mind the dual code paths.** Engine changes must work for both interactive play and headless simulation. The damage logic in `symptomPhase` and its mirror in `computeSymptomIntent` must stay consistent.
