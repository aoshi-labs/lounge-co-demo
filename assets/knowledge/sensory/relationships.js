/**
 * SterlonSensoryRelationships — cross-product pairing compatibility logic.
 * Pure functions: inputs → scores. No DOM, no LLM, no session state.
 * Depends on: sensory/profiles.js (consumed by index.js only — relationships.js is standalone).
 */
(function (global) {
  'use strict';

  /**
   * Flavor-tag bridge pairs. When product A has tag `a` and product B has tag `b`
   * (or vice versa) they share the named bridge — a signal of harmonic compatibility.
   */
  var HARMONY_BRIDGES = [
    { a: 'cocoa',        b: 'chocolate',   label: 'cocoa-chocolate' },
    { a: 'cocoa',        b: 'cocoa',       label: 'cocoa-depth' },
    { a: 'espresso',     b: 'chocolate',   label: 'cocoa-espresso' },
    { a: 'coffee',       b: 'espresso',    label: 'cocoa-espresso' },
    { a: 'dark_chocolate', b: 'cocoa',     label: 'cocoa-depth' },
    { a: 'caramel',      b: 'toffee',      label: 'sweet-finish' },
    { a: 'caramel',      b: 'sweetness',   label: 'sweet-finish' },
    { a: 'oak',          b: 'cedar',       label: 'wood-structure' },
    { a: 'wood',         b: 'cedar',       label: 'wood-structure' },
    { a: 'spice',        b: 'pepper',      label: 'spice-thread' },
    { a: 'leather',      b: 'tobacco',     label: 'earth-leather' },
    { a: 'earth',        b: 'leather',     label: 'earth-leather' },
    { a: 'cream',        b: 'vanilla',     label: 'cream-elegance' },
    { a: 'cream',        b: 'sweetness',   label: 'cream-elegance' },
    { a: 'orange_peel',  b: 'spice',       label: 'citrus-lift' },
    { a: 'dark_fruit',   b: 'cherry',      label: 'smoke-depth' },
    { a: 'dark_fruit',   b: 'leather',     label: 'smoke-depth' },
    { a: 'dried_fruit',  b: 'dark_fruit',  label: 'smoke-depth' },
    { a: 'peat',         b: 'earth',       label: 'smoke-earth' },
    { a: 'smoke',        b: 'earth',       label: 'smoke-earth' },
    { a: 'smoke',        b: 'tobacco',     label: 'smoke-tobacco' },
    { a: 'honey',        b: 'cream',       label: 'cream-elegance' }
  ];

  var INTENSITY_MATCH_TOLERANCE = 2;

  function intensityDelta(profileA, profileB) {
    if (!profileA || !profileB) return Infinity;
    return Math.abs((profileA.body || 0) - (profileB.body || 0));
  }

  function isIntensityMatch(profileA, profileB) {
    return intensityDelta(profileA, profileB) <= INTENSITY_MATCH_TOLERANCE;
  }

  function findHarmonyBridges(tagsA, tagsB) {
    var setA = {};
    var setB = {};
    (tagsA || []).forEach(function (t) { setA[t] = true; });
    (tagsB || []).forEach(function (t) { setB[t] = true; });
    var found = [];
    HARMONY_BRIDGES.forEach(function (bridge) {
      var hit = (setA[bridge.a] && setB[bridge.b]) || (setA[bridge.b] && setB[bridge.a]);
      if (hit && found.indexOf(bridge.label) === -1) found.push(bridge.label);
    });
    return found;
  }

  /**
   * Returns a compatibility score in [0, 1].
   * 0.5 base for intensity match; up to 0.15 per shared bridge (max 0.45).
   */
  function pairingCompatibility(profileA, tagsA, profileB, tagsB) {
    var base = isIntensityMatch(profileA, profileB) ? 0.5 : 0.2;
    var bridges = findHarmonyBridges(tagsA, tagsB);
    var bridgeBonus = Math.min(bridges.length * 0.15, 0.45);
    return Math.min(base + bridgeBonus, 1.0);
  }

  global.SterlonSensoryRelationships = {
    HARMONY_BRIDGES: HARMONY_BRIDGES,
    INTENSITY_MATCH_TOLERANCE: INTENSITY_MATCH_TOLERANCE,
    intensityDelta: intensityDelta,
    isIntensityMatch: isIntensityMatch,
    findHarmonyBridges: findHarmonyBridges,
    pairingCompatibility: pairingCompatibility
  };
})(typeof window !== 'undefined' ? window : global);
