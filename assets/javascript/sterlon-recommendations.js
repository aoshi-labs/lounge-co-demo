/* ──────────────────────────────────────────────────────────────────────
   sterlon-recommendations.js — verify, normalize, match, enrich (RR-E3).

   Refinement pivots: assets/knowledge/refinement-pivots.js.
   Runtime deck assembly: recommendation-runtime/deck-template.js.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var LABEL_ALLOWLIST = [
    'BEST PICK', 'REFINED OPTION', 'CONTRAST WILDCARD',
    'Best Pick', 'Refined Option', 'Balanced Choice', 'Easygoing Pairing',
    'Luxury Pour', 'Wildcard', 'Evening Pick', "Collector's Choice"
  ];

  var WILDCARD_DESCRIPTOR_FALLBACKS = [
    'Richer. Darker. More decadent.',
    'Smoke-forward, with a longer finish.',
    'Silkier start, bolder second act.'
  ];

  var g = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : null;

  /** Empty until catalog hydrates — never a hero-only emergency shelf. */
  var CATALOG_LOADING_CIGARS_FALLBACK = [];
  var CATALOG_LOADING_SPIRITS_FALLBACK = [];

  var CATALOG_LOADING_FOODS_FALLBACK = [
    'Dark Chocolate Flight',
    'Prosciutto & Manchego',
    'Smoked Almonds',
    'Marcona Olives',
    'Prime Filet Sliders',
    'Citrus-Olive Oil Cake',
    'Espresso Tiramisu Bites'
  ];

  function loungeProducts() {
    return g && g.LoungeProducts;
  }

  function getMenuSpirits() {
    var lp = loungeProducts();
    if (lp && typeof lp.listMenuSpiritNames === 'function') {
      var names = lp.listMenuSpiritNames();
      if (names && names.length) return names;
    }
    return CATALOG_LOADING_SPIRITS_FALLBACK.slice();
  }

  function getMenuCigars() {
    var lp = loungeProducts();
    if (lp && typeof lp.listMenuCigarNames === 'function') {
      var names = lp.listMenuCigarNames();
      if (names && names.length) return names;
    }
    return CATALOG_LOADING_CIGARS_FALLBACK.slice();
  }

  function getMenuFoods() {
    var lp = loungeProducts();
    if (lp && typeof lp.listMenuFoodNames === 'function') {
      var names = lp.listMenuFoodNames();
      if (names && names.length) return names;
    }
    return CATALOG_LOADING_FOODS_FALLBACK.slice();
  }

  function aliasTable() {
    var SPM = g && g.SterlonProductMatch;
    return (SPM && SPM.PRODUCT_NAME_ALIASES) ? SPM.PRODUCT_NAME_ALIASES : [];
  }

  function matchMenuProductInText(text) {
    var IM = g && g.RecommendationIntentMatch;
    if (IM && typeof IM.matchMenuProductIntent === 'function') {
      var hit = IM.matchMenuProductIntent(text);
      if (!hit) return null;
      return {
        name: hit.name,
        category: hit.category,
        productId: hit.productId,
        matchKind: hit.matchKind,
        intentOnly: true
      };
    }
    return null;
  }

  function promptExplicitlyNamesMenuSpirit(text) {
    var IM = g && g.RecommendationIntentMatch;
    if (IM && typeof IM.promptExplicitlyNamesMenuSpiritIntent === 'function') {
      return IM.promptExplicitlyNamesMenuSpiritIntent(text || '');
    }
    var named = matchMenuProductInText(text || '');
    return !!(named && named.category === 'spirit');
  }

  function fieldAllowed(name, id, menuNames, products) {
    if (!name && !id) return true;
    if (name && menuNames.indexOf(name) !== -1) return true;
    if (id && products && products.length) {
      for (var i = 0; i < products.length; i++) {
        if (products[i].id === id && menuNames.indexOf(products[i].name) !== -1) return true;
      }
    }
    return false;
  }

  function verifyRecommendationCards(cards) {
    var SLOT = ['best', 'safe', 'wildcard'];
    var violations = [];
    var lp = loungeProducts();
    var spiritProducts = lp && lp.spirits ? lp.spirits : [];
    var cigarProducts = lp && lp.cigars ? lp.cigars : [];
    var foodProducts = lp && lp.foods ? lp.foods : [];
    var menuSpirits = getMenuSpirits();
    var menuCigars = getMenuCigars();
    var menuFoods = getMenuFoods();
    (cards || []).forEach(function (card, idx) {
      var slot = SLOT[idx] || ('slot-' + idx);
      if (card.cigar && !fieldAllowed(card.cigar, card.cigarId, menuCigars, cigarProducts)) {
        violations.push({ slot: slot, field: 'cigar', found: card.cigar || card.cigarId });
      }
      if (card.spirit && !fieldAllowed(card.spirit, card.spiritId, menuSpirits, spiritProducts)) {
        violations.push({ slot: slot, field: 'spirit', found: card.spirit || card.spiritId });
      }
      if (card.food && !fieldAllowed(card.food, card.foodId, menuFoods, foodProducts)) {
        violations.push({ slot: slot, field: 'food', found: card.food || card.foodId });
      }
    });
    return { ok: violations.length === 0, violations: violations };
  }

  function enrichCardsForPresentation(cards, promptText) {
    var pt = promptText || '';
    var RP = g && g.RecommendationPresentation;
    var PIDs = g && g.RecommendationProductIds;
    return (cards || []).map(function (card, idx) {
      var base = card;
      if (PIDs && typeof PIDs.resolveProductIds === 'function') {
        var ids = PIDs.resolveProductIds(card);
        base = Object.assign({}, card, ids);
        if (PIDs.hydrateCardDisplay) base = PIDs.hydrateCardDisplay(base);
      }
      var spiritLabel =
        base.spirit ||
        (PIDs && base.spiritId ? PIDs.displayNameForId('spirit', base.spiritId) : '') ||
        '';
      var enriched = Object.assign({}, base, {
        stock: inventoryTagForCard({ label: base.label, tier: base.tier, spirit: spiritLabel }),
        descriptor:
          idx === 2
            ? base.descriptor || pickWildcardDescriptor((spiritLabel || base.cigarId || '') + ' ' + pt)
            : base.descriptor || ''
      });
      if (base.cigarId && RP && typeof RP.cigarPresentationMeta === 'function') {
        Object.assign(enriched, RP.cigarPresentationMeta(base.cigarId));
      }
      return enriched;
    });
  }

  function normalizeRecoLabel(rawLabel, fallbackLabel) {
    var candidate = (rawLabel || '').trim();
    if (LABEL_ALLOWLIST.indexOf(candidate) !== -1) return candidate;
    return fallbackLabel;
  }

  function normalizeWhyLine(line) {
    var text = (line || '').trim();
    if (!text) return '';
    var compact = text.replace(/\s+/g, ' ');
    if (compact.length <= 92) return compact;
    return compact.slice(0, 89).trimEnd() + '...';
  }

  function normalizeWhyBullets(why, fallbackWhy) {
    var source = Array.isArray(why) && why.length ? why : fallbackWhy;
    return source.map(normalizeWhyLine).filter(Boolean).slice(0, 3);
  }

  function pickWildcardDescriptor(seedText) {
    var seed = (seedText || '').toLowerCase();
    if (/peat|smoke|islay/.test(seed)) return WILDCARD_DESCRIPTOR_FALLBACKS[1];
    if (/luxury|collector|rare/.test(seed)) return WILDCARD_DESCRIPTOR_FALLBACKS[0];
    return WILDCARD_DESCRIPTOR_FALLBACKS[2];
  }

  function inventoryTagForCard(card) {
    if (!card) return 'On the menu tonight';
    var tier = String(card.tier || '').toLowerCase();
    if (tier === 'value') return 'Approachable pick on the rail';
    if (tier === 'luxury') return 'Heavier pour on the rail';
    return 'On the menu tonight';
  }

  function validateCards(cards, promptText, options) {
    var opts = options || {};
    var cf = opts.categoryFocus || null;
    var stripCigar = cf === 'spirit';
    var stripSpirit = cf === 'cigar';
    var working = cards || [];

    if (opts.enforceRuntimeAuthority) {
      var RP = g && g.RecommendationPresentation;
      if (RP && typeof RP.enforceRuntimePresentation === 'function') {
        working = RP.enforceRuntimePresentation(working);
      }
    }

    var verification = verifyRecommendationCards(working);
    if (!verification.ok && typeof console !== 'undefined' && console.warn) {
      console.warn('[Sterlon][validateCards] Off-menu products — runtime pipeline integrity violation.', verification.violations);
    }

    return enrichCardsForPresentation(working, promptText).map(function (card, idx) {
      var c = Object.assign({}, card);
      if (stripCigar) c.cigar = null;
      if (stripSpirit) c.spirit = null;
      c.label = normalizeRecoLabel(
        c.label,
        idx === 0 ? 'BEST PICK' : idx === 1 ? 'REFINED OPTION' : 'CONTRAST WILDCARD'
      );
      c.food = null;
      c.foodId = null;
      c.why = normalizeWhyBullets(c.why, []);
      return c;
    });
  }

  function containsCompetingRecommendationSignal(text, card) {
    var raw = String(text || '').toLowerCase();
    if (!raw || !card) return false;
    var RP = g && g.RecommendationPresentation;
    var active = (
      RP && typeof RP.displayNamesForEmphasis === 'function'
        ? RP.displayNamesForEmphasis([card])
        : [card.cigar, card.spirit, card.food]
    )
      .filter(Boolean)
      .map(function (item) {
        return String(item).toLowerCase();
      });
    var menuItems = getMenuCigars().concat(getMenuSpirits(), getMenuFoods());
    return menuItems.some(function (item) {
      var lower = String(item || '').toLowerCase();
      return lower && active.indexOf(lower) === -1 && raw.indexOf(lower) !== -1;
    });
  }

  if (!g) return;

  g.SterlonRecommendations = {
    get PRODUCT_NAME_ALIASES() {
      return aliasTable();
    },
    matchMenuProductInText: matchMenuProductInText,
    promptExplicitlyNamesMenuSpirit: promptExplicitlyNamesMenuSpirit,
    LABEL_ALLOWLIST: LABEL_ALLOWLIST,
    WILDCARD_DESCRIPTOR_FALLBACKS: WILDCARD_DESCRIPTOR_FALLBACKS,
    getMenuSpirits: getMenuSpirits,
    getMenuCigars: getMenuCigars,
    getMenuFoods: getMenuFoods,
    normalizeRecoLabel: normalizeRecoLabel,
    normalizeWhyBullets: normalizeWhyBullets,
    pickWildcardDescriptor: pickWildcardDescriptor,
    inventoryTagForCard: inventoryTagForCard,
    verifyRecommendationCards: verifyRecommendationCards,
    enrichCardsForPresentation: enrichCardsForPresentation,
    validateCards: validateCards,
    containsCompetingRecommendationSignal: containsCompetingRecommendationSignal,
    get refinementAdjacentPilot() {
      var PR = g.PilotRefinementPivots;
      return PR && PR.refinementAdjacentPilot ? PR.refinementAdjacentPilot : {};
    }
  };

  Object.defineProperty(g.SterlonRecommendations, 'MENU_SPIRITS', {
    get: getMenuSpirits,
    enumerable: true
  });
  Object.defineProperty(g.SterlonRecommendations, 'MENU_CIGARS', {
    get: getMenuCigars,
    enumerable: true
  });
  Object.defineProperty(g.SterlonRecommendations, 'MENU_FOODS', {
    get: getMenuFoods,
    enumerable: true
  });
})();
