/**
 * Governed RecommendationTurn persistence (Law 8 — RR-E1).
 *
 * Serializes frozen turns to localStorage; restoration uses adoptRestoredTurn only.
 * Never reconstructs authority from DOM or presentation state.
 */
(function (global) {
  'use strict';

  var LAST_TURN_STORAGE_KEY = 'lounge-sterlon-last-turn-v1';

  function adoptFn() {
    var RR = global.RecommendationRuntime;
    var TH = global.RecommendationTurnHelpers;
    if (RR && typeof RR.adoptRestoredTurn === 'function') return RR.adoptRestoredTurn;
    if (TH && typeof TH.adoptRestoredTurn === 'function') return TH.adoptRestoredTurn;
    return null;
  }

  /**
   * Persist a RecommendationTurn artifact (JSON round-trip safe).
   * @param {object} turn
   */
  function saveLastRecommendationTurn(turn) {
    if (!turn || typeof turn !== 'object') return;
    var storage = global.localStorage;
    if (!storage || typeof storage.setItem !== 'function') return;
    try {
      storage.setItem(LAST_TURN_STORAGE_KEY, JSON.stringify(turn));
    } catch (_) {}
  }

  /**
   * Load and adopt a governed turn from storage, or null on miss/invalid/version mismatch.
   * @returns {object|null} deep-frozen RecommendationTurn
   */
  function loadLastRecommendationTurn() {
    var storage = global.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    var adopt = adoptFn();
    if (!adopt) return null;
    try {
      var raw = storage.getItem(LAST_TURN_STORAGE_KEY);
      if (!raw) return null;
      var plain = JSON.parse(raw);
      return adopt(plain);
    } catch (_) {
      try {
        if (typeof storage.removeItem === 'function') {
          storage.removeItem(LAST_TURN_STORAGE_KEY);
        }
      } catch (e2) {}
      return null;
    }
  }

  function clearLastRecommendationTurn() {
    var storage = global.localStorage;
    if (!storage || typeof storage.removeItem !== 'function') return;
    try {
      storage.removeItem(LAST_TURN_STORAGE_KEY);
    } catch (_) {}
  }

  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.LAST_TURN_STORAGE_KEY = LAST_TURN_STORAGE_KEY;
    RR.saveLastRecommendationTurn = saveLastRecommendationTurn;
    RR.loadLastRecommendationTurn = loadLastRecommendationTurn;
    RR.clearLastRecommendationTurn = clearLastRecommendationTurn;
  }
})(typeof window !== 'undefined' ? window : global);
