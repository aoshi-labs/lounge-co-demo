/**
 * RecommendationBudget — parse member budget language into structured filters.
 *
 * Modes:
 *   none    — no budget constraint
 *   ceiling — under / below / max (msrp <= ceiling)
 *   around  — around / about / $N-ish (nearest band, default ±25% min $3)
 *   range   — between $A and $B (inclusive)
 *
 * Pure: no DOM, no session mutation. Session ceiling is an optional fallback input.
 */
(function (global) {
  'use strict';

  var NONE = Object.freeze({
    mode: 'none',
    ceiling: null,
    target: null,
    min: null,
    max: null
  });

  /**
   * @param {number} target
   * @returns {{ min: number, max: number }}
   */
  function aroundBand(target) {
    var t = Number(target);
    if (!Number.isFinite(t) || t <= 0) {
      return { min: 1, max: 1 };
    }
    var band = Math.max(3, Math.round(t * 0.25));
    return {
      min: Math.max(1, t - band),
      max: t + band
    };
  }

  /**
   * @param {string} text
   * @param {number|null|undefined} sessionCeiling
   * @returns {{ mode: string, ceiling: number|null, target: number|null, min: number|null, max: number|null }}
   */
  function parseBudgetIntent(text, sessionCeiling) {
    var t = String(text || '').toLowerCase();

    var rangeMatch = t.match(
      /\bbetween\s+\$?\s*(\d+(?:\.\d+)?)\s*(?:and|&|to|-)\s*\$?\s*(\d+(?:\.\d+)?)/i
    );
    if (rangeMatch) {
      var a = Number(rangeMatch[1]);
      var b = Number(rangeMatch[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return {
          mode: 'range',
          ceiling: null,
          target: null,
          min: Math.min(a, b),
          max: Math.max(a, b)
        };
      }
    }

    var aroundMatch =
      t.match(/\b(?:around|about|roughly|approximately|~)\s*\$?\s*(\d+(?:\.\d+)?)\b/i) ||
      t.match(/\$?\s*(\d+(?:\.\d+)?)\s*-?\s*ish\b/i);
    if (aroundMatch) {
      var target = Number(aroundMatch[1]);
      if (Number.isFinite(target)) {
        var band = aroundBand(target);
        return {
          mode: 'around',
          ceiling: null,
          target: target,
          min: band.min,
          max: band.max
        };
      }
    }

    var underMatch =
      t.match(/\b(?:under|below|less than|max|at most)\s*\$?\s*(\d+(?:\.\d+)?)/i) ||
      t.match(/\$?\s*(\d+(?:\.\d+)?)\s+or less\b/i);
    if (underMatch) {
      var ceiling = Number(underMatch[1]);
      if (Number.isFinite(ceiling)) {
        return {
          mode: 'ceiling',
          ceiling: ceiling,
          target: null,
          min: null,
          max: ceiling
        };
      }
    }

    if (sessionCeiling != null && Number.isFinite(Number(sessionCeiling))) {
      var sc = Number(sessionCeiling);
      return {
        mode: 'ceiling',
        ceiling: sc,
        target: null,
        min: null,
        max: sc
      };
    }

    return {
      mode: NONE.mode,
      ceiling: NONE.ceiling,
      target: NONE.target,
      min: NONE.min,
      max: NONE.max
    };
  }

  /**
   * Back-compat ceiling helper — returns a number only for explicit ceiling mode.
   * @param {string} text
   * @param {number|null|undefined} sessionCeiling
   * @returns {number|null|undefined}
   */
  function parseBudgetCeiling(text, sessionCeiling) {
    var intent = parseBudgetIntent(text, sessionCeiling);
    if (intent.mode === 'ceiling') return intent.ceiling;
    return null;
  }

  /**
   * @param {string|null|undefined} categoryFocus  'spirit' | 'cigar' | 'pairing'
   * @returns {boolean}
   */
  function budgetAppliesToCigars(categoryFocus) {
    return categoryFocus === 'cigar' || categoryFocus === 'pairing';
  }

  /**
   * @param {string|null|undefined} categoryFocus
   * @returns {boolean}
   */
  function budgetAppliesToSpirits(categoryFocus) {
    return categoryFocus === 'spirit' || categoryFocus == null;
  }

  global.RecommendationBudget = {
    parseBudgetIntent: parseBudgetIntent,
    parseBudgetCeiling: parseBudgetCeiling,
    aroundBand: aroundBand,
    budgetAppliesToCigars: budgetAppliesToCigars,
    budgetAppliesToSpirits: budgetAppliesToSpirits,
    NONE: NONE
  };
})(typeof window !== 'undefined' ? window : global);
