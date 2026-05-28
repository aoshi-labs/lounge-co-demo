# SterlonSensory (visionboard mock)

Deterministic sensory profiles and pairing scores for the lounge catalog.

## Public API (`sensory/index.js`)

| API | Role |
|-----|------|
| `scorePairing(nameA, nameB)` | **Canonical compatibility** — `{ score, intensityMatch, bridges[] }` for any two menu product names. Same math `RecommendationContext.generateRecommendationContext` uses for `compatibility.cigarSpirit` and `compatibility.spiritFood`. |
| `getFlavorNotes`, `getProductSensoryProfile`, … | Ontology-backed lookups for rationale atoms and copy. |

## Relationship to `sterlon-flavor-match.js`

- **Flavor match (utterance → tags → menu row)** still uses `FLAVOR_LEXICON` and tag overlap / confidence rules to *choose* a spirit hero when the member describes a flavor lane. That is **route selection**, not a second compatibility engine.
- **Sensory `scorePairing`** is the **single scorer** for how well two *already-named* SKUs sit together. Do not duplicate its math in flavor-match or chat; consume `RecommendationRuntime.generateRecommendationContext` or call `SterlonSensory.scorePairing` directly.

Golden checks: `docs/visionboard/fixtures/sterlon-reco/` includes `ctxScoreParity` and Tier C context baselines.
