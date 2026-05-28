/**
 * OntologySpiritContext — spirit deck affinity, ranking, refinement helpers.
 */
(function (global) {
  'use strict';

  var C = global.OntologyPolicyCore;
  if (!C) return;

  function spiritAffinityBoost(spirit, cigarName, strategy) {
    var cigar = C.findProduct(cigarName, 'cigar');
    if (!cigar || !spirit) return 0;
    var decks = C.deckKeysForAffinity(C.guidanceOf(cigar).pairingAffinity);
    if (!decks.length) return 0;
    if (decks.indexOf(spirit.deckKey) !== -1) return 0.62;
    var strat = strategy || '';
    var PI = global.PairingIconic;
    var CP = global.ContrastPairing;
    var spiritName = spirit.name || '';
    var boldAllowed =
      (CP && typeof CP.isBoldPairAllowed === 'function' && CP.isBoldPairAllowed(cigarName, spiritName, strat)) ||
      (PI && typeof PI.isBoldPairAllowed === 'function' && PI.isBoldPairAllowed(cigarName, spiritName, strat));
    var iconic = PI && typeof PI.iconicPairBoost === 'function' ? PI.iconicPairBoost(cigarName, spiritName) : 0;
    if (strat === 'contrast' || strat === 'adventurous' || strat === 'educational') {
      if (boldAllowed || iconic >= 0.05) return -0.03;
    }
    return -0.28;
  }

  function hasExplicitVodkaIntent(ctx) {
    var text = C.normalizeText(ctx && ctx.promptText);
    return /\b(vodka|palate reset|clean|neutral)\b/.test(text);
  }

  function morningSpiritAdjustment(spirit, ctx) {
    if (!ctx || ctx.boldAsk) return 0;
    var coffeeCtx = !!(ctx.morningSession || ctx.coffeeEspressoPairing);
    if (!coffeeCtx) return 0;
    var p = typeof spirit === 'string' ? C.findProduct(spirit, 'spirit') : spirit;
    if (!p) return 0;
    var n = String(p.name || '').toLowerCase();
    var deck = p.deckKey || '';
    var score = 0;
    if (deck === 'peated' || /\b(ardbeg|laphroaig|lagavulin|octomore)\b/.test(n)) score -= 0.55;
    if (deck === 'bourbon') score += 0.28;
    else if (deck === 'irish') score += 0.22;
    else if (deck === 'cognac') score += 0.18;
    else if (deck === 'rum') score += 0.14;
    else if (deck === 'rye') score += 0.04;
    else if (deck === 'agave') score -= 0.48;
    else if (deck === 'vodka') score -= 0.35;
    else if (deck === 'japanese' || deck === 'scotch') score -= 0.1;
    return score;
  }

  function spiritContextScore(spirit, ctx, cigarName) {
    if (!spirit) return 0;
    var p = typeof spirit === 'string' ? C.findProduct(spirit, 'spirit') : spirit;
    if (!p) return 0;
    var strategy = ctx && ctx.pairingStrategy;
    var score = spiritAffinityBoost(p, cigarName, strategy) + morningSpiritAdjustment(p, ctx);
    var PI = global.PairingIconic;
    if (PI && typeof PI.iconicPairBoost === 'function' && cigarName) {
      score += PI.iconicPairBoost(cigarName, p.name);
    }
    if (p.deckKey === 'vodka' && !hasExplicitVodkaIntent(ctx)) score -= 0.55;
    if (C.avoidIfTriggered(p, ctx)) return -2;
    return score - C.beginnerPenalty(p, ctx);
  }

  function rankSpirits(spirits, ctx, cigarName) {
    return (spirits || [])
      .slice()
      .sort(function (a, b) {
        var sa = spiritContextScore(a, ctx, cigarName) + (a.journeyRank != null ? a.journeyRank * 0.01 : 0);
        var sb = spiritContextScore(b, ctx, cigarName) + (b.journeyRank != null ? b.journeyRank * 0.01 : 0);
        return sb - sa;
      });
  }

  function resolveSpiritDeckKey(opts) {
    var o = opts || {};
    var SDK = global.SpiritDeckKey;
    var nlpDeck =
      o.nlpDeckKey ||
      (SDK && typeof SDK.inferDeckKeyFromPrompt === 'function'
        ? SDK.inferDeckKeyFromPrompt(o.promptText, {
            categoryFocus: o.categoryFocus,
            sessionDeckKey: o.sessionDeckKey,
            flavorRouteDeckKey: o.flavorRouteDeckKey
          })
        : null);

    var cigarName = o.pairingCigar || o.sessionCigar || null;
    var cigar = cigarName ? C.findProduct(cigarName, 'cigar') : null;
    var affinity = cigar ? C.guidanceOf(cigar).pairingAffinity : '';
    var affinityDecks = C.deckKeysForAffinity(affinity);
    var deckKey = nlpDeck;
    var overridden = false;
    var conflict = false;

    var cigarAnchored = !!(o.pairingCigar || o.sessionCigar);
    if (affinityDecks.length) {
      if (!deckKey || affinityDecks.indexOf(deckKey) === -1) {
        if (!deckKey || o.openPairing || cigarAnchored) {
          deckKey = affinityDecks[0];
          overridden = !!nlpDeck && nlpDeck !== deckKey;
        } else {
          conflict = true;
        }
      }
      C.lastDiagnostics.affinityInfluencePct = overridden ? 1 : nlpDeck === deckKey ? 0.5 : 0.35;
    } else {
      C.lastDiagnostics.affinityInfluencePct = 0;
    }

    C.lastDiagnostics.deckOverride = overridden;
    C.lastDiagnostics.affinityConflict = conflict;
    if (affinity) C.lastDiagnostics.contextHits.push('affinity:' + C.normalizeAffinity(affinity));

    return {
      deckKey: deckKey || nlpDeck || null,
      affinity: affinity || null,
      affinityDecks: affinityDecks,
      nlpDeckKey: nlpDeck,
      overridden: overridden,
      conflict: conflict
    };
  }

  function refinementStrategyForAxis(axis) {
    var a = String(axis || '').toLowerCase();
    if (a === 'contrast' || a === 'unexpected' || a === 'interesting') return 'contrast';
    if (a === 'adventure' || a === 'connoisseur') return 'adventurous';
    if (a === 'luxury') return 'classic_lounge';
    return 'complementary';
  }

  function filterSpiritNamesByStrategy(spiritNames, cigarName, strategy) {
    var names = (spiritNames || []).slice();
    var lounge = C.lp();
    if (!lounge || !lounge.spirits || !names.length) return names;
    var cigar = C.findProduct(cigarName, 'cigar');
    var decks = C.deckKeysForAffinity(cigar ? C.guidanceOf(cigar).pairingAffinity : '');
    if (!decks.length) return names;
    var strat = strategy || 'balanced';
    var strictAffinity = strat === 'complementary' || strat === 'classic_lounge';
    if (strictAffinity) {
      var filtered = lounge.spirits
        .filter(function (s) {
          return names.indexOf(s.name) !== -1 && decks.indexOf(s.deckKey) !== -1;
        })
        .map(function (s) {
          return s.name;
        });
      return filtered.length ? filtered : names;
    }
    var cigarStr =
      cigar && cigar.spec && cigar.spec.strength != null ? Number(cigar.spec.strength) : 5;
    var widenDecks = decks.slice();
    if (cigarStr >= 7) {
      ['peated', 'scotch', 'rye'].forEach(function (dk) {
        if (widenDecks.indexOf(dk) === -1) widenDecks.push(dk);
      });
    }
    if (cigarStr >= 7 || widenDecks.length > decks.length) {
      var widened = lounge.spirits
        .filter(function (s) {
          return names.indexOf(s.name) !== -1 && widenDecks.indexOf(s.deckKey) !== -1;
        })
        .map(function (s) {
          return s.name;
        });
      if (widened.length) return widened;
    }
    return names;
  }

  function pickSpiritPreservingAffinity(currentName, cigarName, candidateNames, ctx) {
    var lounge = C.lp();
    if (!lounge || !lounge.spirits) return currentName;
    var strategy = ctx && ctx.pairingStrategy ? ctx.pairingStrategy : 'complementary';
    var filteredNames = filterSpiritNamesByStrategy(candidateNames || [], cigarName, strategy);
    var pool = filteredNames
      .map(function (n) {
        return C.findProduct(n, 'spirit');
      })
      .filter(Boolean);
    if (!pool.length) {
      pool = (candidateNames || [])
        .map(function (n) {
          return C.findProduct(n, 'spirit');
        })
        .filter(Boolean);
    }
    pool = rankSpirits(pool, ctx, cigarName);
    return pool.length ? pool[0].name : currentName;
  }

  global.OntologySpiritContext = {
    spiritAffinityBoost: spiritAffinityBoost,
    spiritContextScore: spiritContextScore,
    rankSpirits: rankSpirits,
    resolveSpiritDeckKey: resolveSpiritDeckKey,
    refinementStrategyForAxis: refinementStrategyForAxis,
    filterSpiritNamesByStrategy: filterSpiritNamesByStrategy,
    pickSpiritPreservingAffinity: pickSpiritPreservingAffinity
  };
})(typeof window !== 'undefined' ? window : global);
