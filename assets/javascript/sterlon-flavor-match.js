/**
 * sterlon-flavor-match.js — Menu flavor scoring for Sterlon recommendations.
 *
 * Parse member flavor language → canonical tags → score every catalog SKU.
 * High-confidence winners drive deck + hero spirit/cigar on the best card.
 */
(function (global) {
  'use strict';

  var tagProductIndex = null;

  function getScoringProducts() {
    var MFC = global.MenuFlavorCatalog;
    if (MFC && typeof MFC.getProducts === 'function') {
      return MFC.getProducts();
    }
    if (MFC && MFC.products) {
      return MFC.products;
    }
    return [];
  }

  function invalidateProductIndex() {
    tagProductIndex = null;
  }

  /** Canonical tag id → member-facing phrases (longest match first at parse time). */
  var FLAVOR_LEXICON = [
    { id: 'ripe_apple', phrases: ['ripe apples', 'ripe apple', 'orchard apple'] },
    { id: 'green_apple', phrases: ['green apple', 'fresh apple'] },
    { id: 'pronounced_wood', phrases: ['pronounced wood', 'wood flavor', 'wood flavors', 'woody', 'barrel character'] },
    { id: 'dark_chocolate', phrases: ['dark chocolate'] },
    { id: 'dark_fruit', phrases: ['dark fruit'] },
    { id: 'dried_fruit', phrases: ['dried fruit', 'dried fruits'] },
    { id: 'orange_peel', phrases: ['orange peel', 'orange zest'] },
    { id: 'orchard_fruit', phrases: ['orchard fruit'] },
    { id: 'chocolate', phrases: ['chocolate', 'cocoa', 'cacao', 'hint of chocolate'] },
    { id: 'caramel', phrases: ['sweet caramel', 'caramel'] },
    { id: 'cherry', phrases: ['cherries', 'cherry'] },
    { id: 'tobacco', phrases: ['tobacco'] },
    { id: 'oak', phrases: ['toasted oak', 'oak'] },
    { id: 'wood', phrases: ['wood'] },
    { id: 'apple', phrases: ['apples', 'apple'] },
    { id: 'peat', phrases: ['peated', 'peat smoke', 'peat'] },
    { id: 'smoke', phrases: ['smoky', 'smoke'] },
    { id: 'iodine', phrases: ['iodine', 'medicinal'] },
    { id: 'sherry', phrases: ['sherried', 'sherry cask', 'sherry'] },
    { id: 'honey', phrases: ['honeyed', 'honey'] },
    { id: 'vanilla', phrases: ['vanilla'] },
    { id: 'citrus', phrases: ['citrus', 'lemon', 'orange'] },
    { id: 'floral', phrases: ['floral', 'flower'] },
    { id: 'espresso', phrases: ['espresso'] },
    { id: 'cocoa', phrases: ['cocoa'] },
    { id: 'cedar', phrases: ['cedar'] },
    { id: 'cream', phrases: ['creamy', 'cream'] },
    { id: 'pepper', phrases: ['white pepper', 'pepper', 'peppery'] },
    { id: 'leather', phrases: ['leather'] },
    { id: 'earth', phrases: ['earthy', 'earth', 'barnyard'] },
    { id: 'coffee', phrases: ['coffee'] },
    { id: 'spice', phrases: ['spice', 'spicy', 'baking spice'] },
    { id: 'walnut', phrases: ['walnut'] },
    { id: 'toffee', phrases: ['toffee', 'butterscotch'] },
    { id: 'agave', phrases: ['agave', 'tequila'] },
    { id: 'cinnamon', phrases: ['cinnamon'] },
    { id: 'herbal', phrases: ['herbal', 'herbs', 'herbaceous'] },
    { id: 'mint', phrases: ['mint', 'menthol'] },
    { id: 'peach', phrases: ['peach'] },
    { id: 'incense', phrases: ['incense'] },
    { id: 'sandalwood', phrases: ['sandalwood'] },
    { id: 'fig', phrases: ['fig'] },
    { id: 'clove', phrases: ['clove', 'cloves'] },
    { id: 'nutmeg', phrases: ['nutmeg'] },
    { id: 'hay', phrases: ['hay'] },
    { id: 'maritime', phrases: ['maritime', 'sea spray', 'saline'] },
    { id: 'fresh', phrases: ['fresh', 'bright'] }
  ];

  var LEX_SORTED = FLAVOR_LEXICON.slice().sort(function (a, b) {
    var al = a.phrases[0].length;
    var bl = b.phrases[0].length;
    return bl - al;
  });

  function escapeRegexPhrase(phrase) {
    return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  var COMPILED_LEXICON = LEX_SORTED.map(function (entry) {
    return {
      id: entry.id,
      patterns: entry.phrases.slice().sort(function (a, b) { return b.length - a.length; }).map(function (phrase) {
        return new RegExp('\\b' + escapeRegexPhrase(phrase) + '\\b', 'g');
      })
    };
  });

  var CONFIG = {
    minScore: 0.55,
    minMargin: 0.1,
    multiTagBonus: 0.12,
    distinctiveProductCap: 2,
    distinctiveMinWeight: 0.85
  };

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildTagProductIndex() {
    if (tagProductIndex) return tagProductIndex;
    tagProductIndex = {};
    getScoringProducts().forEach(function (p) {
      (p.tags || []).forEach(function (t) {
        if (!tagProductIndex[t.id]) tagProductIndex[t.id] = [];
        tagProductIndex[t.id].push(p.name);
      });
    });
    return tagProductIndex;
  }

  function isDistinctiveTagInIndex(tagId, idx) {
    var list = (idx || {})[tagId] || [];
    return list.length > 0 && list.length <= CONFIG.distinctiveProductCap;
  }

  function isDistinctiveTag(tagId) {
    return isDistinctiveTagInIndex(tagId, buildTagProductIndex());
  }

  /** Longest-phrase-first extraction; no double-counting overlapping spans. */
  function parseFlavorTags(text) {
    var t = normalizeText(text);
    if (!t) return [];

    var found = [];
    var used = [];

    function spanTaken(start, end) {
      for (var i = 0; i < used.length; i++) {
        if (start < used[i].end && end > used[i].start) return true;
      }
      return false;
    }

    COMPILED_LEXICON.forEach(function (entry) {
      entry.patterns.forEach(function (re) {
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(t)) !== null) {
          var start = m.index;
          var end = start + m[0].length;
          if (!spanTaken(start, end)) {
            used.push({ start: start, end: end });
            if (found.indexOf(entry.id) === -1) found.push(entry.id);
          }
        }
      });
    });

    return found;
  }

  function inferCategoryBias(text) {
    var SPM = typeof window !== 'undefined' ? window.SterlonProductMatch : null;
    if (SPM && typeof SPM.inferCategoryBias === 'function') {
      return SPM.inferCategoryBias(text);
    }
    return null;
  }

  function isPassiveFlavorObservation(text) {
    var t = normalizeText(text);
    if (!t) return false;
    var seeking = /\b(show me|looking for|find me|give me|want|recommend|suggest|in the mood for|what should i|help me find)\b/.test(t);
    if (seeking) return false;
    if (/\b(had|have had|got|noticed|picked up|detected|found|tasted like|finishes with|finished with|opens with|opened with|on the nose|on the palate|in the glass)\b/.test(t)) {
      return true;
    }
    if (/\b(that|this|last|my)\s+(pour|cigar|smoke|glass|dram)\b/.test(t)) {
      return true;
    }
    return false;
  }

  function hasFlavorSeekingIntent(text) {
    var t = normalizeText(text);
    if (!t) return false;
    if (isPassiveFlavorObservation(text)) return false;
    if (/\b(show me|looking for|find me|give me|want something|something with|in the mood for|recommend|suggest)\b/.test(t) &&
        /\b(taste|tasting|flavor|flavour|notes?|profile|palate)\b/.test(t)) {
      return true;
    }
    if (/\b(with a hint of|notes? of|flavor of|taste of|like a|tastes like)\b/.test(t)) return true;
    if (parseFlavorTags(t).length >= 2 &&
        /\b(give me|find me|show me|want|looking for|recommend|suggest|something|anything)\b/.test(t)) {
      return true;
    }
    return false;
  }

  /**
   * Product-side tag id → member-side tag ids (from parseFlavorTags) that count as a hit.
   * Applied category-agnostically in scoreProduct for every menu SKU (spirits and cigars).
   * Shared sensory families (smoke/peat, oak/wood, etc.) intentionally cross-match across categories.
   */
  var PRODUCT_TAG_ALIASES = {
    ripe_apple: ['apple', 'ripe_apple', 'ripe_apples'],
    green_apple: ['apple', 'green_apple'],
    oak: ['oak', 'wood', 'woody', 'barrel', 'pronounced_wood'],
    wood: ['wood', 'woody', 'oak', 'pronounced_wood', 'barrel'],
    chocolate: ['chocolate', 'cocoa', 'cacao', 'dark_chocolate'],
    cocoa: ['cocoa', 'chocolate', 'cacao'],
    dark_chocolate: ['dark_chocolate', 'chocolate', 'cocoa'],
    caramel: ['caramel', 'toffee'],
    toffee: ['toffee', 'caramel', 'butterscotch'],
    smoke: ['smoke', 'smoky', 'peat'],
    peat: ['peat', 'smoke', 'smoky']
  };

  function productTagMatches(memberSet, productTagId) {
    if (memberSet[productTagId]) return true;
    var aliases = PRODUCT_TAG_ALIASES[productTagId] || [];
    for (var i = 0; i < aliases.length; i++) {
      if (memberSet[aliases[i]]) return true;
    }
    return false;
  }

  function scoreProduct(product, memberTagIds) {
    var memberSet = {};
    memberTagIds.forEach(function (id) { memberSet[id] = true; });
    var matched = [];
    var score = 0;

    (product.tags || []).forEach(function (pt) {
      if (productTagMatches(memberSet, pt.id)) {
        matched.push(pt.id);
        score += pt.weight;
      }
    });

    if (matched.length > 1) {
      score += CONFIG.multiTagBonus * (matched.length - 1);
    }

    return { score: score, matched: matched };
  }

  function scoreMenu(text, options) {
    var opts = options || {};
    var memberTags = parseFlavorTags(text);
    if (!memberTags.length) {
      return { confident: false, reason: 'no_tags', rankings: [], memberTags: [] };
    }

    var bias = opts.category || inferCategoryBias(text);
    var products = getScoringProducts().filter(function (p) {
      if (bias && p.category !== bias) return false;
      if (opts.category === 'spirit' || opts.category === 'cigar') return p.category === opts.category;
      return true;
    });

    var rankings = products.map(function (p) {
      var result = scoreProduct(p, memberTags);
      return {
        product: p,
        name: p.name,
        category: p.category,
        deckKey: p.deckKey,
        score: result.score,
        matched: result.matched
      };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    if (!rankings.length) {
      return { confident: false, reason: 'no_match', rankings: [], memberTags: memberTags };
    }

    var top = rankings[0];
    var second = rankings[1];
    var margin = second ? (top.score - second.score) / Math.max(top.score, 0.001) : 1;
    var tagIndex = buildTagProductIndex();

    var distinctiveHit = top.matched.some(function (tagId) {
      return isDistinctiveTagInIndex(tagId, tagIndex) &&
        top.product.tags.some(function (pt) { return pt.id === tagId && pt.weight >= CONFIG.distinctiveMinWeight; });
    });

    var threshold = CONFIG.minScore;
    if (distinctiveHit && memberTags.length === 1) threshold = 0.45;
    if (memberTags.length >= 2) threshold = Math.min(threshold, 0.5);

    var confident = top.score >= threshold && margin >= CONFIG.minMargin;

    if (!confident && distinctiveHit && top.score >= 0.45 && (!second || margin >= 0.2)) {
      confident = true;
    }

    return {
      confident: confident,
      reason: confident ? 'ok' : 'low_margin_or_score',
      winner: confident ? top : null,
      runnerUp: second || null,
      margin: margin,
      rankings: rankings,
      memberTags: memberTags
    };
  }

  function findProductByName(name) {
    return getScoringProducts().find(function (p) { return p.name === name; }) || null;
  }

  function buildFlavorLeadProse(winner, memberTags) {
    if (!winner || !winner.product) return '';
    var p = winner.product;
    var tags = memberTags || winner.matched || [];
    var tagPhrase = tags.slice(0, 3).join(', ').replace(/_/g, ' ');
    var fh = p.presentation && p.presentation.flavorHero;
    if (fh) {
      if (tags.indexOf('caramel') !== -1 && (tags.indexOf('chocolate') !== -1 || tags.indexOf('cocoa') !== -1) && fh.caramelChocolate) {
        return fh.caramelChocolate;
      }
      if ((tags.indexOf('ripe_apple') !== -1 || tags.indexOf('apple') !== -1) && fh.appleOrchard) {
        return fh.appleOrchard;
      }
      if ((tags.indexOf('wood') !== -1 || tags.indexOf('oak') !== -1 || tags.indexOf('pronounced_wood') !== -1) && fh.woodOak) {
        return fh.woodOak;
      }
    }
    return 'For ' + (tagPhrase || 'that profile') + ', my pick is the ' + p.name + '.';
  }

  function applySpiritHeroToCards(cards, winner, options) {
    if (!winner || !winner.product || winner.product.category !== 'spirit') return cards;
    var p = winner.product;
    var opts = options || {};
    var next = cards.slice();
    var best = Object.assign({}, next[0] || {});
    best.spirit = p.name;
    if (winner.matched && winner.matched.length) {
      var RB = global.RecommendationRationale;
      var RRtm = global.RecommendationRuntime;
      var atoms = RB && typeof RB.buildRationaleAtoms === 'function' ? RB.buildRationaleAtoms(best.cigar, best.spirit, best.food) : [];
      var rowFallback = (best.why || []).slice();
      if (RRtm && typeof RRtm.renderWhyBullets === 'function') {
        best.why = RRtm.renderWhyBullets(atoms, rowFallback);
      } else {
        var bridge = winner.matched.slice(0, 2).map(function (t) { return t.replace(/_/g, ' '); }).join(' and ');
        best.why = [
          'Your ' + bridge + ' lane maps cleanly to this pour.',
          'Body stays full without crowding the cigar.',
          'Finish stays long and composed between sips.'
        ];
      }
    }
    next[0] = best;
    return next;
  }

  function shouldAttemptFlavorRoute(text) {
    if (isPassiveFlavorObservation(text)) return false;
    var tags = parseFlavorTags(text);
    if (!tags.length) return false;
    if (hasFlavorSeekingIntent(text)) return true;
    var idx = buildTagProductIndex();
    return tags.some(function (id) { return isDistinctiveTagInIndex(id, idx); });
  }

  function resolveFlavorRoute(text, options) {
    if (!shouldAttemptFlavorRoute(text)) return null;
    var WJ = global.WhiskeyJourney;
    if (WJ && WJ.isNovicePalate && WJ.isNovicePalate(text)) {
      return null;
    }
    var result = scoreMenu(text, options);
    if (!result.confident || !result.winner) return null;
    if (WJ && WJ.isAdvancedProduct && WJ.isAdvancedProduct(result.winner.product)) {
      if (WJ.isNovicePalate && WJ.isNovicePalate(text)) return null;
    }
    return {
      product: result.winner.product,
      name: result.winner.name,
      category: result.winner.category,
      deckKey: result.winner.deckKey,
      score: result.winner.score,
      matched: result.winner.matched,
      memberTags: result.memberTags,
      rankings: result.rankings
    };
  }

  function getProductSpec(name) {
    var p = findProductByName(name);
    if (!p || !p.spec) return null;
    return Object.assign({}, p.spec);
  }

  /** Prose for proof / mash / style expertise turns. */
  function buildSpecProse(productName, options) {
    var spec = getProductSpec(productName);
    if (!spec) return null;
    var label = productName;
    var opts = options || {};
    if (opts.shortLabel) label = opts.shortLabel;
    var parts = [];
    if (spec.proof != null) {
      var proofLine = label + ' is bottled at ' + spec.proof + ' proof';
      if (spec.abvPercent != null) proofLine += ' (' + spec.abvPercent + '% ABV)';
      parts.push(proofLine + '.');
    }
    if (spec.mash) parts.push('It is distilled from a ' + spec.mash.toLowerCase() + ' bill.');
    if (spec.style) {
      var styleLine = 'On the label it is classified as ' + spec.style.toLowerCase();
      if (spec.origin) styleLine += ' from ' + spec.origin;
      parts.push(styleLine + '.');
    }
    return parts.join(' ');
  }

  function getProductAwards(name) {
    var p = findProductByName(name);
    if (!p || !p.awards || !p.awards.length) return null;
    return p.awards.slice();
  }

  function formatAwardLine(award) {
    var line = award.result;
    if (award.detail) line += ' (' + award.detail + ')';
    line += ' — ' + award.organization;
    return line;
  }

  /** Prose block for Sterlon awards expertise turns (newest year first). */
  function buildAwardsProse(productName, options) {
    var awards = getProductAwards(productName);
    if (!awards || !awards.length) return null;
    var label = productName;
    var opts = options || {};
    if (opts.shortLabel) label = opts.shortLabel;
    var byYear = {};
    awards.forEach(function (a) {
      if (!byYear[a.year]) byYear[a.year] = [];
      byYear[a.year].push(a);
    });
    var years = Object.keys(byYear).map(Number).sort(function (a, b) { return b - a; });
    var sentences = [];
    years.forEach(function (year, idx) {
      var items = byYear[year];
      var lines = items.map(formatAwardLine);
      if (idx === 0) {
        sentences.push('In ' + year + ', ' + lines.join('; ') + '.');
      } else {
        sentences.push(year + ' also brought ' + lines.join('; ') + '.');
      }
    });
    return label + ' has serious competition pedigree on record. ' + sentences.join(' ');
  }

  global.SterlonFlavorMatch = {
    CONFIG: CONFIG,
    FLAVOR_LEXICON: FLAVOR_LEXICON,
    parseFlavorTags: parseFlavorTags,
    hasFlavorSeekingIntent: hasFlavorSeekingIntent,
    shouldAttemptFlavorRoute: shouldAttemptFlavorRoute,
    inferCategoryBias: inferCategoryBias,
    scoreMenu: scoreMenu,
    resolveFlavorRoute: resolveFlavorRoute,
    buildFlavorLeadProse: buildFlavorLeadProse,
    applySpiritHeroToCards: applySpiritHeroToCards,
    findProductByName: findProductByName,
    getProductSpec: getProductSpec,
    buildSpecProse: buildSpecProse,
    getProductAwards: getProductAwards,
    buildAwardsProse: buildAwardsProse,
    getCatalog: function () {
      return { products: getScoringProducts() };
    },
    invalidateProductIndex: invalidateProductIndex
  };
})(typeof window !== 'undefined' ? window : global);
