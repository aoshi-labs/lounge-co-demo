# Sterlon recommendation freeze fixtures

Golden JSON fixtures lock the recommendation contract and catalog-driven runtime behavior.

## Tiers

| Tier | Scope |
|------|--------|
| **A** | `SterlonRecommendations` - validate, parse, wildcard descriptors, competing signal, selector helpers |
| **B** | Removed legacy preset-deck fixtures. Catalog recommendations are covered by Tier C. |
| **C** | `RecommendationRuntime` / `SterlonSensory` — `generateRecommendationContext`, `buildRationaleAtoms`, `scorePairing`, `ctxScoreParity`, **`recommendationTurnContract`** / **`resolveTurnFromChatContext`** / **`persistTurnRoundTrip`** / **`recommendationTurnDegraded`** / **`recommendationTurnGovernanceForcedDegrade`**, **`recommendationRuntimeBoundary`** (API surface + `scoreRecommendation` smoke), **`categoryIntegrityTurns`** (bourbon/tequila/peated/cognac deck routing), **`spiritOntologyValidate`** (deckKey / journeyRank invariants) |
| **D** | Hygiene — **`stackValidate`** (load-order diagnostics), **`routerSamples`** (off-menu + evening dims), **`aliasMatch`** (SterlonProductMatch), **`sessionRouting`** (SL.applyTurnRouting + SO journey latch + refinement/budget writes) |
| **E** | Concierge prose — **`conciergeProseSamples`** (stable local template strings via `SterlonConciergeProse`), **`proseGovernanceLimits`** (`SterlonGatewayProse` word/sentence caps) |

## Commands

From `docs/visionboard/`:

```bash
node tools/sterlon-reco-freeze/run.mjs
npm run test:sterlon-shrink
```

Regenerate expected outputs after an **intentional** behavior change:

```bash
node tools/sterlon-reco-freeze/update-golden.mjs
```

Review diffs before commit. For guest-quality scenarios before touching goldens:

```bash
node tools/probe-regression-suite.mjs
```

**Tier G** includes `tier-g-regression-probes.json` (Old Forester maduro/after-dinner, Buffalo Trace novice, morning pairing, cigar-only budget/coffee).

## Loader

Scripts load in the same order as [sterlon.html](../sterlon.html) (through `sterlon-recommendations.js`): see [tools/load-sterlon-stack.mjs](../tools/load-sterlon-stack.mjs). Includes `recommendation-turn.js` (canonical **RecommendationTurn** shape + helpers) before `build-set.js`.

## CI

`npm run test:reco-freeze` from `docs/visionboard/` runs the freeze runner (requires Node 18+). Optional: invoke the same command from repository CI so recommendation regressions fail the pipeline.

**RecommendationTurn:** canonical contract is documented in [`docs/internal/STERLON_RECOMMENDATION_TURN.md`](../../../internal/STERLON_RECOMMENDATION_TURN.md); Tier **C** fixtures assert a stable projection (`contractVersion`, `runtimeMode`, provenance / `degradedCause`, governance flags) — not full per-slot context blobs. **`recommendationTurnGovernanceForcedDegrade`** asserts missing `generateRecommendationContext` coerces explicit degraded mode with valid governance.

The runner normalizes vm results with `JSON.parse(JSON.stringify(actual))` so host-parsed expected files compare reliably.
