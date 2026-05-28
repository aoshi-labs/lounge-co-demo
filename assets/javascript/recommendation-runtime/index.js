/**
 * RecommendationRuntime — canonical recommendation operating boundary (visionboard).
 *
 * **Public surface (Phase 4):** one object on `window.RecommendationRuntime` — the only supported
 * entry for orchestrated recommendation semantics. Callers outside this API should shrink over time;
 * chat renders `RecommendationTurn` downstream only.
 *
 * Methods:
 *   - `generateRecommendationContext(opts)` — per-slot structured context (no prose policy).
 *   - `resolveRecommendationTurn(opts)` — **canonical** catalog flight → `RecommendationTurn` (transitional duplicate name: `buildRecommendationSet`).
 *   - `buildRecommendationSet(opts)` — **transitional alias** of `resolveRecommendationTurn`; same patched function.
 *   - `resolveTurnFromChatContext(opts)` — chat-facing facade (degraded fallbacks + input normalization; RR-E1).
 *   - `resolveRefinementFromContext(opts)` — refinement chip → new `RecommendationTurn` (RR-E2).
 *   - `saveLastRecommendationTurn` / `loadLastRecommendationTurn` / `clearLastRecommendationTurn` — Law 8 persistence (`persist-turn.js`).
 *   - `scoreRecommendation(nameA, nameB)` — deterministic compatibility dict (delegates to `SterlonSensory.scorePairing`).
 *   - `buildRationaleAtoms`, `renderWhyBullets`, `renderSensoryPreludeFromAtoms` — rationale presentation helpers.
 *   - `selectors.*` — pure deck/ladder/refinement queries.
 *   - Patched from `recommendation-turn.js`: `createRecommendationTurn`, `withValidatedCards`, `buildDegradedTurn`, `validateRecommendationTurn`, …
 *
 * Depends on: rationale.js, selectors.js, context.js (before this barrel); `recommendation-turn.js` + `build-set.js` after.
 *
 * Load order in sterlon.html:
 *   sensory/index.js → r-r/rationale.js → r-r/selectors.js → r-r/context.js → r-r/index.js
 *   → r-r/recommendation-turn.js → r-r/build-set.js (patches resolveRecommendationTurn + buildRecommendationSet) → … → sterlon-chat.js
 *
 * Full contract + DAG: `docs/internal/STERLON_RECOMMENDATION_RUNTIME_BOUNDARY.md`
 */
(function (global) {
  'use strict';

  function ctx()  { return global.RecommendationContext   || null; }
  function rat()  { return global.RecommendationRationale || null; }
  function sel()  { return global.RecommendationSelectors || null; }

  global.RecommendationRuntime = {
    /** Monotonic when the JS API surface meaningfully changes (fixtures may assert). */
    version: 1,
    /** Phase 4 — formal runtime boundary revision (docs + resolveRecommendationTurn + scoreRecommendation). */
    boundaryVersion: 1,

    /**
     * Central recommendation contract.
     * Returns structured metadata; never prose.
     */
    generateRecommendationContext: function (opts) {
      var c = ctx();
      return c ? c.generateRecommendationContext(opts) : null;
    },

    /**
     * Deterministic compatibility / harmony shape for two product display names.
     * Canonical runtime entry for sensory pairing scores (delegates to SterlonSensory).
     */
    scoreRecommendation: function (nameA, nameB) {
      var SS = global.SterlonSensory;
      if (!SS || typeof SS.scorePairing !== 'function') return null;
      return SS.scorePairing(nameA, nameB);
    },

    /** Structured pairing explanation atoms for a cigar + spirit + food triple. */
    buildRationaleAtoms: function (cigar, spirit, food) {
      var r = rat();
      return r ? r.buildRationaleAtoms(cigar, spirit, food) : [];
    },

    /** Deterministic why bullets from atoms; falls back to deck copy. */
    renderWhyBullets: function (atoms, fallbackWhy) {
      var r = rat();
      return r ? r.renderWhyBullets(atoms, fallbackWhy) : (fallbackWhy || []).slice(0, 3);
    },

    /** One short paragraph from cigar–spirit harmony atoms (optional prelude body). */
    renderSensoryPreludeFromAtoms: function (atoms, card) {
      var r = rat();
      return r ? r.renderSensoryPreludeFromAtoms(atoms, card) : '';
    },

    /**
     * Catalog recommendation flight → `RecommendationTurn` (cards + per-slot runtime contexts).
     * Patched by build-set.js. **Prefer `resolveRecommendationTurn`** — same implementation; stable canonical name.
     */
    buildRecommendationSet: null,

    /**
     * Canonical orchestration entry: member prompt + session → one `RecommendationTurn`.
     * Patched to the same function as `buildRecommendationSet` by build-set.js.
     */
    resolveRecommendationTurn: null,

    selectors: {
      getSlotCard: function (deck, tier, slot) {
        var s = sel();
        return s ? s.getSlotCard(deck, tier, slot) : null;
      },
      getRefinementTarget: function (spirit, axis, table) {
        var s = sel();
        return s ? s.getRefinementTarget(spirit, axis, table) : null;
      },
      getIntensityAdjacent: function (name, direction, ladder) {
        var s = sel();
        return s ? s.getIntensityAdjacent(name, direction, ladder) : null;
      },
      coerceMenuProduct: function (name, menu, fallback) {
        var s = sel();
        return s ? s.coerceMenuProduct(name, menu, fallback) : name || fallback;
      },
      pickSpiritForBudget: function (ceiling, currentSpirit) {
        var s = sel();
        return s ? s.pickSpiritForBudget(ceiling, currentSpirit) : currentSpirit;
      }
    }
  };
})(typeof window !== 'undefined' ? window : global);
