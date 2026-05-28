# Pairing evaluation harness (Phase 3.5)

Answers: **“Is Sterlon actually good at pairing cigars and spirits?”** — not just diversity or routing.

## Artifacts

| Path | Role |
|------|------|
| `fixtures/pairing-evals/pairing-evals.json` | Human-curated benchmark cases, prompt scenarios, investor walkthrough prompts |
| `assets/javascript/pairing-evaluation/score.js` | `PairingEvaluation.scorePairing()`, `scoreTurn()`, `compareBaselines()`, A–F grading |
| `assets/javascript/sterlon-pairing-diagnostics.js` | `SterlonPairingDiagnostics.snapshot()` aggregates |
| `tools/pairing-eval-runner.mjs` | CLI runner, exports, `--gate` |
| `tools/pairing-eval-gate.mjs` | Shared gate logic (runner + freeze) |
| `fixtures/sterlon-reco/inputs/pairing-quality.json` | Freeze op `pairingQualityGate` |

## Commands (from `docs/visionboard`)

```bash
node tools/pairing-eval-runner.mjs
node tools/pairing-eval-runner.mjs --verbose
node tools/pairing-eval-runner.mjs --export reports/pairing-eval
node tools/pairing-eval-runner.mjs --gate
```

Freeze suite includes pairing quality:

```bash
node tools/sterlon-reco-freeze/run.mjs
```

## Gate thresholds

- All canonical cases pass `minGrade` / `expectedMaxGrade`
- All anti-pairing cases pass (expect low grades, flagged correctly)
- All prompt scenarios pass
- Benchmark average (non–anti-pairing canonical) ≥ **0.78** (grade B−)
- Average realism ≥ **0.72**
- Average diagnostics grade numeric ≥ **0.75**
- Ontology lift sample ≥ **0.05** vs naive baselines

## Composite grade (`--grade`)

```bash
node tools/pairing-eval-runner.mjs --grade
```

Weighted 1–10 score from canonical pass rate, scenario/investor pass rates, benchmark average, realism, average grade, and ontology lift. Target for 9/10 sprint: **≥ 9.0**.

## Grading dimensions

Flavor/body/strength, category coherence, ontology fit, realism/hospitality, **contrast tension / palate refresh / balance risk** (`ContrastPairing`), anti-pairing and `avoidIf` violations, exploration plausibility (via scenarios).

Contrast benchmark cases use `expectedPairingStyle: "contrast"` and `minContrastScore`. Harmony guard cases use `forbidHighContrast`.

## Demo / investor

`pairing-evals.json` → `investorWalkthrough[]`; runner prints pass counts per flow. Use exported markdown/CSV under `reports/pairing-eval/` for human tasting review.

**Spirit menu coverage:** the tracker import expanded the hydrated spirit catalog to ~92 SKUs (90 tracker + 2 curated). Benchmark includes `spirit-forward` cases using canonical menu names.
