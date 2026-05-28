/**
 * RecommendationDiversity — anti-convergence picks and demo-gravity metrics.
 * Pure: no DOM. Used by SpiritAnchor and SterlonRecoDiagnostics.
 */
(function (global) {
  'use strict';

  var HERO_SPIRIT_PATTERNS = [
    /\bpappy\b/i,
    /\bblanton/i,
    /\beagle rare\b/i,
    /\bbuffalo trace\b/i
  ];
  var HERO_CIGAR_PATTERNS = [
    /\bpadron\b/i,
    /\bashton\b/i,
    /\bcohiba\b/i,
    /\bmontecristo\b/i
  ];

  function hashString(s) {
    var h = 0;
    var str = String(s || '');
    for (var i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function strengthOf(product) {
    return product && product.spec && product.spec.strength != null ? Number(product.spec.strength) : 5;
  }

  /**
   * Stratified cigar sample (light / mid / full) for pairing probes — avoids one median cigar.
   */
  function stratifiedCigarNames(lp, count) {
    if (!lp || !lp.cigars || !lp.cigars.length) return [];
    var sorted = lp.cigars.slice().sort(function (a, b) {
      return strengthOf(a) - strengthOf(b);
    });
    var n = count != null ? count : 3;
    if (sorted.length <= n) return sorted.map(function (c) { return c.name; });
    var names = [];
    for (var i = 0; i < n; i++) {
      var idx = Math.floor((i / (n - 1)) * (sorted.length - 1));
      names.push(sorted[idx].name);
    }
    return names;
  }

  function pickRotatingFromSorted(sorted, seedText) {
    if (!sorted || !sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var idx = hashString(seedText) % sorted.length;
    return sorted[idx];
  }

  /**
   * Pick spirit from PairingEngine ranks with diversity: top-K, recent dampening, prompt rotation.
   */
  function pickSpiritByPairingDiverse(opts) {
    var o = opts || {};
    var PE = global.PairingEngine;
    var E = global.RecommendationEntropy;
    if (!PE || typeof PE.rankCandidates !== 'function') return null;

    var cigarNames = o.cigarNames || (o.cigarName ? [o.cigarName] : []);
    if (!cigarNames.length) return null;

    var candidateNames = o.candidateNames || [];
    if (!candidateNames.length) return null;

    var recentBag = o.recent || null;
    if (!recentBag && E && typeof E.recentCountsFromSession === 'function') {
      recentBag = E.recentCountsFromSession({ recentSpiritCounts: o.recentSpirits });
    }
    var seed = o.seedText || '';
    var aggregate = Object.create(null);

    cigarNames.forEach(function (cigar) {
      var ranked = PE.rankCandidates(cigar, candidateNames, {
        recent: recentBag,
        seedText: seed,
        candidateCategory: 'spirit',
        slotRole: 'anchor'
      });
      ranked.forEach(function (row, rankIdx) {
        if (!row || !row.name) return;
        var prev = aggregate[row.name];
        var score =
          row.adjustedScore != null
            ? row.adjustedScore
            : row.score != null
              ? row.score
              : 100 - rankIdx;
        if (!prev) {
          aggregate[row.name] = { name: row.name, scoreSum: score, hits: 1 };
        } else {
          prev.scoreSum += score;
          prev.hits += 1;
        }
      });
    });

    var rows = Object.keys(aggregate).map(function (name) {
      var a = aggregate[name];
      return { name: name, score: a.scoreSum / a.hits };
    });

    if (E && typeof E.applyExplorationModifiers === 'function') {
      E.applyExplorationModifiers(rows, {
        anchorName: cigarNames[0],
        candidateCategory: 'spirit',
        recent: recentBag,
        seedText: seed,
        slotRole: 'anchor-aggregate'
      });
    }

    if (E && typeof E.pickFromConfidenceBand === 'function') {
      return E.pickFromConfidenceBand(rows, { seedText: seed, slotRole: 'spirit-anchor' });
    }

    rows.sort(function (a, b) {
      return b.score - a.score;
    });
    var topK = Math.min(5, rows.length);
    if (!topK) return null;
    return rows[hashString(seed) % topK].name;
  }

  function isHeroSpirit(name) {
    var n = String(name || '').toLowerCase();
    for (var i = 0; i < HERO_SPIRIT_PATTERNS.length; i++) {
      if (HERO_SPIRIT_PATTERNS[i].test(n)) return true;
    }
    return false;
  }

  function isHeroCigar(name) {
    var n = String(name || '').toLowerCase();
    for (var i = 0; i < HERO_CIGAR_PATTERNS.length; i++) {
      if (HERO_CIGAR_PATTERNS[i].test(n)) return true;
    }
    return false;
  }

  function dominancePct(map, total, predicate) {
    if (!total) return 0;
    var hero = 0;
    Object.keys(map).forEach(function (k) {
      if (predicate(k)) hero += map[k];
    });
    return Math.round((hero / total) * 1000) / 10;
  }

  function deckDominancePct(signals, deckKey) {
    var total = 0;
    var hit = 0;
    Object.keys(signals || {}).forEach(function (k) {
      var c = signals[k];
      total += c;
      if (k.indexOf(deckKey) !== -1) hit += c;
    });
    return total ? Math.round((hit / total) * 1000) / 10 : 0;
  }

  global.RecommendationDiversity = {
    hashString: hashString,
    stratifiedCigarNames: stratifiedCigarNames,
    pickRotatingFromSorted: pickRotatingFromSorted,
    pickSpiritByPairingDiverse: pickSpiritByPairingDiverse,
    isHeroSpirit: isHeroSpirit,
    isHeroCigar: isHeroCigar,
    HERO_SPIRIT_PATTERNS: HERO_SPIRIT_PATTERNS,
    HERO_CIGAR_PATTERNS: HERO_CIGAR_PATTERNS
  };
})(typeof window !== 'undefined' ? window : global);
