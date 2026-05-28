/**
 * RecommendationRuntime.resolveTurnFromChatContext — chat-facing turn resolution (RR-E1).
 *
 * Absorbs degraded fallback selection and runtime assembly that previously lived in
 * sterlon-chat.js buildRecommendationTurnForPrompt. Chat supplies session bag + routing
 * predicates; this module returns a RecommendationTurn only.
 *
 * Does not assign sessionRuntime.lastRecommendationTurn — chat assigns the binding.
 */
(function (global) {
  'use strict';

  var warned = Object.create(null);

  function warnExplicitDegrade(reason, detail, telemetry) {
    if (warned[reason]) return;
    warned[reason] = true;
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Sterlon] Explicit recommendation degraded mode:', reason, detail || '');
      }
    } catch (_) {}
    if (telemetry && typeof telemetry.emit === 'function') {
      try {
        telemetry.emit('recommendation_runtime_degraded', Object.assign({ reason: reason }, detail || {}));
      } catch (_) {}
    }
  }

  function buildLegacyInlineDegradedTurn(promptText, journeyLevel, reason) {
    var DT = global.DeckTemplate;
    var cards =
      DT && typeof DT.getDeckCards === 'function'
        ? DT.getDeckCards(promptText || '', journeyLevel, 'bourbon')
        : [];
    return {
      contractVersion: 1,
      runtimeMode: 'degraded',
      journeyLevel: journeyLevel == null ? null : journeyLevel,
      cards: cards,
      contextsBySlot: { best: null, safe: null, wildcard: null },
      rationaleBySlot: { best: [], safe: [], wildcard: [] },
      compatibilityBySlot: { best: null, safe: null, wildcard: null },
      confidenceBySlot: { best: null, safe: null, wildcard: null },
      provenance: {
        source: 'degraded',
        reason: reason,
        degradedCause: reason
      },
      generatedAt: Date.now(),
      degraded: true
    };
  }

  /**
   * @param {object} opts
   * @param {string} opts.promptText
   * @param {object} opts.sessionRuntime
   * @param {string} [opts.journeyLevel]
   * @param {function(string): string} [opts.getJourneyLevel]
   * @param {function(string): *} [opts.inferCategoryFocus]
   * @param {function(string): boolean} [opts.promptExplicitlyNamesMenuSpirit]
   * @param {function(string): number|null} [opts.parseBudgetCeiling]
   * @param {function(string): string|null} [opts.detectBrandHint]
   * @param {string|null} [opts.categoryFocus]
   * @param {string|null} [opts.anchorCigar]
   * @param {object} [opts.telemetry]
   * @returns {object} RecommendationTurn
   */
  function resolveTurnFromChatContext(opts) {
    var o = opts || {};
    var RR = global.RecommendationRuntime;
    var TH = global.RecommendationTurnHelpers;
    var promptText = o.promptText || '';
    var journeyLevel = o.journeyLevel;
    if (journeyLevel == null && typeof o.getJourneyLevel === 'function') {
      journeyLevel = o.getJourneyLevel(promptText);
    }

    var categoryFocus;
    if ('categoryFocus' in o) {
      categoryFocus = o.categoryFocus;
    } else if (typeof o.inferCategoryFocus === 'function') {
      categoryFocus = o.inferCategoryFocus(promptText);
    } else {
      categoryFocus = null;
    }

    var priceCeiling = null;
    var budgetFilter = null;
    var RB = global.RecommendationBudget;
    if (RB && typeof RB.parseBudgetIntent === 'function') {
      var sessionCeiling =
        o.sessionRuntime && o.sessionRuntime.budgetCeiling != null
          ? o.sessionRuntime.budgetCeiling
          : null;
      budgetFilter = RB.parseBudgetIntent(promptText, sessionCeiling);
      if (budgetFilter.mode === 'ceiling') priceCeiling = budgetFilter.ceiling;
    } else if (typeof o.parseBudgetCeiling === 'function') {
      priceCeiling = o.parseBudgetCeiling(promptText);
    } else if ('priceCeiling' in o) {
      priceCeiling = o.priceCeiling;
    }
    if (!budgetFilter && 'budgetFilter' in o) {
      budgetFilter = o.budgetFilter;
    }

    var brandHint = null;
    if (typeof o.detectBrandHint === 'function') {
      brandHint = o.detectBrandHint(promptText);
    } else if ('brandHint' in o) {
      brandHint = o.brandHint;
    }

    var bodyConstraint = null;
    var t = promptText.toLowerCase();
    if (/\bfull[\s-]?body\b|\bfull[\s-]?strength\b|\bfull\s+cigar\b|\bfull\s+smoke\b/.test(t)) {
      bodyConstraint = 'full';
    } else if (/\bmedium[\s-]?body\b|\bmedium\s+cigar\b/.test(t)) {
      bodyConstraint = 'medium';
    } else if (/\bmild\b|\blight\s+cigar\b|\blight\s+smoke\b/.test(t)) {
      bodyConstraint = 'mild';
    }

    var resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;

    if (resolveTurn) {
      return resolveTurn({
        promptText: promptText,
        journeyLevel: journeyLevel,
        sessionRuntime: o.sessionRuntime || {},
        promptExplicitlyNamesMenuSpirit: o.promptExplicitlyNamesMenuSpirit,
        categoryFocus: categoryFocus,
        anchorCigar: o.anchorCigar || null,
        priceCeiling: priceCeiling,
        budgetFilter: budgetFilter,
        brandHint: brandHint,
        bodyConstraint: bodyConstraint
      });
    }

    warnExplicitDegrade('RecommendationRuntime.buildRecommendationSet-unavailable', {
      journeyLevel: journeyLevel
    }, o.telemetry);

    if (TH && typeof TH.buildDegradedTurn === 'function') {
      return TH.buildDegradedTurn({
        promptText: promptText,
        journeyLevel: journeyLevel,
        reason: 'RecommendationRuntime.buildRecommendationSet-unavailable'
      });
    }

    warnExplicitDegrade('no-RecommendationTurnHelpers', { journeyLevel: journeyLevel }, o.telemetry);
    return buildLegacyInlineDegradedTurn(
      promptText,
      journeyLevel,
      'no-RecommendationTurnHelpers'
    );
  }

  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.resolveTurnFromChatContext = resolveTurnFromChatContext;
  }
})(typeof window !== 'undefined' ? window : global);
