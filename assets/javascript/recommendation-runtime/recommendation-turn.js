/**
 * RecommendationTurn — canonical structured artifact for one recommendation flight.
 *
 * Plain object shape (no classes). Built once per turn; chat renders it without
 * recomputing compatibility, rationale atoms, or sensory scores.
 *
 * Load after RecommendationRuntime exists (index.js); before build-set.js.
 */
(function (global) {
  'use strict';

  var SLOT_ORDER = ['best', 'safe', 'wildcard'];

  /**
   * Deep-freeze a plain-object recommendation artifact.
   * Arrays and nested plain objects are frozen recursively.
   * Non-objects (strings, numbers, null) are returned as-is.
   * Enforces Law 2 (Turn Immutability): mutations throw TypeError in strict mode.
   */
  function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    Object.getOwnPropertyNames(obj).forEach(function (name) {
      deepFreeze(obj[name]);
    });
    return Object.freeze(obj);
  }
  /** Bump when required fields or slot semantics change; freeze fixtures pin this. */
  var RECOMMENDATION_TURN_CONTRACT_VERSION = 1;

  function generateTurnId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (e) {}
    return 'turn-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
  }

  /** One console.warn per stable key when authority falls back to explicit degraded (Phase 3d). */
  var warnedDegradedKeys = Object.create(null);

  function warnOnceDegraded(key, message) {
    try {
      if (warnedDegradedKeys[key]) return;
      warnedDegradedKeys[key] = true;
      if (typeof console !== 'undefined' && console.warn) console.warn(message);
    } catch (e) {}
  }

  /**
   * @param {object[]} cards  Up to 3 slot cards (best, safe, wildcard)
   * @param {string} journeyLevel  'novice' | 'advanced'
   * @returns {{
   *   contextsBySlot: object,
   *   rationaleBySlot: object,
   *   compatibilityBySlot: object,
   *   confidenceBySlot: object
   * }}
   */
  function buildPerSlotLayers(cards, journeyLevel) {
    var RR = global.RecommendationRuntime;
    var contextsBySlot = { best: null, safe: null, wildcard: null };
    var rationaleBySlot = { best: [], safe: [], wildcard: [] };
    var compatibilityBySlot = { best: null, safe: null, wildcard: null };
    var confidenceBySlot = { best: null, safe: null, wildcard: null };
    if (!RR || typeof RR.generateRecommendationContext !== 'function') {
      return {
        contextsBySlot: contextsBySlot,
        rationaleBySlot: rationaleBySlot,
        compatibilityBySlot: compatibilityBySlot,
        confidenceBySlot: confidenceBySlot
      };
    }
    for (var i = 0; i < SLOT_ORDER.length; i++) {
      var slot = SLOT_ORDER[i];
      var card = cards[i];
      if (!card) continue;
      var ctx = RR.generateRecommendationContext({
        cigarId: card.cigarId,
        spiritId: card.spiritId,
        foodId: card.foodId,
        cigar: card.cigar,
        spirit: card.spirit,
        food: card.food,
        journeyLevel: journeyLevel,
        pairingMode: slot
      });
      contextsBySlot[slot] = ctx;
      if (ctx && ctx.rationale) rationaleBySlot[slot] = ctx.rationale.slice();
      if (ctx && ctx.compatibility) compatibilityBySlot[slot] = ctx.compatibility;
      if (ctx && ctx.confidence != null) confidenceBySlot[slot] = ctx.confidence;
    }
    return {
      contextsBySlot: contextsBySlot,
      rationaleBySlot: rationaleBySlot,
      compatibilityBySlot: compatibilityBySlot,
      confidenceBySlot: confidenceBySlot
    };
  }

  /**
   * @param {object} opts
   * @param {object[]} opts.cards
   * @param {'novice'|'advanced'|null|undefined} [opts.journeyLevel]
   * @param {object} [opts.provenance]
   * @param {number} [opts.generatedAt]
   * @param {boolean} [opts.degraded]
   * @param {number} [opts.contractVersion]  Schema contract version; default 1
   * @returns {RecommendationTurn}
   */
  function createRecommendationTurn(opts) {
    var o = opts || {};
    var PIDs = global.RecommendationProductIds;
    var cards = (o.cards || []).slice(0, 3);
    if (PIDs && typeof PIDs.normalizeSlotCards === 'function') {
      cards = PIDs.normalizeSlotCards(cards);
    }
    var jl = o.journeyLevel;
    var layers = buildPerSlotLayers(cards, jl);
    var RR0 = global.RecommendationRuntime;
    var hasGen = RR0 && typeof RR0.generateRecommendationContext === 'function';

    var forcedDegraded = false;
    var forcedReason = null;
    if (cards.length > 0) {
      if (!hasGen) {
        forcedDegraded = true;
        forcedReason = 'RecommendationRuntime.generateRecommendationContext-unavailable';
      } else {
        for (var fi = 0; fi < SLOT_ORDER.length; fi++) {
          var fslot = SLOT_ORDER[fi];
          if (cards[fi] && !layers.contextsBySlot[fslot]) {
            forcedDegraded = true;
            forcedReason = 'RecommendationRuntime.slot-context-missing-with-card';
            break;
          }
        }
      }
    }

    // Callers must pass o.degraded=true for semantic degradation (e.g. hard-eligibility fallback).
    // This helper only forces degraded mode for structural/runtime-authority failures it detects locally.
    var degraded = !!o.degraded || forcedDegraded;
    if (forcedDegraded && forcedReason) {
      warnOnceDegraded(
        forcedReason,
        '[Sterlon][RecommendationTurn] Runtime authority incomplete — entering explicit degraded mode (' + forcedReason + ').'
      );
    }

    // Id-first allowlist: legacy display name without resolved catalog id is a violation.
    // This is seal-time status recording only. Enforcement and early degraded returns
    // happen before turn creation in build-set.js.
    var allowlistViolations =
      PIDs && typeof PIDs.idAuthorityViolations === 'function'
        ? PIDs.idAuthorityViolations(cards)
        : [];
    if (!allowlistViolations.length) {
      for (var ali = 0; ali < cards.length; ali++) {
        var alCard = cards[ali];
        if (!alCard) continue;
        var alSlot = SLOT_ORDER[ali] || ('slot-' + ali);
        if (alCard.cigar && alCard.cigarId === null) {
          allowlistViolations.push({ slot: alSlot, field: 'cigar', name: alCard.cigar });
        }
        if (alCard.spirit && alCard.spiritId === null) {
          allowlistViolations.push({ slot: alSlot, field: 'spirit', name: alCard.spirit });
        }
        if (alCard.food && alCard.foodId === null) {
          allowlistViolations.push({ slot: alSlot, field: 'food', name: alCard.food });
        }
      }
    }
    var allowlistStatus = { verified: allowlistViolations.length === 0, violations: allowlistViolations };
    var productIdAuthority =
      PIDs && typeof PIDs.PRODUCT_ID_AUTHORITY_VERSION === 'number'
        ? PIDs.PRODUCT_ID_AUTHORITY_VERSION
        : null;

    var turnId = generateTurnId();
    var baseProv = o.provenance && typeof o.provenance === 'object' ? o.provenance : {};
    var provenance;
    if (degraded) {
      provenance = Object.assign({ source: 'degraded' }, baseProv, { turnId: turnId });
      var dc = o.degradedCause || forcedReason || provenance.degradedCause || provenance.reason;
      if (dc) {
        provenance.degradedCause = provenance.degradedCause || dc;
        provenance.reason = provenance.reason || dc;
      }
    } else {
      provenance = Object.assign({ source: 'recommendation-runtime' }, baseProv, { turnId: turnId });
    }

    var runtimeMode =
      o.runtimeMode === 'normal' || o.runtimeMode === 'degraded'
        ? o.runtimeMode
        : degraded
          ? 'degraded'
          : 'normal';
    if (degraded && runtimeMode === 'normal') runtimeMode = 'degraded';
    if (!degraded && runtimeMode === 'degraded') runtimeMode = 'normal';

    var cv =
      typeof o.contractVersion === 'number' && !isNaN(o.contractVersion)
        ? o.contractVersion
        : RECOMMENDATION_TURN_CONTRACT_VERSION;
    // Law 2 (Turn Immutability): deep-freeze the artifact at creation time.
    // Any post-creation mutation throws TypeError in strict mode.
    return deepFreeze({
      contractVersion: cv,
      productIdAuthority: productIdAuthority,
      runtimeMode: runtimeMode,
      journeyLevel: jl == null || jl === '' ? null : jl,
      cards: cards,
      contextsBySlot: layers.contextsBySlot,
      rationaleBySlot: layers.rationaleBySlot,
      compatibilityBySlot: layers.compatibilityBySlot,
      confidenceBySlot: layers.confidenceBySlot,
      allowlistStatus: allowlistStatus,
      provenance: provenance,
      generatedAt: o.generatedAt != null ? o.generatedAt : Date.now(),
      degraded: degraded
    });
  }

  /**
   * Explicit degraded path when buildRecommendationSet is unavailable.
   */
  function buildDegradedTurn(opts) {
    var o = opts || {};
    var DT = global.DeckTemplate;
    var jl = o.journeyLevel;
    var reason = o.reason || 'RecommendationRuntime.buildRecommendationSet-unavailable';
    var cards =
      DT && typeof DT.getDegradedCatalogCards === 'function'
        ? DT.getDegradedCatalogCards(jl)
        : [];
    var prov = {
      source: 'degraded',
      reason: reason,
      degradedCause: o.degradedCause || reason,
      module: o.module
    };
    if (!cards.length) {
      prov.reason = 'deck-template-missing';
      prov.degradedCause = 'deck-template-missing';
    }
    return createRecommendationTurn({
      cards: cards,
      journeyLevel: jl,
      degraded: true,
      runtimeMode: 'degraded',
      degradedCause: prov.degradedCause,
      provenance: prov
    });
  }

  function getPrimaryRecommendation(turn) {
    return turn && turn.cards && turn.cards[0] ? turn.cards[0] : null;
  }

  function getSlotContext(turn, slot) {
    if (!turn || !turn.contextsBySlot) return null;
    return turn.contextsBySlot[slot] || null;
  }

  function getSlotRationale(turn, slot) {
    if (turn && turn.rationaleBySlot && turn.rationaleBySlot[slot] && turn.rationaleBySlot[slot].length) {
      return turn.rationaleBySlot[slot];
    }
    var c = getSlotContext(turn, slot);
    return c && c.rationale ? c.rationale : [];
  }

  function isDegradedTurn(turn) {
    return !!(turn && turn.degraded);
  }

  var api = {
    SLOT_ORDER: SLOT_ORDER,
    RECOMMENDATION_TURN_CONTRACT_VERSION: RECOMMENDATION_TURN_CONTRACT_VERSION,
    buildPerSlotLayers: buildPerSlotLayers,
    createRecommendationTurn: createRecommendationTurn,
    buildDegradedTurn: buildDegradedTurn,
    getPrimaryRecommendation: getPrimaryRecommendation,
    getSlotContext: getSlotContext,
    getSlotRationale: getSlotRationale,
    isDegradedTurn: isDegradedTurn
  };

  global.RecommendationTurnHelpers = api;

  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.createRecommendationTurn = createRecommendationTurn;
    RR.buildDegradedTurn = buildDegradedTurn;
    RR.getPrimaryRecommendation = getPrimaryRecommendation;
    RR.getSlotContext = getSlotContext;
    RR.getSlotRationale = getSlotRationale;
    RR.isDegradedTurn = isDegradedTurn;
  }
})(typeof window !== 'undefined' ? window : global);
