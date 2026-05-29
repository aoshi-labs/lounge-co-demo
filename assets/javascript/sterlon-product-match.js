/* ──────────────────────────────────────────────────────────────────────
   sterlon-product-match.js — shared product name / alias / off-menu matching.

   Canonical alias table and off-menu spirit detection. SterlonRecommendations
   and SterlonChatRouter delegate here to avoid duplicate matchers.
   ────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  var g = global;

  var PRODUCT_NAME_ALIASES = [
    { pattern: /\bpappy\b|\bvan winkle\b/, name: 'Pappy Van Winkle 23yr', category: 'spirit' },
    { pattern: /\bblanton'?s?\b/, name: "Blanton's Single Barrel", category: 'spirit' },
    { pattern: /\bbuffalo trace\b/, name: 'Buffalo Trace', category: 'spirit' },
    { pattern: /\bwoodford\b/, name: 'Woodford Reserve', category: 'spirit' },
    { pattern: /\beagle rare\b/, name: 'Eagle Rare 10yr', category: 'spirit' },
    { pattern: /\bcasamigos\b/, name: 'Casamigos Reposado', category: 'spirit' },
    { pattern: /\bwhistlepig\b|\bwhistle pig\b/, name: 'WhistlePig 10yr', category: 'spirit' },
    { pattern: /\bsazerac\b/, name: 'Sazerac Rye', category: 'spirit' },
    { pattern: /\bmacallan\b/, name: 'Macallan 12', category: 'spirit' },
    { pattern: /\blagavulin\b/, name: 'Lagavulin 16', category: 'spirit' },
    { pattern: /\bglenfiddich\b/, name: 'Glenfiddich 12', category: 'spirit' },
    { pattern: /\bjohnnie walker blue\b|\bjw blue\b/, name: 'Johnnie Walker Blue', category: 'spirit' },
    { pattern: /\bhibiki\b/, name: 'Hibiki Harmony', category: 'spirit' },
    { pattern: /\byamazaki\b/, name: 'Yamazaki 12', category: 'spirit' },
    { pattern: /\bdiplomatico\b/, name: 'Diplomatico Reserva Exclusiva', category: 'spirit' },
    { pattern: /\bzacapa\b/, name: 'Zacapa 23', category: 'spirit' },
    { pattern: /\bhennessy\s*xo\b/i, name: 'Hennessy XO', category: 'spirit' },
    { pattern: /\bhennessy\b/, name: 'Hennessy VS', category: 'spirit' },
    { pattern: /\bfuente\s+hemingway\b|\bhemingway\s+(short\s+story|perfecto)\b/i, name: 'Arturo Fuente Hemingway Short Story', category: 'cigar' },
    { pattern: /\bopus\s*x\b|\bopusx\b/, name: 'Arturo Fuente Opus X', category: 'cigar' },
    { pattern: /\barturo fuente\b|\bfuente\b/, name: 'Arturo Fuente Don Carlos Personal Reserve', category: 'cigar' },
    { pattern: /\bpadron\s*1926\s*no\.?\s*35\b/i, name: 'Padron 1926 No. 35', category: 'cigar' },
    { pattern: /\bpadron\s*1964\b|\bpadron\s*64\b/, name: 'Padron 1964 Anniversary Exclusivo', category: 'cigar' },
    { pattern: /\bpadron\s*1926\b|\bpadron\s*26\b|\bpadron\s*35\b/, name: 'Padron 1926 Series No. 35', category: 'cigar' },
    { pattern: /\bpadron\s*2000\b/, name: 'Padron 2000 Robusto', category: 'cigar' },
    { pattern: /\boliva\s*v\b|\boliva serie v\b/, name: 'Oliva Serie V Double Robusto / Torpedo / Toro', category: 'cigar' },
    { pattern: /\bliga privada h99\b/, name: 'Liga Privada H99', category: 'cigar' },
    { pattern: /\bliga privada\b/, name: 'Liga Privada No. 9', category: 'cigar' },
    { pattern: /\bmy father\s*(the judge)?\b|\bthe judge\b/, name: 'My Father The Judge Toro', category: 'cigar' },
    { pattern: /\bmy father\b|\ble bijou\b/, name: 'My Father Le Bijou 1922', category: 'cigar' },
    { pattern: /\bmontecristo\s*(no\.?\s*2)?\b|\bmonte white\b|\bwhite monte\b/, name: 'Montecristo White Series Toro / Rothchilde / Churchill', category: 'cigar' },
    { pattern: /\bmontecristo\b/, name: 'Montecristo No. 2', category: 'cigar' },
    { pattern: /\bcohiba\s+ambar\b/i, name: 'The Cohiba Ambar', category: 'cigar' },
    { pattern: /\bcohiba\s*(piramides|pyramides|dom|dominican|red dot)\b|\bsiglo\b/, name: 'Cohiba Siglo VI', category: 'cigar' },
    { pattern: /\brj\b|\bromeo y julieta\b|\bromeo julieta\b/, name: 'Romeo y Julieta Reserva Real Churchill', category: 'cigar' },
    { pattern: /\bdavidoff\b/, name: 'Davidoff No. 2', category: 'cigar' },
    { pattern: /\bashton\s+vsg\b/i, name: 'Ashton VSG Torpedo', category: 'cigar' },
    { pattern: /\bep carrillo\b|\be\.?p\.?\s*carrillo\b/, name: 'E.P. Carrillo Encore Majestic', category: 'cigar' },
    { pattern: /\bdon carlos\b/, name: 'Arturo Fuente Don Carlos Personal Reserve', category: 'cigar' },
    { pattern: /\bmacanudo\b/, name: 'Macanudo Cafe Robusto / Hyde Park', category: 'cigar' },
    { pattern: /\bla flor dominicana\b|\blfd\b/, name: 'La Flor Dominicana Double Ligero Chisel / Robusto / Toro', category: 'cigar' },
    { pattern: /\bla aroma de cuba\b|\baroma de cuba\b/, name: 'La Aroma de Cuba Mi Amor Robusto', category: 'cigar' },
    { pattern: /\bpartagas\b/, name: 'Partagás Lusitania', category: 'cigar' },
    { pattern: /\bvegas robaina\b/, name: 'Vegas Robaina Vegas Robaina Unicos', category: 'cigar' },
    { pattern: /\bhoyo\b/, name: 'Hoyo de Monterrey Epicure Epicure No. 2', category: 'cigar' },
    { pattern: /\bcohiba\b(?!\s+ambar)/i, name: 'Cohiba Siglo VI', category: 'cigar', _broad: true }
  ];

  PRODUCT_NAME_ALIASES.sort(function (a, b) {
    var ba = a._broad ? 1 : 0;
    var bb = b._broad ? 1 : 0;
    if (ba !== bb) return ba - bb;
    return 0;
  });

  function resolveAlias(text) {
    var t = (text || '').toLowerCase();
    for (var j = 0; j < PRODUCT_NAME_ALIASES.length; j += 1) {
      var alias = PRODUCT_NAME_ALIASES[j];
      if (alias.pattern.test(t)) return { name: alias.name, category: alias.category };
    }
    return null;
  }

  function matchOffMenuProductInText(text) {
    var t = (text || '').toLowerCase();
    if (/\bchivas\b/.test(t)) return { name: 'Chivas 18', category: 'spirit' };
    if (/\bhibiki\s*(21|30)\b/.test(t)) return { name: 'Hibiki 30', category: 'spirit' };
    if (/\bjohnnie walker blue\b|\bblue label\b/.test(t)) return { name: 'Johnnie Walker Blue', category: 'spirit' };
    if (/\bcrown royal\b/.test(t)) return { name: 'Crown Royal', category: 'spirit' };
    return null;
  }

  function matchOffMenuCigarInText(text) {
    var t = (text || '').toLowerCase();
    if (/\bla gloria\b|\bgloria cubana\b/.test(t)) {
      return { name: /\bestel[ií]\b/.test(t) ? 'La Gloria Cubana Esteli' : 'La Gloria Cubana', category: 'cigar' };
    }
    if (/\bromeo y julieta\b|\bryj\b/.test(t)) return { name: 'Romeo y Julieta', category: 'cigar' };
    if (/\bpartagas\b/.test(t)) return { name: 'Partagas', category: 'cigar' };
    return null;
  }

  function productExists(category, name) {
    var LP = g.LoungeProducts;
    if (!LP || !name) return false;
    if (category === 'spirit' && typeof LP.findSpiritByName === 'function') return !!LP.findSpiritByName(name);
    if (category === 'cigar' && typeof LP.findCigarByName === 'function') return !!LP.findCigarByName(name);
    return false;
  }

  function detectUnavailableDemoProduct(text) {
    var spirit = matchOffMenuProductInText(text);
    if (spirit && !productExists('spirit', spirit.name)) return spirit;
    var cigar = matchOffMenuCigarInText(text);
    if (cigar && !productExists('cigar', cigar.name)) return cigar;
    var alias = resolveAlias(text);
    if (alias && !productExists(alias.category, alias.name)) {
      return { name: alias.name, category: alias.category };
    }
    return null;
  }

  function matchAliasInText(text) {
    return resolveAlias(text);
  }

  /** Prompt patterns → canonical deckKey (aligned with SpiritDeckKey). */
  var SPIRIT_CATEGORY_PATTERNS = [
    { re: /\b(islay|peated peat|smoky scotch|peaty scotch|peaty whisky)\b/i, deckKey: 'peated' },
    { re: /\b(scotch|single malt|blended scotch|speyside|highland|lowland)\b/i, deckKey: 'scotch' },
    { re: /\b(japanese whisky|japanese whiskey|japanese spirit)\b/i, deckKey: 'japanese' },
    { re: /\b(rye whiskey|rye whisky|straight rye)\b/i, deckKey: 'rye' },
    { re: /\b(cognac|armagnac|v\.?s\.?o\.?p|x\.?o\b)/i, deckKey: 'cognac' },
    { re: /\b(rum|rhum|dark rum|aged rum|caribbean rum)\b/i, deckKey: 'rum' },
    { re: /\b(tequila|mezcal|agave spirit|reposado|anejo|añejo)\b/i, deckKey: 'agave' },
    { re: /\b(vodka)\b/i, deckKey: 'vodka' },
    { re: /\b(irish whiskey|irish whisky)\b/i, deckKey: 'irish' },
    { re: /\b(bourbon|kentucky straight bourbon|wheated bourbon)\b/i, deckKey: 'bourbon' }
  ];

  function pickSpiritFromDeck(deckKey, text) {
    var LP = g.LoungeProducts;
    if (!LP || !LP.spirits || !deckKey) return null;
    var WJ = g.WhiskeyJourney;
    var level = WJ && WJ.detectLevelFromPrompt ? WJ.detectLevelFromPrompt(text) : null;
    var candidates = LP.spirits.filter(function (s) {
      return s.category === 'spirit' && s.deckKey === deckKey;
    });
    if (!candidates.length) return null;
    if (level) {
      var tier = candidates.filter(function (s) {
        return s.journeyLevel === level;
      });
      if (tier.length) candidates = tier;
    }
    candidates.sort(function (a, b) {
      return (a.journeyRank || 99) - (b.journeyRank || 99);
    });
    var names = candidates.map(function (s) {
      return s.name;
    });
    var D = g.RecommendationDiversity;
    if (D && typeof D.pickRotatingFromSorted === 'function') {
      return D.pickRotatingFromSorted(names, text);
    }
    return names[0];
  }

  /**
   * Resolve the spirit the user is referencing — by brand name/alias first,
   * then by spirit category keyword. Returns the catalog spirit name or null.
   *
   * Used by build-set.js to pick an anchor spirit from the prompt before
   * falling back to flavor-route or journey hero.
   */
  function resolveNamedSpiritId(text) {
    var IM = g.RecommendationIntentMatch;
    if (IM && typeof IM.resolveNamedSpiritId === 'function') {
      return IM.resolveNamedSpiritId(text);
    }
    return null;
  }

  function resolveNamedSpirit(text) {
    var id = resolveNamedSpiritId(text);
    var LP = g.LoungeProducts;
    var PIDs = g.RecommendationProductIds;
    if (id && PIDs) return PIDs.displayNameForId('spirit', id) || null;
    if (id && LP && typeof LP.getSpiritById === 'function') {
      var p = LP.getSpiritById(id);
      return p && p.name ? p.name : null;
    }
    return null;
  }

  function resolveNamedCigarId(text) {
    var IM = g.RecommendationIntentMatch;
    if (IM && typeof IM.resolveNamedCigarId === 'function') {
      return IM.resolveNamedCigarId(text);
    }
    return null;
  }

  function resolveNamedCigar(text) {
    var id = resolveNamedCigarId(text);
    var LP = g.LoungeProducts;
    var PIDs = g.RecommendationProductIds;
    if (id && PIDs) return PIDs.displayNameForId('cigar', id) || null;
    if (id && LP && typeof LP.getCigarById === 'function') {
      var p = LP.getCigarById(id);
      return p && p.name ? p.name : null;
    }
    return null;
  }

  function inferCategoryBias(text) {
    var t = (text || '').toLowerCase();
    var pairingIntent = /\b(pair|pairs|pairing|goes with|works with|what to pair)\b/.test(t);

    if (pairingIntent) {
      if (/\b(what|which)\s+cigar\b/.test(t) || /\bwhich cigar\b/.test(t) ||
          /\b(recommend|suggest)\s+(a\s+)?cigar\b/.test(t)) {
        return 'cigar';
      }
      if (/\b(what|which)\s+(spirit|whisky|whiskey|bourbon|scotch|pour|dram)\b/.test(t) ||
          /\bwhat\s+(should i )?(pour|drink)\b/.test(t)) {
        return 'spirit';
      }
    }

    if (
      /\b(cigar|cigars|smoke|smoking|maduro|connecticut|corojo|habano|toro|robusto|figurado|wrapper)\b/.test(t) &&
      !/\b(whisky|whiskey|bourbon|scotch|pour|spirit|dram|glass)\b/.test(t)
    ) {
      return 'cigar';
    }
    if (/\b(whisky|whiskey|bourbon|scotch|spirit|pour|dram|glass)\b/.test(t)) {
      return 'spirit';
    }
    return null;
  }

  g.SterlonProductMatch = {
    PRODUCT_NAME_ALIASES: PRODUCT_NAME_ALIASES,
    pickSpiritFromDeck: pickSpiritFromDeck,
    resolveAlias: resolveAlias,
    matchAliasInText: matchAliasInText,
    matchOffMenuProductInText: matchOffMenuProductInText,
    matchOffMenuCigarInText: matchOffMenuCigarInText,
    detectUnavailableDemoProduct: detectUnavailableDemoProduct,
    inferCategoryBias: inferCategoryBias,
    resolveNamedCigar: resolveNamedCigar,
    resolveNamedCigarId: resolveNamedCigarId,
    resolveNamedSpirit: resolveNamedSpirit,
    resolveNamedSpiritId: resolveNamedSpiritId
  };
})(typeof window !== 'undefined' ? window : global);
