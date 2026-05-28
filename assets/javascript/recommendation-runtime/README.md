# Recommendation runtime (`recommendation-runtime/`)

Visionboard **deterministic recommendation boundary** — structured context, catalog flight orchestration, and **`RecommendationTurn`** construction.

## Canonical API

See **[`docs/internal/STERLON_RECOMMENDATION_RUNTIME_BOUNDARY.md`](../../../../internal/STERLON_RECOMMENDATION_RUNTIME_BOUNDARY.md)** for the full contract, dependency DAG, and governance rules.

**Headline:** prefer **`RecommendationRuntime.resolveRecommendationTurn(opts)`** for one flight; use **`RecommendationRuntime.scoreRecommendation(a, b)`** for compatibility scores; **`buildRecommendationSet`** remains an alias of `resolveRecommendationTurn` during transition.

## Load order

Matches [`sterlon.html`](../../sterlon.html): `rationale.js` → `selectors.js` → **`product-ids.js`** → **`intent-match.js`** → **`presentation-cards.js`** → `context.js` → **`index.js`** → `recommendation-turn.js` → **`build-set.js`** (patches `resolveRecommendationTurn` + `buildRecommendationSet`).

**Id-first (Phase A–D):** Runtime authority in [`product-ids.js`](./product-ids.js) + generate/refine; intent in [`intent-match.js`](./intent-match.js); presentation in [`presentation-cards.js`](./presentation-cards.js) (`[[RECO]]` stripped, display hydrated from ids only). See [`STERLON_ID_FIRST_AUTHORITY.md`](../../../../internal/STERLON_ID_FIRST_AUTHORITY.md).

Node fixtures: [`tools/load-sterlon-stack.mjs`](../../tools/load-sterlon-stack.mjs).
