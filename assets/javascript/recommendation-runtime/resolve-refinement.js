/**
 * RecommendationRuntime.resolveRefinementFromContext — refinement turn authority (RR-E2).
 *
 * Ports mutateActiveSet / mutateTierSlot policy from sterlon-chat.js. Returns a new
 * immutable RecommendationTurn with provenance lineage; parent turn is never mutated.
 */
(function (global) {
  'use strict';

  var SCORING_VERSION = 1;
  var SLOT_KEYS = ['best', 'refined', 'wildcard'];
  var SLOT_INDEX = { best: 0, refined: 1, wildcard: 2 };

  function normalizeRefineAxis(axis) {
    if (axis === 'softer') return 'lighter';
    if (axis === 'under30') return 'budget';
    if (axis === 'connoisseur') return 'adventure';
    if (axis === 'contrast' || axis === 'unexpected' || axis === 'interesting') return 'contrast';
    return axis;
  }

  function PIDs() {
    return global.RecommendationProductIds || null;
  }

  function tagsForProductId(id, category) {
    var pid = PIDs();
    if (!pid || !id) return [];
    var p =
      category === 'spirit'
        ? global.LoungeProducts && global.LoungeProducts.getSpiritById
          ? global.LoungeProducts.getSpiritById(id)
          : null
        : category === 'cigar' && global.LoungeProducts && global.LoungeProducts.getCigarById
          ? global.LoungeProducts.getCigarById(id)
          : null;
    if (!p || !p.tags || !p.tags.length) return [];
    return p.tags
      .slice()
      .sort(function (a, b) {
        return (b.weight || 0) - (a.weight || 0);
      })
      .slice(0, 6)
      .map(function (t) {
        return t.id;
      });
  }

  function coerceId(id, menuIds, fallbackId, sel, pid) {
    if (pid && typeof pid.coerceMenuId === 'function') {
      return pid.coerceMenuId(id, menuIds, fallbackId);
    }
    if (sel && typeof sel.coerceMenuId === 'function') {
      return sel.coerceMenuId(id, menuIds, fallbackId);
    }
    return id || fallbackId;
  }

  function ladderStepId(currentId, ladderIds, direction, sel) {
    if (!currentId) return currentId;
    if (sel && typeof sel.getIntensityAdjacentId === 'function') {
      var axis = direction < 0 ? 'lighter' : direction > 0 ? 'bolder' : null;
      if (axis === null) return currentId;
      var adj = sel.getIntensityAdjacentId(currentId, axis, ladderIds);
      return adj != null ? adj : currentId;
    }
    var idx = ladderIds.indexOf(currentId);
    if (idx === -1) {
      return direction < 0 ? ladderIds[0] : ladderIds[Math.min(2, ladderIds.length - 1)];
    }
    var next = idx + direction;
    if (next < 0) return ladderIds[0];
    if (next >= ladderIds.length) return ladderIds[ladderIds.length - 1];
    return ladderIds[next];
  }

  function pickTasteAdjacentRefinement(currentSpirit, axis, adjacentTable, peatedPattern, sel) {
    var key = normalizeRefineAxis(axis);
    var spirit = currentSpirit || '';
    if (sel && typeof sel.getRefinementTarget === 'function') {
      var result = sel.getRefinementTarget(spirit, key, adjacentTable);
      if (result) return result;
      return null;
    }
    var mapped = adjacentTable[spirit];
    if (mapped && mapped[key]) return mapped[key];
    return null;
  }

  function applyTasteAdjacentToCard(card, axis, menus, sel, pid) {
    var spiritKey =
      (card.spiritId && pid && pid.displayNameForId('spirit', card.spiritId)) || card.spirit || '';
    var adjacent = pickTasteAdjacentRefinement(
      spiritKey,
      axis,
      menus.adjacentTable,
      menus.peatedPattern,
      sel
    );
    if (!adjacent) return { card: card, proseTail: '' };
    var next = Object.assign({}, card, {
      spiritId: adjacent.spirit
        ? coerceId(
            pid ? pid.resolveSpiritId(adjacent.spirit) : null,
            menus.spiritIds,
            card.spiritId,
            sel,
            pid
          )
        : card.spiritId,
      cigarId: adjacent.cigar
        ? coerceId(
            pid ? pid.resolveCigarId(adjacent.cigar) : null,
            menus.cigarIds,
            card.cigarId,
            sel,
            pid
          )
        : card.cigarId,
      foodId: adjacent.food
        ? coerceId(
            pid ? pid.resolveFoodId(adjacent.food) : null,
            menus.foodIds,
            card.foodId,
            sel,
            pid
          )
        : card.foodId,
      why: (adjacent.why || card.why || []).slice()
    });
    return { card: next, proseTail: adjacent.proseTail || '' };
  }

  function mutateCard(card, axis, slotKey, opts) {
    var o = opts || {};
    var SR = global.SterlonRecommendations;
    var sel = global.RecommendationSelectors;
    var pid = PIDs();
    var menus = o.menus || {};
    var ids = pid ? pid.resolveProductIds(card) : {};
    var next = Object.assign({}, card, {
      cigarId: ids.cigarId || card.cigarId,
      spiritId: ids.spiritId || card.spiritId,
      foodId: ids.foodId || card.foodId,
      why: (card.why || []).slice()
    });
    var refinementTail = '';
    var direction = axis === 'lighter' ? -1 : axis === 'bolder' ? 1 : 0;
    var spiritLadder = o.spiritLadderIds || menus.spiritIds || [];
    var cigarLadder = o.cigarLadderIds || menus.cigarIds || [];

    if (axis === 'lighter' || axis === 'bolder') {
      var tasteShift = applyTasteAdjacentToCard(next, axis, menus, sel, pid);
      if (tasteShift.proseTail) {
        next = tasteShift.card;
        refinementTail = tasteShift.proseTail;
      } else {
        var OP = global.OntologyPolicy;
        var refineStrat =
          OP && typeof OP.refinementStrategyForAxis === 'function'
            ? OP.refinementStrategyForAxis(axis)
            : 'complementary';
        var recoCtx =
          OP && typeof OP.buildRecoContext === 'function'
            ? OP.buildRecoContext({
                promptText: o.sourcePrompt || '',
                journeyLevel: o.journeyLevel,
                sessionRuntime: o.sessionRuntime,
                pairingStrategy: refineStrat
              })
            : { pairingStrategy: refineStrat };
        var newSpiritId = ladderStepId(next.spiritId, spiritLadder, direction, sel);
        if (OP && typeof OP.pickSpiritPreservingAffinity === 'function' && next.cigarId && pid) {
          var cigarName = pid.displayNameForId('cigar', next.cigarId);
          var ladderNames = pid.idsToDisplayNames('spirit', spiritLadder);
          var pickedName = OP.pickSpiritPreservingAffinity(
            pid.displayNameForId('spirit', newSpiritId),
            cigarName,
            ladderNames.length ? ladderNames : pid.idsToDisplayNames('spirit', menus.spiritIds || []),
            recoCtx
          );
          newSpiritId = pid.resolveSpiritId(pickedName) || newSpiritId;
        }
        var newCigarId = ladderStepId(next.cigarId, cigarLadder, direction, sel);
        next.spiritId = coerceId(newSpiritId, menus.spiritIds, next.spiritId, sel, pid);
        next.cigarId = coerceId(newCigarId, menus.cigarIds, next.cigarId, sel, pid);
        if (axis === 'lighter') {
          next.why[0] = 'Keeps the richness but lands softer on the finish.';
        } else {
          next.why[0] = 'More weight in the glass without the smoke turning muddy.';
        }
      }
    } else if (axis === 'budget') {
      var ceiling = o.budgetCeiling == null ? 30 : Number(o.budgetCeiling);
      var pickBudgetId =
        sel && typeof sel.pickSpiritForBudgetId === 'function'
          ? sel.pickSpiritForBudgetId(ceiling, next.spiritId)
          : next.spiritId;
      next.spiritId = coerceId(pickBudgetId, menus.spiritIds, next.spiritId, sel, pid);
      next.why[0] = 'Stays in budget and still drinks well beside the cigar.';
    } else if (axis === 'contrast') {
      var CP = global.ContrastPairing;

      if (!next.spiritId) {
        var CONTRAST_BODIES = {
          Full: ['Mild', 'Medium-Light', 'Medium'],
          'Medium-Full': ['Mild', 'Medium-Light', 'Medium'],
          Medium: ['Full', 'Medium-Full'],
          'Medium-Light': ['Full', 'Medium-Full', 'Medium'],
          Mild: ['Full', 'Medium-Full', 'Medium']
        };
        var allCigarIds = (pid && pid.listMenuCigarIds()) || [];
        var currentBody = pid ? pid.cigarBodyTierForId(next.cigarId) : '';
        var preferredBodies = CONTRAST_BODIES[currentBody] || [];
        var contrastCigarId = null;
        for (var ci = 0; ci < allCigarIds.length; ci++) {
          if (allCigarIds[ci] === next.cigarId) continue;
          if (preferredBodies.length) {
            var cp2Body = pid.cigarBodyTierForId(allCigarIds[ci]);
            if (cp2Body && preferredBodies.indexOf(cp2Body) !== -1) {
              contrastCigarId = allCigarIds[ci];
              break;
            }
          }
        }
        if (!contrastCigarId) {
          for (var ci2 = 0; ci2 < allCigarIds.length; ci2++) {
            if (allCigarIds[ci2] !== next.cigarId) {
              contrastCigarId = allCigarIds[ci2];
              break;
            }
          }
        }
        if (contrastCigarId) {
          next.cigarId = coerceId(contrastCigarId, menus.cigarIds, next.cigarId, sel, pid);
          next.why[0] =
            'A deliberate contrast — plays against the weight and flavor register of the first pick.';
        } else {
          next.why[0] = 'Dialing back the weight for a different register on the palate.';
        }
      } else if (CP && pid && next.cigarId) {
        var spiritIds = menus.spiritIds || pid.listMenuSpiritIds();
        var ranked = pid.rankCandidateIds('cigar', next.cigarId, spiritIds, {
          promptText: o.sourcePrompt || 'something unexpected',
          journeyLevel: o.journeyLevel,
          sessionRuntime: o.sessionRuntime,
          pairingStrategy: 'contrast',
          slotRole: 'wildcard'
        });
        var pickId = null;
        for (var ri = 0; ri < ranked.length; ri++) {
          if (ranked[ri].id !== next.spiritId && ranked[ri].contrastScore >= 0.35) {
            pickId = ranked[ri].id;
            break;
          }
        }
        if (!pickId && ranked.length) pickId = ranked[0].id;
        if (pickId) {
          next.spiritId = coerceId(pickId, menus.spiritIds, next.spiritId, sel, pid);
          var analysis = CP.analyzePair(
            pid.displayNameForId('cigar', next.cigarId),
            pid.displayNameForId('spirit', next.spiritId)
          );
          var cLine = CP.buildContrastWhyLine(
            pid.displayNameForId('cigar', next.cigarId),
            pid.displayNameForId('spirit', next.spiritId),
            analysis
          );
          next.why[0] = cLine || 'A deliberate contrast — tension on the palate, still lounge-defensible.';
        }
      } else {
        next.why[0] = 'Leaning into contrast — a pour that sharpens the smoke instead of echoing it.';
      }
      if (o.sessionRuntime) o.sessionRuntime.pairingStrategy = 'contrast';
    } else if (axis === 'adventure' || axis === 'luxury') {
      var E = global.RecommendationEntropy;
      var recent =
        E && typeof E.recentCountsFromSession === 'function'
          ? E.recentCountsFromSession(o.sessionRuntime || {})
          : null;
      var refineSeed =
        (o.parentTurnId || '') + '|' + axis + '|' + slotKey + '|' + (next.spiritId || '');
      if (slotKey === 'wildcard' || axis === 'adventure' || axis === 'luxury') {
        if (E && typeof E.pickRefinementLuxurySpirit === 'function' && pid) {
          var luxSpiritName = E.pickRefinementLuxurySpirit(
            pid.displayNameForId('spirit', next.spiritId),
            { seedText: refineSeed, recent: recent }
          );
          next.spiritId = coerceId(
            pid.resolveSpiritId(luxSpiritName),
            menus.spiritIds,
            next.spiritId,
            sel,
            pid
          );
        }
        if (E && typeof E.pickRefinementLuxuryCigar === 'function' && pid) {
          var luxCigarName = E.pickRefinementLuxuryCigar(
            pid.displayNameForId('cigar', next.cigarId),
            { seedText: refineSeed + '|cigar', recent: recent }
          );
          next.cigarId = coerceId(
            pid.resolveCigarId(luxCigarName),
            menus.cigarIds,
            next.cigarId,
            sel,
            pid
          );
        }
        if (SR && SR.pickWildcardDescriptor && pid) {
          next.descriptor =
            SR.pickWildcardDescriptor(pid.displayNameForId('spirit', next.spiritId)) ||
            next.descriptor;
        }
      }
      next.why[0] =
        axis === 'luxury'
          ? 'More craftsmanship and finish — still coherent beside the cigar.'
          : 'A bolder pour if you want a little more to sit with tonight.';
    }

    return { card: next, refinementTail: refinementTail };
  }

  function slotIndexesForTarget(target) {
    var targetKey = target === 'set' ? 'set' : target || 'best';
    if (targetKey === 'set') return [0, 1, 2];
    var idx = SLOT_INDEX[targetKey];
    return idx != null ? [idx] : [0];
  }

  function applyRefinementToCards(parentCards, axis, target, opts) {
    var cards = (parentCards || []).map(function (c) {
      return Object.assign({}, c);
    });
    while (cards.length < 3) cards.push({});
    var indexes = slotIndexesForTarget(target);
    var bestTail = '';
    for (var i = 0; i < indexes.length; i++) {
      var idx = indexes[i];
      var slotKey = SLOT_KEYS[idx] || 'best';
      var result = mutateCard(cards[idx], axis, slotKey, opts);
      cards[idx] = result.card;
      if (idx === 0 && result.refinementTail) bestTail = result.refinementTail;
    }
    return { cards: cards, refinementTail: bestTail };
  }

  /**
   * @param {object} opts
   * @param {object} opts.parentTurn
   * @param {string} opts.refinementAxis
   * @param {string} [opts.refinementTarget]
   * @param {number} [opts.budgetCeiling]
   * @param {string} [opts.journeyLevel]
   * @param {string} [opts.sourcePrompt]
   * @returns {{ turn: object, refinementTail: string }|null}
   */
  function resolveRefinementFromContext(opts) {
    var o = opts || {};
    var TH = global.RecommendationTurnHelpers;
    var RR = global.RecommendationRuntime;
    var SR = global.SterlonRecommendations;
    var parent = o.parentTurn;

    if (!TH || typeof TH.createRecommendationTurn !== 'function') {
      return null;
    }
    if (!parent || !Array.isArray(parent.cards) || !parent.cards.length) {
      return null;
    }

    var axis = normalizeRefineAxis(o.refinementAxis || 'lighter');
    var parentProv = parent.provenance || {};
    var parentTurnId = parentProv.turnId || null;
    var journeyLevel = o.journeyLevel || parent.journeyLevel || 'advanced';
    var sourcePrompt =
      o.sourcePrompt ||
      (parentProv.promptText != null ? parentProv.promptText : '') ||
      '';

    var SEL = global.RecommendationSelectors;
    var PIDsMod = global.RecommendationProductIds;
    var catalogLadderIds =
      SEL && typeof SEL.buildCatalogIntensityLadderIds === 'function'
        ? SEL.buildCatalogIntensityLadderIds()
        : { spirits: [], cigars: [] };
    var menus = {
      spiritIds: PIDsMod ? PIDsMod.listMenuSpiritIds() : [],
      cigarIds: PIDsMod ? PIDsMod.listMenuCigarIds() : [],
      foodIds: [],
      adjacentTable: {},
      peatedPattern: o.peatedPourPattern || /\b(islay|peated|peat|smoky)\b/i
    };

    var applied = applyRefinementToCards(parent.cards, axis, o.refinementTarget, {
      budgetCeiling: o.budgetCeiling,
      journeyLevel: journeyLevel,
      spiritLadderIds: catalogLadderIds.spirits,
      cigarLadderIds: catalogLadderIds.cigars,
      catalogLadderIds: catalogLadderIds,
      menus: menus,
      sessionRuntime: o.sessionRuntime,
      parentTurnId: parentTurnId,
      sourcePrompt: sourcePrompt
    });

    if (SR && typeof SR.verifyRecommendationCards === 'function') {
      var verification = SR.verifyRecommendationCards(applied.cards);
      if (!verification.ok && typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[Sterlon][resolve-refinement] Off-menu products after refinement.',
          verification.violations
        );
      }
    }

    var FPP = global.FlightPhilosophyPolicy;
    if (FPP && typeof FPP.repairCollapsedFlightCards === 'function') {
      var parentLocked =
        parentProv.lockedBestCigarId ||
        (parent.cards[0] && parent.cards[0].cigarId) ||
        null;
      var repairOut = FPP.repairCollapsedFlightCards(applied.cards, {
        categoryFocus: o.categoryFocus || null,
        anchorSpiritId: applied.cards[0] && applied.cards[0].spiritId,
        lockedBestCigarId: parentLocked,
        promptText: sourcePrompt,
        sessionRuntime: o.sessionRuntime,
        flightMode: parentProv.flightMode || 'pairing',
        namedSpiritLocked:
          parentProv.signals &&
          parentProv.signals.indexOf('named-spirit') !== -1,
        rankedCigars: parentProv.rankedCigars || null,
        rankedSpirits: parentProv.rankedSpirits || null
      });
      applied.cards = repairOut.cards;
    }

    var signals = ['refinement-policy', 'context-runtime', 'refinement-' + axis, 'ontology-refinement', 'flight-philosophy'];
    var prov = {
      source: 'recommendation-runtime',
      module: 'resolve-refinement',
      scoringVersion: SCORING_VERSION,
      runtimeVersion: RR && RR.version != null ? RR.version : 1,
      promptText: sourcePrompt || null,
      signals: signals,
      parentTurnId: parentTurnId,
      refinementType: axis,
      refinementReason: 'chat-refinement-' + axis,
      refinementSource: o.refinementSource || 'chat-refinement-chip'
    };

    var turn = TH.createRecommendationTurn({
      cards: applied.cards,
      journeyLevel: journeyLevel,
      degraded: false,
      provenance: prov
    });

    return { turn: turn, refinementTail: applied.refinementTail || '' };
  }

  var RR0 = global.RecommendationRuntime;
  if (RR0) {
    RR0.resolveRefinementFromContext = resolveRefinementFromContext;
  }
})(typeof window !== 'undefined' ? window : global);
