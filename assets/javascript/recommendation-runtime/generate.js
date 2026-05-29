/**
 * RecommendationGenerate — scoring-driven card generation for one recommendation flight.
 *
 * Phase B: candidate pools and slot assignment run in catalog id space. Display names
 * are bridged only at PairingEngine / OntologyPolicy boundaries via RecommendationProductIds.
 *
 * Depends on: PairingEngine, RecommendationProductIds, RecommendationSelectors.
 */
(function (global) {
  'use strict';

  var SLOT_NAMES = ['best', 'safe', 'wildcard'];
  var SLOT_LABELS = ['BEST PICK', 'REFINED OPTION', 'CONTRAST WILDCARD'];
  var SLOT_TIERS = ['Classic', 'Value', 'Luxury'];

  function PIDs() {
    return global.RecommendationProductIds || null;
  }

  function EligibilityConstraints() {
    return global.RecommendationEligibilityConstraints || null;
  }

  function explorationOpts(o) {
    var E = global.RecommendationEntropy;
    var CP = global.ContrastPairing;
    var session = (o && o.sessionRuntime) || {};
    var strat =
      session.pairingStrategy ||
      (CP && CP.inferStrategy
        ? CP.inferStrategy(o && o.promptText, {
            journeyLevel: o && o.journeyLevel,
            sessionRuntime: session
          }).strategy
        : 'balanced');
    if (CP && typeof CP.buildRecoContextPatch === 'function' && o && o.promptText) {
      var patch = CP.buildRecoContextPatch(o.promptText, {
        journeyLevel: o.journeyLevel,
        sessionRuntime: session
      });
      session.pairingStrategy = patch.pairingStrategy;
    }
    return {
      seedText: (o && (o.promptText || o.anchorSpiritId || o.anchorCigarId)) || '',
      promptText: o && o.promptText,
      journeyLevel: o && o.journeyLevel,
      sessionRuntime: session,
      pairingStrategy: strat,
      recent:
        E && typeof E.recentCountsFromSession === 'function'
          ? E.recentCountsFromSession(session)
          : null,
      candidateCategory: null
    };
  }

  function buildWhyBulletsFromIds(cigarId, spiritId, foodId, deckWhy, pairingMeta) {
    var pid = PIDs();
    if (!pid) return (deckWhy || []).slice(0, 3);
    var cigar = pid.displayNameForId('cigar', cigarId);
    var spirit = pid.displayNameForId('spirit', spiritId);
    var food = foodId ? pid.displayNameForId('food', foodId) : null;
    var OP = global.OntologyPolicy;
    if (OP && typeof OP.buildCardWhy === 'function' && cigar && spirit) {
      return OP.buildCardWhy(cigar, spirit, food, deckWhy || [], pairingMeta);
    }
    var RR = global.RecommendationRuntime;
    if (RR && typeof RR.buildRationaleAtoms === 'function' && cigar && spirit) {
      var atoms = RR.buildRationaleAtoms(cigar, spirit, food);
      if (atoms && atoms.length) {
        var bullets = RR.renderWhyBullets(atoms, deckWhy || []);
        if (bullets && bullets.length >= 1) return bullets;
      }
    }
    return (deckWhy || []).slice(0, 3);
  }

  function cardFromSlotIds(idx, cigarId, spiritId, deckCard, why) {
    return {
      label: SLOT_LABELS[idx],
      tier: (deckCard && deckCard.tier) || SLOT_TIERS[idx],
      cigarId: cigarId,
      spiritId: spiritId,
      foodId: null,
      why: why
    };
  }

  function memberWantsFullBody(o) {
    if (o && o.bodyConstraint === 'full') return true;
    var t = (o && o.promptText) || '';
    return /\bfull[\s-]?body\b|\bfull[\s-]?strength\b|\bfull\s+cigar\b/i.test(t);
  }

  /**
   * @param {object} opts
   * @param {string} [opts.anchorSpiritId]
   * @param {string} [opts.anchorCigarId]
   * @param {string} [opts.anchorSpirit] — legacy shim; resolved once at entry
   * @param {string} [opts.anchorCigar]
   * @returns {object[]} cards with cigarId/spiritId authority (display hydrated at turn seal)
   */
  function generateRecommendations(opts) {
    var o = opts || {};
    var pid = PIDs();
    if (!pid) return [];

    var anchors = pid.resolveAnchorIds(o);
    var anchorSpiritId = anchors.spiritId;
    var anchorCigarId = anchors.cigarId;
    var deckCards = o.deckCards || [];
    var budgetFilter = o.budgetFilter || { mode: 'none' };
    var SEL = global.RecommendationSelectors;

    // ── Cigar-anchored: lock cigar id; score spirits in id space ─────────────
    if (anchorCigarId) {
      var spiritIds = pid.listMenuSpiritIds();
      spiritIds = pid.filterSpiritIdsForCigarAnchor(anchorCigarId, spiritIds, {
        promptText: o.promptText,
        journeyLevel: o.journeyLevel,
        sessionRuntime: o.sessionRuntime,
        explorationOpts: explorationOpts(o)
      });

      var lockedSpiritId = null;
      if (anchorSpiritId) {
        for (var lsi = 0; lsi < spiritIds.length; lsi += 1) {
          if (String(spiritIds[lsi]) === String(anchorSpiritId)) {
            lockedSpiritId = spiritIds[lsi];
            break;
          }
        }
      }
      var spiritPoolForOpenSlots = lockedSpiritId
        ? spiritIds.filter(function (id) { return String(id) !== String(lockedSpiritId); })
        : spiritIds;
      var spiritSlotIds = pid.pickSlotIds('cigar', anchorCigarId, spiritPoolForOpenSlots, explorationOpts(o));
      var spiritForSlot = [
        lockedSpiritId || spiritSlotIds.best,
        spiritSlotIds.safe || spiritSlotIds.best,
        spiritSlotIds.wildcard || spiritSlotIds.safe
      ];

      return SLOT_NAMES.map(function (slot, idx) {
        var spiritId = spiritForSlot[idx] || null;
        var deckCard = deckCards[idx] || {};
        var why = buildWhyBulletsFromIds(
          anchorCigarId,
          spiritId,
          null,
          deckCard.why || [],
          o.pairingMeta
        );
        return cardFromSlotIds(idx, anchorCigarId, spiritId, deckCard, why);
      });
    }

    // ── Spirit-anchored (default) ────────────────────────────────────────────
    var anchorSpiritIdResolved =
      anchorSpiritId || pid.listMenuSpiritIds()[0] || null;
    if (!anchorSpiritIdResolved) return [];

    var cigarIds = pid.listMenuCigarIds();
    if (budgetFilter && budgetFilter.mode !== 'none' && SEL && SEL.filterProductsByBudgetIds) {
      cigarIds = SEL.filterProductsByBudgetIds('cigar', budgetFilter, cigarIds);
    }
    if (o.bodyConstraint === 'full' || memberWantsFullBody(o)) {
      cigarIds = pid.applyFullBodyCandidateFilterIds(cigarIds, o);
    } else if (o.bodyConstraint) {
      cigarIds = pid.filterCigarIdsByBody(cigarIds, o.bodyConstraint);
    }
    if (pid.filterCigarIdsByWrapperIntent) {
      cigarIds = pid.filterCigarIdsByWrapperIntent(cigarIds, o.promptText);
    }
    cigarIds = pid.policyFilterCigarIds(cigarIds, o);

    var FBP = global.FlightBrandPolicy;
    var cigarBrandLock =
      FBP && typeof FBP.detectRequestedCigarBrand === 'function' && o.promptText
        ? FBP.detectRequestedCigarBrand(o.promptText)
        : null;
    if (cigarBrandLock) {
      cigarIds = pid.filterCigarIdsByBrand(cigarIds, cigarBrandLock);
    }

    /*
     * Hard eligibility gate — runs after all explicit catalog narrowing (budget,
     * body, wrapper, policy, brand lock) and before scoring/ranking/slot picking.
     *
     * Explicit member constraints (smoke time, origin) must remove ineligible
     * candidates here so that every downstream picker and reconciler operates
     * only on the eligible pool. Fallback is allowed only when degraded metadata
     * is explicit. No silent constraint relaxation in this file.
     *
     * TODO: apply hard spirit/cigar eligibility to the cigar-anchored branch
     * once constraints are formalized for that path.
     */
    var hardEligibility = null;
    var EC = EligibilityConstraints();
    if (EC && typeof EC.applyHardEligibilityConstraints === 'function') {
      hardEligibility = EC.applyHardEligibilityConstraints(cigarIds, {
        promptText: o.promptText,
        journeyLevel: o.journeyLevel,
        sessionRuntime: o.sessionRuntime,
        bodyConstraint: o.bodyConstraint,
        budgetFilter: budgetFilter,
        anchorSpiritId: anchorSpiritIdResolved,
        productIds: pid,
        toleranceMinutes: 10
      });
      if (hardEligibility && Array.isArray(hardEligibility.cigarIds)) {
        cigarIds = hardEligibility.cigarIds;
      }
      /* Use explicit fallback only when degraded — never silently. */
      if (
        hardEligibility &&
        hardEligibility.degraded === true &&
        (!cigarIds || !cigarIds.length) &&
        Array.isArray(hardEligibility.fallbackCigarIds) &&
        hardEligibility.fallbackCigarIds.length
      ) {
        cigarIds = hardEligibility.fallbackCigarIds;
      }
    }

    var ex1 = explorationOpts(o);
    ex1.candidateCategory = 'cigar';
    var hasCigarBudget = budgetFilter && budgetFilter.mode && budgetFilter.mode !== 'none';
    var cigarSlotIds = pid.pickSlotIds('spirit', anchorSpiritIdResolved, cigarIds, {
      wildcardMinTier: hasCigarBudget ? 0 : 6,
      seedText: ex1.seedText,
      recent: ex1.recent,
      promptText: o.promptText,
      pairingStrategy: ex1.pairingStrategy
    });

    cigarSlotIds = pid.applyFlightSlotDiversityIds(cigarSlotIds, anchorSpiritIdResolved, cigarIds, {
      explorationOpts: ex1,
      cigarBrandLock: cigarBrandLock
    });
    cigarSlotIds = pid.reconcileBestPickBodyIntentIds(
      cigarSlotIds,
      anchorSpiritIdResolved,
      cigarIds,
      o
    );
    cigarSlotIds = pid.reconcileWildcardBodyIntentIds(cigarSlotIds, cigarIds, {
      promptText: o.promptText,
      journeyLevel: o.journeyLevel,
      sessionRuntime: o.sessionRuntime,
      bodyConstraint: o.bodyConstraint,
      anchorSpiritId: anchorSpiritIdResolved
    });
    cigarSlotIds = pid.reconcileHighProofMaduroSlotGuardIds(cigarSlotIds, cigarIds, {
      promptText: o.promptText,
      journeyLevel: o.journeyLevel,
      sessionRuntime: o.sessionRuntime,
      anchorSpiritId: anchorSpiritIdResolved
    });

    // FPP after FBP + CSB reconciles — locked pipeline (see FlightPhilosophyPolicy.GENERATE_PIPELINE_ORDER).
    var FPP = global.FlightPhilosophyPolicy;
    var lockedBestCigarId = cigarSlotIds.best;
    var progressionIntent =
      FPP && typeof FPP.detectProgressionIntent === 'function'
        ? FPP.detectProgressionIntent(o.promptText)
        : false;
    var rankedCigars = pid.rankCandidateIds('spirit', anchorSpiritIdResolved, cigarIds, ex1);
    var OP = global.OntologyPolicy;
    var recoContext =
      OP && typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({
            promptText: o.promptText,
            journeyLevel: o.journeyLevel,
            sessionRuntime: o.sessionRuntime,
            pairingStrategy: ex1.pairingStrategy
          })
        : null;
    if (FPP && typeof FPP.applyCigarFlightPhilosophy === 'function') {
      cigarSlotIds = FPP.applyCigarFlightPhilosophy(cigarSlotIds, rankedCigars, {
        anchorSpiritId: anchorSpiritIdResolved,
        lockedBestCigarId: lockedBestCigarId,
        promptText: o.promptText,
        progressionIntent: progressionIntent,
        pairingStrategy: ex1.pairingStrategy,
        cigarBrandLock: cigarBrandLock,
        seedText: ex1.seedText,
        recoContext: recoContext
      });
    }

    // Named in-hand pour ("I'm drinking X…") — lock the same spirit on every slot; only cigars vary.
    var spiritForSlot = {
      best: anchorSpiritIdResolved,
      safe: anchorSpiritIdResolved,
      wildcard: anchorSpiritIdResolved
    };
    var rankedSpirits = [];

    var cardsOut = SLOT_NAMES.map(function (slot, idx) {
      var cigarId = cigarSlotIds[slot];
      var spiritId = spiritForSlot[slot] || anchorSpiritIdResolved;
      var deckCard = deckCards[idx] || {};
      var pairingMeta = Object.assign({}, o.pairingMeta || {}, {
        slotRole: slot,
        recoCtx: recoContext
      });
      var why = buildWhyBulletsFromIds(
        cigarId,
        spiritId,
        null,
        deckCard.why || [],
        pairingMeta
      );
      return cardFromSlotIds(idx, cigarId, spiritId, deckCard, why);
    });
    var CEP = global.CoffeeEspressoProse;
    if (CEP && typeof CEP.differentiateFlightWhy === 'function' && recoContext && CEP.isActive(recoContext)) {
      cardsOut = CEP.differentiateFlightWhy(cardsOut, recoContext);
    }
    cardsOut.hardEligibility = hardEligibility;
    cardsOut.lockedBestCigarId = lockedBestCigarId;
    cardsOut.progressionIntent = progressionIntent;
    cardsOut.rankedPoolSize = rankedCigars.length;
    cardsOut.rankedCigars = rankedCigars;
    cardsOut.rankedSpirits = rankedSpirits;
    cardsOut.recoContext = recoContext;
    cardsOut.generatePipelineOrder = FPP && FPP.GENERATE_PIPELINE_ORDER ? FPP.GENERATE_PIPELINE_ORDER.slice() : null;
    return cardsOut;
  }

  global.RecommendationGenerate = {
    generateRecommendations: generateRecommendations
  };
})(typeof window !== 'undefined' ? window : global);
