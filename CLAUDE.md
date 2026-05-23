# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**INTERN Combat Prototype** — a browser-based deck-building card game with a medical theme, written entirely in Korean. The player manages a doctor treating a patient by playing cards each turn to fight a disease and suppress symptoms.

No build tools, no dependencies, no package manager. Pure vanilla HTML/CSS/JS.

## Running the Game

Open `index.html` directly in a browser, or serve it with any static file server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

There are no tests, no linting setup, and no CI.

## Architecture

All game logic lives in a single file: **`game.js`** (~316 lines). It is structured in sections:

| Section | What it does |
|---|---|
| `DATA` | Hardcoded `CARDS`, `SYMPTOMS`, and `STARTER_DECK` constants |
| `STATE` | Global `G` object holding all mutable game state; `newGame()` initializes it |
| `UI` | DOM references, `print()`, and `waitInput()` (Promise-based async input) |
| `DRAW` | `drawCards(n)` — shuffles discard back into deck when exhausted |
| `SYMPTOM PHASE` | `symptomPhase()` — applies damage/effects from active symptoms each turn |
| `PLAY CARD` | `playCard(id)` / `doSuppress(effect)` — resolves card effects |
| `TURN` | `runTurn()` — main async turn loop (draw → play → symptom phase) |
| `MAIN` | Top-level IIFE that runs the game loop |

### Data files vs. game.js

`data/cards.json` and `data/symptoms.json` are **not loaded at runtime** — they are reference/design documents. The live data is the hardcoded objects in `game.js`. The two can diverge; when editing card or symptom data, update `game.js` (the source of truth) and keep the JSON files in sync manually if needed.

`scenarios/tutorial.json` is similarly a design document — the tutorial scenario is hardcoded in `newGame()`.

### Key game state (`G` object)

```
diseaseHp, patientHp, maxHp, energyMax, energy
symptoms[]  — { name, sup (suppress turns), neglect, escalate }
deck[], discard[], hand[]
treatBuff, treatDebuff, defTotal, defReduce, costReduce  — per-turn accumulators
```

### Symptom mechanics

Symptoms have two modes: **active** (sup === 0) or **suppressed** (sup > 0, counts down). Neglected active symptoms evolve after `evolveAt` turns into stronger forms. Several symptoms have cross-amplification effects (e.g., 발열 deals extra damage when 감염 or 탈수 is also active).

### Card types

- `treatment` — damages `diseaseHp` or suppresses a symptom (대증처치)
- `stabilize` — adds to `defTotal` (consumed at symptom phase) or heals patient
- `support` — buffs, draw, cost reduction; effects apply within the same turn

---

## Behavioral Guidelines

**Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them.

**Simplicity first.** Minimum code that solves the problem. No speculative features, no extra abstractions.

**Surgical changes.** Touch only what you must. Match existing style. Don't clean up adjacent code.

**Goal-driven.** Define verifiable success criteria before implementing. For multi-step tasks, state a brief plan.
