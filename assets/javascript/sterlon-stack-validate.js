/* ──────────────────────────────────────────────────────────────────────
   sterlon-stack-validate.js — load-order diagnostics for the Sterlon stack.

   Fail-fast visibility when required modules are missing; warn-only for
   optional enrichments (RecommendationGenerate, SterlonFlavorMatch, LoungeProducts).
   See docs/internal/STERLON_RECOMMENDATION_EXTRACTION.md.
   ────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  var REQUIRED_CHECKS = [
    { id: 'SterlonRuntimeState', test: function (g) { return !!g.SterlonRuntimeState; } },
    { id: 'SterlonRecommendations', test: function (g) { return !!g.SterlonRecommendations; } },
    { id: 'SterlonGateway', test: function (g) { return !!g.SterlonGateway; } },
    { id: 'RecommendationRuntime', test: function (g) { return !!g.RecommendationRuntime; } },
    {
      id: 'RecommendationRuntime.resolveRecommendationTurn',
      test: function (g) {
        return !!(g.RecommendationRuntime && g.RecommendationRuntime.resolveRecommendationTurn);
      }
    },
    { id: 'SterlonSessionLifecycle', test: function (g) { return !!g.SterlonSessionLifecycle; } },
    { id: 'SterlonSessionRouting', test: function (g) { return !!g.SterlonSessionRouting; } },
    { id: 'SterlonPresentationLifecycle', test: function (g) { return !!g.SterlonPresentationLifecycle; } },
    { id: 'SterlonGatewayLifecycle', test: function (g) { return !!g.SterlonGatewayLifecycle; } },
    { id: 'SterlonProsePipeline', test: function (g) { return !!g.SterlonProsePipeline; } },
    { id: 'SterlonPresentationOverlays', test: function (g) { return !!g.SterlonPresentationOverlays; } },
    { id: 'SterlonChatRouter', test: function (g) { return !!g.SterlonChatRouter; } }
  ];

  var WARN_CHECKS = [
    { id: 'RecommendationGenerate', test: function (g) { return !!g.RecommendationGenerate; } },
    { id: 'SterlonFlavorMatch', test: function (g) { return !!g.SterlonFlavorMatch; } },
    { id: 'LoungeProducts', test: function (g) { return !!g.LoungeProducts; } },
    { id: 'SterlonConciergeProse', test: function (g) { return !!g.SterlonConciergeProse; } },
    { id: 'SterlonScrollAnchor', test: function (g) { return !!g.SterlonScrollAnchor; } },
    { id: 'SterlonChatPrompts', test: function (g) { return !!g.SterlonChatPrompts; } },
    { id: 'SterlonTurnHandlers', test: function (g) { return !!g.SterlonTurnHandlers; } }
  ];

  /**
   * @returns {{ ok: boolean, missing: string[], warnings: string[] }}
   */
  function assertSterlonStack() {
    var g = global || {};
    var missing = [];
    var warnings = [];
    var i;

    for (i = 0; i < REQUIRED_CHECKS.length; i += 1) {
      if (!REQUIRED_CHECKS[i].test(g)) missing.push(REQUIRED_CHECKS[i].id);
    }
    for (i = 0; i < WARN_CHECKS.length; i += 1) {
      if (!WARN_CHECKS[i].test(g)) warnings.push(WARN_CHECKS[i].id);
    }

    return { ok: missing.length === 0, missing: missing, warnings: warnings };
  }

  global.SterlonStackValidate = {
    assertSterlonStack: assertSterlonStack,
    REQUIRED_CHECKS: REQUIRED_CHECKS.map(function (c) { return c.id; }),
    WARN_CHECKS: WARN_CHECKS.map(function (c) { return c.id; })
  };
})(typeof window !== 'undefined' ? window : global);
