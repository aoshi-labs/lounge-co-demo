/**
 * SpiritDeckKey — canonical deck inference, prompt routing, ontology validation.
 * Pure data policy; no DOM or session state.
 */
(function (global) {
  'use strict';

  var VALID_DECK_KEYS = [
    'bourbon',
    'rye',
    'scotch',
    'peated',
    'japanese',
    'rum',
    'cognac',
    'agave',
    'vodka',
    'irish'
  ];

  var PROMPT_DECK_PATTERNS = [
    { re: /\b(vodka)\b/i, key: 'vodka' },
    { re: /\b(cognac|hennessy|remy martin|rémy martin|armagnac)\b/i, key: 'cognac' },
    { re: /\b(irish whiskey|irish whisky|jameson|redbreast|green spot)\b/i, key: 'irish' },
    { re: /\b(tequila|mezcal|reposado|añejo|anejo|agave spirit|don julio|clase azul|casamigos)\b/i, key: 'agave' },
    { re: /\b(rum|rhum|diplomatico|zacapa|plantation rum)\b/i, key: 'rum' },
    { re: /\b(japanese whisky|japanese whiskey|hibiki|yamazaki|nikka)\b/i, key: 'japanese' },
    { re: /\b(islay|peated|peaty|lagavulin|laphroaig|ardbeg)\b/i, key: 'peated' },
    { re: /\b(scotch|single malt|speyside|macallan|glenfiddich|johnnie walker)\b/i, key: 'scotch' },
    { re: /\b(rye whiskey|rye whisky|straight rye|whistlepig|rittenhouse|sazerac rye)\b/i, key: 'rye' },
    { re: /\b(bourbon|wheated|buffalo trace|pappy|blanton|weller|woodford|maker'?s mark)\b/i, key: 'bourbon' }
  ];

  var STYLE_RULES = [
    { re: /\b(vodka)\b/i, key: 'vodka' },
    { re: /\b(cognac|brandy)\b/i, key: 'cognac' },
    { re: /\b(irish whiskey|irish whisky)\b/i, key: 'irish' },
    { re: /\b(tequila|mezcal|agave)\b/i, key: 'agave' },
    { re: /\b(rum|rhum)\b/i, key: 'rum' },
    { re: /\b(japanese whisky|japanese whiskey)\b/i, key: 'japanese' },
    { re: /\b(islay|peated)\b/i, key: 'peated' },
    { re: /\b(scotch|single malt|blended scotch)\b/i, key: 'scotch' },
    { re: /\b(straight rye|rye whiskey|rye whisky)\b/i, key: 'rye' },
    { re: /\b(bourbon|tennessee whiskey|kentucky straight)\b/i, key: 'bourbon' }
  ];

  var NAME_OVERRIDES = {
    'lagavulin 16': 'peated',
    'lagavulin 8 year': 'peated',
    'ardbeg 10': 'peated',
    'laphroaig 10 year': 'peated',
    'talisker 10 year': 'peated',
    'hibiki harmony': 'japanese',
    'yamazaki 12': 'japanese',
    'nikka from the barrel': 'japanese',
    'nikka coffey grain whisky': 'japanese',
    'hakushu 12 year': 'japanese',
    'mars iwai tradition': 'japanese',
    'martell blue swift': 'cognac',
    "hendrick's gin": 'vodka',
    'tanqueray no. ten': 'vodka',
    'hennessy vs': 'cognac',
    'hennessy xo': 'cognac',
    'rémy martin xo': 'cognac',
    'jameson irish whiskey': 'irish',
    "tito's handmade vodka": 'vodka',
    'smirnoff no. 21 vodka': 'vodka',
    'new amsterdam vodka': 'vodka'
  };

  var DECK_INCOMPATIBLE = {
    bourbon: /\b(cognac|vodka|tequila|mezcal|rum|scotch|irish whiskey)\b/i,
    cognac: /\b(bourbon|vodka|tequila|rum|scotch whiskey)\b/i,
    vodka: /\b(bourbon|cognac|tequila|rum|scotch|whiskey)\b/i,
    rum: /\b(bourbon|cognac|vodka|tequila|scotch)\b/i,
    scotch: /\b(bourbon|cognac|vodka|tequila|rum)\b/i,
    agave: /\b(bourbon|cognac|vodka|rum|scotch)\b/i,
    irish: /\b(bourbon|cognac|vodka|tequila|rum)\b/i,
    rye: /\b(cognac|vodka|tequila|rum|scotch)\b/i,
    japanese: /\b(bourbon|cognac|vodka|tequila|rum)\b/i,
    peated: /\b(bourbon|cognac|vodka|tequila|rum)\b/i
  };

  function normalizeName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function inferDeckKeyFromProduct(product) {
    if (!product) return null;
    var nameKey = normalizeName(product.name);
    if (NAME_OVERRIDES[nameKey]) return NAME_OVERRIDES[nameKey];
    if (product.deckKey && VALID_DECK_KEYS.indexOf(product.deckKey) !== -1) {
      var style = (product.spec && product.spec.style) || '';
      var blob = nameKey + ' ' + style.toLowerCase();
      for (var i = 0; i < STYLE_RULES.length; i++) {
        if (STYLE_RULES[i].re.test(blob)) return STYLE_RULES[i].key;
      }
      return product.deckKey;
    }
    var styleOnly = (product.spec && product.spec.style) || '';
    var blob2 = nameKey + ' ' + String(styleOnly).toLowerCase();
    for (var j = 0; j < STYLE_RULES.length; j++) {
      if (STYLE_RULES[j].re.test(blob2)) return STYLE_RULES[j].key;
    }
    return 'bourbon';
  }

  function inferDeckKeyFromPrompt(text, opts) {
    var o = opts || {};
    if (o.categoryFocus === 'cigar') return o.sessionDeckKey || null;
    var t = String(text || '');
    for (var i = 0; i < PROMPT_DECK_PATTERNS.length; i++) {
      if (PROMPT_DECK_PATTERNS[i].re.test(t)) return PROMPT_DECK_PATTERNS[i].key;
    }
    if (o.sessionDeckKey) return o.sessionDeckKey;
    if (o.flavorRouteDeckKey) return o.flavorRouteDeckKey;
    return null;
  }

  function spiritMatchesDeck(spirit, deckKey) {
    if (!deckKey) return true;
    return spirit && spirit.deckKey === deckKey;
  }

  function validateSpiritProduct(product) {
    var issues = [];
    if (!product || product.category !== 'spirit') return issues;
    var deck = inferDeckKeyFromProduct(product);
    if (product.deckKey && product.deckKey !== deck) {
      issues.push({
        code: 'deckKey_mismatch',
        name: product.name,
        stored: product.deckKey,
        expected: deck
      });
    }
    var style = ((product.spec && product.spec.style) || '').toLowerCase();
    var nameKey = normalizeName(product.name);
    var blob = nameKey + ' ' + style;
    var bad = DECK_INCOMPATIBLE[deck];
    if (bad && bad.test(blob) && nameKey !== 'martell blue swift') {
      issues.push({ code: 'deck_category_conflict', name: product.name, deckKey: deck });
    }
    var rank = product.journeyRank;
    if (rank != null && rank > 30) {
      issues.push({ code: 'journeyRank_corrupt', name: product.name, journeyRank: rank });
    }
    var msrp = product.spec && product.spec.msrp;
    if (msrp != null && (msrp < 0 || msrp > 5000)) {
      issues.push({ code: 'msrp_invalid', name: product.name, msrp: msrp });
    }
    if (!product.tags || !product.tags.length) {
      issues.push({ code: 'tags_missing', name: product.name });
    }
    return issues;
  }

  function validateSpiritCatalog(spirits) {
    var all = [];
    (spirits || []).forEach(function (s) {
      validateSpiritProduct(s).forEach(function (issue) {
        all.push(issue);
      });
    });
    return all;
  }

  function isBourbonPrompt(text) {
    return /\b(bourbon|wheated|pappy|blanton|buffalo trace|weller)\b/i.test(text || '');
  }

  function spiritInDeckFamily(spirit, deckKey) {
    if (!spirit || !deckKey) return true;
    return spirit.deckKey === deckKey;
  }

  global.SpiritDeckKey = {
    VALID_DECK_KEYS: VALID_DECK_KEYS,
    inferDeckKeyFromProduct: inferDeckKeyFromProduct,
    inferDeckKeyFromPrompt: inferDeckKeyFromPrompt,
    validateSpiritProduct: validateSpiritProduct,
    validateSpiritCatalog: validateSpiritCatalog,
    spiritMatchesDeck: spiritMatchesDeck,
    isBourbonPrompt: isBourbonPrompt,
    spiritInDeckFamily: spiritInDeckFamily
  };
})(typeof window !== 'undefined' ? window : global);
