/**
 * PairingEngine — deterministic scoring + exploration-aware slot assignment.
 *
 * Tie scores at ~0.95 are broken via RecommendationEntropy confidence-band picks,
 * not stable first-ranked winners.
 */
(function (global) {
  'use strict';

  function ss()  { return global.SterlonSensory         || null; }
  function ssp() { return global.SterlonSensoryProfiles || null; }
  function ent() { return global.RecommendationEntropy || null; }

  function scoreCandidate(anchorName, candidateName) {
    var sensory = ss();
    if (!sensory || typeof sensory.scorePairing !== 'function') {
      return { score: 0, intensityMatch: false, bridges: [] };
    }
    var result = sensory.scorePairing(anchorName, candidateName);
    return result || { score: 0, intensityMatch: false, bridges: [] };
  }

  function bodyDelta(anchorName, candidateName) {
    var profiles = ssp();
    if (!profiles || typeof profiles.getSensoryDimension !== 'function') return 0;
    var anchorBody    = profiles.getSensoryDimension(anchorName,    'body');
    var candidateBody = profiles.getSensoryDimension(candidateName, 'body');
    if (anchorBody == null || candidateBody == null) return 0;
    return Math.abs(anchorBody - candidateBody);
  }

  function inferCandidateCategory(anchorName, candidateNames) {
    var lp = global.LoungeProducts;
    if (lp && typeof lp.findSpiritByName === 'function' && lp.findSpiritByName(anchorName)) {
      return 'spirit';
    }
    return 'cigar';
  }

  var POLICY_WEIGHT = 0.18;

  function resolveCigarSpirit(anchorName, candidateName) {
    var lp = global.LoungeProducts;
    if (lp && lp.findSpiritByName && lp.findSpiritByName(anchorName)) {
      return { cigar: candidateName, spirit: anchorName };
    }
    return { cigar: anchorName, spirit: candidateName };
  }

  function policyContribution(anchorName, candidateName, opts) {
    var o = opts || {};
    var OP = global.OntologyPolicy;
    var lp = global.LoungeProducts;
    if (!OP || !lp || typeof OP.spiritContextScore !== 'function') return 0;
    var pair = resolveCigarSpirit(anchorName, candidateName);
    var spirit =
      lp.findSpiritByName && lp.findSpiritByName(pair.spirit)
        ? lp.findSpiritByName(pair.spirit)
        : null;
    if (!spirit || !pair.cigar) return 0;
    var ctx =
      typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({
            promptText: o.promptText,
            journeyLevel: o.journeyLevel,
            sessionRuntime: o.sessionRuntime,
            pairingStrategy: o.pairingStrategy
          })
        : { pairingStrategy: o.pairingStrategy };
    var highProofBourbon =
      typeof OP.isHighProofBourbonContext === 'function' && OP.isHighProofBourbonContext(ctx, spirit);
    var raw = OP.spiritContextScore(spirit, ctx, pair.cigar);
    if (highProofBourbon && typeof OP.cigarContextScore === 'function') {
      raw += OP.cigarContextScore(pair.cigar, ctx, spirit);
      return Math.max(-1.5, Math.min(1.1, raw));
    }
    return Math.max(0, Math.min(0.35, raw));
  }

  function rankCandidates(anchorName, candidateNames, opts) {
    var o = opts || {};
    var CP = global.ContrastPairing;
    var candidates = (candidateNames || []).slice();
    var scored = candidates.map(function (name) {
      var s = scoreCandidate(anchorName, name);
      var composite = s.score;
      var contrastScore = 0;
      var pairingStrategy = o.pairingStrategy || null;
      if (CP && typeof CP.blendPairingScore === 'function') {
        var blended = CP.blendPairingScore(anchorName, name, s, {
          promptText: o.promptText,
          journeyLevel: o.journeyLevel,
          sessionRuntime: o.sessionRuntime,
          strategy: pairingStrategy,
          slotRole: o.slotRole
        });
        composite = blended.compositeScore;
        contrastScore = blended.contrastScore;
        pairingStrategy = blended.pairingStrategy;
      }
      composite += policyContribution(anchorName, name, {
        promptText: o.promptText,
        journeyLevel: o.journeyLevel,
        sessionRuntime: o.sessionRuntime,
        pairingStrategy: pairingStrategy
      }) * POLICY_WEIGHT;
      composite = Math.max(0, Math.min(1, composite));
      return {
        name: name,
        score: composite,
        harmonyScore: s.score,
        contrastScore: contrastScore,
        pairingStrategy: pairingStrategy,
        intensityMatch: s.intensityMatch,
        bridges: s.bridges || [],
        bodyDelta: bodyDelta(anchorName, name)
      };
    });

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.intensityMatch !== b.intensityMatch) return a.intensityMatch ? -1 : 1;
      return 0;
    });

    var E = ent();
    if (E && typeof E.applyExplorationModifiers === 'function') {
      E.applyExplorationModifiers(scored, {
        anchorName: anchorName,
        candidateCategory: o.candidateCategory || inferCandidateCategory(anchorName, candidateNames),
        recent: o.recent,
        seedText: o.seedText,
        slotRole: o.slotRole
      });
    }

    return scored;
  }

  function pickSlots(anchorName, candidateNames, opts) {
    var o = opts || {};
    var wildcardDeltaMin = typeof o.wildcardBodyDeltaMin === 'number' ? o.wildcardBodyDeltaMin : 2;
    var wildcardMinTier = typeof o.wildcardMinTier === 'number' ? o.wildcardMinTier : 6;
    var E = ent();

    function meetsWildcardTier(name) {
      if (wildcardMinTier === null) return true;
      var LP = global.LoungeProducts;
      var cigar = LP && typeof LP.findCigarByName === 'function' ? LP.findCigarByName(name) : null;
      var tier = cigar && cigar.spec ? cigar.spec.tier : null;
      return tier == null || Number(tier) >= wildcardMinTier;
    }

    function pickFromPool(pool, slotRole, preferNovelty) {
      if (!pool.length) return null;
      if (E && typeof E.pickFromConfidenceBand === 'function') {
        return E.pickFromConfidenceBand(pool, {
          seedText: o.seedText || anchorName,
          slotRole: slotRole,
          preferNovelty: preferNovelty
        });
      }
      return pool[0].name;
    }

    var strat =
      o.pairingStrategy ||
      (global.ContrastPairing && global.ContrastPairing.inferStrategy
        ? global.ContrastPairing.inferStrategy(o.promptText, o).strategy
        : null);

    var ranked = rankCandidates(anchorName, candidateNames, {
      recent: o.recent,
      seedText: o.seedText,
      promptText: o.promptText,
      journeyLevel: o.journeyLevel,
      sessionRuntime: o.sessionRuntime,
      pairingStrategy: strat,
      candidateCategory: o.candidateCategory || inferCandidateCategory(anchorName, candidateNames)
    });

    if (ranked.length === 0) {
      return { best: null, safe: null, wildcard: null };
    }

    var best = pickFromPool(ranked, 'best', false);
    var used = {};
    if (best) used[best] = true;

    var safe = null;
    var safePool = ranked.filter(function (r) {
      return !used[r.name] && r.intensityMatch;
    });
    if (!safePool.length) safePool = ranked.filter(function (r) { return !used[r.name]; });
    safe = pickFromPool(safePool.length ? safePool : ranked, 'safe', false);
    if (safe) used[safe] = true;

    var wildcard = null;
    var preferContrast = strat === 'contrast' || strat === 'adventurous';
    var wildPool = ranked.filter(function (r) {
      if (used[r.name]) return false;
      if (!meetsWildcardTier(r.name)) return false;
      if (preferContrast) {
        return r.contrastScore >= 0.4 && r.bridges.length >= 1 && r.bodyDelta >= wildcardDeltaMin;
      }
      return r.bridges.length >= 1 && r.bodyDelta >= wildcardDeltaMin;
    });
    if (!wildPool.length) {
      wildPool = ranked.filter(function (r) { return !used[r.name]; });
    }
    wildcard = pickFromPool(wildPool.length ? wildPool : ranked, 'wildcard', true);
    if (!wildcard) {
      for (var k = 0; k < ranked.length; k++) {
        if (!used[ranked[k].name]) {
          wildcard = ranked[k].name;
          break;
        }
      }
    }

    return { best: best, safe: safe, wildcard: wildcard };
  }

  global.PairingEngine = {
    scoreCandidate:  scoreCandidate,
    rankCandidates:  rankCandidates,
    pickSlots:       pickSlots,
    policyContribution: policyContribution
  };

})(typeof window !== 'undefined' ? window : global);
