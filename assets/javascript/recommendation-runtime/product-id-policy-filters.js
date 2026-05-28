/**
 * RecommendationProductIdPolicyFilters - policy filters and slot repairs layered on id authority.
 *
 * Depends on: RecommendationProductIds, LoungeProducts, OntologyPolicy, CigarSublineBody.
 */
(function (global) {
  'use strict';

  var pid = global.RecommendationProductIds;
  if (!pid) return;

  function lounge() { return global.LoungeProducts || null; }
  function getById(category, id) { return pid.getById(category, id); }
  function resolveCigarId(name) { return pid.resolveCigarId(name); }
  function resolveSpiritId(name) { return pid.resolveSpiritId(name); }
  function displayNameForId(category, id) { return pid.displayNameForId(category, id); }
  function idsToDisplayNames(category, ids) { return pid.idsToDisplayNames(category, ids); }
  function rankCandidateIds(anchorCategory, anchorId, candidateIds, peOpts) { return pid.rankCandidateIds(anchorCategory, anchorId, candidateIds, peOpts); }
  function listMenuCigarIds() { return pid.listMenuCigarIds(); }
  function pickSlotIds(anchorCategory, anchorId, candidateIds, peOpts) { return pid.pickSlotIds(anchorCategory, anchorId, candidateIds, peOpts); }
  var BODY_TIERS = {
    mild: ['Mild', 'Medium-Light'],
    medium: ['Medium-Light', 'Medium', 'Medium-Full'],
    full: ['Medium-Full', 'Full'],
    'full-strict': ['Full']
  };

  function cigarBodyTierForId(cigarId) {
    var p = getById('cigar', cigarId);
    return (p && ((p.spec && p.spec.body) || p.body)) || '';
  }

  function filterCigarIdsByBody(cigarIds, bodyConstraint) {
    var allowed = BODY_TIERS[bodyConstraint];
    if (!allowed) return cigarIds || [];
    var CSB = global.CigarSublineBody;
    var filtered = (cigarIds || []).filter(function (id) {
      var body = cigarBodyTierForId(id);
      if (!body || allowed.indexOf(body) === -1) return false;
      if (bodyConstraint === 'full-strict' && CSB && typeof CSB.isMildSubline === 'function') {
        return !CSB.isMildSubline(displayNameForId('cigar', id));
      }
      return true;
    });
    return filtered.length ? filtered : cigarIds || [];
  }

  function filterCigarIdsByWrapperIntent(cigarIds, promptText) {
    var t = String(promptText || '').toLowerCase();
    if (!/\bmaduro\b/.test(t)) return cigarIds || [];
    var filtered = (cigarIds || []).filter(function (id) {
      var p = getById('cigar', id);
      if (!p) return false;
      var spec = p.spec || {};
      var guidance = p.guidance || {};
      var blob = [
        p.name,
        spec.wrapper,
        spec.binder,
        spec.filler,
        guidance.wrapperRole,
        guidance.flavorFamily,
        guidance.whyRecommend,
        guidance.memberBlurb
      ].filter(Boolean).join(' ').toLowerCase();
      return /\b(maduro|broadleaf|san andr(?:es)?)\b/.test(blob);
    });
    return filtered.length >= 3 ? filtered : cigarIds || [];
  }

  function applyFullBodyCandidateFilterIds(cigarIds, o) {
    var CSB = global.CigarSublineBody;
    if (!CSB || typeof CSB.memberWantsStrictFullBody !== 'function') return cigarIds;
    if (!CSB.memberWantsStrictFullBody(o)) return cigarIds;
    var strict = filterCigarIdsByBody(cigarIds, 'full-strict');
    if (typeof CSB.filterForFullBodyIntent === 'function') {
      var names = idsToDisplayNames('cigar', strict);
      names = CSB.filterForFullBodyIntent(names, o);
      strict = names
        .map(function (n) {
          return resolveCigarId(n);
        })
        .filter(Boolean);
    }
    return strict.length ? strict : cigarIds;
  }

  function policyFilterCigarIds(cigarIds, o) {
    var OP = global.OntologyPolicy;
    if (!OP || !cigarIds || !cigarIds.length) return cigarIds || [];
    var names = idsToDisplayNames('cigar', cigarIds);
    var ctx =
      typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({
            promptText: o.promptText,
            journeyLevel: o.journeyLevel,
            sessionRuntime: o.sessionRuntime
          })
        : {};
    var filtered = OP.filterCigarNames(names, ctx);
    var ranked = OP.rankCigarNames ? OP.rankCigarNames(filtered, ctx) : filtered;
    return (ranked || [])
      .map(function (n) {
        return resolveCigarId(n);
      })
      .filter(Boolean);
  }

  function filterSpiritIdsForCigarAnchor(cigarId, spiritIds, o) {
    var OP = global.OntologyPolicy;
    var lp = lounge();
    if (!OP || !lp || !cigarId) return spiritIds || [];
    var cigarName = displayNameForId('cigar', cigarId);
    var spiritNames = idsToDisplayNames('spirit', spiritIds);
    var ex = o.explorationOpts || {};
    var pairingStrat = ex.pairingStrategy || 'balanced';
    var ctx =
      typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({
            promptText: o.promptText,
            journeyLevel: o.journeyLevel,
            sessionRuntime: o.sessionRuntime,
            pairingStrategy: pairingStrat
          })
        : { pairingStrategy: pairingStrat };
    if (typeof OP.filterSpiritNamesByStrategy === 'function') {
      spiritNames = OP.filterSpiritNamesByStrategy(spiritNames, cigarName, pairingStrat);
    }
    if (typeof OP.rankSpirits === 'function') {
      var ranked = OP.rankSpirits(
        spiritNames
          .map(function (n) {
            return lp.findSpiritByName(n);
          })
          .filter(Boolean),
        ctx,
        cigarName
      );
      return ranked
        .map(function (s) {
          return s && s.id ? s.id : resolveSpiritId(s.name);
        })
        .filter(Boolean);
    }
    return spiritIds;
  }

  function filterCigarIdsByBrand(cigarIds, brandLock) {
    var FBP = global.FlightBrandPolicy;
    if (!FBP || !brandLock || typeof FBP.filterCigarsByManufacturer !== 'function') {
      return cigarIds;
    }
    var names = idsToDisplayNames('cigar', cigarIds);
    var filtered = FBP.filterCigarsByManufacturer(names, brandLock);
    if (filtered.length < 3) return cigarIds;
    return filtered
      .map(function (n) {
        return resolveCigarId(n);
      })
      .filter(Boolean);
  }

  function reconcileHighProofMaduroSlotGuardIds(slotIds, candidateIds, o) {
    var C = global.OntologyPolicyCore;
    var OP = global.OntologyPolicy;
    if (!C || !slotIds || typeof C.isBlockedForHighProofAnchorSlot !== 'function') return slotIds;
    var ctx =
      OP && typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({
            promptText: o.promptText,
            journeyLevel: o.journeyLevel,
            sessionRuntime: o.sessionRuntime
          })
        : {};
    var spirit =
      o.anchorSpiritId && typeof getById === 'function' ? getById('spirit', o.anchorSpiritId) : null;
    if (!C.isHighProofBourbonContext(ctx, spirit)) return slotIds;

    var pool = (candidateIds || []).filter(function (id) {
      if (!id) return false;
      var p = getById('cigar', id);
      return p && !C.isBlockedForHighProofAnchorSlot(p, ctx);
    });
    if (!pool.length) return slotIds;

    var out = {
      best: slotIds.best,
      safe: slotIds.safe,
      wildcard: slotIds.wildcard
    };
    ['best', 'safe'].forEach(function (slot) {
      var id = out[slot];
      var p = id ? getById('cigar', id) : null;
      if (!p || !C.isBlockedForHighProofAnchorSlot(p, ctx)) return;
      var repl = pool.find(function (cand) {
        return cand && cand !== out.best && cand !== out.safe && cand !== out.wildcard;
      });
      if (repl) out[slot] = repl;
    });
    return out;
  }

  function reconcileWildcardBodyIntentIds(slotIds, candidateIds, o) {
    if (!slotIds || !slotIds.wildcard || !slotIds.best) return slotIds;
    var anchorSpiritId = o && o.anchorSpiritId;
    if (!anchorSpiritId) return slotIds;
    var wantsFull =
      (o && o.bodyConstraint === 'full') ||
      /\bfull[\s-]?body\b|\bfull[\s-]?strength\b|\bfull\s+cigar\b/i.test((o && o.promptText) || '');
    if (!wantsFull) return slotIds;
    if (cigarBodyTierForId(slotIds.wildcard) === 'Full') return slotIds;

    var pool = (candidateIds || []).filter(function (id) {
      return (
        id &&
        id !== slotIds.best &&
        id !== slotIds.safe &&
        cigarBodyTierForId(id) === 'Full'
      );
    });
    if (!pool.length) return slotIds;

    var ranked = rankCandidateIds('spirit', anchorSpiritId, pool, {
      slotRole: 'wildcard',
      pairingStrategy: 'contrast',
      promptText: o.promptText,
      journeyLevel: o.journeyLevel,
      sessionRuntime: o.sessionRuntime,
      candidateCategory: 'cigar'
    });
    var pick = null;
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].contrastScore >= 0.2 && ranked[i].id) {
        pick = ranked[i].id;
        break;
      }
    }
    if (!pick && ranked.length && ranked[0].id) pick = ranked[0].id;
    if (pick) slotIds.wildcard = pick;
    return slotIds;
  }

  function reconcileBestPickBodyIntentIds(slotIds, anchorSpiritId, cigarIds, o) {
    var CSB = global.CigarSublineBody;
    if (!CSB || typeof CSB.reconcileBestPickBodyIntent !== 'function') return slotIds;
    var anchorName = displayNameForId('spirit', anchorSpiritId);
    var candNames = idsToDisplayNames('cigar', cigarIds);
    var nameSlots = {
      best: displayNameForId('cigar', slotIds.best),
      safe: displayNameForId('cigar', slotIds.safe),
      wildcard: displayNameForId('cigar', slotIds.wildcard)
    };
    var reconciled = CSB.reconcileBestPickBodyIntent(nameSlots, anchorName, candNames, o);
    return {
      best: resolveCigarId(reconciled.best) || slotIds.best,
      safe: resolveCigarId(reconciled.safe) || slotIds.safe,
      wildcard: resolveCigarId(reconciled.wildcard) || slotIds.wildcard
    };
  }

  function applyFlightSlotDiversityIds(slotIds, anchorSpiritId, cigarIds, o) {
    var FBP = global.FlightBrandPolicy;
    if (!FBP || typeof FBP.applyFlightSlotDiversity !== 'function') return slotIds;
    var ex = o.explorationOpts || {};
    var ranked = rankCandidateIds('spirit', anchorSpiritId, cigarIds, ex);
    var nameSlots = {
      best: displayNameForId('cigar', slotIds.best),
      safe: displayNameForId('cigar', slotIds.safe),
      wildcard: displayNameForId('cigar', slotIds.wildcard)
    };
    var diverse = FBP.applyFlightSlotDiversity(nameSlots, ranked, {
      cigarBrandLock: o.cigarBrandLock || null
    });
    return {
      best: resolveCigarId(diverse.best) || slotIds.best,
      safe: resolveCigarId(diverse.safe) || slotIds.safe,
      wildcard: resolveCigarId(diverse.wildcard) || slotIds.wildcard
    };
  }

  /** Spirit-only flights â€” three distinct pours scored against a stable cigar anchor. */
  function pickSpiritOnlySlotIds(spiritIds, peOpts) {
    var ids = (spiritIds || []).slice();
    if (!ids.length) return { best: null, safe: null, wildcard: null };
    var cigarAnchor = listMenuCigarIds()[0] || null;
    var slots;
    if (cigarAnchor) {
      slots = pickSlotIds('cigar', cigarAnchor, ids, peOpts || {});
    } else {
      slots = {
        best: ids[0],
        safe: ids[1] || ids[0],
        wildcard: ids[2] || ids[1] || ids[0]
      };
    }
    if (slots.best === slots.safe && ids.length > 1) slots.safe = ids[1];
    if (slots.safe === slots.wildcard && ids.length > 2) slots.wildcard = ids[2];
    if (slots.best === slots.wildcard && ids.length > 2) slots.wildcard = ids[2];
    return slots;
  }
  Object.assign(pid, {
    cigarBodyTierForId: cigarBodyTierForId,
    filterCigarIdsByBody: filterCigarIdsByBody,
    filterCigarIdsByWrapperIntent: filterCigarIdsByWrapperIntent,
    applyFullBodyCandidateFilterIds: applyFullBodyCandidateFilterIds,
    policyFilterCigarIds: policyFilterCigarIds,
    filterSpiritIdsForCigarAnchor: filterSpiritIdsForCigarAnchor,
    filterCigarIdsByBrand: filterCigarIdsByBrand,
    reconcileHighProofMaduroSlotGuardIds: reconcileHighProofMaduroSlotGuardIds,
    reconcileWildcardBodyIntentIds: reconcileWildcardBodyIntentIds,
    reconcileBestPickBodyIntentIds: reconcileBestPickBodyIntentIds,
    applyFlightSlotDiversityIds: applyFlightSlotDiversityIds,
    pickSpiritOnlySlotIds: pickSpiritOnlySlotIds
  });

  var RR = global.RecommendationRuntime;
  if (RR) RR.productIds = pid;
})(typeof window !== 'undefined' ? window : global);
