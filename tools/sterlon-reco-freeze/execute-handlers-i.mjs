/**
 * execute-handlers-i.mjs — freeze-case op handlers group I.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupI(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'comfortContextRank') {
    const OP = ctx.OntologyPolicy;
    const OCC = ctx.OntologyCigarContext;
    const pid = ctx.RecommendationProductIds;
    if (!OP || !OCC || !pid) throw new Error('OntologyPolicy + OntologyCigarContext required');
    const text = input.promptText || 'approachable but still interesting, not intimidating';
    const recoCtx = OP.buildRecoContext({
      promptText: text,
      journeyLevel: input.journeyLevel || 'advanced',
      sessionRuntime: input.session || {}
    });
    const nameA = input.cigarA || 'E.P. Carrillo Encore Majestic';
    const nameB = input.cigarB || 'Arturo Fuente Chateau Fuente Double';
    const scoreA = OCC.cigarContextScore(nameA, recoCtx);
    const scoreB = OCC.cigarContextScore(nameB, recoCtx);
    const sophisticatedBeatsBland = scoreA > scoreB;
    return {
      comfortAskDetected: !!recoCtx.comfortAsk,
      scoreA,
      scoreB,
      scoreDelta: scoreA - scoreB,
      sophisticatedBeatsBland,
      ok: sophisticatedBeatsBland && scoreA > scoreB
    };
  }

  if (op === 'comfortHospitalitySuite') {
    const RR = ctx.RecommendationRuntime;
    const FPP = ctx.FlightPhilosophyPolicy;
    const OP = ctx.OntologyPolicy;
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : null;
    if (!resolveTurn) throw new Error('resolveRecommendationTurn required');

    const prompts = input.prompts || [
      'Something approachable but still interesting for tonight — not boring, not intimidating.',
      'I am new to cigars — keep it relaxed and smooth, nothing that feels like maximum strength.',
      'Hosting friends who rarely smoke — approachable cigars, still worth talking about.',
      'Smooth and easy sipping tonight; I do not want nicotine to take over the evening.',
      'Lighter cigar beside the pour — comfortable, not a powerhouse.',
      'Sophisticated flavor without an intimidating strength arc — step up in taste, not aggression.'
    ];

    const PIDs = ctx.RecommendationProductIds;
    const cases = prompts.map(function (promptText, idx) {
      const session = {};
      const journeyLevel = effectiveJourneyLevel(WJ, session, promptText);
      const turn = resolveTurn({
        promptText,
        journeyLevel,
        sessionRuntime: session
      });
      const cards = turn.cards || [];
      const prov = turn.provenance || {};
      const recoCtx = OP.buildRecoContext({ promptText, journeyLevel, sessionRuntime: session });
      const cigarIds = cards.map((c) => (c && c.cigarId ? c.cigarId : null)).filter(Boolean);
      const distinct = (function () {
        const seen = Object.create(null);
        for (let i = 0; i < cigarIds.length; i++) {
          const k = cigarIds[i];
          if (seen[k]) return false;
          seen[k] = true;
        }
        return true;
      })();

      let connecticutCount = 0;
      let allLowMild = cards.length >= 3;
      const wrappers = [];
      cards.forEach(function (c) {
        if (!c || !c.cigarId || !PIDs) return;
        const p = PIDs.getProductRef('cigar', PIDs.displayNameForId('cigar', c.cigarId));
        const w = p && p.spec && p.spec.wrapper ? String(p.spec.wrapper) : '';
        wrappers.push(w);
        if (/connecticut/i.test(w)) connecticutCount += 1;
        const tier = p && p.spec && p.spec.tier != null ? Number(p.spec.tier) : 0;
        const str = p && p.spec && p.spec.strength != null ? Number(p.spec.strength) : 0;
        const pepper = p && p.sensory && p.sensory.pepper != null ? Number(p.sensory.pepper) : 0;
        if (!(tier <= 4 && str <= 4 && pepper <= 4)) allLowMild = false;
      });

      const slotMeta =
        FPP && typeof FPP.computeSlotRoleMetadata === 'function'
          ? FPP.computeSlotRoleMetadata(cards, { lockedBestCigarId: prov.lockedBestCigarId })
          : [];
      const rankedPoolSize = prov.rankedPoolSize != null ? prov.rankedPoolSize : 0;
      const poolOk = rankedPoolSize >= 3;
      const bestMeta = slotMeta[0] || {};
      const refinedMeta = slotMeta[1] || {};
      const wildMeta = slotMeta[2] || {};
      const refinedLanePreserved =
        !poolOk ||
        (refinedMeta.tier != null &&
          bestMeta.tier != null &&
          (refinedMeta.tier >= bestMeta.tier ||
            (refinedMeta.lineKey &&
              bestMeta.lineKey &&
              refinedMeta.lineKey !== bestMeta.lineKey)));
      const wildcardLanePreserved =
        !poolOk ||
        (wildMeta.contrastVsBest != null && wildMeta.contrastVsBest >= 0.25) ||
        (wildMeta.manufacturerKey &&
          bestMeta.manufacturerKey &&
          wildMeta.manufacturerKey !== bestMeta.manufacturerKey);

      const comfortAskDetected = !!recoCtx.comfortAsk;
      const connecticutCapOk = connecticutCount <= 1;
      const cigarIdsDistinct = cigarIds.length < 2 || distinct;
      const notAllLowTierMild = !allLowMild;
      const suiteOk =
        comfortAskDetected &&
        connecticutCapOk &&
        cigarIdsDistinct &&
        refinedLanePreserved &&
        wildcardLanePreserved &&
        notAllLowTierMild;

      return {
        id: 'prompt-' + (idx + 1),
        comfortAskDetected,
        connecticutCapOk,
        connecticutWrapperCount: connecticutCount,
        cigarIdsDistinct,
        refinedLanePreserved,
        wildcardLanePreserved,
        notAllLowTierMild,
        wrapperKeysInFlight: wrappers,
        suiteOk
      };
    });

    return {
      cases,
      allPromptsOk: cases.every((c) => c.suiteOk),
      ok: cases.every((c) => c.suiteOk)
    };
  }

  if (op === 'flightPhilosophyTurn') {
    const WJ = ctx.WhiskeyJourney;
    const FPP = ctx.FlightPhilosophyPolicy;
    const PEV = ctx.PairingEvaluation;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) {
      throw new Error('RecommendationRuntime.resolveRecommendationTurn required for flightPhilosophyTurn');
    }
    const session = input.session || {};
    const text = input.promptText || '';
    const journeyLevel =
      input.journeyLevel != null ? input.journeyLevel : effectiveJourneyLevel(WJ, session, text);
    const turn = resolveTurn({
      promptText: text,
      journeyLevel,
      sessionRuntime: session,
      categoryFocus: 'categoryFocus' in input ? input.categoryFocus : undefined
    });
    const cards = turn.cards || [];
    const prov = turn.provenance || {};
    const signals = Array.isArray(prov.signals) ? prov.signals.slice() : [];
    const cigarIds = cards.map(function (c) {
      return c && c.cigarId ? c.cigarId : null;
    });
    const spiritIds = cards.map(function (c) {
      return c && c.spiritId ? c.spiritId : null;
    });
    function idsDistinct(arr) {
      const seen = Object.create(null);
      for (let i = 0; i < arr.length; i++) {
        const k = arr[i];
        if (!k) continue;
        if (seen[k]) return false;
        seen[k] = true;
      }
      return true;
    }
    const lockedBest = prov.lockedBestCigarId || null;
    const bestCard = cards[0] || null;
    const slotRoleMetadata =
      FPP && typeof FPP.computeSlotRoleMetadata === 'function'
        ? FPP.computeSlotRoleMetadata(cards, { lockedBestCigarId: lockedBest })
        : [];
    const bestMeta = slotRoleMetadata[0] || {};
    const refinedMeta = slotRoleMetadata[1] || {};
    const wildMeta = slotRoleMetadata[2] || {};
    const rankedPoolSize = prov.rankedPoolSize != null ? prov.rankedPoolSize : null;
    const poolOk = rankedPoolSize == null || rankedPoolSize >= 3;
    const wildcardContrastMeaningful =
      !poolOk ||
      (wildMeta.contrastVsBest != null && wildMeta.contrastVsBest >= 0.25) ||
      (wildMeta.manufacturerKey &&
        bestMeta.manufacturerKey &&
        wildMeta.manufacturerKey !== bestMeta.manufacturerKey);
    const refinedElevatedVsBest =
      !poolOk ||
      (refinedMeta.tier != null &&
        bestMeta.tier != null &&
        (refinedMeta.tier >= bestMeta.tier ||
          (refinedMeta.lineKey &&
            bestMeta.lineKey &&
            refinedMeta.lineKey !== bestMeta.lineKey &&
            refinedMeta.tier >= bestMeta.tier - 1)));
    const anchorSpiritId = bestCard && bestCard.spiritId ? bestCard.spiritId : null;
    const SPM = ctx.SterlonProductMatch;
    const namedSpiritId =
      SPM && typeof SPM.resolveNamedSpiritId === 'function' ? SPM.resolveNamedSpiritId(text) : null;
    const spiritPool =
      FPP && typeof FPP.filterSpiritPoolByDeck === 'function' && anchorSpiritId
        ? FPP.filterSpiritPoolByDeck(ctx.RecommendationProductIds.listMenuSpiritIds(), anchorSpiritId)
        : [];
    const spiritRelativesDistinctWhenPoolAllows =
      spiritPool.length < 2 ? true : idsDistinct(spiritIds.filter(Boolean));
    const repairFired = signals.filter(function (s) {
      return (
        s === 'flight-philosophy-repair-cigar' ||
        s === 'flight-philosophy-repair-spirit' ||
        s === 'flight-philosophy-pool-thin'
      );
    });
    const OP = ctx.OntologyPolicy;
    const recoCtx =
      OP && typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({ promptText: text, journeyLevel, sessionRuntime: session })
        : null;
    let connecticutWrapperCount = 0;
    let minTier = 99;
    let maxStrength = 0;
    slotRoleMetadata.forEach(function (m) {
      if (m.wrapper && /connecticut/i.test(m.wrapper)) connecticutWrapperCount += 1;
      if (m.tier != null && m.tier < minTier) minTier = m.tier;
      if (m.strength != null && m.strength > maxStrength) maxStrength = m.strength;
    });
    if (minTier === 99) minTier = null;

    const out = {
      comfortAskDetected: recoCtx ? !!recoCtx.comfortAsk : false,
      targetSmokeMinutes: recoCtx ? recoCtx.targetSmokeMinutes : null,
      connecticutWrapperCount,
      minTierInFlight: minTier,
      maxStrengthInFlight: maxStrength,
      cardsProductIds: cards.map(function (c, i) {
        return {
          slot: SLOT_KEYS[i] || null,
          cigarId: c && c.cigarId != null ? c.cigarId : null,
          spiritId: c && c.spiritId != null ? c.spiritId : null
        };
      }),
      cigarIdsDistinct: idsDistinct(cigarIds.filter(Boolean)),
      spiritIdsDistinct: idsDistinct(spiritIds.filter(Boolean)),
      spiritBestIsAnchor: !namedSpiritId || (bestCard && bestCard.spiritId === namedSpiritId),
      spiritRelativesDistinctWhenPoolAllows: spiritRelativesDistinctWhenPoolAllows,
      bestPreservesLockedId: !lockedBest || (bestCard && bestCard.cigarId === lockedBest),
      slotRoleMetadata: slotRoleMetadata,
      wildcardContrastMeaningful: wildcardContrastMeaningful,
      refinedElevatedVsBest: refinedElevatedVsBest,
      repairFired: repairFired,
      progressionIntent: !!prov.progressionIntent,
      provenanceSignals: signals,
      generatePipelineOrder: prov.generatePipelineOrder || null,
      rankedPoolSize: rankedPoolSize,
      governanceOk:
        ctx.RecommendationTurnHelpers &&
        ctx.RecommendationTurnHelpers.validateRecommendationTurn(turn, { governance: true }).ok
    };
    if (input.includePairingEval && PEV && bestCard && bestCard.cigarId && anchorSpiritId) {
      const pid = ctx.RecommendationProductIds;
      const anchorSpirit = pid.displayNameForId('spirit', anchorSpiritId);
      const grades = cards.map(function (c) {
        if (!c || !c.cigarId) return null;
        const cigar = pid.displayNameForId('cigar', c.cigarId);
        const scored = PEV.scorePairing(cigar, anchorSpirit, { context: { promptText: text, journeyLevel } });
        return scored && scored.numericScore != null ? scored.numericScore : null;
      });
      out.pairingEvalGrades = grades;
      if (grades[0] != null && grades[1] != null && grades[2] != null) {
        out.bestPairingGradeGteRefinedMinusOne = grades[0] >= grades[1] - 1;
        out.wildcardHospitalityContrast = grades[2] >= grades[1];
      }
    }
    return out;
  }

  if (op === 'guestQualityAuthority') {
    const RT = ctx.SterlonChatRouter;
    const RR = ctx.RecommendationRuntime;
    const SPM = ctx.SterlonProductMatch;
    const pid = ctx.RecommendationProductIds;
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime.resolveRecommendationTurn required');

    const cases = (input.cases || []).map(function mapGuestCase(item) {
      const text = item.promptText || '';
      const session = item.session || {};
      const journeyLevel =
        item.journeyLevel != null ? item.journeyLevel : effectiveJourneyLevel(WJ, session, text);
      const focus =
        RT && typeof RT.inferCategoryFocus === 'function' ? RT.inferCategoryFocus(text) : null;
      const turn = resolveTurn({
        promptText: text,
        journeyLevel,
        sessionRuntime: session,
        categoryFocus: 'categoryFocus' in item ? item.categoryFocus : focus
      });
      const cards = turn.cards || [];
      const checks = {};

      if (item.categoryFocus === 'cigar') {
        checks.noSpiritOnCards = cards.every(function (c) {
          return c && !c.spirit && !c.spiritId;
        });
      }

      if (item.expectNamedSpiritId) {
        const namedId =
          SPM && typeof SPM.resolveNamedSpiritId === 'function'
            ? SPM.resolveNamedSpiritId(text)
            : null;
        checks.namedSpiritResolved = namedId === item.expectNamedSpiritId;
        checks.bestSpiritLocked =
          cards[0] && cards[0].spiritId === item.expectNamedSpiritId;
        if (item.expectSpiritLockedAllSlots) {
          checks.allSlotsSameSpirit = cards.every(function (c) {
            return c && c.spiritId === item.expectNamedSpiritId;
          });
        }
      }

      if (item.forbiddenSpiritNamePattern) {
        const re = new RegExp(item.forbiddenSpiritNamePattern, 'i');
        const anchorName =
          cards[0] && cards[0].spiritId && pid
            ? pid.displayNameForId('spirit', cards[0].spiritId)
            : cards[0] && cards[0].spirit
              ? cards[0].spirit
              : '';
        checks.morningSpiritNotPeated = !re.test(String(anchorName || ''));
      }

      if (item.expectDistinctWhyAcrossSlots) {
        const stems = cards.map(function (c) {
          const why = c && Array.isArray(c.why) ? c.why : [];
          const first = why[0] ? String(why[0]) : '';
          return first
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^a-z0-9 ]/g, '')
            .trim()
            .slice(0, 48);
        });
        const unique = new Set(stems.filter(Boolean));
        checks.distinctWhyAcrossSlots =
          unique.size === stems.filter(Boolean).length && unique.size >= 2;
      }

      if (item.expectSpiritDeckIn && Array.isArray(item.expectSpiritDeckIn)) {
        const SDK = ctx.SpiritDeckKey;
        const anchorId = cards[0] && cards[0].spiritId;
        const spiritProduct =
          anchorId && pid && typeof pid.getById === 'function' ? pid.getById('spirit', anchorId) : null;
        const deck =
          spiritProduct && SDK && typeof SDK.inferDeckKeyFromProduct === 'function'
            ? SDK.inferDeckKeyFromProduct(spiritProduct)
            : spiritProduct && spiritProduct.deckKey
              ? spiritProduct.deckKey
              : null;
        checks.spiritDeckInCoffeeBias = item.expectSpiritDeckIn.indexOf(deck) !== -1;
      }

      if (item.expectFocus) {
        checks.categoryFocus = focus === item.expectFocus;
      }

      if (item.forbidLigeroHeavyOnAnchorSlots) {
        const C = ctx.OntologyPolicyCore;
        const OP = ctx.OntologyPolicy;
        const recoCtx =
          OP && typeof OP.buildRecoContext === 'function'
            ? OP.buildRecoContext({
                promptText: text,
                journeyLevel,
                sessionRuntime: session
              })
            : {};
        const anchorSlots = item.forbidLigeroHeavyOnAnchorSlots;
        checks.noLigeroHeavyOnAnchorSlots = anchorSlots.every(function (slot) {
          const idx = SLOT_KEYS.indexOf(slot);
          const card = cards[idx];
          if (!card || !card.cigarId || !C || typeof C.isBlockedForHighProofAnchorSlot !== 'function') {
            return true;
          }
          const p =
            pid && typeof pid.getById === 'function' ? pid.getById('cigar', card.cigarId) : null;
          return !C.isBlockedForHighProofAnchorSlot(p, recoCtx);
        });
      }

      if (item.expectAllMaduroCigars) {
        checks.allMaduroCigars = cards.every(function (c) {
          if (!c || !c.cigarId || !pid) return false;
          const p = pid.getById('cigar', c.cigarId);
          const blob = [
            pid.displayNameForId('cigar', c.cigarId),
            p && p.spec && p.spec.wrapper,
            p && p.guidance && p.guidance.wrapperRole
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return /\b(maduro|broadleaf|san andr(?:es)?)\b/.test(blob);
        });
      }

      if (item.forbiddenCigarNamePattern) {
        const cre = new RegExp(item.forbiddenCigarNamePattern, 'i');
        const slotsToCheck = item.forbiddenCigarSlots || ['best', 'safe', 'wildcard'];
        checks.noForbiddenCigarNames = slotsToCheck.every(function (slot) {
          const idx = SLOT_KEYS.indexOf(slot);
          const card = cards[idx];
          const name =
            card && card.cigarId && pid
              ? pid.displayNameForId('cigar', card.cigarId)
              : card && card.cigar
                ? card.cigar
                : '';
          return !cre.test(String(name || ''));
        });
      }

      const ok = Object.keys(checks).every(function (k) {
        return checks[k];
      });
      return {
        id: item.id,
        categoryFocus: focus,
        checks,
        ok,
        cardsProductIds: cards.map(function (c, i) {
          return {
            slot: SLOT_KEYS[i] || null,
            cigarId: c && c.cigarId != null ? c.cigarId : null,
            spiritId: c && c.spiritId != null ? c.spiritId : null,
            why: c && Array.isArray(c.why) ? c.why.slice(0, 3) : []
          };
        })
      };
    });

    return { cases, ok: cases.every(function (c) { return c.ok; }) };
  }

  throw new Error('Unknown freeze op: ' + op);
}
