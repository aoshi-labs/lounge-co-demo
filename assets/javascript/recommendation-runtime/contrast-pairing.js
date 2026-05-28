/**
 * ContrastPairing — controlled opposition, balance vectors, and pairing strategy selection.
 * Pure: LoungeProducts + SterlonSensory; no DOM.
 */
(function (global) {
  'use strict';

  var PAIRING_MODES = {
    complementary: {
      id: 'complementary',
      label: 'Complementary',
      description: 'Shared flavor families amplify; both stay on stage.'
    },
    contrast: {
      id: 'contrast',
      label: 'Contrast',
      description: 'Deliberate opposition surfaces hidden notes.'
    },
    balancing: {
      id: 'balancing',
      label: 'Balancing',
      description: 'One partner offsets excess in the other (sweet vs dry, rich vs bright).'
    },
    'palate-cleansing': {
      id: 'palate-cleansing',
      label: 'Palate cleansing',
      description: 'Spirit refreshes between puffs; reduces smoke heaviness.'
    },
    progression: {
      id: 'progression',
      label: 'Progression',
      description: 'Session arc moves lighter → richer or sweet → dry.'
    },
    tension: {
      id: 'tension',
      label: 'Controlled tension',
      description: 'Dynamic, conversation-worthy — not chaotic.'
    }
  };

  var STRATEGY_WEIGHTS = {
    complementary: { harmony: 0.82, contrast: 0.18, wildcardContrast: 0.25 },
    contrast: { harmony: 0.32, contrast: 0.68, wildcardContrast: 0.85 },
    balanced: { harmony: 0.52, contrast: 0.48, wildcardContrast: 0.55 },
    adventurous: { harmony: 0.38, contrast: 0.62, wildcardContrast: 0.9 },
    classic_lounge: { harmony: 0.74, contrast: 0.26, wildcardContrast: 0.4 },
    educational: { harmony: 0.48, contrast: 0.52, wildcardContrast: 0.6 }
  };

  var OPPOSITION_RULES = [
    {
      id: 'sweet-dry',
      modes: ['contrast', 'balancing'],
      dim: 'sweetness',
      idealDelta: [2, 5],
      weight: 0.14,
      explain: function (cigar, spirit, delta) {
        var pour = spirit || 'the pour';
        var smoke = cigar || 'the smoke';
        return (
          'The ' +
          (delta > 0 ? 'drier ' + pour : 'sweeter ' + pour) +
          ' keeps ' +
          smoke +
          ' from turning one-note on the finish.'
        );
      }
    },
    {
      id: 'spice-balance',
      modes: ['contrast', 'tension', 'balancing'],
      dim: 'pepper',
      idealDelta: [2, 4],
      weight: 0.12,
      explain: function (cigar, spirit) {
        var cp = sensoryDim(cigar, 'pepper') || 0;
        var sp = sensoryDim(spirit, 'pepper') || 0;
        if (cp >= sp + 2) {
          return 'Spice in the smoke wakes ' + (spirit || 'the pour') + ' without the glass needing to shout.';
        }
        if (sp >= cp + 2) {
          return 'Pepper lift in ' + (spirit || 'the glass') + ' keeps ' + (cigar || 'the smoke') + ' from sitting flat.';
        }
        return 'Pepper threads between ' + (cigar || 'smoke') + ' and ' + (spirit || 'glass') + ' without stacking heat.';
      }
    },
    {
      id: 'richness-cut',
      modes: ['contrast', 'palate-cleansing'],
      bodyDelta: [2, 4],
      weight: 0.16,
      tagSpirit: ['citrus', 'agave', 'fresh'],
      explain: function () {
        return 'A brighter, lighter pour cuts through cocoa richness in the smoke.';
      }
    },
    {
      id: 'cream-spice',
      modes: ['contrast', 'tension'],
      tagCigar: ['cream', 'vanilla', 'caramel'],
      tagSpirit: ['pepper', 'spice', 'rye'],
      weight: 0.1,
      explain: function () {
        return 'Creamy wrapper sweetness meets spice lift in the glass — tension on purpose.';
      }
    },
    {
      id: 'smoke-refresh',
      modes: ['palate-cleansing', 'contrast'],
      tagCigar: ['smoke', 'peat', 'earth'],
      tagSpirit: ['citrus', 'agave', 'apple', 'fresh'],
      weight: 0.11,
      explain: function () {
        return 'Herbal or citrus brightness resets the palate between heavy smoke puffs.';
      }
    }
  ];

  var CONTRAST_PROMPT =
    /\b(surprise|unexpected|challenge me|less obvious|more interesting|something different|not obvious|contrasting|more contrast|cut through|palate cleanse|refresh|brighten)\b/i;
  var SAFE_PROMPT =
    /\b(safe|classic|traditional|harmon|easy pour|beginner|smooth|mild|gentle)\b/i;
  var CONTRAST_EXPLICIT = /\b(contrast|tension|offset|balance the|cuts through)\b/i;

  function lp() {
    return global.LoungeProducts || null;
  }

  function findProduct(name, category) {
    var PIDs = global.RecommendationProductIds;
    return PIDs && typeof PIDs.getProductRef === 'function'
      ? PIDs.getProductRef(category, name)
      : null;
  }

  function sensoryDim(name, dim) {
    var SS = global.SterlonSensory;
    return SS && SS.getSensoryDimension ? SS.getSensoryDimension(name, dim) : null;
  }

  function flavorTags(name) {
    var SS = global.SterlonSensory;
    return SS && SS.getFlavorNotes ? SS.getFlavorNotes(name) : [];
  }

  function hasTag(tags, ids) {
    var set = {};
    (tags || []).forEach(function (t) {
      set[t] = true;
    });
    for (var i = 0; i < (ids || []).length; i++) {
      if (set[ids[i]]) return true;
    }
    return false;
  }

  function bodyDelta(cigarName, spiritName) {
    var cb = sensoryDim(cigarName, 'body');
    var sb = sensoryDim(spiritName, 'body');
    if (cb == null || sb == null) return 0;
    return Math.abs(cb - sb);
  }

  function inferStrategy(promptText, ctx) {
    var o = ctx || {};
    var t = String(promptText || '').toLowerCase();
    var jl = o.journeyLevel || o.sessionRuntime && o.sessionRuntime.latchedJourneyLevel || 'advanced';
    var sessionStrategy = o.sessionRuntime && o.sessionRuntime.pairingStrategy;
    if (sessionStrategy && STRATEGY_WEIGHTS[sessionStrategy]) {
      return {
        strategy: sessionStrategy,
        confidence: 0.85,
        source: 'session'
      };
    }
    if (o.pairingStrategy && STRATEGY_WEIGHTS[o.pairingStrategy]) {
      return { strategy: o.pairingStrategy, confidence: 0.9, source: 'explicit' };
    }
    if (CONTRAST_EXPLICIT.test(t)) {
      return { strategy: jl === 'novice' ? 'balanced' : 'contrast', confidence: 0.88, source: 'prompt' };
    }
    if (CONTRAST_PROMPT.test(t)) {
      return {
        strategy: jl === 'novice' ? 'balanced' : 'adventurous',
        confidence: 0.82,
        source: 'prompt'
      };
    }
    if (SAFE_PROMPT.test(t) || jl === 'novice') {
      return { strategy: 'complementary', confidence: 0.86, source: 'prompt' };
    }
    if (/\b(luxury|celebration|classic lounge)\b/i.test(t)) {
      return { strategy: 'classic_lounge', confidence: 0.8, source: 'prompt' };
    }
    if (/\b(learn|explain|why|teach|education)\b/i.test(t)) {
      return { strategy: 'educational', confidence: 0.75, source: 'prompt' };
    }
    return { strategy: 'balanced', confidence: 0.7, source: 'default' };
  }

  function beginnerSafety(cigarName, spiritName) {
    var risks = [];
    var cigarTags = flavorTags(cigarName);
    var spiritTags = flavorTags(spiritName);
    var cPep = sensoryDim(cigarName, 'pepper') || 0;
    var sPep = sensoryDim(spiritName, 'pepper') || 0;
    var cSweet = sensoryDim(cigarName, 'sweetness') || 5;
    var sSweet = sensoryDim(spiritName, 'sweetness') || 5;
    var strC =
      (findProduct(cigarName, 'cigar') || {}).spec &&
      (findProduct(cigarName, 'cigar').spec.strength != null)
        ? Number(findProduct(cigarName, 'cigar').spec.strength)
        : 5;

    if (cPep >= 7 && sPep >= 7) risks.push('pepper-overload');
    if (cSweet <= 3 && sSweet <= 3 && cPep >= 6) risks.push('dry-bitter-stack');
    if (strC >= 8 && sPep >= 7 && /lagavulin|laphroaig|ardbeg/i.test(spiritName)) {
      risks.push('nicotine-peat-stack');
    }
    if (/macanudo|connecticut|hyde/i.test(cigarName) && /lagavulin|laphroaig/i.test(spiritName)) {
      risks.push('delicate-peat-bury');
    }

    var blocked = risks.indexOf('delicate-peat-bury') !== -1 || risks.indexOf('pepper-overload') !== -1;
    return {
      ok: !blocked,
      risks: risks,
      beginnerPenalty: risks.length ? Math.min(0.45, risks.length * 0.15) : 0
    };
  }

  function analyzePair(cigarName, spiritName, opts) {
    var o = opts || {};
    var cigarTags = flavorTags(cigarName);
    var spiritTags = flavorTags(spiritName);
    var bDelta = bodyDelta(cigarName, spiritName);
    var hits = [];
    var tensionSum = 0;
    var refresh = 0;

    OPPOSITION_RULES.forEach(function (rule) {
      var score = 0;
      if (rule.dim) {
        var cv = sensoryDim(cigarName, rule.dim);
        var sv = sensoryDim(spiritName, rule.dim);
        if (cv != null && sv != null) {
          var d = Math.abs(cv - sv);
          if (d >= rule.idealDelta[0] && d <= rule.idealDelta[1]) {
            score = rule.weight * (1 - Math.abs(d - (rule.idealDelta[0] + rule.idealDelta[1]) / 2) / 3);
            hits.push({ id: rule.id, delta: d, modes: rule.modes });
          }
        }
      }
      if (rule.bodyDelta && bDelta >= rule.bodyDelta[0] && bDelta <= rule.bodyDelta[1]) {
        if (!rule.tagSpirit || hasTag(spiritTags, rule.tagSpirit)) {
          score = Math.max(score, rule.weight);
          hits.push({ id: rule.id, bodyDelta: bDelta, modes: rule.modes });
        }
      }
      if (rule.tagCigar && rule.tagSpirit && hasTag(cigarTags, rule.tagCigar) && hasTag(spiritTags, rule.tagSpirit)) {
        score = Math.max(score, rule.weight);
        hits.push({ id: rule.id, modes: rule.modes });
      }
      if (rule.tagSpirit && !rule.tagCigar && hasTag(spiritTags, rule.tagSpirit)) {
        score = Math.max(score, rule.weight * 0.75);
        if (rule.id === 'smoke-refresh') refresh = Math.max(refresh, 0.7);
      }
      tensionSum += score;
    });

    var SS = global.SterlonSensory;
    var bridges = SS && SS.scorePairing ? (SS.scorePairing(cigarName, spiritName).bridges || []) : [];
    var controlledTension = Math.min(1, tensionSum + (bridges.length >= 1 && bDelta >= 2 ? 0.12 : 0));
    if (bridges.length >= 1 && bDelta >= 2 && bDelta <= 4) {
      controlledTension = Math.max(controlledTension, 0.38);
    }
    if (bDelta > 4 && bridges.length < 1) controlledTension *= 0.55;

    var PI = global.PairingIconic;
    if (PI && typeof PI.contrastTensionBump === 'function') {
      controlledTension = Math.min(1, controlledTension + PI.contrastTensionBump(cigarName, spiritName));
    }

    var safety = beginnerSafety(cigarName, spiritName);
    var primaryMode = hits.length ? hits[0].modes[0] : controlledTension >= 0.45 ? 'contrast' : 'complementary';

    return {
      pairingMode: primaryMode,
      controlledTension: Math.round(controlledTension * 1000) / 1000,
      palateRefresh: refresh,
      bodyDelta: bDelta,
      oppositionHits: hits,
      bridgeCount: bridges.length,
      confidence: Math.min(1, 0.45 + controlledTension * 0.4 + bridges.length * 0.08),
      balanceRisk: bDelta > 4 && bridges.length === 0 ? 0.7 : controlledTension > 0.65 ? 0.35 : 0.15,
      beginnerSuitable: safety.ok && controlledTension < 0.72,
      advancedSuitable: controlledTension >= 0.35,
      beginnerSafety: safety,
      explainLine: pickExplainLine(cigarName, spiritName, hits)
    };
  }

  function pickExplainLine(cigarName, spiritName, hits) {
    if (!hits.length) return '';
    var rule = OPPOSITION_RULES.filter(function (r) {
      return r.id === hits[0].id;
    })[0];
    if (!rule || !rule.explain) return '';
    var delta =
      hits[0].delta != null
        ? hits[0].delta
        : hits[0].bodyDelta != null
          ? hits[0].bodyDelta
          : 0;
    return rule.explain(cigarName, spiritName, delta);
  }

  function resolveCigarSpirit(anchorName, candidateName) {
    if (findProduct(anchorName, 'spirit')) {
      return { cigar: candidateName, spirit: anchorName };
    }
    return { cigar: anchorName, spirit: candidateName };
  }

  function blendPairingScore(anchorName, candidateName, sensoryResult, opts) {
    var o = opts || {};
    var strat = inferStrategy(o.promptText, o);
    var strategy = o.strategy || strat.strategy;
    var weights = STRATEGY_WEIGHTS[strategy] || STRATEGY_WEIGHTS.balanced;
    var raw = (sensoryResult && sensoryResult.score) || 0;
    var harmony = raw <= 1 ? raw : Math.min(1, raw / 100);
    var pair = resolveCigarSpirit(anchorName, candidateName);
    var analysis = analyzePair(pair.cigar, pair.spirit, o);

    var contrast = analysis.controlledTension;
    var composite = harmony * weights.harmony + contrast * weights.contrast;
    if (o.slotRole === 'wildcard') {
      composite = harmony * (1 - weights.wildcardContrast) + contrast * weights.wildcardContrast;
    }
    if (o.journeyLevel === 'novice' || strat.strategy === 'complementary') {
      composite -= analysis.beginnerSafety.beginnerPenalty;
      if (!analysis.beginnerSuitable) composite *= 0.72;
    }
    composite = Math.max(0, Math.min(1, composite));

    return {
      compositeScore: composite,
      harmonyScore: harmony,
      contrastScore: contrast,
      pairingStrategy: strategy,
      pairingMode: analysis.pairingMode,
      analysis: analysis,
      strategyMeta: strat
    };
  }

  function buildContrastWhyLine(cigarName, spiritName, analysis) {
    var a = analysis || analyzePair(cigarName, spiritName);
    if (a.explainLine) return a.explainLine;
    if (a.controlledTension >= 0.5 && a.bodyDelta >= 2) {
      return 'Controlled contrast — different body registers keep the flight dynamic without chaos.';
    }
    return '';
  }

  function buildRecoContextPatch(promptText, ctx) {
    var strat = inferStrategy(promptText, ctx);
    return { pairingStrategy: strat.strategy, pairingStrategyConfidence: strat.confidence };
  }

  function recordStyleDiagnostics(snap, analysis, strategy) {
    if (!snap || !snap.styleDistribution) return;
    var key = strategy || 'balanced';
    snap.styleDistribution[key] = (snap.styleDistribution[key] || 0) + 1;
    if (analysis && analysis.controlledTension >= 0.5) {
      snap.contrastTurns = (snap.contrastTurns || 0) + 1;
    }
  }

  function isBoldPairAllowed(cigarName, spiritName, strategy) {
    var PI = global.PairingIconic;
    if (PI && typeof PI.isBoldPairAllowed === 'function') {
      return PI.isBoldPairAllowed(cigarName, spiritName, strategy);
    }
    return false;
  }

  global.ContrastPairing = {
    PAIRING_MODES: PAIRING_MODES,
    STRATEGY_WEIGHTS: STRATEGY_WEIGHTS,
    inferStrategy: inferStrategy,
    analyzePair: analyzePair,
    blendPairingScore: blendPairingScore,
    beginnerSafety: beginnerSafety,
    isBoldPairAllowed: isBoldPairAllowed,
    buildContrastWhyLine: buildContrastWhyLine,
    buildRecoContextPatch: buildRecoContextPatch,
    recordStyleDiagnostics: recordStyleDiagnostics
  };
})(typeof window !== 'undefined' ? window : global);
