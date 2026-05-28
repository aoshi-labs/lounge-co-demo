/**
 * RecommendationIntentMatch — intent-only text → catalog id (NOT flight authority).
 *
 * Routers, expertise, and session registry use this for "what did the member mention?"
 * Slot assignment and turn sealing remain RecommendationRuntime + product-ids only.
 */
(function (global) {
  'use strict';

  function PIDs() {
    return global.RecommendationProductIds || null;
  }

  function lounge() {
    return global.LoungeProducts || null;
  }

  function intentHit(category, productId, name, matchKind) {
    if (!productId && !name) return null;
    return {
      category: category,
      productId: productId || null,
      name: name || '',
      matchKind: matchKind || 'unknown',
      intentOnly: true
    };
  }

  function resolveHitName(category, productId, fallbackName) {
    var pid = PIDs();
    if (productId && pid) {
      var dn = pid.displayNameForId(category, productId);
      if (dn) return dn;
    }
    return fallbackName || '';
  }

  /**
   * Longest menu substring match → catalog id.
   */
  function matchMenuSubstringIntent(text) {
    var t = (text || '').toLowerCase();
    var lp = lounge();
    var pid = PIDs();
    if (!lp || !pid) return null;
    var catalog = [];
    var spiritIds = pid.listMenuSpiritIds();
    var cigarIds = pid.listMenuCigarIds();
    var si;
    for (si = 0; si < spiritIds.length; si++) {
      catalog.push({
        category: 'spirit',
        productId: spiritIds[si],
        name: pid.displayNameForId('spirit', spiritIds[si])
      });
    }
    for (si = 0; si < cigarIds.length; si++) {
      catalog.push({
        category: 'cigar',
        productId: cigarIds[si],
        name: pid.displayNameForId('cigar', cigarIds[si])
      });
    }
    catalog.sort(function (a, b) {
      return b.name.length - a.name.length;
    });
    for (var i = 0; i < catalog.length; i++) {
      if (t.indexOf(String(catalog[i].name).toLowerCase()) !== -1) {
        return intentHit(catalog[i].category, catalog[i].productId, catalog[i].name, 'menu-substring');
      }
    }
    return null;
  }

  function matchAliasIntent(text) {
    var SPM = global.SterlonProductMatch;
    if (!SPM || typeof SPM.resolveAlias !== 'function') return null;
    var alias = SPM.resolveAlias(text);
    if (!alias) return null;
    var pid = PIDs();
    if (!pid) return intentHit(alias.category, null, alias.name, 'alias');
    var productId =
      alias.category === 'spirit'
        ? pid.resolveSpiritId(alias.name)
        : alias.category === 'cigar'
          ? pid.resolveCigarId(alias.name)
          : pid.resolveFoodId(alias.name);
    return intentHit(
      alias.category,
      productId,
      resolveHitName(alias.category, productId, alias.name),
      'alias'
    );
  }

  /**
   * @returns {{ category, productId, name, matchKind, intentOnly: true }|null}
   */
  function matchMenuProductIntent(text) {
    var aliasHit = matchAliasIntent(text);
    if (aliasHit) return aliasHit;
    return matchMenuSubstringIntent(text);
  }

  function promptExplicitlyNamesMenuSpiritIntent(text) {
    var hit = matchMenuProductIntent(text);
    return !!(hit && hit.category === 'spirit');
  }

  /** Spirit brand/category intent → anchor spirit id (not a flight slot). */
  function resolveNamedSpiritId(text) {
    if (!text) return null;
    var hit = matchMenuProductIntent(text);
    if (hit && hit.category === 'spirit' && hit.productId) return hit.productId;

    var SPM = global.SterlonProductMatch;
    var lp = lounge();
    var pid = PIDs();
    if (!SPM || !lp || !pid) return null;
    var tl = text.toLowerCase();

    var aliases = SPM.PRODUCT_NAME_ALIASES || [];
    var i;
    for (i = 0; i < aliases.length; i++) {
      var a = aliases[i];
      if (a.category !== 'spirit') continue;
      if (!a.pattern.test(tl)) continue;
      var id = pid.resolveSpiritId(a.name);
      if (id) return id;
    }

    if (typeof SPM.pickSpiritFromDeck === 'function') {
      var patterns = [
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
      for (i = 0; i < patterns.length; i++) {
        if (!patterns[i].re.test(text)) continue;
        var picked = SPM.pickSpiritFromDeck(patterns[i].deckKey, text);
        if (picked) return pid.resolveSpiritId(picked);
      }
    }
    return null;
  }

  var api = {
    matchMenuProductIntent: matchMenuProductIntent,
    promptExplicitlyNamesMenuSpiritIntent: promptExplicitlyNamesMenuSpiritIntent,
    resolveNamedSpiritId: resolveNamedSpiritId
  };

  global.RecommendationIntentMatch = api;

  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.intentMatch = api;
  }
})(typeof window !== 'undefined' ? window : global);
