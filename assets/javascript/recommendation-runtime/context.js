/**
 * RecommendationContext — canonical structured recommendation output interface.
 *
 * generateRecommendationContext() is the formalized boundary between
 * recommendation intelligence and narrative rendering. Prose builders should
 * consume its output — not compute their own pairing claims.
 *
 * Depends on: LoungeProducts, SterlonSensory, RecommendationRationale
 * Does NOT depend on: session state, DOM, sterlon-chat.js, prose templates
 */
(function (global) {
  'use strict';

  /**
   * Derive the sensory prelude template key from the spirit's canonical deckKey.
   * Uses product ontology (LoungeProducts) as the authoritative source.
   * Falls back to 'bourbon' when a spirit is missing deck metadata.
   */
  function resolvePreludeKey(spiritIdOrName) {
    var PIDs = global.RecommendationProductIds;
    var spirit =
      PIDs && typeof PIDs.getProductRef === 'function'
        ? PIDs.getProductRef('spirit', spiritIdOrName)
        : null;
    if (spirit && spirit.deckKey) return spirit.deckKey;
    return 'bourbon';
  }

  /**
   * Generate a structured recommendation context for a cigar + spirit + food triple.
   *
   * @param {object} opts
   * @param {string} opts.cigar
   * @param {string} opts.spirit
   * @param {string} [opts.food]
   * @param {string} [opts.journeyLevel]   'novice' | 'advanced'
   * @param {string} [opts.pairingMode]    'best' | 'safe' | 'wildcard'
   *
   * @returns {object} {
   *   cigar, spirit, food,
   *   journeyLevel, pairingMode,
   *   deckKey, preludeKey,
   *   compatibility: { cigarSpirit: {score, intensityMatch, bridges}, spiritFood },
   *   rationale: RationaleAtom[],
   *   confidence: 'high' | 'medium' | 'low'
   * }
   */
  /** Display names for sensory/rationale (scoring bridge — ids are authoritative). */
  function namesForScoring(ids, legacy) {
    var lp = global.LoungeProducts;
    var PIDs = global.RecommendationProductIds;
    var leg = legacy || {};
    var cigar = leg.cigar || '';
    var spirit = leg.spirit || '';
    var food = leg.food || '';
    if (ids.cigarId && lp && typeof lp.getCigarById === 'function') {
      var c = lp.getCigarById(ids.cigarId);
      if (c && c.name) cigar = c.name;
    }
    if (ids.spiritId && lp && typeof lp.getSpiritById === 'function') {
      var s = lp.getSpiritById(ids.spiritId);
      if (s && s.name) spirit = s.name;
    }
    if (ids.foodId && lp && typeof lp.getFoodById === 'function') {
      var f = lp.getFoodById(ids.foodId);
      if (f && f.name) food = f.name;
    }
    if (!ids.cigarId && !cigar && leg.cigar) cigar = leg.cigar;
    if (!ids.spiritId && !spirit && leg.spirit) spirit = leg.spirit;
    if (!ids.foodId && !food && leg.food) food = leg.food;
    if (PIDs && typeof PIDs.displayNameForId === 'function') {
      if (ids.cigarId && !cigar) cigar = PIDs.displayNameForId('cigar', ids.cigarId);
      if (ids.spiritId && !spirit) spirit = PIDs.displayNameForId('spirit', ids.spiritId);
      if (ids.foodId && !food) food = PIDs.displayNameForId('food', ids.foodId);
    }
    return { cigar: cigar, spirit: spirit, food: food };
  }

  function generateRecommendationContext(opts) {
    var o = opts || {};
    var PIDs = global.RecommendationProductIds;
    var ids =
      PIDs && typeof PIDs.resolveProductIds === 'function'
        ? PIDs.resolveProductIds(o)
        : { cigarId: null, spiritId: null, foodId: null };
    var names = namesForScoring(ids, o);
    var cigar = names.cigar;
    var spirit = names.spirit;
    var food = names.food;

    var ss = global.SterlonSensory || null;
    var rb = global.RecommendationRationale || null;

    var cigarSpiritScore =
      ss && cigar && spirit
        ? ss.scorePairing(cigar, spirit)
        : { score: 0, intensityMatch: false, bridges: [] };

    var spiritFoodScore = ss && spirit && food ? ss.scorePairing(spirit, food) : null;

    var rationale = rb ? rb.buildRationaleAtoms(cigar, spirit, food) : [];

    var preludeKey = ids.spiritId
      ? resolvePreludeKey(ids.spiritId)
      : spirit
        ? resolvePreludeKey(spirit)
        : 'default';
    var score = cigarSpiritScore.score || 0;
    var confidence = score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low';

    return {
      cigarId: ids.cigarId,
      spiritId: ids.spiritId,
      foodId: ids.foodId,
      cigar: cigar,
      spirit: spirit,
      food: food,
      journeyLevel: o.journeyLevel || null,
      pairingMode: o.pairingMode || 'best',
      deckKey: preludeKey,
      preludeKey: preludeKey,
      compatibility: {
        cigarSpirit: cigarSpiritScore,
        spiritFood: spiritFoodScore
      },
      rationale: rationale,
      confidence: confidence
    };
  }

  global.RecommendationContext = {
    generateRecommendationContext: generateRecommendationContext,
    resolvePreludeKey: resolvePreludeKey
  };
})(typeof window !== 'undefined' ? window : global);
