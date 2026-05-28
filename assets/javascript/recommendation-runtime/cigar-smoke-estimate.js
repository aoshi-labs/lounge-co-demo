/**
 * CigarSmokeEstimate — session pacing from smokeTime, stickSize, or vitola hints.
 * Pure module; no DOM. Load before ontology-policy-core.js.
 */
(function (global) {
  'use strict';

  var FRACTION_MAP = {
    '⅛': 0.125,
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75
  };

  function parseSmokeMinutesFromSpec(smokeTime) {
    var m = String(smokeTime || '').match(/(\d+)\s*(?:–|-|to)\s*(\d+)/i);
    if (m) return (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2;
    var single = String(smokeTime || '').match(/(\d+)/);
    return single ? parseInt(single[1], 10) : null;
  }

  function parseLengthToken(tok) {
    var s = String(tok || '').trim();
    if (!s) return null;
    var m = s.match(/^(\d+)([⅛¼½¾])?$/);
    if (m) {
      var whole = parseInt(m[1], 10);
      var frac = m[2] ? FRACTION_MAP[m[2]] || 0 : 0;
      return whole + frac;
    }
    var dec = parseFloat(s.replace(',', '.'));
    return isNaN(dec) ? null : dec;
  }

  function parseStickDimensions(stickSize) {
    var raw = String(stickSize || '');
    var m = raw.match(/([\d.⅛¼½¾]+)\s*[×x]\s*(\d+)/i);
    if (!m) return null;
    var length = parseLengthToken(m[1]);
    var ring = parseInt(m[2], 10);
    if (length == null || isNaN(ring)) return null;
    return { length: length, ring: ring };
  }

  function minutesFromDimensions(length, ring) {
    var score = length * 12 + ring * 0.35;
    if (score < 72) return 45;
    if (score < 88) return 55;
    if (score < 100) return 65;
    return 85;
  }

  function minutesFromVitolaHint(text) {
    var t = String(text || '').toLowerCase();
    if (/\b(petit|petite|corona gorda|short)\b/.test(t)) return 40;
    if (/\b(robusto|corona)\b/.test(t) && !/\b(churchill|double corona|gordo|toro gordo)\b/.test(t)) {
      return 45;
    }
    if (/\b(toro|torpedo|belicoso)\b/.test(t)) return 60;
    if (/\b(churchill|double corona|presidente)\b/.test(t)) return 90;
    if (/\b(gordo|gigante|mega)\b/.test(t)) return 95;
    return null;
  }

  function getProductRef(product) {
    if (!product) return null;
    var PIDs = global.RecommendationProductIds;
    if (product.name && PIDs && typeof PIDs.getProductRef === 'function') {
      return PIDs.getProductRef('cigar', product.name) || product;
    }
    return product;
  }

  function estimateSmokeMinutes(product) {
    var p = getProductRef(product);
    if (!p) return null;
    var fromSpec = parseSmokeMinutesFromSpec(p.spec && p.spec.smokeTime);
    if (fromSpec != null) return fromSpec;

    var stick = p.stickSize || '';
    if (!stick && p.menuLine) {
      var lineMatch = String(p.menuLine).match(/·\s*([^·]+?)\s*·/);
      if (lineMatch) stick = lineMatch[1];
    }
    var dims = parseStickDimensions(stick);
    if (dims) return minutesFromDimensions(dims.length, dims.ring);

    var hint = minutesFromVitolaHint(stick + ' ' + (p.spec && p.spec.body ? p.spec.body : ''));
    if (hint != null) return hint;
    return null;
  }

  function normalizeText(t) {
    return String(t || '')
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resolveTargetSmokeMinutes(ctx) {
    if (!ctx) return null;
    if (ctx.targetSmokeMinutes != null) return ctx.targetSmokeMinutes;
    var text = normalizeText(ctx.promptText);
    if (ctx.quickSmoke || /\b(patio|quick smoke|under an hour)\b/.test(text)) return 45;
    if (/\b(morning|coffee|espresso)\b/.test(text)) return 50;
    if (/\b(golf|sunset|one glass|single pour)\b/.test(text)) return 58;
    if (ctx.afterDinner || /\b(after dinner|long conversation)\b/.test(text)) return 75;
    if (ctx.celebration || ctx.longSession) return 90;
    if (ctx.sessionRhythm === 'wontExhaust' || ctx.sessionRhythm === 'easyToSitWith') return 50;
    return 60;
  }

  function smokeMinutesFitPenalty(minutes, ctx) {
    var target = resolveTargetSmokeMinutes(ctx);
    if (minutes == null || target == null) return 0;
    var delta = Math.abs(minutes - target);
    if (delta <= 8) return 0;
    if (ctx.quickSmoke || target <= 50) {
      return Math.min(0.12, (delta - 8) * 0.008);
    }
    if (ctx.longSession || target >= 85) {
      if (minutes < target - 20) return Math.min(0.1, (target - 20 - minutes) * 0.006);
      return 0;
    }
    return Math.min(0.12, (delta - 12) * 0.006);
  }

  function smokeMinutesFitDelta(minutes, ctx) {
    var pen = smokeMinutesFitPenalty(minutes, ctx);
    return pen > 0 ? -pen : 0;
  }

  function formatSmokeTimeLine(minutes, ctx) {
    if (minutes == null) return '';
    var rounded = Math.round(minutes / 5) * 5;
    var target = resolveTargetSmokeMinutes(ctx);
    if (target != null && target <= 50) {
      return (
        'At around ' +
        rounded +
        ' minutes, it fits the pacing you asked for without becoming an all-night commitment.'
      );
    }
    if (target != null && target >= 75) {
      return 'Roughly ' + rounded + ' minutes — long enough for a slow evening beside the pour.';
    }
    return (
      'At around ' +
      rounded +
      ' minutes, it keeps the rhythm comfortable beside the glass without rushing the conversation.'
    );
  }

  global.CigarSmokeEstimate = {
    parseStickDimensions: parseStickDimensions,
    estimateSmokeMinutes: estimateSmokeMinutes,
    resolveTargetSmokeMinutes: resolveTargetSmokeMinutes,
    smokeMinutesFitPenalty: smokeMinutesFitPenalty,
    smokeMinutesFitDelta: smokeMinutesFitDelta,
    formatSmokeTimeLine: formatSmokeTimeLine,
    parseSmokeMinutesFromSpec: parseSmokeMinutesFromSpec
  };
})(typeof window !== 'undefined' ? window : global);
