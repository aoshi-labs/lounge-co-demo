/**
 * build-set helper functions — companion to build-set.js.
 * Exposes anchor resolution, rerank, provenance assembly, and route-category helpers.
 * Load after build-set.js.
 */
(function (global) {
  'use strict';

  function flavorRouteCategory(focus, text) {
    if (focus === 'cigar') return 'cigar';
    if (focus === 'spirit') return 'spirit';
    if (focus === 'pairing') {
      var tl = String(text || '').toLowerCase();
      if (/\b(pair|recommend|suggest|want|need|give me)\b/.test(tl) && /\bcigar\b/.test(tl)) {
        return 'cigar';
      }
      if (
        /\b(pair|pour|drink|sipping|drinking)\b/.test(tl) &&
        /\b(whiskey|whisky|bourbon|spirit|scotch|rye)\b/.test(tl)
      ) {
        return 'spirit';
      }
      return 'cigar';
    }
    return 'spirit';
  }

  function rerankBestPairingSlot(cardList, rerankOpts) {
    var PE = global.PairingEvaluation;
    var CP = global.ContrastPairing;
    var pid = global.RecommendationProductIds;
    if (!PE || !cardList || cardList.length < 2) return { cards: cardList, reranked: false, skipped: false };
    var ro = rerankOpts || {};
    var lockedBestCigarId = ro.lockedBestCigarId || null;
    var strat =
      ro.session && ro.session.pairingStrategy
        ? ro.session.pairingStrategy
        : CP && CP.inferStrategy
          ? CP.inferStrategy(ro.promptText || '', {
              journeyLevel: ro.journeyLevel,
              sessionRuntime: ro.session || {}
            }).strategy
          : 'balanced';
    var bestIdx = 0;
    var bestScore = -1;
    for (var ri = 0; ri < cardList.length; ri += 1) {
      var rc = cardList[ri];
      if (!rc) continue;
      var cigarName =
        rc.cigar || (pid && rc.cigarId ? pid.displayNameForId('cigar', rc.cigarId) : null);
      var spiritName =
        rc.spirit || (pid && rc.spiritId ? pid.displayNameForId('spirit', rc.spiritId) : null);
      if (!cigarName || !spiritName) continue;
      var rs = PE.scorePairing(cigarName, spiritName, {
        context: {
          promptText: ro.promptText,
          journeyLevel: ro.journeyLevel,
          pairingStrategy: strat
        },
        modes: { pairingStrategy: strat }
      });
      if (rs.numericScore > bestScore) {
        bestScore = rs.numericScore;
        bestIdx = ri;
      }
    }
    if (bestIdx === 0 || bestScore < 0) return { cards: cardList, reranked: false, skipped: false };
    if (lockedBestCigarId && cardList[bestIdx] && cardList[bestIdx].cigarId !== lockedBestCigarId) {
      return { cards: cardList, reranked: false, skipped: true };
    }
    var out = cardList.slice();
    var slot0 = out[0];
    var slotN = out[bestIdx];
    var swapFields = ['cigar', 'cigarId', 'spirit', 'spiritId', 'why'];
    swapFields.forEach(function (field) {
      var tmp = slot0[field];
      slot0[field] = slotN[field];
      slotN[field] = tmp;
    });
    return { cards: out, reranked: true, skipped: false };
  }

  function resolveRouteAndAnchor(p) {
    var opts = p.opts;
    var session = p.session;
    var route = p.route;
    var promptText = p.promptText;
    var journeyLevel = p.journeyLevel;
    var categoryFocus = p.categoryFocus;
    var spiritBudgetFilter = p.spiritBudgetFilter;
    var brandHint = p.brandHint;
    var deckKey = p.deckKey;

    var PIDsMod = global.RecommendationProductIds;
    var anchorSpirit = null;
    var anchorCigar = null;
    var usedNamedSpirit = false;
    var usedFlavorRoute = false;
    var usedCatalogAnchor = false;
    var catalogAnchorSignal = null;

    var SPM = global.SterlonProductMatch;
    var namedSpiritAnchorId =
      !opts.anchorCigar &&
      !(route && route.category === 'cigar') &&
      SPM &&
      typeof SPM.resolveNamedSpiritId === 'function'
        ? SPM.resolveNamedSpiritId(promptText)
        : null;
    var namedSpiritAnchor =
      namedSpiritAnchorId && PIDsMod
        ? PIDsMod.displayNameForId('spirit', namedSpiritAnchorId)
        : !opts.anchorCigar &&
            !(route && route.category === 'cigar') &&
            SPM &&
            typeof SPM.resolveNamedSpirit === 'function'
          ? SPM.resolveNamedSpirit(promptText)
          : null;

    if (opts.anchorCigar) {
      anchorCigar = opts.anchorCigar;
    } else if (route && route.category === 'cigar' && route.product && route.product.name) {
      usedFlavorRoute = true;
      anchorCigar = route.product.name;
    } else if (namedSpiritAnchorId || namedSpiritAnchor) {
      usedNamedSpirit = true;
      anchorSpirit =
        namedSpiritAnchor ||
        (PIDsMod && namedSpiritAnchorId
          ? PIDsMod.displayNameForId('spirit', namedSpiritAnchorId)
          : null);
    } else if (route && route.category === 'spirit' && route.product && route.product.name) {
      usedFlavorRoute = true;
      anchorSpirit = route.product.name;
    } else {
      var SA = global.SpiritAnchor;
      var CP = global.ContrastPairing;
      var stratMeta =
        CP && typeof CP.inferStrategy === 'function'
          ? CP.inferStrategy(promptText, { journeyLevel: journeyLevel, sessionRuntime: session })
          : { strategy: 'balanced' };
      session.pairingStrategy = stratMeta.strategy;
      var sessionBest = session.activeRecommendationSet && session.activeRecommendationSet.best;
      var sessionCigar = sessionBest
        ? sessionBest.cigar ||
          (PIDsMod && sessionBest.cigarId
            ? PIDsMod.displayNameForId('cigar', sessionBest.cigarId)
            : null)
        : null;
      var luxuryHint =
        (stratMeta.strategy === 'classic_lounge' || /\b(luxury|celebration|top shelf|special occasion)\b/i.test(promptText)) &&
        global.PairingIconic &&
        typeof global.PairingIconic.luxurySpiritCandidates === 'function' &&
        global.LoungeProducts &&
        typeof global.LoungeProducts.listMenuSpiritNames === 'function';
      if (luxuryHint) {
        var luxuryPool = global.PairingIconic.luxurySpiritCandidates(
          global.LoungeProducts.listMenuSpiritNames()
        );
        if (luxuryPool.length) {
          anchorSpirit = luxuryPool[0];
          usedCatalogAnchor = true;
          catalogAnchorSignal = 'luxury-iconic';
        }
      }
      if (!anchorSpirit && SA && typeof SA.selectCatalogSpiritAnchor === 'function') {
        var anchorPick = SA.selectCatalogSpiritAnchor({
          promptText: promptText,
          journeyLevel: journeyLevel,
          budgetFilter: spiritBudgetFilter,
          brandHint: brandHint,
          deckKey: deckKey,
          categoryFocus: categoryFocus,
          sessionDeckKey: session.activeDeckKey || null,
          flavorRouteDeckKey: route && route.deckKey ? route.deckKey : null,
          pairingCigar: opts.anchorCigar || sessionCigar,
          sessionCigar: sessionCigar,
          sessionRuntime: session
        });
        anchorSpirit = anchorPick.name;
        catalogAnchorSignal = anchorPick.signal;
        if (anchorPick.deckKey) deckKey = anchorPick.deckKey;
        if (anchorPick.affinityOverridden) session.ontologyAffinityOverride = true;
        if (anchorPick.affinity) session.ontologyPairingAffinity = anchorPick.affinity;
        usedCatalogAnchor = true;
      } else if (!anchorSpirit) {
        anchorSpirit = null;
      }
    }

    var anchorSpiritId = namedSpiritAnchorId || null;
    var anchorCigarId = null;
    if (PIDsMod) {
      if (anchorSpirit && !anchorSpiritId) {
        anchorSpiritId =
          route && route.category === 'spirit' && route.product && route.product.id
            ? route.product.id
            : PIDsMod.resolveSpiritId(anchorSpirit);
      }
      if (anchorCigar) {
        anchorCigarId =
          route && route.category === 'cigar' && route.product && route.product.id
            ? route.product.id
            : PIDsMod.resolveCigarId(anchorCigar);
      }
    }

    return {
      anchorSpirit: anchorSpirit,
      anchorCigar: anchorCigar,
      anchorSpiritId: anchorSpiritId,
      anchorCigarId: anchorCigarId,
      usedFlavorRoute: usedFlavorRoute,
      usedNamedSpirit: usedNamedSpirit,
      usedCatalogAnchor: usedCatalogAnchor,
      catalogAnchorSignal: catalogAnchorSignal,
      deckKey: deckKey
    };
  }

  function assembleProvenance(p) {
    var o = p.opts;
    var signals = ['catalog-shell', 'context-runtime'];
    if (p.usedFlavorRoute) signals.push('flavor-route');
    else if (p.usedNamedSpirit) signals.push('named-spirit');
    else if (p.usedCatalogAnchor) {
      if (p.catalogAnchorSignal === 'pairing-scored') signals.push('catalog-pairing');
      else if (p.catalogAnchorSignal === 'open-pairing') signals.push('open-pairing');
      else if (p.catalogAnchorSignal === 'open-ranked') signals.push('open-ranked');
      else if (p.catalogAnchorSignal === 'luxury-iconic') signals.push('luxury-iconic');
      else signals.push('catalog-ranked');
    }
    if (p.usedNoviceCap) signals.push('novice-cap');
    if (p.categoryFocus === 'spirit' || p.categoryFocus === 'cigar') {
      signals.push('category-' + p.categoryFocus);
    }
    if (p.budgetFilter && p.budgetFilter.mode && p.budgetFilter.mode !== 'none') {
      signals.push('budget-' + p.budgetFilter.mode);
    }
    if (p.session.pairingStrategy) signals.push('pairing-strategy-' + p.session.pairingStrategy);
    if (p.progressionIntent) signals.push('progression-intent');
    if (p.hardEligibility && p.hardEligibility.constraintsApplied && p.hardEligibility.constraintsApplied.length) {
      signals.push('hard-eligibility-gate');
      if (p.hardEligibility.degraded) signals.push('hard-eligibility-degraded');
    }
    signals.push('flight-philosophy');
    if (p.rerankSkippedForPhilosophy) signals.push('flight-philosophy-rerank-skipped');
    (p.repairSignals || []).forEach(function (sig) {
      if (signals.indexOf(sig) === -1) signals.push(sig);
    });
    if (p.session.ontologyAffinityOverride) signals.push('ontology-affinity-deck');
    if (p.session.ontologyPairingAffinity) signals.push('ontology-affinity');
    if (p.bestSlotReranked) signals.push('pairing-best-slot-rerank');
    var OPsig = global.OntologyPolicy;
    if (OPsig && typeof OPsig.getAffinityDiagnostics === 'function') {
      var od = OPsig.getAffinityDiagnostics();
      if (od && od.suppressedCount > 0) signals.push('ontology-suppressed');
    }
    var hasCuratedWhy =
      p.cards && p.cards[0] &&
      p.cards[0].why &&
      p.cards[0].why[0] &&
      /recommend when|best for|value seeker|top 25/i.test(String(p.cards[0].why[0]));
    if (hasCuratedWhy) signals.push('ontology-curated-why');
    if (o.refinementType) signals.push('refinement-' + o.refinementType);

    var prov = {
      source: 'recommendation-runtime',
      module: 'build-set',
      deckKey: p.deckKey,
      signals: signals,
      scoringVersion: p.SCORING_VERSION,
      runtimeVersion: (global.RecommendationRuntime && global.RecommendationRuntime.version) || 1,
      promptText: p.promptText || null,
      flightMode: p.anchorCigarId ? 'cigar-anchor' : 'pairing',
      lockedBestCigarId: p.lockedBestCigarId,
      rankedPoolSize: p.rankedPoolSize,
      rankedCigars: p.rankedCigars,
      rankedSpirits: p.rankedSpirits,
      generatePipelineOrder: p.generatePipelineOrder,
      progressionIntent: p.progressionIntent,
      hardEligibility: p.hardEligibility || null,
      spiritRelativesSkipped:
        p.usedNamedSpirit &&
        (p.repairSignals || []).indexOf('flight-philosophy-pool-thin') !== -1
    };
    if (o.parentTurnId) prov.parentTurnId = o.parentTurnId;
    if (o.refinementType) prov.refinementType = o.refinementType;
    if (o.refinementReason) prov.refinementReason = o.refinementReason;
    if (o.refinementSource) prov.refinementSource = o.refinementSource;
    return prov;
  }

  global.RecommendationBuildSetHelpers = {
    flavorRouteCategory: flavorRouteCategory,
    rerankBestPairingSlot: rerankBestPairingSlot,
    resolveRouteAndAnchor: resolveRouteAndAnchor,
    assembleProvenance: assembleProvenance
  };
})(typeof window !== 'undefined' ? window : global);
