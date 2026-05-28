/* ──────────────────────────────────────────────────────────────────────
   sterlon-runtime-state.js — PR1/PR2 session state factories (no DOM).

   Persistence (localStorage) stays in sterlon-chat.js; this module only
   defines shapes and defaults the orchestrator mutates.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var RuntimeMode = {
    GREETING: 'greeting',
    CLARIFICATION: 'clarification',
    RECOMMENDATION: 'recommendation',
    REFINEMENT: 'refinement',
    RECALL: 'recall',
    COMPARISON: 'comparison',
    TASTING: 'tasting',
    EXPERTISE: 'expertise'
  };

  var OutputShape = {
    PROSE_ONLY: 'prose_only',
    PROSE_WITH_RECOMMENDATIONS: 'prose_with_recommendations',
    RECALL_PROSE: 'recall_prose',
    COMPARISON_PROSE: 'comparison_prose',
    REFINEMENT_PROSE: 'refinement_prose',
    REFINEMENT_FLIGHT: 'refinement_flight',
    TASTING_FLOW: 'tasting_flow',
    EXPERTISE_PROSE: 'expertise_prose'
  };

  var SESSION_RUNTIME_STORAGE_KEY = 'lounge-sterlon-runtime-v2';
  var SESSION_RUNTIME_LEGACY_KEY = 'lounge-sterlon-runtime-v1';

  function createDefaultSessionState() {
    return {
      conversationalMode: null,
      threadPhase: 'new',
      hasExplicitRecommendationRequest: false,
      activeCategoryFocus: undefined,
      pendingClarification: null,
      turnCount: 0,
      activeRecommendationSet: null,
      sessionProductRegistry: [],
      lastReferencedProduct: null,
      refinementAxis: null,
      refinementTarget: null,
      refinementChainDepth: 0,
      budgetCeiling: null,
      comparisonSet: [],
      comparisonAffordance: false,
      lastExpertiseBranch: null,
      eveningMood: null,
      eveningMoodTurn: 0,
      activeDeckKey: null,
      latchedJourneyLevel: null,
      journeyLevel: null,
      eveningOccasion: null,
      eveningRhythm: null,
      eveningSocial: null,
      eveningAtmosphere: null
    };
  }

  function cloneSessionRuntimeState(runtime) {
    try {
      return JSON.parse(JSON.stringify(runtime || createDefaultSessionState()));
    } catch (_) {
      return createDefaultSessionState();
    }
  }

  window.SterlonRuntimeState = {
    RuntimeMode: RuntimeMode,
    OutputShape: OutputShape,
    SESSION_RUNTIME_STORAGE_KEY: SESSION_RUNTIME_STORAGE_KEY,
    SESSION_RUNTIME_LEGACY_KEY: SESSION_RUNTIME_LEGACY_KEY,
    createDefaultSessionState: createDefaultSessionState,
    cloneSessionRuntimeState: cloneSessionRuntimeState
  };
})();
