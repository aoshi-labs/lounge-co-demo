/**
 * SterlonSensory — barrel export for the sensory runtime.
 * Depends on: sensory/profiles.js, sensory/relationships.js
 *
 * Public API:
 *   getProductSensoryProfile(name)  → sensory object or null
 *   getFlavorNotes(name)            → tag-id string array
 *   getSensoryDimension(name, dim)  → number or null
 *   getIntensityOrderedCigars()     → name array, lightest → boldest
 *   getIntensityOrderedSpirits()    → name array, lightest → boldest
 *   scorePairing(nameA, nameB)      → { score, intensityMatch, bridges }
 */
(function (global) {
  'use strict';

  function getProfiles() { return global.SterlonSensoryProfiles || null; }
  function getRels()     { return global.SterlonSensoryRelationships || null; }

  function scorePairing(nameA, nameB) {
    var p = getProfiles();
    var r = getRels();
    if (!p || !r) return { score: 0, intensityMatch: false, bridges: [] };
    var profileA = p.getSensoryProfile(nameA);
    var tagsA    = p.getFlavorNotes(nameA);
    var profileB = p.getSensoryProfile(nameB);
    var tagsB    = p.getFlavorNotes(nameB);
    return {
      score:         r.pairingCompatibility(profileA, tagsA, profileB, tagsB),
      intensityMatch: r.isIntensityMatch(profileA, profileB),
      bridges:       r.findHarmonyBridges(tagsA, tagsB)
    };
  }

  global.SterlonSensory = {
    version: 1,
    getProductSensoryProfile: function (name) {
      var p = getProfiles();
      return p ? p.getSensoryProfile(name) : null;
    },
    getFlavorNotes: function (name) {
      var p = getProfiles();
      return p ? p.getFlavorNotes(name) : [];
    },
    getSensoryDimension: function (name, dim) {
      var p = getProfiles();
      return p ? p.getSensoryDimension(name, dim) : null;
    },
    getIntensityOrderedCigars: function () {
      var p = getProfiles();
      return p ? p.getIntensityOrderedCigars() : [];
    },
    getIntensityOrderedSpirits: function () {
      var p = getProfiles();
      return p ? p.getIntensityOrderedSpirits() : [];
    },
    scorePairing: scorePairing
  };
})(typeof window !== 'undefined' ? window : global);
