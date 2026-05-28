/**
 * RecommendationSelectors — pure selection functions for recommendation data.
 *
 * Formalizes the query interface for deck slots, refinement targets, and
 * intensity ladder navigation. These were previously inline expressions
 * inside sterlon-chat.js narrative functions.
 *
 * All functions are pure: (inputs) → value. No DOM, no session state, no prose.
 */
(function (global) {
  'use strict';

  /**
   * Pull a slot card from a pairing deck-like fixture.
   * @param {string} journeyTier  'novice' | 'advanced'
   * @param {string} slot         'best' | 'safe' | 'wildcard'
   */
  function getSlotCard(pairingDeck, journeyTier, slot) {
    if (!pairingDeck) return null;
    var tier = pairingDeck[journeyTier] || pairingDeck['advanced'] || pairingDeck;
    return (tier && tier[slot]) || null;
  }

  /**
   * Look up the taste-adjacent refinement target for a given spirit and axis.
   * @param {string} currentSpirit
   * @param {string} axis           'lighter' | 'bolder'
   * @param {object} adjacentTable  SR.refinementAdjacentPilot / REFINE_TASTE_ADJACENT
   * @returns {object|null}         { spirit, cigar, food, why, proseTail } or null
   */
  function getRefinementTarget(currentSpirit, axis, adjacentTable) {
    if (!currentSpirit || !axis || !adjacentTable) return null;
    var entry = adjacentTable[currentSpirit];
    if (!entry) return null;
    return entry[axis] || null;
  }

  /**
   * Step one position along an intensity ladder.
   * Mirrors the ladderStep logic in sterlon-chat.js.
   * @param {string} name       Current product name
   * @param {string} direction  'lighter' | 'bolder'
   * @param {Array}  ladder     Ordered name array (lightest → boldest)
   * @returns {string|null}     Adjacent name or null when direction is invalid
   */
  function cigarStrengthKey(product) {
    var s = product && product.spec && product.spec.strength;
    return s != null ? Number(s) : 5;
  }

  /**
   * Build light→bold name ladders from hydrated LoungeProducts (catalog order).
   * @returns {{ spirits: string[], cigars: string[] }}
   */
  function buildCatalogIntensityLadders() {
    var lp = global.LoungeProducts;
    var spirits = [];
    var cigars = [];
    if (!lp) return { spirits: spirits, cigars: cigars };
    if (lp.spirits && lp.spirits.length) {
      spirits = lp.spirits
        .slice()
        .filter(function (s) {
          return s.category === 'spirit';
        })
        .sort(function (a, b) {
          var ra = a.journeyRank != null ? a.journeyRank : 0;
          var rb = b.journeyRank != null ? b.journeyRank : 0;
          if (ra !== rb) return ra - rb;
          var pa = a.spec && a.spec.msrp != null ? a.spec.msrp : 0;
          var pb = b.spec && b.spec.msrp != null ? b.spec.msrp : 0;
          return pa - pb;
        })
        .map(function (s) {
          return s.name;
        });
    }
    if (lp.cigars && lp.cigars.length) {
      cigars = lp.cigars
        .slice()
        .sort(function (a, b) {
          return cigarStrengthKey(a) - cigarStrengthKey(b);
        })
        .map(function (c) {
          return c.name;
        });
    }
    return { spirits: spirits, cigars: cigars };
  }

  function getIntensityAdjacent(name, direction, ladder) {
    if (!name || !direction || !ladder || !ladder.length) return null;
    var dir = direction === 'lighter' ? -1 : direction === 'bolder' ? 1 : 0;
    if (dir === 0) return null;
    var idx = ladder.indexOf(name);
    if (idx === -1) {
      return dir < 0 ? ladder[0] : ladder[Math.min(2, ladder.length - 1)];
    }
    var next = idx + dir;
    if (next < 0) return ladder[0];
    if (next >= ladder.length) return ladder[ladder.length - 1];
    return ladder[next];
  }

  /**
   * Menu coerce — replaces deleted SterlonRecommendations.pickAllowedItem (RR-E2).
   * @returns {string}
   */
  function coerceMenuProduct(name, menuArray, fallback) {
    if (!name) return fallback;
    var n = String(name);
    var menu = menuArray || [];
    for (var i = 0; i < menu.length; i++) {
      if (String(menu[i]).toLowerCase() === n.toLowerCase()) return menu[i];
    }
    return fallback;
  }

  function productMsrp(product) {
    if (!product || !product.spec) return null;
    var msrp = product.spec.msrp;
    return msrp != null && Number.isFinite(Number(msrp)) ? Number(msrp) : null;
  }

  /**
   * @param {object|null} product
   * @param {{ mode: string, ceiling?: number|null, min?: number|null, max?: number|null }} budgetFilter
   */
  function matchesBudgetFilter(product, budgetFilter) {
    if (!budgetFilter || budgetFilter.mode === 'none') return true;
    var msrp = productMsrp(product);
    if (msrp == null) return false;
    if (budgetFilter.mode === 'ceiling') return msrp <= budgetFilter.ceiling;
    if (budgetFilter.mode === 'range' || budgetFilter.mode === 'around') {
      return msrp >= budgetFilter.min && msrp <= budgetFilter.max;
    }
    return true;
  }

  /**
   * Filter display names by MSRP policy; relaxes to the original list when empty.
   */
  function filterProductsByBudget(category, budgetFilter, names) {
    if (!budgetFilter || budgetFilter.mode === 'none') return names || [];
    var PIDs = global.RecommendationProductIds;
    var list = names || [];
    var filtered = list.filter(function (name) {
      var p =
        PIDs && typeof PIDs.getProductRef === 'function'
          ? PIDs.getProductRef(category, name)
          : null;
      return matchesBudgetFilter(p, budgetFilter);
    });
    if (filtered.length) return filtered;
    var catalogMatches = filterCatalogByBudget(category, budgetFilter);
    if (catalogMatches.length) {
      return catalogMatches.map(function (p) {
        return p.name;
      });
    }
    return list;
  }

  /**
   * Filter catalog rows by MSRP policy.
   */
  function filterCatalogByBudget(category, budgetFilter) {
    var LP = global.LoungeProducts;
    if (!LP) return [];
    var list = category === 'spirit' ? (LP.spirits || []) : (LP.cigars || []);
    return list.filter(function (p) {
      return p.category === category && matchesBudgetFilter(p, budgetFilter);
    });
  }

  function sortProductsByBudgetProximity(products, budgetFilter) {
    if (!budgetFilter || budgetFilter.mode !== 'around' || budgetFilter.target == null) {
      return products;
    }
    var target = budgetFilter.target;
    return products.slice().sort(function (a, b) {
      var ma = productMsrp(a);
      var mb = productMsrp(b);
      var da = Math.abs((ma != null ? ma : target) - target);
      var db = Math.abs((mb != null ? mb : target) - target);
      return da - db;
    });
  }

  /**
   * Budget refinement spirit pick (ported from sterlon-chat mutateTierSlot).
   */
  function buildCatalogIntensityLadderIds() {
    var lp = global.LoungeProducts;
    var spiritIds = [];
    var cigarIds = [];
    if (!lp) return { spirits: spiritIds, cigars: cigarIds };
    if (lp.spirits && lp.spirits.length) {
      spiritIds = lp.spirits
        .slice()
        .filter(function (s) {
          return s.category === 'spirit' && s.id;
        })
        .sort(function (a, b) {
          var ra = a.journeyRank != null ? a.journeyRank : 0;
          var rb = b.journeyRank != null ? b.journeyRank : 0;
          if (ra !== rb) return ra - rb;
          var pa = a.spec && a.spec.msrp != null ? a.spec.msrp : 0;
          var pb = b.spec && b.spec.msrp != null ? b.spec.msrp : 0;
          return pa - pb;
        })
        .map(function (s) {
          return s.id;
        });
    }
    if (lp.cigars && lp.cigars.length) {
      cigarIds = lp.cigars
        .slice()
        .filter(function (c) {
          return c.id;
        })
        .sort(function (a, b) {
          return cigarStrengthKey(a) - cigarStrengthKey(b);
        })
        .map(function (c) {
          return c.id;
        });
    }
    return { spirits: spiritIds, cigars: cigarIds };
  }

  function getIntensityAdjacentId(currentId, direction, ladderIds) {
    if (!currentId || !direction || !ladderIds || !ladderIds.length) return null;
    var axis = direction === 'lighter' ? 'lighter' : direction === 'bolder' ? 'bolder' : null;
    if (!axis) return currentId;
    var idx = ladderIds.indexOf(currentId);
    if (idx === -1) {
      return axis === 'lighter' ? ladderIds[0] : ladderIds[Math.min(2, ladderIds.length - 1)];
    }
    var dir = axis === 'lighter' ? -1 : 1;
    var next = idx + dir;
    if (next < 0) return ladderIds[0];
    if (next >= ladderIds.length) return ladderIds[ladderIds.length - 1];
    return ladderIds[next];
  }

  function coerceMenuId(id, menuIds, fallbackId) {
    if (!id) return fallbackId;
    var sid = String(id);
    var menu = menuIds || [];
    for (var i = 0; i < menu.length; i++) {
      if (String(menu[i]) === sid) return menu[i];
    }
    return fallbackId;
  }

  function filterProductsByBudgetIds(category, budgetFilter, ids) {
    if (!budgetFilter || budgetFilter.mode === 'none') return ids || [];
    var LP = global.LoungeProducts;
    var getFn = category === 'spirit' ? 'getSpiritById' : 'getCigarById';
    var list = ids || [];
    var filtered = list.filter(function (id) {
      var p = LP && typeof LP[getFn] === 'function' ? LP[getFn](id) : null;
      return matchesBudgetFilter(p, budgetFilter);
    });
    if (filtered.length) return filtered;
    var catalogMatches = filterCatalogByBudget(category, budgetFilter);
    if (catalogMatches.length) {
      return catalogMatches
        .map(function (p) {
          return p.id;
        })
        .filter(Boolean);
    }
    return list;
  }

  function pickSpiritForBudgetId(ceiling, currentSpiritId) {
    var PIDs = global.RecommendationProductIds;
    var currentName =
      currentSpiritId && PIDs
        ? PIDs.displayNameForId('spirit', currentSpiritId)
        : null;
    var pickName = pickSpiritForBudget(ceiling, currentName);
    if (!pickName || !PIDs) return currentSpiritId;
    return PIDs.resolveSpiritId(pickName) || currentSpiritId;
  }

  function pickSpiritForBudget(ceiling, currentSpirit) {
    var max = ceiling == null ? 85 : Number(ceiling);
    var LP = global.LoungeProducts;
    if (LP && LP.spirits && LP.spirits.length) {
      var PIDs = global.RecommendationProductIds;
      var currentObj =
        currentSpirit && PIDs && typeof PIDs.getProductRef === 'function'
          ? PIDs.getProductRef('spirit', currentSpirit)
          : null;
      var currentJourney = currentObj && currentObj.journeyLevel ? currentObj.journeyLevel : null;
      var journeyOrder = { novice: 0, intermediate: 1, advanced: 2 };
      var currentRank = currentJourney != null ? journeyOrder[currentJourney] || 1 : 1;
      var candidates = LP.spirits.filter(function (s) {
        if (s.category !== 'spirit') return false;
        if (s.spec && s.spec.msrp != null && s.spec.msrp > max) return false;
        return true;
      });
      if (!candidates.length) {
        candidates = LP.spirits.filter(function (s) { return s.category === 'spirit'; });
      }
      candidates.sort(function (a, b) {
        var ar = a.journeyRank != null ? a.journeyRank : 99;
        var br = b.journeyRank != null ? b.journeyRank : 99;
        var aTierRank = journeyOrder[a.journeyLevel] != null ? journeyOrder[a.journeyLevel] : 1;
        var bTierRank = journeyOrder[b.journeyLevel] != null ? journeyOrder[b.journeyLevel] : 1;
        var aFit = aTierRank <= currentRank ? 0 : 1;
        var bFit = bTierRank <= currentRank ? 0 : 1;
        if (aFit !== bFit) return aFit - bFit;
        return ar - br;
      });
      if (candidates[0]) return candidates[0].name;
    }
    return currentSpirit || null;
  }

  global.RecommendationSelectors = {
    getSlotCard: getSlotCard,
    getRefinementTarget: getRefinementTarget,
    buildCatalogIntensityLadders: buildCatalogIntensityLadders,
    buildCatalogIntensityLadderIds: buildCatalogIntensityLadderIds,
    getIntensityAdjacent: getIntensityAdjacent,
    getIntensityAdjacentId: getIntensityAdjacentId,
    coerceMenuProduct: coerceMenuProduct,
    coerceMenuId: coerceMenuId,
    pickSpiritForBudget: pickSpiritForBudget,
    pickSpiritForBudgetId: pickSpiritForBudgetId,
    filterProductsByBudgetIds: filterProductsByBudgetIds,
    productMsrp: productMsrp,
    matchesBudgetFilter: matchesBudgetFilter,
    filterProductsByBudget: filterProductsByBudget,
    filterCatalogByBudget: filterCatalogByBudget,
    sortProductsByBudgetProximity: sortProductsByBudgetProximity
  };
})(typeof window !== 'undefined' ? window : global);
