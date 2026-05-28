/**
 * RecommendationEntropy — exploration pressure, convergence metrics, session repetition tracking.
 * Pure: no DOM. Used by PairingEngine, SpiritAnchor, RecommendationDiversity, diagnostics, freezes.
 */
(function (global) {
  'use strict';

  var SCORE_EPSILON = 0.025;
  var RECENT_SPIRIT_PEN = 0.14;
  var RECENT_CIGAR_PEN = 0.16;
  var RECENT_BRAND_PEN = 0.09;
  var RECENT_CATEGORY_PEN = 0.07;
  var UNDERUSE_CATEGORY_BOOST = 0.08;
  var NOVELTY_BOOST = 0.05;
  var HERO_SKU_PEN = 0.1;

  function hashString(s) {
    var h = 0;
    var str = String(s || '');
    for (var i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function brandKey(name) {
    var n = String(name || '').trim();
    var m = n.match(/^([^0-9]+?)(?:\s+\d|\s+No\.|\s+Series|\s+Anniversary|$)/i);
    return (m ? m[1] : n.split(/\s+/).slice(0, 2).join(' ')).trim().toLowerCase();
  }

  function wrapperKey(product) {
    if (!product || !product.menuLine) return 'unknown';
    var line = String(product.menuLine);
    var m = line.match(/·\s*([^·]+?)\s*·\s*\$/);
    if (m) return m[1].trim().toLowerCase();
    return 'unknown';
  }

  function flavorFamilyKey(product) {
    if (!product || !product.tags || !product.tags.length) return 'none';
    return product.tags[0].id || 'none';
  }

  function findProduct(name, category) {
    var PIDs = global.RecommendationProductIds;
    return PIDs && typeof PIDs.getProductRef === 'function'
      ? PIDs.getProductRef(category, name)
      : null;
  }

  function productCategory(name, category) {
    var p = findProduct(name, category);
    if (!p) return category === 'spirit' ? 'unknown' : 'cigar';
    if (category === 'spirit') return p.deckKey || 'unknown';
    return 'cigar';
  }

  function emptyCounts() {
    return {
      spirits: Object.create(null),
      cigars: Object.create(null),
      spiritBrands: Object.create(null),
      cigarBrands: Object.create(null),
      categories: Object.create(null),
      wrappers: Object.create(null)
    };
  }

  /** Merge active flight + optional session rolling counts. */
  function foldGlobalIntoRecent(out, scale) {
    var sc = scale != null ? scale : 0.65;
    Object.keys(globalState.spiritPicks).forEach(function (k) {
      out.spirits[k] = (out.spirits[k] || 0) + globalState.spiritPicks[k] * sc;
      var bk = brandKey(k);
      out.spiritBrands[bk] = (out.spiritBrands[bk] || 0) + globalState.spiritPicks[k] * sc;
      var cat = productCategory(k, 'spirit');
      out.categories[cat] = (out.categories[cat] || 0) + globalState.spiritPicks[k] * sc;
    });
    Object.keys(globalState.cigarPicks).forEach(function (k) {
      out.cigars[k] = (out.cigars[k] || 0) + globalState.cigarPicks[k] * sc;
      var cb = brandKey(k);
      out.cigarBrands[cb] = (out.cigarBrands[cb] || 0) + globalState.cigarPicks[k] * sc;
    });
    return out;
  }

  function recentCountsFromSession(session) {
    var out = emptyCounts();
    var s = session || {};
    var bags = [
      s.recentEntropyCounts,
      { spirits: s.recentSpiritCounts, cigars: s.recentCigarCounts }
    ];
    bags.forEach(function (bag) {
      if (!bag) return;
      Object.keys(bag.spirits || {}).forEach(function (k) {
        out.spirits[k] = (out.spirits[k] || 0) + bag.spirits[k];
      });
      Object.keys(bag.cigars || {}).forEach(function (k) {
        out.cigars[k] = (out.cigars[k] || 0) + bag.cigars[k];
      });
      Object.keys(bag.spiritBrands || {}).forEach(function (k) {
        out.spiritBrands[k] = (out.spiritBrands[k] || 0) + bag.spiritBrands[k];
      });
      Object.keys(bag.cigarBrands || {}).forEach(function (k) {
        out.cigarBrands[k] = (out.cigarBrands[k] || 0) + bag.cigarBrands[k];
      });
      Object.keys(bag.categories || {}).forEach(function (k) {
        out.categories[k] = (out.categories[k] || 0) + bag.categories[k];
      });
    });
    var set = s.activeRecommendationSet;
    if (set) {
      ['best', 'safe', 'wildcard'].forEach(function (slot) {
        var card = set[slot];
        if (!card) return;
        if (card.spirit) out.spirits[card.spirit] = (out.spirits[card.spirit] || 0) + 1;
        if (card.cigar) out.cigars[card.cigar] = (out.cigars[card.cigar] || 0) + 1;
      });
    }
    foldGlobalIntoRecent(out, s.includeGlobalRecent === false ? 0 : 0.65);
    return out;
  }

  function recordTurnOnSession(session, turn) {
    var s = session || {};
    if (!s.recentEntropyCounts) s.recentEntropyCounts = emptyCounts();
    var bag = s.recentEntropyCounts;
    (turn.cards || []).forEach(function (card) {
      if (card.spirit) {
        bag.spirits[card.spirit] = (bag.spirits[card.spirit] || 0) + 1;
        var sb = brandKey(card.spirit);
        bag.spiritBrands[sb] = (bag.spiritBrands[sb] || 0) + 1;
        var cat = productCategory(card.spirit, 'spirit');
        bag.categories[cat] = (bag.categories[cat] || 0) + 1;
      }
      if (card.cigar) {
        bag.cigars[card.cigar] = (bag.cigars[card.cigar] || 0) + 1;
        var cb = brandKey(card.cigar);
        bag.cigarBrands[cb] = (bag.cigarBrands[cb] || 0) + 1;
        var cigar = findProduct(card.cigar, 'cigar');
        var wk = wrapperKey(cigar);
        bag.wrappers[wk] = (bag.wrappers[wk] || 0) + 1;
      }
    });
    return bag;
  }

  function categoryUsageFromMenu() {
    var lp = global.LoungeProducts;
    var usage = Object.create(null);
    if (!lp || !lp.spirits) return usage;
    lp.spirits.forEach(function (sp) {
      var dk = sp.deckKey || 'unknown';
      usage[dk] = usage[dk] || 0;
    });
    return usage;
  }

  function isAttractorSku(name, category) {
    var n = String(name || '').toLowerCase();
    if (category === 'cigar') {
      return /\bashton\s+vsg\b/.test(n) || /\bpadron\b/.test(n);
    }
    return (
      /\beagle rare\b/.test(n) ||
      /\bwoodford\b/.test(n) ||
      /\bblanton/.test(n) ||
      /\bjohnnie walker blue\b/.test(n) ||
      /\bwhistlepig\b/.test(n)
    );
  }

  /**
   * Apply gentle exploration modifiers to ranked pairing rows (mutates adjustedScore).
   * @param {object} opts
   * @param {string} opts.anchorName
   * @param {'spirit'|'cigar'} opts.candidateCategory — category of candidate list
   * @param {object} [opts.recent]
   * @param {string} [opts.seedText]
   * @param {string} [opts.slotRole] — best | safe | wildcard
   */
  function applyExplorationModifiers(ranked, opts) {
    var o = opts || {};
    var recent = o.recent || emptyCounts();
    var seed = (o.seedText || '') + '|' + (o.slotRole || 'best') + '|' + (o.anchorName || '');
    var catUsage = o.categoryUsage || categoryUsageFromMenu();
    var candidateCat = o.candidateCategory || 'cigar';
    var topRaw = ranked.length ? ranked[0].score : 0;

    ranked.forEach(function (row, idx) {
      var raw = row.score != null ? row.score : 0;
      row.rawScore = raw;
      var adj = raw;
      var name = row.name;
      var p = findProduct(name, candidateCat);
      var bk = brandKey(name);
      var cat = candidateCat === 'spirit' ? productCategory(name, 'spirit') : 'cigar';

      if (candidateCat === 'spirit') {
        adj -= (recent.spirits[name] || 0) * RECENT_SPIRIT_PEN;
        adj -= (recent.spiritBrands[bk] || 0) * RECENT_BRAND_PEN;
      } else {
        adj -= (recent.cigars[name] || 0) * RECENT_CIGAR_PEN;
        adj -= (recent.cigarBrands[bk] || 0) * RECENT_BRAND_PEN;
        var cigar = p;
        adj -= (recent.wrappers[wrapperKey(cigar)] || 0) * 0.05;
      }

      adj -= (recent.categories[cat] || 0) * RECENT_CATEGORY_PEN;

      if (candidateCat === 'spirit' && catUsage[cat] != null) {
        var deckSize = catUsage[cat];
        if (deckSize <= 2) adj += UNDERUSE_CATEGORY_BOOST * 0.65;
        else if (cat !== 'bourbon') adj += UNDERUSE_CATEGORY_BOOST * 1.2;
        else adj -= 0.04;
      }

      if (idx > 8) adj += NOVELTY_BOOST;
      if (isAttractorSku(name, candidateCat)) adj -= HERO_SKU_PEN;

      adj += (hashString(seed + name) % 11) * 0.004;
      row.adjustedScore = adj;
      row.inConfidenceBand = topRaw - raw <= SCORE_EPSILON;
    });

    ranked.sort(function (a, b) {
      var aa = a.adjustedScore != null ? a.adjustedScore : a.score;
      var bb = b.adjustedScore != null ? b.adjustedScore : b.score;
      if (bb !== aa) return bb - aa;
      if (a.intensityMatch !== b.intensityMatch) return a.intensityMatch ? -1 : 1;
      return hashString(seed + a.name) - hashString(seed + b.name);
    });

    return ranked;
  }

  /**
   * Pick one name from confidence band using weighted hash (deterministic per seed).
   */
  function pickFromConfidenceBand(ranked, opts) {
    if (!ranked || !ranked.length) return null;
    var o = opts || {};
    var seed = (o.seedText || '') + '|' + (o.slotRole || 'best');
    var top = ranked[0].adjustedScore != null ? ranked[0].adjustedScore : ranked[0].score;
    var band = ranked.filter(function (r) {
      var adj = r.adjustedScore != null ? r.adjustedScore : r.score;
      return top - adj <= SCORE_EPSILON + 0.001;
    });
    if (band.length <= 1) return band[0].name;

    var total = 0;
    var weights = band.map(function (r, i) {
      var w = 1 + Math.max(0, (r.adjustedScore != null ? r.adjustedScore : r.score) - (band[band.length - 1].adjustedScore || 0));
      if (o.preferNovelty && i > 2) w += 0.35;
      total += w;
      return w;
    });
    var pick = hashString(seed) % total;
    var acc = 0;
    for (var i = 0; i < band.length; i++) {
      acc += weights[i];
      if (pick < acc) return band[i].name;
    }
    return band[0].name;
  }

  /**
   * Spirit anchor: explore sorted catalog list with category + repetition pressure.
   */
  function pickSpiritFromCatalog(sortedNames, opts) {
    var o = opts || {};
    var recent = o.recent || emptyCounts();
    var seed = o.seedText || '';
    if (!sortedNames || !sortedNames.length) return null;

    var rows = sortedNames.map(function (name) {
      var cat = productCategory(name, 'spirit');
      var adj = 1;
      adj -= (recent.spirits[name] || 0) * RECENT_SPIRIT_PEN;
      adj -= (recent.spiritBrands[brandKey(name)] || 0) * RECENT_BRAND_PEN;
      adj -= (recent.categories[cat] || 0) * RECENT_CATEGORY_PEN;
      if (cat !== 'bourbon') adj += UNDERUSE_CATEGORY_BOOST * 1.35;
      if (cat === 'bourbon') adj -= 0.03;
      if (isAttractorSku(name, 'spirit')) adj -= HERO_SKU_PEN;
      adj += (hashString(seed + name) % 17) * 0.012;
      return { name: name, adjustedScore: adj, deckKey: cat };
    });

    rows.sort(function (a, b) {
      return b.adjustedScore - a.adjustedScore;
    });

    var topK = Math.min(14, rows.length);
    var band = rows.slice(0, topK);
    var byDeck = Object.create(null);
    band.forEach(function (r) {
      if (!byDeck[r.deckKey]) byDeck[r.deckKey] = [];
      byDeck[r.deckKey].push(r);
    });
    var decks = Object.keys(byDeck);
    if (decks.length > 1) {
      var deckIdx = hashString(seed + '|deck') % decks.length;
      var deckBand = byDeck[decks[deckIdx]];
      var dTotal = 0;
      deckBand.forEach(function (r) {
        dTotal += Math.max(0.12, r.adjustedScore);
      });
      var dPick = hashString(seed + '|spirit-anchor') % Math.max(1, Math.floor(dTotal * 10));
      var dAcc = 0;
      for (var d = 0; d < deckBand.length; d++) {
        dAcc += Math.max(1, Math.floor(deckBand[d].adjustedScore * 10));
        if (dPick < dAcc) return deckBand[d].name;
      }
    }

    var total = 0;
    band.forEach(function (r) {
      total += Math.max(0.12, r.adjustedScore);
    });
    var pick = hashString(seed + '|spirit-anchor') % Math.max(1, Math.floor(total * 10));
    var acc = 0;
    for (var i = 0; i < band.length; i++) {
      acc += Math.max(1, Math.floor(band[i].adjustedScore * 10));
      if (pick < acc) return band[i].name;
    }
    return band[0].name;
  }

  /**
   * Semantic luxury / adventure pick — not ladder maximum.
   */
  function pickRefinementLuxurySpirit(currentSpirit, opts) {
    var o = opts || {};
    var lp = global.LoungeProducts;
    if (!lp || !lp.spirits) return currentSpirit;
    var seed = o.seedText || currentSpirit || '';
    var candidates = lp.spirits.filter(function (s) {
      return s.category === 'spirit';
    });
    if (!candidates.length) return currentSpirit;

    var scored = candidates.map(function (s) {
      var tags = (s.tags || []).length;
      var rank = s.journeyRank != null ? s.journeyRank : 0;
      var msrp = s.spec && s.spec.msrp != null ? s.spec.msrp : 40;
      var luxuryScore = rank * 0.02 + Math.min(tags, 6) * 0.04 + Math.min(msrp, 120) / 1200;
      if (s.journeyLevel === 'advanced') luxuryScore += 0.08;
      if (s.name === currentSpirit) luxuryScore -= 0.15;
      luxuryScore -= (o.recent && o.recent.spirits[s.name]) ? 0.12 : 0;
      luxuryScore += (hashString(seed + s.name) % 9) * 0.008;
      return { name: s.name, score: luxuryScore };
    });

    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    var topN = Math.min(5, scored.length);
    var idx = hashString(seed + '|luxury') % topN;
    return scored[idx].name;
  }

  function pickRefinementLuxuryCigar(currentCigar, opts) {
    var o = opts || {};
    var lp = global.LoungeProducts;
    if (!lp || !lp.cigars) return currentCigar;
    var seed = o.seedText || currentCigar || '';
    var candidates = lp.cigars.slice();
    var scored = candidates.map(function (c) {
      var tier = c.spec && c.spec.tier != null ? Number(c.spec.tier) : 5;
      var str = c.spec && c.spec.strength != null ? c.spec.strength : 5;
      var msrp = c.spec && c.spec.msrp != null ? c.spec.msrp : 20;
      var score = tier * 0.03 + str * 0.02 + Math.min(msrp, 60) / 600;
      if (c.name === currentCigar) score -= 0.12;
      if (isAttractorSku(c.name, 'cigar')) score -= 0.05;
      score += (hashString(seed + c.name) % 11) * 0.007;
      return { name: c.name, score: score };
    });
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    var topN = Math.min(6, scored.length);
    var idx = hashString(seed + '|luxury-cigar') % topN;
    return scored[idx].name;
  }

  /** Global diagnostics state (reset per Monte Carlo). */
  var globalState = {
    spiritPicks: Object.create(null),
    cigarPicks: Object.create(null),
    turns: 0
  };

  function resetGlobalMetrics() {
    globalState.spiritPicks = Object.create(null);
    globalState.cigarPicks = Object.create(null);
    globalState.turns = 0;
  }

  function recordGlobalPick(turn) {
    globalState.turns += 1;
    var card = turn && turn.cards && turn.cards[0];
    if (!card) return;
    if (card.spirit) globalState.spiritPicks[card.spirit] = (globalState.spiritPicks[card.spirit] || 0) + 1;
    if (card.cigar) globalState.cigarPicks[card.cigar] = (globalState.cigarPicks[card.cigar] || 0) + 1;
  }

  function topShare(map) {
    var total = 0;
    var top = 0;
    Object.keys(map).forEach(function (k) {
      total += map[k];
      if (map[k] > top) top = map[k];
    });
    return total ? top / total : 0;
  }

  function computeMetrics() {
    var spiritTotal = 0;
    var cigarTotal = 0;
    Object.keys(globalState.spiritPicks).forEach(function (k) {
      spiritTotal += globalState.spiritPicks[k];
    });
    Object.keys(globalState.cigarPicks).forEach(function (k) {
      cigarTotal += globalState.cigarPicks[k];
    });
    var uniqueSpirits = Object.keys(globalState.spiritPicks).length;
    var uniqueCigars = Object.keys(globalState.cigarPicks).length;
    var lp = global.LoungeProducts;
    var menuSpirits = lp && lp.spirits ? lp.spirits.length : 32;
    var menuCigars = lp && lp.cigars ? lp.cigars.length : 172;
    var topSpiritShare = topShare(globalState.spiritPicks);
    var topCigarShare = topShare(globalState.cigarPicks);
    var ashtonShare = 0;
    var eagleShare = 0;
    Object.keys(globalState.cigarPicks).forEach(function (k) {
      if (/\bashton\s+vsg\b/i.test(k)) ashtonShare += globalState.cigarPicks[k];
    });
    Object.keys(globalState.spiritPicks).forEach(function (k) {
      if (/\beagle rare\b/i.test(k)) eagleShare += globalState.spiritPicks[k];
    });
    ashtonShare = cigarTotal ? ashtonShare / cigarTotal : 0;
    eagleShare = spiritTotal ? eagleShare / spiritTotal : 0;

    var diversityScore = Math.min(1, (uniqueSpirits / Math.max(1, menuSpirits * 0.4)) * 0.5 + (uniqueCigars / Math.max(1, menuCigars * 0.2)) * 0.5);
    var convergenceScore = Math.min(1, topSpiritShare * 0.45 + topCigarShare * 0.55);
    var entropyScore = Math.max(0, 1 - convergenceScore);

    return {
      turns: globalState.turns,
      uniqueSpirits: uniqueSpirits,
      uniqueCigars: uniqueCigars,
      menuSpirits: menuSpirits,
      menuCigars: menuCigars,
      spiritUtilizationPct: menuSpirits ? Math.round((uniqueSpirits / menuSpirits) * 1000) / 10 : 0,
      cigarUtilizationPct: menuCigars ? Math.round((uniqueCigars / menuCigars) * 1000) / 10 : 0,
      topSpiritSharePct: Math.round(topSpiritShare * 1000) / 10,
      topCigarSharePct: Math.round(topCigarShare * 1000) / 10,
      ashtonSharePct: Math.round(ashtonShare * 1000) / 10,
      eagleRareSharePct: Math.round(eagleShare * 1000) / 10,
      diversityScore: Math.round(diversityScore * 1000) / 1000,
      convergenceScore: Math.round(convergenceScore * 1000) / 1000,
      entropyScore: Math.round(entropyScore * 1000) / 1000,
      ontologyUtilizationScore: Math.round(((diversityScore + entropyScore) / 2) * 1000) / 1000
    };
  }

  global.RecommendationEntropy = {
    SCORE_EPSILON: SCORE_EPSILON,
    hashString: hashString,
    brandKey: brandKey,
    recentCountsFromSession: recentCountsFromSession,
    recordTurnOnSession: recordTurnOnSession,
    applyExplorationModifiers: applyExplorationModifiers,
    pickFromConfidenceBand: pickFromConfidenceBand,
    pickSpiritFromCatalog: pickSpiritFromCatalog,
    pickRefinementLuxurySpirit: pickRefinementLuxurySpirit,
    pickRefinementLuxuryCigar: pickRefinementLuxuryCigar,
    resetGlobalMetrics: resetGlobalMetrics,
    recordGlobalPick: recordGlobalPick,
    computeMetrics: computeMetrics
  };
})(typeof window !== 'undefined' ? window : global);
