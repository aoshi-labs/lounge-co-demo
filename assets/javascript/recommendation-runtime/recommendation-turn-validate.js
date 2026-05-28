/**
 * RecommendationTurnValidate — validateRecommendationTurn + adoptRestoredTurn.
 * Extends RecommendationTurnHelpers. Load after recommendation-turn.js.
 */
(function (global) {
  'use strict';

  var SLOT_ORDER = global.RecommendationTurnHelpers.SLOT_ORDER;

  function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    Object.getOwnPropertyNames(obj).forEach(function (name) { deepFreeze(obj[name]); });
    return Object.freeze(obj);
  }

  function validateRecommendationTurn(turn, opts) {
    var o = opts || {};
    var errors = [];
    if (!turn || typeof turn !== 'object') {
      return { ok: false, errors: ['turn must be a non-null object'] };
    }
    if (typeof turn.contractVersion !== 'number' || isNaN(turn.contractVersion)) {
      errors.push('contractVersion must be a number');
    }
    if (!Array.isArray(turn.cards)) {
      errors.push('cards must be an array');
    } else if (turn.cards.length > 3) {
      errors.push('cards length must be at most 3');
    }
    var jl = turn.journeyLevel;
    if (jl != null && jl !== 'novice' && jl !== 'intermediate' && jl !== 'advanced') {
      errors.push('journeyLevel must be null, novice, intermediate, or advanced');
    }
    function checkSlotKeys(name, val) {
      if (!val || typeof val !== 'object') {
        errors.push(name + ' must be an object');
        return;
      }
      for (var i = 0; i < SLOT_ORDER.length; i++) {
        var s = SLOT_ORDER[i];
        if (!Object.prototype.hasOwnProperty.call(val, s)) {
          errors.push(name + ' missing key: ' + s);
        }
      }
    }
    checkSlotKeys('contextsBySlot', turn.contextsBySlot);
    checkSlotKeys('rationaleBySlot', turn.rationaleBySlot);
    for (var ri = 0; ri < SLOT_ORDER.length; ri++) {
      var rs = SLOT_ORDER[ri];
      if (turn.rationaleBySlot && !Array.isArray(turn.rationaleBySlot[rs])) {
        errors.push('rationaleBySlot.' + rs + ' must be an array');
      }
    }
    checkSlotKeys('compatibilityBySlot', turn.compatibilityBySlot);
    checkSlotKeys('confidenceBySlot', turn.confidenceBySlot);
    if (!turn.provenance || typeof turn.provenance !== 'object') {
      errors.push('provenance must be an object');
    }
    if (typeof turn.generatedAt !== 'number' || isNaN(turn.generatedAt)) {
      errors.push('generatedAt must be a number (unix ms)');
    }
    if (typeof turn.degraded !== 'boolean') {
      errors.push('degraded must be a boolean');
    }
    var rm = turn.runtimeMode;
    if (rm != null && rm !== 'normal' && rm !== 'degraded') {
      errors.push('runtimeMode must be normal, degraded, or omitted');
    }

    var structOk = errors.length === 0;
    if (!o.governance) {
      return { ok: structOk, errors: errors };
    }

    var gErrors = [];
    var effectiveMode = rm != null ? rm : (turn.degraded ? 'degraded' : 'normal');

    if (effectiveMode === 'normal') {
      if (turn.degraded) gErrors.push('governance: normal runtimeMode inconsistent with degraded=true');
      var src = turn.provenance && turn.provenance.source;
      if (src !== 'recommendation-runtime') {
        gErrors.push('governance: normal authority requires provenance.source=recommendation-runtime');
      }
      for (var gi = 0; gi < SLOT_ORDER.length; gi++) {
        var gs = SLOT_ORDER[gi];
        if (turn.cards && turn.cards[gi]) {
          if (!turn.contextsBySlot || !turn.contextsBySlot[gs]) {
            gErrors.push('governance: slot ' + gs + ' has card but missing runtime context');
          }
        }
      }
      if (turn.allowlistStatus && !turn.allowlistStatus.verified) {
        gErrors.push('governance: normal turn has allowlist violations — product identity drift forbidden');
      }
      if (turn.cards && turn.cards.length > 0) {
        var pia = turn.productIdAuthority;
        if (pia == null) {
          gErrors.push('governance: normal turn requires productIdAuthority when cards present');
        }
        for (var gi2 = 0; gi2 < turn.cards.length; gi2++) {
          var gc = turn.cards[gi2];
          if (!gc) continue;
          if (!gc.slot || SLOT_ORDER.indexOf(gc.slot) === -1) {
            gErrors.push('governance: card missing canonical slot key at index ' + gi2);
          }
        }

        var flightMode = turn.provenance && turn.provenance.flightMode;
        var cardCount = turn.cards.filter(function (c) { return c && c.cigarId; }).length;
        if (cardCount >= 2 && flightMode !== 'cigar-anchor') {
          var cigarSeen = Object.create(null);
          for (var ci = 0; ci < turn.cards.length; ci++) {
            var cc = turn.cards[ci];
            if (!cc || !cc.cigarId) continue;
            if (cigarSeen[cc.cigarId]) {
              gErrors.push('governance: duplicate cigarId across flight slots forbidden');
              break;
            }
            cigarSeen[cc.cigarId] = true;
          }
        }

        var provSignals = turn.provenance && turn.provenance.signals;
        var namedSpirit =
          provSignals && provSignals.indexOf('named-spirit') !== -1;
        var spiritPoolThin =
          turn.provenance && turn.provenance.spiritRelativesSkipped === true;
        if (namedSpirit && turn.cards.length >= 3) {
          var anchorSpiritId = turn.cards[0] && turn.cards[0].spiritId;
          if (anchorSpiritId) {
            for (var si = 1; si < turn.cards.length; si++) {
              var sc = turn.cards[si];
              if (sc && sc.spiritId && sc.spiritId !== anchorSpiritId) {
                gErrors.push(
                  'governance: named-spirit flight must keep the same spiritId on every slot'
                );
                break;
              }
            }
          }
        }
      }
    } else {
      if (!turn.degraded) {
        gErrors.push('governance: degraded runtimeMode requires degraded=true');
      }
      var p = turn.provenance || {};
      if (!p.reason && !p.degradedCause) {
        gErrors.push('governance: degraded turn requires provenance.reason or degradedCause');
      }
    }

    var govOk = gErrors.length === 0;
    var allOk = structOk && govOk;
    return {
      ok: allOk,
      errors: errors.concat(gErrors),
      governance: { ok: govOk, errors: gErrors.slice() }
    };
  }

  function adoptRestoredTurn(plain) {
    try {
      if (!plain || typeof plain !== 'object') return null;

      var PIDs = global.RecommendationProductIds;
      if (PIDs && typeof PIDs.normalizeSlotCards === 'function' && Array.isArray(plain.cards)) {
        plain = Object.assign({}, plain, {
          cards: PIDs.normalizeSlotCards(plain.cards),
          productIdAuthority: PIDs.PRODUCT_ID_AUTHORITY_VERSION
        });
      }

      // Version compatibility — only hard-reject when BOTH sides supply a version.
      // If the runtime is not yet loaded or the turn predates version tracking,
      // accept the turn and let governance validation decide.
      var RR = global.RecommendationRuntime;
      var currentRV = RR && RR.version != null ? RR.version : null;
      var storedRV = plain.provenance && plain.provenance.runtimeVersion != null
        ? plain.provenance.runtimeVersion : null;
      if (currentRV !== null && storedRV !== null && currentRV !== storedRV) {
        try {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(
              '[Sterlon][adoptRestoredTurn] Version mismatch — stored runtimeVersion=' +
              storedRV + ', current=' + currentRV + '. Discarding stale turn.'
            );
          }
        } catch (_) {}
        return null;
      }

      // Structural + governance validation.
      var result = validateRecommendationTurn(plain, { governance: true });
      if (!result.ok) {
        try {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(
              '[Sterlon][adoptRestoredTurn] Validation failed — discarding turn.',
              result.errors
            );
          }
        } catch (_) {}
        return null;
      }

      // Re-freeze: JSON.parse produces plain mutable objects.
      return deepFreeze(plain);
    } catch (_) {
      return null;
    }
  }

  var RT = global.RecommendationTurnHelpers;
  Object.assign(RT, {
    validateRecommendationTurn: validateRecommendationTurn,
    adoptRestoredTurn: adoptRestoredTurn
  });
  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.validateRecommendationTurn = validateRecommendationTurn;
    RR.adoptRestoredTurn = adoptRestoredTurn;
  }
})(typeof window !== 'undefined' ? window : global);
