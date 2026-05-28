/**
 * OntologyCigarContext — cigar policy scoring and filtering.
 */
(function (global) {
  'use strict';

  var C = global.OntologyPolicyCore;
  if (!C) return;

  function cigarContextScore(name, ctx, spirit) {
    var p = C.findProduct(name, 'cigar');
    if (!p) return 0;
    if (C.avoidIfTriggered(p, ctx)) return -2;
    var CC = global.ComfortCalibration;
    var comfortDelta =
      CC && typeof CC.comfortCalibrationDelta === 'function' ? CC.comfortCalibrationDelta(p, ctx) : 0;
    var score =
      C.bestForBoost(p, ctx) +
      C.flavorFamilyBoost(p, ctx) +
      (typeof C.highProofBourbonMaduroDelta === 'function'
        ? C.highProofBourbonMaduroDelta(p, ctx, spirit)
        : 0) +
      (typeof C.afterDinnerCigarDelta === 'function' ? C.afterDinnerCigarDelta(p, ctx) : 0) +
      comfortDelta -
      C.beginnerPenalty(p, ctx) -
      C.smokeTimePenalty(p, ctx);
    var CSB = global.CigarSublineBody;
    if (ctx.fullBodyAsk && CSB) {
      if (typeof CSB.isMildSubline === 'function' && CSB.isMildSubline(name)) return -2.5;
      var body = (p.spec && p.spec.body) || p.body || '';
      if (body === 'Full') score += 0.35;
      else if (body === 'Medium-Full') score -= 0.2;
    }
    return score;
  }

  function filterCigarNames(names, ctx) {
    var out = [];
    var suppressed = 0;
    (names || []).forEach(function (name) {
      var p = C.findProduct(name, 'cigar');
      if (p && C.avoidIfTriggered(p, ctx)) {
        suppressed += 1;
        return;
      }
      if (p && ctx.journeyLevel === 'novice') {
        var safe = C.provenanceOf(p).beginnerSafe;
        if (safe && /^no$/i.test(String(safe).trim())) {
          suppressed += 1;
          return;
        }
      }
      if (
        p &&
        ctx &&
        ctx.highProofBourbon &&
        typeof C.highProofBourbonMaduroDelta === 'function' &&
        C.highProofBourbonMaduroDelta(p, ctx, null) <= -0.38
      ) {
        suppressed += 1;
        return;
      }
      if (p && ctx && ctx.morningSession && !ctx.boldAsk && !ctx.fullBodyAsk) {
        var spec = p.spec || {};
        var CSE = global.CigarSmokeEstimate;
        var mins =
          CSE && typeof CSE.estimateSmokeMinutes === 'function'
            ? CSE.estimateSmokeMinutes(p)
            : (function () {
                var m = String(spec.smokeTime || '').match(/(\d+)/);
                return m ? parseInt(m[1], 10) : null;
              })();
        var strength = spec.strength != null ? Number(spec.strength) : 5;
        var body = String(spec.body || '').toLowerCase();
        var morningBlob = [
          p.name,
          spec.wrapper,
          C.guidanceOf(p).flavorFamily,
          C.guidanceOf(p).wrapperRole,
          (p.tags || []).map(function (tag) { return tag && tag.id; }).join(' ')
        ].filter(Boolean).join(' ').toLowerCase();
        var morningFriendly =
          /\b(cafe|coffee|cream|creamy|connecticut|shade|cameroon|mild|smooth|nut|vanilla)\b/.test(
            morningBlob
          );
        if (
          strength >= 6 ||
          body === 'full' ||
          (body === 'medium-full' && !morningFriendly) ||
          (mins != null && mins > 75)
        ) {
          suppressed += 1;
          return;
        }
      }
      out.push(name);
    });
    C.lastDiagnostics.suppressedCount = suppressed;
    return out.length ? out : (names || []).slice(0, 3);
  }

  function rankCigarNames(names, ctx) {
    return (names || [])
      .slice()
      .sort(function (a, b) {
        return cigarContextScore(b, ctx) - cigarContextScore(a, ctx);
      });
  }

  global.OntologyCigarContext = {
    cigarContextScore: cigarContextScore,
    filterCigarNames: filterCigarNames,
    rankCigarNames: rankCigarNames
  };
})(typeof window !== 'undefined' ? window : global);
