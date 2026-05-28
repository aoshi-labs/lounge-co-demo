/**
 * SterlonSensoryProfiles — queryable sensory surface over LoungeProducts ontology.
 * Pure read-only module: no DOM, no recommendations, no prose.
 * Depends on: products/cigars.js, products/spirits.js, products/foods.js, products/index.js
 */
(function (global) {
  'use strict';

  /**
   * Intensity-ordered product IDs (lighter → bolder by body score).
   * Order matches the established pairing ladder; do not reorder without updating
   * refinementAdjacentPilot in sterlon-recommendations.js.
   */
  var CIGAR_INTENSITY_IDS = [
    'cohiba-siglo-vi',
    'ashton-vsg-torpedo',
    'arturo-fuente-opus-x',
    'padron-1926-no-35',
    'liga-privada-no-9',
    'my-father-le-bijou-1922'
  ];

  var SPIRIT_INTENSITY_IDS = [
    'blantons-single-barrel',
    'pappy-van-winkle-23yr'
  ];

  function lp() {
    return global.LoungeProducts || null;
  }

  function getSensoryProfile(name) {
    var lib = lp();
    if (!lib) return null;
    var p = lib.findProductByName(name);
    return (p && p.sensory) ? p.sensory : null;
  }

  function getFlavorNotes(name) {
    var lib = lp();
    if (!lib) return [];
    var p = lib.findProductByName(name);
    if (!p || !p.tags) return [];
    return p.tags.map(function (t) { return typeof t === 'string' ? t : t.id; });
  }

  function getSensoryDimension(name, dimension) {
    var profile = getSensoryProfile(name);
    if (!profile) return null;
    return typeof profile[dimension] !== 'undefined' ? profile[dimension] : null;
  }

  function idsToNames(ids, getById) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var p = getById(ids[i]);
      if (p && p.name) out.push(p.name);
    }
    return out;
  }

  function getIntensityOrderedCigars() {
    var lib = lp();
    if (!lib || !lib.getCigarById) return CIGAR_INTENSITY_IDS.slice();
    return idsToNames(CIGAR_INTENSITY_IDS, function (id) { return lib.getCigarById(id); });
  }

  function getIntensityOrderedSpirits() {
    var lib = lp();
    if (!lib || !lib.getSpiritById) return SPIRIT_INTENSITY_IDS.slice();
    return idsToNames(SPIRIT_INTENSITY_IDS, function (id) { return lib.getSpiritById(id); });
  }

  global.SterlonSensoryProfiles = {
    CIGAR_INTENSITY_IDS: CIGAR_INTENSITY_IDS,
    SPIRIT_INTENSITY_IDS: SPIRIT_INTENSITY_IDS,
    getSensoryProfile: getSensoryProfile,
    getFlavorNotes: getFlavorNotes,
    getSensoryDimension: getSensoryDimension,
    getIntensityOrderedCigars: getIntensityOrderedCigars,
    getIntensityOrderedSpirits: getIntensityOrderedSpirits
  };
})(typeof window !== 'undefined' ? window : global);
