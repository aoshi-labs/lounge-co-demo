/**
 * SterlonSessionLifecycle — session persistence, continuity, and recommendation-set
 * coordination.
 *
 * Tracks WHAT was recommended and WHEN via sessionRuntime; never creates or mutates
 * RecommendationTurn artifacts (authority remains RecommendationRuntime-owned).
 *
 * Architecture: docs/internal/STERLON_RECOMMENDATION_EXTRACTION.md
 *
 * Dependencies (injected by sterlon-chat.js):
 *   _sessionProvider → () => sessionRuntime (write-through; must not reassign binding)
 *
 * External module dependencies (lazy):
 *   _RS() → window.SterlonRuntimeState
 *   _RT() → window.SterlonChatRouter
 */
(function (global) {
  'use strict';

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

  function setSessionProvider(fn) {
    if (typeof fn !== 'function') return;
    if (_sessionProviderWired) {
      if (typeof console !== 'undefined' && console.warn && !setSessionProvider._doubleWarned) {
        setSessionProvider._doubleWarned = true;
        console.warn('[SterlonSessionLifecycle] setSessionProvider called more than once — last provider wins; earlier wiring is replaced.');
      }
    } else if (_sr._warned) {
      if (typeof console !== 'undefined' && console.warn && !setSessionProvider._lateWarned) {
        setSessionProvider._lateWarned = true;
        console.warn('[SterlonSessionLifecycle] setSessionProvider called after fallback session was used — prior mutations are not on live sessionRuntime.');
      }
    }
    _sessionProvider = fn;
    _sessionProviderWired = true;
  }

  /** @returns {object} current sessionRuntime */
  function _sr() {
    if (!_sessionProviderWired && typeof console !== 'undefined' && console.warn && !_sr._warned) {
      _sr._warned = true;
      console.warn('[SterlonSessionLifecycle] setSessionProvider not called — using isolated fallback session');
    }
    return _sessionProvider();
  }

  function _RS() { return global.SterlonRuntimeState || {}; }
  function _RT() { return global.SterlonChatRouter || null; }

  let sessionIdCounter = 0;

  function generateSessionId(prefix) {
    sessionIdCounter += 1;
    return (prefix || 'id') + '-' + Date.now() + '-' + sessionIdCounter;
  }

  function _PIDs() {
    return typeof window !== 'undefined' ? window.RecommendationProductIds : null;
  }

  function resolveRegistryProduct(nameOrId, category) {
    const trimmed = String(nameOrId || '').trim();
    if (!trimmed) return { productId: null, name: '' };
    const lp = typeof window !== 'undefined' ? window.LoungeProducts : null;
    const PIDs = _PIDs();
    if (lp) {
      const getFn =
        category === 'spirit'
          ? 'getSpiritById'
          : category === 'cigar'
            ? 'getCigarById'
            : category === 'food'
              ? 'getFoodById'
              : null;
      if (getFn && typeof lp[getFn] === 'function') {
        const byId = lp[getFn](trimmed);
        if (byId && byId.id) {
          return { productId: byId.id, name: byId.name || trimmed };
        }
      }
    }
    if (PIDs) {
      const productId =
        category === 'spirit'
          ? PIDs.resolveSpiritId(trimmed)
          : category === 'cigar'
            ? PIDs.resolveCigarId(trimmed)
            : category === 'food'
              ? PIDs.resolveFoodId(trimmed)
              : null;
      if (productId) {
        return {
          productId,
          name: PIDs.displayNameForId(category, productId) || trimmed
        };
      }
    }
    return { productId: null, name: trimmed };
  }

  function tagsForProduct(nameOrId, category) {
    const resolved = resolveRegistryProduct(nameOrId, category);
    const lp = typeof window !== 'undefined' ? window.LoungeProducts : null;
    const PIDs = _PIDs();
    let p = null;
    if (resolved.productId && lp) {
      if (category === 'spirit' && lp.getSpiritById) p = lp.getSpiritById(resolved.productId);
      if (category === 'cigar' && lp.getCigarById) p = lp.getCigarById(resolved.productId);
      if (category === 'food' && lp.getFoodById) p = lp.getFoodById(resolved.productId);
    }
    if (!p && PIDs && resolved.name) {
      p = PIDs.getProductRef(category, resolved.name);
    }
    if (!p || !p.tags || !p.tags.length) return [];
    return p.tags
      .slice()
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 6)
      .map((t) => t.id);
  }

  function tierFromCard(card, role) {
    const PIDs = _PIDs();
    const ids =
      PIDs && typeof PIDs.resolveProductIds === 'function'
        ? PIDs.resolveProductIds(card)
        : { cigarId: card.cigarId, spiritId: card.spiritId, foodId: card.foodId };
    const hydrated =
      PIDs && typeof PIDs.hydrateCardDisplay === 'function'
        ? PIDs.hydrateCardDisplay(Object.assign({}, card, ids))
        : card;
    return {
      label: hydrated.label,
      tier: hydrated.tier,
      cigarId: ids.cigarId || null,
      spiritId: ids.spiritId || null,
      foodId: ids.foodId || null,
      cigar: hydrated.cigar,
      spirit: hydrated.spirit,
      food: hydrated.food,
      why: (hydrated.why || []).slice(),
      descriptor: hydrated.descriptor || '',
      stock: hydrated.stock || '',
      tags: tagsForProduct(ids.spiritId || hydrated.spirit, 'spirit').concat(
        tagsForProduct(ids.cigarId || hydrated.cigar, 'cigar')
      )
    };
  }

  function saveSessionRuntime() {
    const RS = _RS();
    const key = RS.SESSION_RUNTIME_STORAGE_KEY || 'lounge-sterlon-runtime-v2';
    try {
      const storage = global.localStorage;
      if (!storage || typeof storage.setItem !== 'function') return;
      const sr = _sr();
      const lastRecommendationTurn = sr.lastRecommendationTurn;
      const persistable = Object.assign({}, sr);
      delete persistable.lastRecommendationTurn;
      storage.setItem(key, JSON.stringify(persistable));
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        const errName = err && err.name ? err.name : 'Error';
        console.warn(
          '[SterlonSessionLifecycle] Failed to persist session runtime (' + errName + ') — turn continuity may be lost on reload.',
          err
        );
      }
    }
  }

  function recommendationSetFromCards(cards, sourcePrompt, categoryFocus) {
    const sr = _sr();
    return {
      setId: generateSessionId('set'),
      issuedAtTurn: sr.turnCount,
      sourcePrompt: sourcePrompt || '',
      categoryFocus: categoryFocus || sr.activeCategoryFocus || 'open',
      best: tierFromCard(cards[0], 'best'),
      refined: tierFromCard(cards[1], 'refined'),
      wildcard: tierFromCard(cards[2], 'wildcard')
    };
  }

  function registerProductEntry(nameOrId, category, role, fromSetId) {
    const sr = _sr();
    const resolved = resolveRegistryProduct(nameOrId, category);
    if (!resolved.name && !resolved.productId) return null;
    const existing = sr.sessionProductRegistry.find(function (e) {
      if (resolved.productId && e.productId) return e.productId === resolved.productId;
      return e.name === resolved.name && e.category === category;
    });
    if (existing) {
      existing.lastReferencedAtTurn = sr.turnCount;
      if (role && role !== 'mentioned') existing.role = role;
      if (resolved.productId) existing.productId = resolved.productId;
      return existing;
    }
    const entry = {
      id: generateSessionId('prod'),
      productId: resolved.productId,
      name: resolved.name,
      category: category,
      role: role || 'mentioned',
      fromSetId: fromSetId || null,
      turnIndex: sr.turnCount,
      tags: tagsForProduct(resolved.productId || resolved.name, category),
      lastReferencedAtTurn: sr.turnCount
    };
    sr.sessionProductRegistry.push(entry);
    return entry;
  }

  function registerFlightProducts(activeSet) {
    if (!activeSet) return;
    const sr = _sr();
    ['best', 'refined', 'wildcard'].forEach(function (role) {
      const tier = activeSet[role];
      if (!tier) return;
      registerProductEntry(tier.cigarId || tier.cigar, 'cigar', role, activeSet.setId);
      registerProductEntry(tier.spiritId || tier.spirit, 'spirit', role, activeSet.setId);
      registerProductEntry(tier.foodId || tier.food, 'food', role, activeSet.setId);
    });
    const spiritCount = sr.sessionProductRegistry.filter(function (e) {
      return e.category === 'spirit';
    }).length;
    sr.comparisonAffordance = spiritCount >= 2;
    sr.threadPhase = sr.refinementChainDepth > 0 ? 'refining' : 'recommended';
    saveSessionRuntime();
  }

  function commitActiveRecommendationSet(cards, promptText, options) {
    const sr = _sr();
    const RT = _RT();
    const opts = options || {};
    const focus = sr.activeCategoryFocus
      || (RT && RT.inferCategoryFocus ? RT.inferCategoryFocus(promptText) : null)
      || 'open';
    const activeSet = recommendationSetFromCards(cards, promptText, focus);
    sr.activeRecommendationSet = activeSet;
    if (opts.resetRefinementChain !== false) {
      sr.refinementChainDepth = 0;
    }
    registerFlightProducts(activeSet);
  }

  function updateSessionStateForContinuity(mode, text) {
    const sr = _sr();
    const RuntimeMode = _RS().RuntimeMode || {};
    sr.conversationalMode = mode;
    sr.threadPhase = mode === RuntimeMode.REFINEMENT ? 'refining'
      : mode === RuntimeMode.RECALL ? 'recommended'
      : mode === RuntimeMode.COMPARISON ? 'comparing'
      : mode === RuntimeMode.EXPERTISE && sr.activeRecommendationSet ? 'recommended'
      : mode === RuntimeMode.EXPERTISE ? 'exploring'
      : sr.threadPhase;
    saveSessionRuntime();
  }

  function _WJ() { return global.WhiskeyJourney || null; }

  /**
   * Persist evening dimension detections on sessionRuntime (single write boundary).
   * @param {object} sr sessionRuntime
   * @param {object} detected RT.detectEveningDimensions output
   */
  function applyEveningDimensions(sr, detected) {
    if (!sr || !detected) {
      return {
        occasion: sr ? sr.eveningOccasion : null,
        rhythm: sr ? sr.eveningRhythm : null,
        social: sr ? sr.eveningSocial : null,
        atmosphere: sr ? sr.eveningAtmosphere : null
      };
    }
    if (detected.occasion) sr.eveningOccasion = detected.occasion;
    if (detected.rhythm) sr.eveningRhythm = detected.rhythm;
    if (detected.social) sr.eveningSocial = detected.social;
    if (detected.atmosphere) sr.eveningAtmosphere = detected.atmosphere;
    return {
      occasion: sr.eveningOccasion,
      rhythm: sr.eveningRhythm,
      social: sr.eveningSocial,
      atmosphere: sr.eveningAtmosphere
    };
  }

  /**
   * Persist evening mood when detected (single write boundary).
   * @param {object} sr sessionRuntime
   * @param {string|null} mood
   * @param {number} turnCount
   */
  function applyEveningMood(sr, mood, turnCount) {
    if (!sr || !mood) return null;
    sr.eveningMood = mood;
    sr.eveningMoodTurn = turnCount || 0;
    return mood;
  }

  /**
   * Apply flavor-route routing fields for one member turn.
   * flavorRoute persistence is intentional — documents turn-level deck/category focus.
   * @param {object} sr sessionRuntime
   * @param {{ route: object|null, defaultDeckKey?: string }} opts
   * @returns {string} active deck key after routing
   */
  function applyTurnRouting(sr, opts) {
    var o = opts || {};
    var route = o.route || null;
    var defaultDeckKey = o.defaultDeckKey || 'bourbon';
    sr.flavorRoute = route;
    sr.flavorRoutedSpirit = route && route.name ? route.name : null;
    if (route && route.deckKey) {
      sr.activeDeckKey = route.deckKey;
      sr.activeCategoryFocus = route.category === 'cigar' ? 'cigar' : 'spirit';
    } else {
      sr.activeDeckKey = defaultDeckKey;
    }
    if (route && route.deckKey) return route.deckKey;
    return sr.activeDeckKey || defaultDeckKey;
  }

  /**
   * Single write boundary for per-member-turn session intake (turn counter, mood hint,
   * category focus, flavor routing). Callers supply precomputed hints + injected hooks.
   * @param {object} sr sessionRuntime
   * @param {string} text raw member text
   * @param {{ focusHint?: string|null, isPivot?: boolean, applyEveningMood?: function, applyTurnRouting?: function, emit?: function }} opts
   */
  function applyTurnIntake(sr, text, opts) {
    var o = opts || {};
    if (!sr) return;
    sr.turnCount = (sr.turnCount || 0) + 1;
    if (typeof o.applyEveningMood === 'function') {
      o.applyEveningMood(sr, text);
    }
    if (o.focusHint) {
      sr.activeCategoryFocus = o.focusHint;
    }
    if (o.isPivot) {
      sr.activeCategoryFocus = o.focusHint || 'open';
    }
    if (typeof o.applyTurnRouting === 'function') {
      o.applyTurnRouting(sr, text);
    }
    if (typeof o.emit === 'function') {
      o.emit('turn_started', { turn: sr.turnCount, textLen: String(text || '').length });
    }
  }

  /**
   * Persist refinement UI axis / slot / depth after a refinement resolution (RR-owned turn is separate).
   * @param {object} sr sessionRuntime
   * @param {string|null} axis
   * @param {string|null} targetKey e.g. 'best' | 'wildcard'
   * @param {number} depth chain depth after this refinement
   */
  function applyRefinementState(sr, axis, targetKey, depth) {
    if (!sr) return;
    sr.refinementAxis = axis;
    sr.refinementTarget = targetKey;
    if (typeof depth === 'number') {
      sr.refinementChainDepth = depth;
    }
  }

  function applyBudgetCeiling(sr, ceiling) {
    if (!sr) return;
    sr.budgetCeiling = ceiling;
  }

  /**
   * Authoritative session pointer for the latest recommendation turn (refinement chain parent/child).
   * @param {object} sr sessionRuntime
   * @param {object} turn RecommendationTurn
   */
  function commitRefinementTurn(sr, turn) {
    if (!sr) return;
    sr.lastRecommendationTurn = turn;
    saveSessionRuntime();
  }

  function updateSessionStateAfterTurn(mode, text) {
    const sr = _sr();
    const RS = _RS();
    const RT = _RT();
    const RuntimeMode = RS.RuntimeMode || {};
    sr.conversationalMode = mode;
    sr.threadPhase = 'active';
    if (RT && RT.hasExplicitRecommendationRequest) {
      sr.hasExplicitRecommendationRequest = RT.hasExplicitRecommendationRequest(text);
    }
    if (mode === RuntimeMode.CLARIFICATION) {
      if (RT && RT.detectClarificationAxis) {
        sr.pendingClarification = RT.detectClarificationAxis(text);
      }
    } else if (mode === RuntimeMode.RECOMMENDATION) {
      sr.pendingClarification = null;
      if (RT && RT.inferCategoryFocus) {
        const focus = RT.inferCategoryFocus(text);
        if (focus) sr.activeCategoryFocus = focus;
      }
    } else if (mode === RuntimeMode.GREETING) {
      sr.pendingClarification = null;
    }
    saveSessionRuntime();
  }

  global.SterlonSessionLifecycle = {
    setSessionProvider: setSessionProvider,
    saveSessionRuntime: saveSessionRuntime,
    recommendationSetFromCards: recommendationSetFromCards,
    registerProductEntry: registerProductEntry,
    registerFlightProducts: registerFlightProducts,
    commitActiveRecommendationSet: commitActiveRecommendationSet,
    updateSessionStateForContinuity: updateSessionStateForContinuity,
    updateSessionStateAfterTurn: updateSessionStateAfterTurn,
    applyEveningDimensions: applyEveningDimensions,
    applyEveningMood: applyEveningMood,
    applyTurnRouting: applyTurnRouting,
    applyTurnIntake: applyTurnIntake,
    applyRefinementState: applyRefinementState,
    applyBudgetCeiling: applyBudgetCeiling,
    commitRefinementTurn: commitRefinementTurn
  };
})(typeof window !== 'undefined' ? window : global);
