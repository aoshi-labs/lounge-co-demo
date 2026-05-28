/**
 * Bourbon whiskey journey — experience levels for menu spirits (Van Winkle framing).
 * Canonical copy inspired by Buffalo Trace Van Winkle "Whiskey Journey" UX.
 * Product level assignments live on MenuFlavorCatalog SKUs (journeyLevel).
 */
(function (global) {
  'use strict';

  var LEVELS = [
    {
      id: 'novice',
      label: 'Novice',
      description:
        'Approachable pours — softer sweetness, less barrel aggression, easier to sip while you learn what you like.'
    },
    {
      id: 'intermediate',
      label: 'Intermediate',
      description:
        'More assertive flavor — spice, rye heat, or deeper oak without the long-aged intensity of the top shelf.'
    },
    {
      id: 'advanced',
      label: 'Advanced',
      description:
        'Long-aged, highly allocated, or structurally complex bourbons — the pours collectors chase and connoisseurs sit with.'
    }
  ];

  var INTRO =
    'New to whiskey? Start closer to Novice. If you\'re a seasoned pro, head for Advanced. It\'s your journey — enjoy it.';

  var NOVICE_RE = /\b(new to (?:bourbon|whiskey|whisky)|(?:bourbon|whiskey|whisky) beginner|never tried (?:bourbon|whiskey|whisky)|first (?:bourbon|whiskey|whisky)|just starting (?:with )?(?:bourbon|whiskey|whisky)|(?:bourbon|whiskey|whisky) novice|don'?t know (?:bourbon|whiskey|whisky)|haven'?t had much (?:bourbon|whiskey|whisky)|start (?:at |on )?novice)\b/;
  var INTERMEDIATE_RE = /\b(intermediate|comfortable with (?:bourbon|whiskey|whisky)|know my way around (?:bourbon|whiskey|whisky)|past the basics)\b/;
  var ADVANCED_RE = /\b(seasoned pro|(?:bourbon|whiskey|whisky) veteran|advanced|allocated bourbon|dusty bottle|connoisseur pour)\b/;
  var JOURNEY_RE = /\b(whiskey journey|whisky journey|bourbon journey|where (?:does|do) .+ sit on the journey|journey level)\b/;

  function getCatalog() {
    return global.MenuFlavorCatalog || null;
  }

  function detectLevelFromPrompt(text) {
    var t = (text || '').toLowerCase();
    if (ADVANCED_RE.test(t)) return 'advanced';
    if (NOVICE_RE.test(t)) return 'novice';
    if (INTERMEDIATE_RE.test(t)) return 'intermediate';
    if (/\bnovice\b/.test(t) && /\bbourbon|whiskey|whisky\b/.test(t)) return 'novice';
    if (/\badvanced\b/.test(t) && /\bbourbon|whiskey|whisky\b/.test(t)) return 'advanced';
    if (/\b(beginner|first timer|just getting into)\b/.test(t) && /\b(bourbon|whiskey|whisky|pour|dram)\b/.test(t)) {
      return 'novice';
    }
    return null;
  }

  function isNovicePalate(text) {
    return detectLevelFromPrompt(text) === 'novice';
  }

  function isAdvancedProduct(product) {
    return !!(product && product.journeyLevel === 'advanced');
  }

  function isJourneyTopic(text) {
    var t = (text || '').toLowerCase();
    return JOURNEY_RE.test(t) || !!detectLevelFromPrompt(t);
  }

  function levelMeta(levelId) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].id === levelId) return LEVELS[i];
    }
    return null;
  }

  /** Spirits on the venue menu for a journey level (bourbon family first). */
  function getSpiritsForLevel(levelId) {
    var lp = global.LoungeProducts;
    var products = lp && lp.spirits ? lp.spirits.slice() : [];
    if (!products.length) {
      var catalog = getCatalog();
      if (catalog && typeof catalog.getProducts === 'function') {
        products = catalog.getProducts();
      } else if (catalog && catalog.products) {
        products = catalog.products;
      }
    }
    return products.filter(function (p) {
      return p.category === 'spirit' && p.journeyLevel === levelId;
    });
  }

  function pickHeroSpirit(levelId, deckKey) {
    var spirits = getSpiritsForLevel(levelId);
    if (!spirits.length) return null;
    if (deckKey) {
      var deckMatches = spirits.filter(function (p) {
        return p.deckKey === deckKey;
      });
      if (deckMatches.length) spirits = deckMatches;
    }
    spirits.sort(function (a, b) {
      return (b.journeyRank || 0) - (a.journeyRank || 0);
    });
    if (levelId === 'novice') {
      spirits.sort(function (a, b) {
        return (a.journeyRank || 0) - (b.journeyRank || 0);
      });
    }
    return spirits[0];
  }

  function buildFrameworkProse() {
    var parts = [INTRO];
    LEVELS.forEach(function (lv) {
      parts.push(lv.label + ' — ' + lv.description);
    });
    return parts.join('\n\n');
  }

  function buildProductJourneyProse(productName, options) {
    var catalog = getCatalog();
    if (!catalog) return null;
    var opts = options || {};
    var label = opts.shortLabel || productName;
    var product = catalog.products.find(function (p) {
      return p.name === productName;
    });
    if (!product || !product.journeyLevel) return null;
    var lv = levelMeta(product.journeyLevel);
    if (!lv) return null;

    var prose =
      label + ' sits on the ' + lv.label + ' end of the whiskey journey — ' + lv.description;

    var novice = pickHeroSpirit('novice');
    var advanced = pickHeroSpirit('advanced');
    if (product.journeyLevel === 'advanced' && novice) {
      prose +=
        ' New to whiskey? Start closer to Novice on our rail — ' +
        novice.name +
        ' is the natural first stop.';
    }
    if (product.journeyLevel === 'novice' && advanced) {
      prose +=
        ' When you are ready for the Advanced lane, ' +
        advanced.name +
        ' is where seasoned members usually land.';
    }
    prose += ' It\'s your journey — enjoy it.';
    return prose;
  }

  /** Never let Advanced SKUs stay on the best card for a novice palate. */
  function enforceNoviceCap(cards, deckKey) {
    if (!cards || !cards.length) return cards;
    var best = cards[0];
    if (!best || (!best.spirit && !best.spiritId)) return cards;
    var product = null;
    var lp = global.LoungeProducts;
    if (best.spiritId && lp && typeof lp.getSpiritById === 'function') {
      product = lp.getSpiritById(best.spiritId);
    }
    if (!product) {
      var catalog = getCatalog();
      if (!catalog) return cards;
      product = catalog.products.find(function (p) {
        return p.name === best.spirit;
      });
    }
    if (!isAdvancedProduct(product)) return cards;
    return applyJourneyHeroToCards(cards, 'novice', deckKey);
  }

  function applyJourneyHeroToCards(cards, levelId, deckKey) {
    if (!levelId || !cards || !cards.length) return cards;
    var hero = pickHeroSpirit(levelId, deckKey);
    if (!hero) return cards;
    var next = cards.slice();
    var best = Object.assign({}, next[0] || {});
    best.spirit = hero.name;
    best.spiritId = hero.id || best.spiritId;
    var lv = levelMeta(levelId);
    best.why = [
      lv ? lv.label + ' lane on the whiskey journey — ' + hero.name + ' fits where you are tonight.' : hero.name + ' fits your journey level tonight.',
      'Body stays balanced beside the cigar without rushing the glass.',
      'Room to explore up or down the journey on the next pour.'
    ];
    next[0] = best;
    return next;
  }

  global.WhiskeyJourney = {
    INTRO: INTRO,
    LEVELS: LEVELS,
    detectLevelFromPrompt: detectLevelFromPrompt,
    isNovicePalate: isNovicePalate,
    isAdvancedProduct: isAdvancedProduct,
    enforceNoviceCap: enforceNoviceCap,
    isJourneyTopic: isJourneyTopic,
    levelMeta: levelMeta,
    getSpiritsForLevel: getSpiritsForLevel,
    pickHeroSpirit: pickHeroSpirit,
    buildFrameworkProse: buildFrameworkProse,
    buildProductJourneyProse: buildProductJourneyProse,
    applyJourneyHeroToCards: applyJourneyHeroToCards
  };
})(typeof window !== 'undefined' ? window : global);
