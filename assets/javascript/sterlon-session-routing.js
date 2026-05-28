/**
 * SterlonSessionRouting — session-aware routing helpers.
 *
 * Contains read-only session-aware routing functions extracted from sterlon-chat.js.
 * All functions read session state via the _sessionProvider closure; none may write
 * to sessionRuntime, create RecommendationTurn artifacts, call PairingEngine,
 * assign product scores, render DOM, or call the gateway.
 *
 * Architecture: docs/internal/STERLON_RECOMMENDATION_EXTRACTION.md
 *
 * Dependencies (lazy accessors, set by sterlon-chat.js after init):
 *   _sessionProvider         → () => sessionRuntime
 *   _activeTastingProvider   → () => activeTastingDemo
 *
 * External module dependencies (lazy, via window globals):
 *   _RT() → window.SterlonChatRouter
 *   _RS() → window.SterlonRuntimeState
 *
 * Most important invariant:
 *   Session-aware routing may interpret conversational continuity, but recommendation
 *   authority may only originate from RecommendationRuntime-generated RecommendationTurn
 *   artifacts.
 */
(function (global) {
  'use strict';

  // -- Session and tasting-demo providers (set once by sterlon-chat.js) ------
  let _sessionProviderWired = false;
  let _unwiredFallback = null;

  function _defaultSessionFallback() {
    if (!_unwiredFallback) {
      const RS = global.SterlonRuntimeState;
      _unwiredFallback = (RS && typeof RS.createDefaultSessionState === 'function')
        ? RS.createDefaultSessionState()
        : { sessionProductRegistry: [], turnCount: 0 };
    }
    return _unwiredFallback;
  }

  let _sessionProvider = function () { return _defaultSessionFallback(); };
  let _activeTastingProvider = function () { return null; };

  function setSessionProvider(fn) {
    if (typeof fn !== 'function') return;
    if (_sessionProviderWired) {
      if (typeof console !== 'undefined' && console.warn && !setSessionProvider._doubleWarned) {
        setSessionProvider._doubleWarned = true;
        console.warn('[SterlonSessionRouting] setSessionProvider called more than once — last provider wins; earlier wiring is replaced.');
      }
    } else if (_sr._warned) {
      if (typeof console !== 'undefined' && console.warn && !setSessionProvider._lateWarned) {
        setSessionProvider._lateWarned = true;
        console.warn('[SterlonSessionRouting] setSessionProvider called after fallback session was used — prior reads used isolated fallback state.');
      }
    }
    _sessionProvider = fn;
    _sessionProviderWired = true;
  }
  function setActiveTastingProvider(fn) { _activeTastingProvider = fn; }

  /** @returns {object} current sessionRuntime */
  function _sr() {
    if (!_sessionProviderWired && typeof console !== 'undefined' && console.warn && !_sr._warned) {
      _sr._warned = true;
      console.warn('[SterlonSessionRouting] setSessionProvider not called — using isolated fallback session');
    }
    return _sessionProvider();
  }

  // -- Lazy external-module accessors ----------------------------------------
  function _RT() { return global.SterlonChatRouter || null; }
  function _RS() { return global.SterlonRuntimeState || {}; }

  // -- Registry helpers -------------------------------------------------------

  function getRegistrySpirits() {
    return _sr().sessionProductRegistry.filter(function (e) { return e.category === 'spirit'; });
  }

  // -- Evening dimension / mood readers --------------------------------------

  function getMergedEveningDimensions(text) {
    const RT = _RT();
    const live = (text && RT) ? RT.detectEveningDimensions(text) : {};
    const sr = _sr();
    return {
      occasion:   live.occasion   || sr.eveningOccasion   || null,
      rhythm:     live.rhythm     || sr.eveningRhythm     || null,
      social:     live.social     || sr.eveningSocial     || null,
      atmosphere: live.atmosphere || sr.eveningAtmosphere || null
    };
  }

  function getActiveEveningMood() {
    const sr = _sr();
    if (!sr.eveningMood) return null;
    const setOn   = sr.eveningMoodTurn || 0;
    const current = sr.turnCount       || 0;
    if (current > setOn + 2) return null;
    return sr.eveningMood;
  }

  // -- Category focus readers ------------------------------------------------

  function getConversationalCategoryFocus() {
    const sr  = _sr();
    const set = sr.activeRecommendationSet;
    if (set && set.categoryFocus && set.categoryFocus !== 'open') return set.categoryFocus;
    if (sr.activeCategoryFocus && sr.activeCategoryFocus !== 'open') {
      return sr.activeCategoryFocus;
    }
    return null;
  }

  function applyCategoryPrecedenceToMatches(matches) {
    if (!matches || !matches.length) return [];
    const focus = getConversationalCategoryFocus();
    if (focus === 'spirit') {
      const spirits = matches.filter(function (e) { return e.category === 'spirit'; });
      if (spirits.length) return spirits;
      if (matches.some(function (e) { return e.category === 'cigar'; })) return [];
    } else if (focus === 'cigar') {
      const cigars = matches.filter(function (e) { return e.category === 'cigar'; });
      if (cigars.length) return cigars;
      if (matches.some(function (e) { return e.category === 'spirit'; })) return [];
    }
    return matches;
  }

  function finalizeTagReferentResolution(matches) {
    const narrowed = applyCategoryPrecedenceToMatches(matches);
    if (narrowed.length === 1) return { status: 'resolved', entry: narrowed[0] };
    if (narrowed.length > 1) {
      return { status: 'ambiguous', candidates: narrowed.slice(0, 3) };
    }
    return { status: 'miss' };
  }

  // -- Recency helpers (pure — no session access) ----------------------------

  function resolveRecencyAmongEntries(entries) {
    if (!entries.length) return { status: 'miss' };
    const sorted = entries.slice().sort(
      function (a, b) {
        return (b.lastReferencedAtTurn || b.turnIndex) - (a.lastReferencedAtTurn || a.turnIndex);
      }
    );
    if (sorted.length === 1) return { status: 'resolved', entry: sorted[0] };
    const recent   = sorted[0];
    const sameTurn = sorted.filter(function (s) { return s.turnIndex === recent.turnIndex && s.id !== recent.id; });
    if (!sameTurn.length) return { status: 'resolved', entry: recent };
    return { status: 'ambiguous', candidates: sorted.slice(0, 3) };
  }

  // -- Continuity intent interpreter -----------------------------------------

  function interpretContinuityIntent(text) {
    const RT = _RT();
    const sr = _sr();
    if (RT && RT.isPivotIntent(text)) return 'pivot';
    if (RT && RT.isRecallIntent(text)) return 'recall';
    if (RT && RT.isComparisonIntent(text)) {
      if (sr.comparisonAffordance || getRegistrySpirits().length >= 2) return 'comparison';
      return 'comparison';
    }
    if (RT && RT.isRefinementIntent(text)) {
      if (sr.activeRecommendationSet) return 'refinement';
      return 'refinement_unresolved';
    }
    return 'none';
  }

  // -- Refinement axis / target / budget readers -----------------------------

  function parseRefinementAxis(text) {
    const t = (text || '').toLowerCase();
    if (/\bunder\s*\$?\d+/.test(t)) return 'budget';
    if (/\bluxury\b/.test(t)) return 'luxury';
    if (/\b(connoisseur|adventur|wildcard)\b/.test(t)) return 'adventure';
    if (/\b(lighter|softer|smoother|soften|milder|less smoke|less intense|cleaner finish|clean finish|even lighter)\b/.test(t)) return 'lighter';
    if (/\b(bolder|fuller|smokier|more smoke|richer|slightly richer|even bolder)\b/.test(t)) return 'bolder';
    if (/\b(more contrast|contrasting|unexpected|challenge me|less obvious|more interesting|not obvious|surprise me)\b/.test(t)) {
      return 'contrast';
    }
    if (/\b(sharper|more edge|more definition|more complexity)\b/.test(t)) return 'bolder';
    if (/\b(different|switch it up|mix it up|something different|change it up)\b/.test(t)) return 'contrast';
    if (/\bmore like the first\b/.test(t)) return 'lighter';
    return _sr().refinementAxis || 'open';
  }

  function parseRefinementTarget(text) {
    const t = (text || '').toLowerCase();
    if (/\bwildcard\b/.test(t)) return 'wildcard';
    if (/\b(refined option|value tier|second)\b/.test(t)) return 'refined';
    if (/\b(best pick|first|primary)\b/.test(t)) return 'best';
    if (/\b(set|flight|all)\b/.test(t)) return 'set';
    return _sr().refinementTarget || 'best';
  }

  function parseBudgetCeiling(text) {
    const RB = global.RecommendationBudget;
    if (RB && typeof RB.parseBudgetCeiling === 'function') {
      return RB.parseBudgetCeiling(text || '', _sr().budgetCeiling);
    }
    const m = (text || '').match(/under\s*\$?\s*(\d+)/i);
    if (m) return Number(m[1]);
    if (/under\s*\$?\s*30/i.test(text || '')) return 30;
    return _sr().budgetCeiling;
  }

  // -- Clarification resolution reader ---------------------------------------

  function isClarificationResolution(text) {
    const RT = _RT();
    if (!_sr().pendingClarification) return false;
    if (RT && RT.isDeferralPrompt(text)) return false;
    if (RT && RT.isCigarAnchoredPairingRequest(text)) return false;
    const trimmed = (text || '').trim();
    if (!trimmed || trimmed.length > 140) return false;
    return /\b(cigar|whiskey|whisky|spirit|bourbon|scotch|pairing|flight|forward|smok|smooth|bold|bolder|lighter|celebrat|comfort|explor|refined|elegant|interesting|adventur)\b/i.test(trimmed);
  }

  function _WJ() { return global.WhiskeyJourney || null; }

  function latchExperienceTierFromPrompt(sr, text) {
    const WJ = _WJ();
    if (!WJ || !WJ.detectLevelFromPrompt || !sr) return null;
    const level = WJ.detectLevelFromPrompt(text);
    if (level === 'novice' || level === 'advanced') {
      sr.latchedJourneyLevel = level;
      sr.journeyLevel = level;
      return level;
    }
    return null;
  }

  /**
   * @param {object} sr sessionRuntime
   * @param {string} promptText
   * @returns {'novice'|'advanced'}
   */
  function getEffectiveJourneyLevel(sr, promptText) {
    const WJ = _WJ();
    latchExperienceTierFromPrompt(sr, promptText || '');
    if (WJ && WJ.isNovicePalate && WJ.isNovicePalate(promptText || '')) {
      if (sr && !sr.latchedJourneyLevel) {
        sr.latchedJourneyLevel = 'novice';
        sr.journeyLevel = 'novice';
      }
      return 'novice';
    }
    if (sr && (sr.latchedJourneyLevel === 'novice' || sr.latchedJourneyLevel === 'advanced')) {
      return sr.latchedJourneyLevel;
    }
    return 'advanced';
  }

  // -- Top-level runtime mode interpreter ------------------------------------

  function interpretRuntimeMode(text) {
    const RT          = _RT();
    const RuntimeMode = _RS().RuntimeMode || {};
    if (_activeTastingProvider()) return RuntimeMode.TASTING;
    if (RT && RT.isExpertiseIntent(text)) return RuntimeMode.EXPERTISE;
    if (RT && RT.isComparisonIntent(text)) return RuntimeMode.COMPARISON;
    if (RT && RT.isHesitantOpenerIntent(text)) return RuntimeMode.CLARIFICATION;
    if (isClarificationResolution(text)) return RuntimeMode.RECOMMENDATION;
    if (RT && RT.hasExplicitRecommendationRequest(text)) return RuntimeMode.RECOMMENDATION;
    if (RT && RT.isPureGreeting(text)) return RuntimeMode.GREETING;
    if (RT && RT.isDeferralPrompt(text)) return RuntimeMode.CLARIFICATION;
    if (RT && RT.isVagueRecommendationPrompt(text)) return RuntimeMode.RECOMMENDATION;
    if ((text || '').trim().split(/\s+/).filter(Boolean).length < 5) {
      return RuntimeMode.CLARIFICATION;
    }
    return RuntimeMode.RECOMMENDATION;
  }

  // -- Public API ------------------------------------------------------------

  global.SterlonSessionRouting = {
    // Setup
    setSessionProvider:       setSessionProvider,
    setActiveTastingProvider: setActiveTastingProvider,

    // Registry
    getRegistrySpirits:             getRegistrySpirits,

    // Evening context
    getMergedEveningDimensions:     getMergedEveningDimensions,
    getActiveEveningMood:           getActiveEveningMood,

    // Category focus
    getConversationalCategoryFocus: getConversationalCategoryFocus,
    applyCategoryPrecedenceToMatches: applyCategoryPrecedenceToMatches,
    finalizeTagReferentResolution:  finalizeTagReferentResolution,
    resolveRecencyAmongEntries:     resolveRecencyAmongEntries,

    // Continuity
    interpretContinuityIntent:      interpretContinuityIntent,

    // Refinement
    parseRefinementAxis:            parseRefinementAxis,
    parseRefinementTarget:          parseRefinementTarget,
    parseBudgetCeiling:             parseBudgetCeiling,

    // Clarification
    isClarificationResolution:      isClarificationResolution,

    // Journey latch
    latchExperienceTierFromPrompt:  latchExperienceTierFromPrompt,
    getEffectiveJourneyLevel:       getEffectiveJourneyLevel,

    // Top-level routing
    interpretRuntimeMode:           interpretRuntimeMode
  };

})(typeof window !== 'undefined' ? window : global);
