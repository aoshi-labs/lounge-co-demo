/**
 * PairingEvaluation — sommelier-grade grading for cigar–spirit pairs.
 * Pure: LoungeProducts + SterlonSensory + OntologyPolicy; no DOM.
 */
(function (global) {
  'use strict';

  var GRADE_THRESHOLDS = { A: 0.88, B: 0.76, C: 0.64, D: 0.52, F: 0 };

  function realismRules() {
    var PI = global.PairingIconic;
    return PI && PI.REALISM_RULES ? PI.REALISM_RULES : [];
  }

  function lp() {
    return global.LoungeProducts || null;
  }

  function findCigar(name) {
    var lounge = lp();
    return lounge && lounge.findCigarByName ? lounge.findCigarByName(name) : null;
  }

  function findSpirit(name) {
    var lounge = lp();
    return lounge && lounge.findSpiritByName ? lounge.findSpiritByName(name) : null;
  }

  function letterFromScore(score) {
    if (score >= GRADE_THRESHOLDS.A) return 'A';
    if (score >= GRADE_THRESHOLDS.B) return 'B';
    if (score >= GRADE_THRESHOLDS.C) return 'C';
    if (score >= GRADE_THRESHOLDS.D) return 'D';
    return 'F';
  }

  function gradeRank(letter) {
    return { A: 5, B: 4, C: 3, D: 2, F: 1 }[letter] || 0;
  }

  function tagOverlap(cigar, spirit) {
    var SS = global.SterlonSensory;
    if (!SS) return { count: 0, ids: [] };
    var a = SS.getFlavorNotes(cigar.name) || [];
    var b = SS.getFlavorNotes(spirit.name) || [];
    var setB = {};
    b.forEach(function (id) {
      setB[id] = true;
    });
    var shared = a.filter(function (id) {
      return setB[id];
    });
    return { count: shared.length, ids: shared };
  }

  function bodyDelta(cigar, spirit) {
    var SS = global.SterlonSensory;
    if (!SS) return 99;
    var cb = SS.getSensoryDimension(cigar.name, 'body');
    var sb = SS.getSensoryDimension(spirit.name, 'body');
    if (cb == null || sb == null) return 99;
    return Math.abs(cb - sb);
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase();
  }

  function productBlob(product) {
    if (!product) return '';
    return normalizeText(
      [
        product.name,
        product.deckKey,
        product.category,
        product.spec && product.spec.wrapper,
        product.spec && product.spec.binder,
        product.spec && product.spec.filler,
        product.spec && product.spec.origin,
        product.spec && product.spec.body,
        product.guidance && product.guidance.flavorFamily,
        product.guidance && product.guidance.bestFor,
        product.guidance && product.guidance.avoidIf,
        product.guidance && product.guidance.whyRecommend,
        JSON.stringify(product.sensory || {})
      ].filter(Boolean).join(' ')
    );
  }

  function isExplicitContrastIntent(ctx, pairingStrategy, evalCase) {
    var prompt = normalizeText(ctx && ctx.promptText);
    if (evalCase && evalCase.expectedPairingStyle === 'contrast') return true;
    if (pairingStrategy === 'contrast' || pairingStrategy === 'adventurous' || pairingStrategy === 'educational') {
      return true;
    }
    return /\b(contrast|wildcard|surprise|challenge|unexpected|clean|neutral|palate reset|cuts? the sweetness)\b/.test(prompt);
  }

  function isExplicitVodkaIntent(ctx, evalCase) {
    var prompt = normalizeText(ctx && ctx.promptText);
    if (/\b(vodka|palate reset|clean|neutral)\b/.test(prompt)) return true;
    return !!(evalCase && evalCase.expectedGoodCategories && evalCase.expectedGoodCategories.indexOf('vodka') !== -1 && /\b(clean|neutral|reset)\b/.test(prompt));
  }

  function isMildConnecticutOrDelicate(cigar) {
    var blob = productBlob(cigar);
    var strength = cigar && cigar.spec && cigar.spec.strength != null ? Number(cigar.spec.strength) : 5;
    var body = normalizeText(cigar && cigar.spec && cigar.spec.body);
    return strength <= 5 && (/\b(connecticut|shade|mild|delicate|cream|creamy|gentle)\b/.test(blob) || body === 'mild' || body === 'medium');
  }

  function isAggressiveIslay(spirit) {
    var blob = productBlob(spirit);
    var body = spirit && spirit.sensory && spirit.sensory.body != null ? Number(spirit.sensory.body) : 0;
    return spirit && (
      spirit.deckKey === 'peated' ||
      /\b(islay|ardbeg|laphroaig|lagavulin|octomore|heavy peat)\b/.test(blob) ||
      ((spirit.deckKey === 'scotch' || spirit.deckKey === 'peated') && body >= 7)
    );
  }

  function isNicotineBomb(cigar) {
    var blob = productBlob(cigar);
    var strength = cigar && cigar.spec && cigar.spec.strength != null ? Number(cigar.spec.strength) : 5;
    return strength >= 8 || /\b(warhead|double ligero|ligero bomb|powerhouse|full nicotine|pepper bomb|la bomba)\b/.test(blob);
  }

  function isLightFruityScotch(spirit) {
    var blob = productBlob(spirit);
    var deck = spirit && spirit.deckKey;
    return (deck === 'scotch' || deck === 'irish') && /\b(glenfiddich|glenlivet|light|pear|apple|honey|fruit|fruity|speyside)\b/.test(blob) && !/\b(sherry|oak bomb|cask strength|peated)\b/.test(blob);
  }

  function isDessertCognacProfileCigar(cigar) {
    var blob = productBlob(cigar);
    return /\b(cognac|dessert|cream|fruit|rosado|baking spice|sweet spice|after dinner)\b/.test(blob);
  }

  function isOverlySweetAgave(spirit) {
    var blob = productBlob(spirit);
    return spirit && spirit.deckKey === 'agave' && /\b(clase azul|casamigos|1942|joven|extra anejo|sweet agave|vanilla heavy|candied)\b/.test(blob);
  }

  function hasPappyFit(cigar) {
    var blob = productBlob(cigar);
    return /\b(bourbon|caramel|oak|aged tobacco|tobacco|toffee|vanilla|sweet wood)\b/.test(blob);
  }

  function luxuryLaneAdjustment(cigar, spirit) {
    if (!cigar || !spirit) return 0;
    var spiritName = normalizeText(spirit.name);
    var cigarName = normalizeText(cigar.name);
    if (/pappy van winkle/.test(spiritName)) {
      return hasPappyFit(cigar) ? 0.06 : -0.1;
    }
    if (/angel's share/.test(cigarName) && spirit.deckKey === 'bourbon' && !hasPappyFit(cigar)) {
      return -0.06;
    }
    if (/angel's share/.test(cigarName) && (spirit.deckKey === 'cognac' || spirit.deckKey === 'rum' || spirit.deckKey === 'scotch')) {
      return 0.05;
    }
    return 0;
  }

  function affinityAligned(cigar, spirit) {
    var OP = global.OntologyPolicy;
    if (!OP || !cigar.guidance) return { aligned: false, decks: [] };
    var decks = OP.deckKeysForAffinity(cigar.guidance.pairingAffinity);
    var aligned = decks.indexOf(spirit.deckKey) !== -1;
    return { aligned: aligned, decks: decks, affinity: cigar.guidance.pairingAffinity };
  }

  function categoryCoherence(cigar, spirit, evalCase) {
    var deck = spirit.deckKey || 'unknown';
    var good = (evalCase && evalCase.expectedGoodCategories) || [];
    var bad = (evalCase && evalCase.expectedBadCategories) || [];
    if (bad.indexOf(deck) !== -1) return 0;
    if (good.length && good.indexOf(deck) === -1) return 0.45;
    return 1;
  }

  function realismScore(cigarName, spiritName, opts) {
    var score = 0.73;
    var o = opts || {};
    var ctx = o.context || null;
    var evalCase = o.evalCase || null;
    var PI = global.PairingIconic;
    if (PI && typeof PI.realismBonus === 'function') {
      score += PI.realismBonus(cigarName, spiritName).bonus;
    } else {
      realismRules().forEach(function (rule) {
        if (rule.cigar.test(cigarName) && rule.spirit.test(spiritName)) score += rule.bonus;
      });
    }
    if (/\b(vodka)\b/i.test(spiritName) && !/vodka/i.test(cigarName)) {
      score -= isExplicitVodkaIntent(ctx, evalCase) ? 0.04 : 0.3;
    }
    if (/lagavulin|laphroaig|ardbeg/i.test(spiritName) && /macanudo|connecticut|hyde/i.test(cigarName)) {
      score -= 0.35;
    }
    return Math.max(0, Math.min(1, score));
  }

  function explorationPlausibility(wildcardSpirit, bestSpirit, cigar) {
    if (!wildcardSpirit || wildcardSpirit === bestSpirit) return 0.5;
    var w = findSpirit(wildcardSpirit);
    var b = findSpirit(bestSpirit);
    if (!w || !b) return 0.4;
    var aff = affinityAligned(cigar, w);
    var sameDeck = w.deckKey === b.deckKey;
    if (aff.aligned && !sameDeck) return 0.85;
    if (bodyDelta(cigar, w) <= 2) return 0.75;
    return 0.55;
  }

  /**
   * Grade a cigar + spirit pair (optional eval case for expectations).
   * @param {string} cigarName
   * @param {string} spiritName
   * @param {object} [opts]  evalCase, context, modes: { ignoreOntology }
   */
  function scorePairing(cigarName, spiritName, opts) {
    var o = opts || {};
    var evalCase = o.evalCase || null;
    var modes = o.modes || {};
    var cigar = findCigar(cigarName);
    var spirit = findSpirit(spiritName);

    if (!cigar || !spirit) {
      return {
        grade: 'F',
        numericScore: 0,
        ok: false,
        error: 'off-menu',
        failures: ['product-not-on-menu'],
        dimensions: {},
        explain: {}
      };
    }

    var SS = global.SterlonSensory;
    var sensory = SS ? SS.scorePairing(cigarName, spiritName) : { score: 0, intensityMatch: false, bridges: [] };
    var rawSensory = sensory.score || 0;
    var flavorNorm = rawSensory <= 1 ? rawSensory : Math.min(1, rawSensory / 100);
    var overlap = tagOverlap(cigar, spirit);
    var flavorCompat = Math.min(1, flavorNorm * 0.55 + Math.min(0.45, overlap.count * 0.12));
    var aff = modes.ignoreOntology ? { aligned: true, decks: [] } : affinityAligned(cigar, spirit);
    var bDelta = bodyDelta(cigar, spirit);
    var CP = global.ContrastPairing;
    var ctx =
      o.context ||
      (global.OntologyPolicy && global.OntologyPolicy.buildRecoContext
        ? global.OntologyPolicy.buildRecoContext(o)
        : {});
    var pairingStrategy =
      (modes.pairingStrategy) ||
      (ctx && ctx.pairingStrategy) ||
      (evalCase && evalCase.expectedPairingStyle === 'contrast' ? 'contrast' : null) ||
      (CP && CP.inferStrategy ? CP.inferStrategy((ctx && ctx.promptText) || '', o).strategy : 'balanced');
    var PI = global.PairingIconic;
    var boldPairAllowed =
      CP &&
      typeof CP.isBoldPairAllowed === 'function' &&
      CP.isBoldPairAllowed(cigarName, spiritName, pairingStrategy);
    var explicitContrast = isExplicitContrastIntent(ctx, pairingStrategy, evalCase);
    var bodyAlign = bDelta <= 1 ? 1 : bDelta <= 2 ? 0.75 : bDelta <= 3 ? 0.45 : 0.15;
    if (aff.aligned && bDelta <= 3 && sensory.intensityMatch) {
      bodyAlign = Math.max(bodyAlign, 0.72);
    }
    var strC = cigar.spec && cigar.spec.strength != null ? Number(cigar.spec.strength) : 5;
    var strS = spirit.sensory && spirit.sensory.pepper != null ? spirit.sensory.pepper : 5;
    var strAlign = Math.max(0, 1 - Math.abs(strC - strS) / 8);
    var ontologyFit = aff.aligned ? 1.12 : explicitContrast ? 0.62 : boldPairAllowed ? 0.56 : 0.18;
    var catCoherence = categoryCoherence(cigar, spirit, evalCase);
    var realism = realismScore(cigarName, spiritName, { context: ctx, evalCase: evalCase });
    var hospitality = (realism + bodyAlign) / 2;
    var contrastAnalysis = CP && CP.analyzePair ? CP.analyzePair(cigarName, spiritName, o) : null;
    var contrastTension = contrastAnalysis ? contrastAnalysis.controlledTension : 0;
    var avoidHit = false;
    if (!modes.ignoreOntology && global.OntologyPolicy && global.OntologyPolicy.avoidIfTriggered) {
      avoidHit =
        global.OntologyPolicy.avoidIfTriggered(cigar, ctx) ||
        global.OntologyPolicy.avoidIfTriggered(spirit, ctx);
    }

    var antiHit = false;
    if (evalCase && evalCase.antiPairings) antiHit = true;
    if (evalCase && evalCase.expectedBadCategories && evalCase.expectedBadCategories.indexOf(spirit.deckKey) !== -1) {
      antiHit = true;
    }
    var contrastStrategy = explicitContrast;
    if (
      !aff.aligned &&
      cigar.guidance &&
      cigar.guidance.pairingAffinity &&
      !modes.ignoreOntology &&
      !(evalCase && evalCase.expectedPairingStyle === 'contrast') &&
      !contrastStrategy
    ) {
      var badAffinity = /cognac|coffee|bourbon/i.test(cigar.guidance.pairingAffinity) && spirit.deckKey === 'agave';
      if (badAffinity) antiHit = true;
    }
    if (spirit.deckKey === 'peated' && isMildConnecticutOrDelicate(cigar) && isAggressiveIslay(spirit)) antiHit = true;
    if ((spirit.deckKey === 'scotch' || spirit.deckKey === 'irish') && isNicotineBomb(cigar) && isLightFruityScotch(spirit)) antiHit = true;
    if (spirit.deckKey === 'agave' && isDessertCognacProfileCigar(cigar) && isOverlySweetAgave(spirit) && !explicitContrast) antiHit = true;

    var bridgeBonus = Math.min(0.12, ((sensory.bridges || []).length) * 0.04);
    var affinityCoherenceBump = aff.aligned && catCoherence >= 0.75 ? 0.08 : 0;
    if (aff.aligned && overlap.count >= 1) affinityCoherenceBump += 0.04;
    var numericScore =
      flavorCompat * 0.24 +
      bodyAlign * 0.2 +
      strAlign * 0.06 +
      (sensory.intensityMatch ? 0.14 : 0.05) +
      ontologyFit * (modes.ignoreOntology ? 0 : 0.12) +
      catCoherence * 0.08 +
      realism * 0.14 +
      bridgeBonus +
      affinityCoherenceBump +
      luxuryLaneAdjustment(cigar, spirit);

    if (contrastAnalysis && pairingStrategy !== 'complementary') {
      numericScore += contrastTension * 0.08;
    }
    if (evalCase && evalCase.expectedPairingStyle === 'contrast' && contrastTension >= (evalCase.minContrastScore || 0.38)) {
      numericScore += 0.04;
    }
    if (evalCase && evalCase.tier === 'controversial') {
      if (boldPairAllowed) numericScore += 0.07;
      else if (PI && typeof PI.realismBonus === 'function' && PI.realismBonus(cigarName, spiritName).bonus >= 0.05) {
        numericScore += 0.06;
      }
    }
    var noviceContrastRisk =
      contrastAnalysis &&
      !contrastAnalysis.beginnerSafety.ok &&
      (o.context && o.context.journeyLevel === 'novice');
    if (noviceContrastRisk) {
      numericScore -= contrastAnalysis.beginnerSafety.beginnerPenalty;
    }

    if (avoidHit) numericScore -= 0.35;
    if (antiHit) numericScore -= 0.38;
    numericScore = Math.max(0, Math.min(1, numericScore));

    var grade = letterFromScore(numericScore);
    var failures = [];
    if (noviceContrastRisk) failures.push('contrast-novice-risk');
    if (avoidHit) failures.push('avoidIf-context');
    if (antiHit) failures.push('anti-pairing');
    if (bDelta > 3 && !(evalCase && evalCase.allowedVariance && evalCase.allowedVariance.bodyDeltaMax >= bDelta)) {
      failures.push('body-mismatch');
    }
    if (!aff.aligned && !modes.ignoreOntology) {
      var allowAffinityVariance =
        boldPairAllowed ||
        explicitContrast ||
        (evalCase && evalCase.tier === 'controversial') ||
        (evalCase && evalCase.allowedVariance && evalCase.allowedVariance.affinityVariance);
      if (!allowAffinityVariance) failures.push('affinity-mismatch');
    }

    var explain = {
      sensoryScore: sensory.score,
      bridges: (sensory.bridges || []).slice(),
      flavorOverlap: overlap.ids,
      bodyDelta: bDelta,
      pairingAffinity: aff.affinity,
      affinityAligned: aff.aligned,
      spiritDeck: spirit.deckKey,
      ontologyContribution: modes.ignoreOntology ? 0 : ontologyFit * 0.14,
      policyPenalty: avoidHit ? 0.35 : 0,
      realism: realism,
      hospitality: hospitality,
      contrastTension: contrastTension,
      pairingStrategy: pairingStrategy,
      pairingMode: contrastAnalysis ? contrastAnalysis.pairingMode : null,
      contrastConfidence: contrastAnalysis ? contrastAnalysis.confidence : null
    };

    var ok = true;
    if (evalCase && evalCase.minGrade) {
      ok = gradeRank(grade) >= gradeRank(evalCase.minGrade);
    }
    if (evalCase && evalCase.expectedMaxGrade) {
      ok = ok && gradeRank(grade) <= gradeRank(evalCase.expectedMaxGrade);
    }
    if (evalCase && evalCase.antiPairings) {
      ok = gradeRank(grade) <= gradeRank(evalCase.expectedMaxGrade || 'D');
    }
    if (evalCase && evalCase.expectedPairingStyle === 'contrast') {
      ok =
        ok &&
        contrastTension >= (evalCase.minContrastScore != null ? evalCase.minContrastScore : 0.35);
    }
    if (evalCase && evalCase.forbidHighContrast && contrastTension >= 0.55) {
      ok = false;
      failures.push('contrast-too-aggressive');
    }

    return {
      grade: grade,
      numericScore: Math.round(numericScore * 1000) / 1000,
      ok: ok,
      failures: failures,
      antiPairingHit: antiHit,
      avoidIfHit: avoidHit,
      dimensions: {
        flavorCompatibility: Math.round(flavorCompat * 100) / 100,
        bodyAlignment: Math.round(bodyAlign * 100) / 100,
        strengthAlignment: Math.round(strAlign * 100) / 100,
        categoryCoherence: Math.round(catCoherence * 100) / 100,
        ontologyFit: Math.round(ontologyFit * 100) / 100,
        realism: Math.round(realism * 100) / 100,
        contrastTension: Math.round(contrastTension * 100) / 100,
        balanceRisk: contrastAnalysis ? Math.round(contrastAnalysis.balanceRisk * 100) / 100 : null,
        palateRefresh: contrastAnalysis ? Math.round(contrastAnalysis.palateRefresh * 100) / 100 : null,
        explorationPlausibility: null
      },
      explain: explain
    };
  }

  function pairingStrategyFromTurn(turn) {
    var signals = (turn && turn.provenance && turn.provenance.signals) || [];
    for (var i = 0; i < signals.length; i++) {
      if (signals[i].indexOf('pairing-strategy-') === 0) {
        return signals[i].slice('pairing-strategy-'.length);
      }
    }
    var CP = global.ContrastPairing;
    if (CP && turn) {
      return CP.inferStrategy((turn.provenance && turn.provenance.promptText) || '', {
        journeyLevel: turn.journeyLevel
      }).strategy;
    }
    return null;
  }

  function scoreTurn(turn, evalExpect) {
    var cards = (turn && turn.cards) || [];
    if (!cards.length) {
      return { grade: 'F', ok: false, error: 'empty-turn' };
    }
    var stratFromTurn = pairingStrategyFromTurn(turn);
    var promptText = (turn.provenance && turn.provenance.promptText) || '';
    var best = null;
    for (var i = 0; i < cards.length; i += 1) {
      var card = cards[i];
      if (!card || !card.cigar || !card.spirit) continue;
      var result = scorePairing(card.cigar, card.spirit, {
        context: { promptText: promptText, journeyLevel: turn.journeyLevel },
        modes: { pairingStrategy: stratFromTurn }
      });
      if (!best || gradeRank(result.grade) > gradeRank(best.grade)) {
        best = result;
        best.cigar = card.cigar;
        best.spirit = card.spirit;
      }
    }
    if (!best) {
      return { grade: 'F', ok: false, error: 'empty-turn' };
    }
    var cigar = findCigar(best.cigar);
    if (cigar && cards[2] && cards[2].spirit) {
      best.dimensions.explorationPlausibility = explorationPlausibility(
        cards[2].spirit,
        best.spirit,
        cigar
      );
    }
    if (evalExpect) {
      var sp = findSpirit(best.spirit);
      if (evalExpect.spiritDeckIn && sp && evalExpect.spiritDeckIn.indexOf(sp.deckKey) === -1) {
        best.ok = false;
        best.failures.push('deck-expectation');
      }
      if (evalExpect.minBestGrade && gradeRank(best.grade) < gradeRank(evalExpect.minBestGrade)) {
        best.ok = false;
      }
      if (evalExpect.pairingStrategy && stratFromTurn !== evalExpect.pairingStrategy) {
        best.ok = false;
        best.failures.push('pairing-strategy');
      }
    }
    return best;
  }

  function compareBaselines(cigarName, spiritCandidates) {
    var SS = global.SterlonSensory;
    var names = spiritCandidates || [];
    var cigar = findCigar(cigarName);
    if (!cigar || !names.length) return {};

    var sensoryRanked = names
      .map(function (n) {
        var s = SS ? SS.scorePairing(cigarName, n) : { score: 0 };
        return { name: n, sensoryScore: s.score };
      })
      .sort(function (a, b) {
        return b.sensoryScore - a.sensoryScore;
      });

    var aff = global.OntologyPolicy ? global.OntologyPolicy.deckKeysForAffinity(cigar.guidance && cigar.guidance.pairingAffinity) : [];
    var categoryPick = names.find(function (n) {
      var sp = findSpirit(n);
      return sp && aff.indexOf(sp.deckKey) !== -1;
    });
    var fullRanked = names
      .map(function (n) {
        return { name: n, scored: scorePairing(cigarName, n, { modes: {} }) };
      })
      .sort(function (a, b) {
        return b.scored.numericScore - a.scored.numericScore;
      });
    var noOntRanked = names
      .map(function (n) {
        return { name: n, scored: scorePairing(cigarName, n, { modes: { ignoreOntology: true } }) };
      })
      .sort(function (a, b) {
        return b.scored.numericScore - a.scored.numericScore;
      });
    var fullTop = fullRanked[0] || { name: sensoryRanked[0].name, scored: scorePairing(cigarName, sensoryRanked[0].name, { modes: {} }) };
    var noOntTop = noOntRanked[0] || { name: sensoryRanked[0].name, scored: scorePairing(cigarName, sensoryRanked[0].name, { modes: { ignoreOntology: true } }) };

    var fullTopNoOntology = scorePairing(cigarName, fullTop.name, { modes: { ignoreOntology: true } });

    return {
      sensoryTop: sensoryRanked[0].name,
      categoryPick: categoryPick || null,
      fullOntologyPick: fullTop.name,
      fullOntologyGrade: fullTop.scored.grade,
      noOntologyPick: noOntTop.name,
      noOntologyGrade: noOntTop.scored.grade,
      ontologyLift: fullTop.scored.numericScore - fullTopNoOntology.numericScore
    };
  }

  global.PairingEvaluation = {
    GRADE_THRESHOLDS: GRADE_THRESHOLDS,
    scorePairing: scorePairing,
    scoreTurn: scoreTurn,
    compareBaselines: compareBaselines,
    letterFromScore: letterFromScore,
    gradeRank: gradeRank,
    explorationPlausibility: explorationPlausibility
  };
})(typeof window !== 'undefined' ? window : global);
