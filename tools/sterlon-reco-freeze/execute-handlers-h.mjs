/**
 * execute-handlers-h.mjs — freeze-case op handlers group H.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupH(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'ontologyDiagnosticsSnapshot') {
    const OD = ctx.SterlonOntologyDiagnostics;
    const snap = OD && typeof OD.snapshot === 'function' ? OD.snapshot() : null;
    return {
      snap,
      ok: snap && snap.trackerCigars >= 100 && snap.affinityCoveragePct >= 90
    };
  }

  if (op === 'pairingQualityGate') {
    const dataset = loadPairingEvalDataset();
    const result = runPairingQualityGate(ctx, dataset);
    return {
      canonicalPass: result.canonicalPass,
      canonicalTotal: result.canonicalTotal,
      scenarioPass: result.scenarioPass,
      scenarioTotal: result.scenarioTotal,
      averageGrade: result.averageGrade,
      averageGradeNumeric: result.averageGradeNumeric,
      antiPairingViolations: result.antiPairingViolations,
      ontologyLiftAvg: result.ontologyLiftAvg,
      gate: result.gate,
      ok: result.ok
    };
  }

  if (op === 'refinementIntentBoundary') {
    const RT = ctx.SterlonChatRouter;
    if (!RT || typeof RT.isRefinementIntent !== 'function') {
      throw new Error('SterlonChatRouter.isRefinementIntent required');
    }
    const cases = (input.cases || []).map(function mapCase(item) {
      const actual = !!RT.isRefinementIntent(item.prompt);
      return {
        id: item.id,
        expect: !!item.expect,
        actual: actual,
        ok: actual === !!item.expect
      };
    });
    return {
      cases: cases,
      ok: cases.every(function allOk(c) { return c.ok; })
    };
  }

  if (op === 'cigarSensoryNormalize') {
    const LC = ctx.LoungeCatalog;
    if (!LC || typeof LC.normalizeCigarProduct !== 'function') {
      throw new Error('LoungeCatalog.normalizeCigarProduct required');
    }
    const cases = (input.cases || []).map(function mapCase(item) {
      const normalized = LC.normalizeCigarProduct(item.input);
      let actual;
      let ok;
      if (item.expectUnchanged) {
        actual = { unchanged: normalized === item.input };
        ok = normalized === item.input;
      } else {
        actual = {
          body: normalized.spec && normalized.spec.body,
          strength: normalized.spec && normalized.spec.strength,
          strengthLabel: normalized.spec && normalized.spec.strengthLabel
        };
        ok =
          actual.body === item.expect.body &&
          actual.strength === item.expect.strength &&
          actual.strengthLabel === item.expect.strengthLabel;
      }
      return {
        id: item.id,
        expect: item.expect || { unchanged: true },
        actual: actual,
        ok: ok
      };
    });
    return {
      cases: cases,
      ok: cases.every(function allOk(c) { return c.ok; })
    };
  }

  if (op === 'proseBrandDriftAnchor') {
    loadSterlonConciergeProseStack(ctx);
    const GP = ctx.SterlonGatewayProse;
    if (!GP || typeof GP.governGeneratedProse !== 'function') {
      throw new Error('SterlonGatewayProse.governGeneratedProse required');
    }
    const sealedCards = input.sealedCards || [];
    const transition = GP.PROSE_BRAND_DRIFT_TRANSITION || '';
    const cases = (input.cases || []).map(function mapCase(item) {
      const governed = GP.governGeneratedProse(item.prose || '', item.profile || 'recommendation_gateway', {
        sealedCards: sealedCards
      });
      const anchored = transition && governed.indexOf(transition) === 0;
      return {
        id: item.id,
        expectAnchored: !!item.expectAnchored,
        anchored: anchored,
        ok: anchored === !!item.expectAnchored
      };
    });
    return {
      cases: cases,
      ok: cases.every(function allOk(c) { return c.ok; })
    };
  }

  if (op === 'proseSealedSlotBind') {
    loadSterlonConciergeProseStack(ctx);
    const GP = ctx.SterlonGatewayProse;
    if (!GP || typeof GP.bindProseToSealedSlots !== 'function') {
      throw new Error('SterlonGatewayProse.bindProseToSealedSlots required');
    }
    const sealedCards = input.sealedCards || [];
    const cases = (input.cases || []).map(function mapCase(item) {
      const bound = GP.bindProseToSealedSlots(item.prose || '', sealedCards, { categoryFocus: 'pairing' });
      const bestMatch = bound.match(/\*\*BEST PICK:\*\*\s*([^\n]+)/i);
      const bestLine = bestMatch ? bestMatch[1].trim() : '';
      const okBest = !item.expectBestProduct || bestLine.indexOf(item.expectBestProduct) !== -1;
      const okBody =
        !item.expectBodyContains ||
        bound.toLowerCase().indexOf(String(item.expectBodyContains).toLowerCase()) !== -1;
      const okWildcard =
        !item.expectWildcardContrast ||
        /\*\*CONTRAST WILDCARD:\*\*/i.test(bound);
      var okNoDup = true;
      if (item.expectNoDuplicateWith && sealedCards[0] && sealedCards[0].spirit) {
        var bestSection = bound.split(/\*\*REFINED OPTION:\*\*/i)[0] || bound;
        var spiritEsc = String(sealedCards[0].spirit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var withSpiritRe = new RegExp('\\bwith\\s+' + spiritEsc + '\\b', 'gi');
        okNoDup = (bestSection.match(withSpiritRe) || []).length <= 1;
      }
      return {
        id: item.id,
        ok: okBest && okBody && okWildcard && okNoDup,
        bestLine: bestLine
      };
    });
    return { cases: cases, ok: cases.every(function allOk(c) { return c.ok; }) };
  }

  if (op === 'educationalRouting') {
    const RT = ctx.SterlonChatRouter;
    const SO = ctx.SterlonSessionRouting;
    if (!RT || !SO) throw new Error('SterlonChatRouter and SterlonSessionRouting required');
    const cases = (input.cases || []).map(function mapCase(item) {
      const text = item.text || '';
      const educational = RT.isEducationalComparisonIntent
        ? RT.isEducationalComparisonIntent(text)
        : false;
      const expertise = RT.isExpertiseIntent ? RT.isExpertiseIntent(text) : false;
      const comparison = RT.isComparisonIntent ? RT.isComparisonIntent(text) : false;
      const continuity = SO.interpretContinuityIntent
        ? SO.interpretContinuityIntent(text)
        : 'none';
      return {
        id: item.id,
        educational: educational,
        expertise: expertise,
        comparison: comparison,
        continuity: continuity,
        ok:
          educational === !!item.expectEducational &&
          expertise === !!item.expectExpertise &&
          (comparison === !!item.expectComparisonContinuity ||
            (item.expectComparisonContinuity
              ? continuity === 'comparison'
              : continuity !== 'comparison'))
      };
    });
    return { cases: cases, ok: cases.every(function allOk(c) { return c.ok; }) };
  }

  if (op === 'categoryFocusOrder') {
    const RT = ctx.SterlonChatRouter;
    if (!RT || typeof RT.inferCategoryFocus !== 'function') {
      throw new Error('SterlonChatRouter.inferCategoryFocus required');
    }
    const cases = (input.cases || []).map(function mapCase(item) {
      const focus = RT.inferCategoryFocus(item.text || '');
      return {
        id: item.id,
        focus: focus || null,
        ok: focus === item.expectFocus
      };
    });
    return { cases: cases, ok: cases.every(function allOk(c) { return c.ok; }) };
  }

  if (op === 'proseCatalogStrip') {
    loadSterlonConciergeProseStack(ctx);
    const PP = ctx.SterlonProsePipeline;
    if (!PP || typeof PP.stripCatalogSchemaFromProse !== 'function') {
      throw new Error('SterlonProsePipeline.stripCatalogSchemaFromProse required');
    }
    const cases = (input.cases || []).map(function mapCase(item) {
      const out = PP.stripCatalogSchemaFromProse(item.input || '');
      const okContains =
        !item.expectContains ||
        out.toLowerCase().indexOf(String(item.expectContains).toLowerCase()) !== -1;
      const excludes = item.expectExcludes || [];
      const okExcludes = excludes.every(function (needle) {
        return out.toLowerCase().indexOf(String(needle).toLowerCase()) === -1;
      });
      return { id: item.id, ok: okContains && okExcludes, output: out };
    });
    return { cases: cases, ok: cases.every(function allOk(c) { return c.ok; }) };
  }

}
