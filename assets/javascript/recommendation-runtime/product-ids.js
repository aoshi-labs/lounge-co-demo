/**
 * RecommendationProductIds â€” Phase A id-first turn sealing (visionboard).
 *
 * Single runtime boundary for nameâ†’id resolution and idâ†’display hydration.
 * Recommendation authority uses ids; display names are derived for presentation only.
 *
 * Depends on: LoungeProducts (catalog hydrated).
 * Does NOT depend on: DOM, session, gateway, sterlon-chat.
 */
(function (global) {
  'use strict';

  var SLOT_ORDER = ['best', 'safe', 'wildcard'];

  /** Bump when normalization / violation rules change (freeze may assert). */
  var PRODUCT_ID_AUTHORITY_VERSION = 2;

  function lounge() {
    return global.LoungeProducts || null;
  }

  function getById(category, id) {
    var lp = lounge();
    if (!lp || !id) return null;
    if (category === 'cigar' && typeof lp.getCigarById === 'function') return lp.getCigarById(id);
    if (category === 'spirit' && typeof lp.getSpiritById === 'function') return lp.getSpiritById(id);
    if (category === 'food' && typeof lp.getFoodById === 'function') return lp.getFoodById(id);
    return null;
  }

  /** Catalog row by canonical id or display name (runtime satellites â€” not turn authority). */
  function getProductRef(category, idOrName) {
    if (!idOrName) return null;
    var byId = getById(category, idOrName);
    if (byId) return byId;
    if (category === 'cigar') return getById('cigar', resolveCigarId(idOrName));
    if (category === 'spirit') return getById('spirit', resolveSpiritId(idOrName));
    if (category === 'food') return getById('food', resolveFoodId(idOrName));
    return null;
  }

  function resolveCigarId(name) {
    if (!name) return null;
    var lp = lounge();
    if (!lp || typeof lp.findCigarByName !== 'function') return null;
    var p = lp.findCigarByName(name);
    return p && p.id ? p.id : null;
  }

  function resolveSpiritId(name) {
    if (!name) return null;
    var lp = lounge();
    if (!lp || typeof lp.findSpiritByName !== 'function') return null;
    var p = lp.findSpiritByName(name);
    return p && p.id ? p.id : null;
  }

  function resolveFoodId(name) {
    if (!name) return null;
    var lp = lounge();
    if (!lp || typeof lp.findFoodByName !== 'function') return null;
    var p = lp.findFoodByName(name);
    return p && p.id ? p.id : null;
  }

  /**
   * Merge legacy name fields and explicit ids into canonical ids.
   * Names are not authoritative; ids win when both are present.
   */
  function resolveProductIds(opts) {
    var o = opts || {};
    var cigarId = o.cigarId != null && o.cigarId !== '' ? o.cigarId : null;
    var spiritId = o.spiritId != null && o.spiritId !== '' ? o.spiritId : null;
    var foodId = o.foodId != null && o.foodId !== '' ? o.foodId : null;
    if (!cigarId && o.cigar) cigarId = resolveCigarId(o.cigar);
    if (!spiritId && o.spirit) spiritId = resolveSpiritId(o.spirit);
    if (!foodId && o.food) foodId = resolveFoodId(o.food);
    return { cigarId: cigarId, spiritId: spiritId, foodId: foodId };
  }

  function displayNameForId(category, id) {
    var p = getById(category, id);
    return p && p.name ? p.name : '';
  }

  /**
   * Attach presentation display strings from canonical ids (non-authoritative copy).
   */
  function hydrateCardDisplay(card) {
    if (!card || typeof card !== 'object') return card;
    var out = Object.assign({}, card);
    if (out.cigarId) out.cigar = displayNameForId('cigar', out.cigarId) || out.cigar || null;
    if (out.spiritId) out.spirit = displayNameForId('spirit', out.spiritId) || out.spirit || null;
    if (out.foodId) out.food = displayNameForId('food', out.foodId) || out.food || null;
    return out;
  }

  /**
   * Seal one slot card: slot key, resolved ids, hydrated display names.
   * Unknown id string â†’ null (same strict signal as generate.js lookupId).
   */
  function normalizeSlotCard(card, slotIndex) {
    if (!card || typeof card !== 'object') return card;
    var slot = SLOT_ORDER[slotIndex] || 'slot-' + slotIndex;
    var out = Object.assign({}, card, { slot: slot });

    var ids = resolveProductIds({
      cigar: out.cigar,
      spirit: out.spirit,
      food: out.food,
      cigarId: out.cigarId,
      spiritId: out.spiritId,
      foodId: out.foodId
    });

    if (ids.cigarId && !getById('cigar', ids.cigarId)) ids.cigarId = null;
    if (ids.spiritId && !getById('spirit', ids.spiritId)) ids.spiritId = null;
    if (ids.foodId && !getById('food', ids.foodId)) ids.foodId = null;

    out.cigarId = ids.cigarId;
    out.spiritId = ids.spiritId;
    out.foodId = ids.foodId;

    return hydrateCardDisplay(out);
  }

  function normalizeSlotCards(cards) {
    return (cards || []).slice(0, 3).map(function (c, i) {
      return normalizeSlotCard(c, i);
    });
  }

  /**
   * Id-first allowlist: a non-empty legacy name without a resolved id is a violation.
   */
  function idAuthorityViolations(cards) {
    var violations = [];
    (cards || []).forEach(function (card, idx) {
      if (!card) return;
      var slot = card.slot || SLOT_ORDER[idx] || 'slot-' + idx;
      if (card.cigar != null && card.cigar !== '' && card.cigarId == null) {
        violations.push({ slot: slot, field: 'cigar', name: card.cigar });
      }
      if (card.spirit != null && card.spirit !== '' && card.spiritId == null) {
        violations.push({ slot: slot, field: 'spirit', name: card.spirit });
      }
      if (card.food != null && card.food !== '' && card.foodId == null) {
        violations.push({ slot: slot, field: 'food', name: card.food });
      }
    });
    return violations;
  }

  function allSlotsIdSealed(cards) {
    var violations = idAuthorityViolations(cards);
    return violations.length === 0;
  }

  function listMenuCigarIds() {
    var lp = lounge();
    if (!lp || typeof lp.listMenuCigarNames !== 'function') return [];
    return (lp.listMenuCigarNames() || [])
      .map(function (n) {
        return resolveCigarId(n);
      })
      .filter(Boolean);
  }

  function listMenuSpiritIds() {
    var lp = lounge();
    if (!lp || typeof lp.listMenuSpiritNames !== 'function') return [];
    return (lp.listMenuSpiritNames() || [])
      .map(function (n) {
        return resolveSpiritId(n);
      })
      .filter(Boolean);
  }

  function idsToDisplayNames(category, ids) {
    return (ids || [])
      .map(function (id) {
        return displayNameForId(category, id);
      })
      .filter(Boolean);
  }

  function resolveAnchorIds(o) {
    var opts = o || {};
    return {
      spiritId:
        opts.anchorSpiritId != null && opts.anchorSpiritId !== ''
          ? opts.anchorSpiritId
          : resolveSpiritId(opts.anchorSpirit),
      cigarId:
        opts.anchorCigarId != null && opts.anchorCigarId !== ''
          ? opts.anchorCigarId
          : resolveCigarId(opts.anchorCigar)
    };
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

  /** PairingEngine boundary â€” anchor and candidates as display names; slots returned as ids. */
  function pickSlotIds(anchorCategory, anchorId, candidateIds, peOpts) {
    var outCategory = anchorCategory === 'spirit' ? 'cigar' : 'spirit';
    var anchorName = displayNameForId(anchorCategory === 'spirit' ? 'spirit' : 'cigar', anchorId);
    var candNames = idsToDisplayNames(outCategory, candidateIds);
    var PE = global.PairingEngine;
    var slots;
    if (PE && typeof PE.pickSlots === 'function' && anchorName) {
      slots = PE.pickSlots(anchorName, candNames, peOpts || {});
    } else {
      slots = {
        best: candNames[0] || null,
        safe: candNames[1] || null,
        wildcard: candNames[2] || null
      };
    }
    var mapSlot = function (name) {
      if (!name) return null;
      return outCategory === 'cigar' ? resolveCigarId(name) : resolveSpiritId(name);
    };
    return {
      best: mapSlot(slots.best),
      safe: mapSlot(slots.safe),
      wildcard: mapSlot(slots.wildcard)
    };
  }

  function rankCandidateIds(anchorCategory, anchorId, candidateIds, peOpts) {
    var anchorName = displayNameForId(anchorCategory === 'spirit' ? 'spirit' : 'cigar', anchorId);
    var candCategory = anchorCategory === 'spirit' ? 'cigar' : 'spirit';
    var candNames = idsToDisplayNames(candCategory, candidateIds);
    var PE = global.PairingEngine;
    if (!PE || typeof PE.rankCandidates !== 'function' || !anchorName) return [];
    var ranked = PE.rankCandidates(anchorName, candNames, peOpts || {});
    return (ranked || []).map(function (r) {
      var id =
        candCategory === 'cigar' ? resolveCigarId(r.name) : resolveSpiritId(r.name);
      return Object.assign({}, r, { id: id, name: r.name });
    });
  }


  var api = {
    PRODUCT_ID_AUTHORITY_VERSION: PRODUCT_ID_AUTHORITY_VERSION,
    SLOT_ORDER: SLOT_ORDER,
    getById: getById,
    getProductRef: getProductRef,
    resolveCigarId: resolveCigarId,
    resolveSpiritId: resolveSpiritId,
    resolveFoodId: resolveFoodId,
    resolveProductIds: resolveProductIds,
    displayNameForId: displayNameForId,
    hydrateCardDisplay: hydrateCardDisplay,
    normalizeSlotCard: normalizeSlotCard,
    normalizeSlotCards: normalizeSlotCards,
    idAuthorityViolations: idAuthorityViolations,
    allSlotsIdSealed: allSlotsIdSealed,
    listMenuCigarIds: listMenuCigarIds,
    listMenuSpiritIds: listMenuSpiritIds,
    idsToDisplayNames: idsToDisplayNames,
    resolveAnchorIds: resolveAnchorIds,
    coerceMenuId: coerceMenuId,
    pickSlotIds: pickSlotIds,
    rankCandidateIds: rankCandidateIds
  };

  global.RecommendationProductIds = api;

  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.productIds = api;
    RR.PRODUCT_ID_AUTHORITY_VERSION = PRODUCT_ID_AUTHORITY_VERSION;
  }
})(typeof window !== 'undefined' ? window : global);
