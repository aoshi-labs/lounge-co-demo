/**
 * execute-handlers-a.mjs — freeze-case op handlers group A.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupA(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'validateCards') {
    return SR.validateCards(
      input.cards || [],
      input.promptText || '',
      input.options || {},
      deckKeyFn
    );
  }

  if (op === 'pickWildcardDescriptors') {
    return {
      peat: SR.pickWildcardDescriptor('peat smoke islay'),
      luxury: SR.pickWildcardDescriptor('luxury collector rare'),
      default: SR.pickWildcardDescriptor('blanton')
    };
  }

  if (op === 'normalizeRecoLabel') {
    return {
      disallowed: SR.normalizeRecoLabel('Not A Label', 'Best Pick'),
      allowed: SR.normalizeRecoLabel('Luxury Pour', 'Best Pick')
    };
  }

  if (op === 'containsCompetingSignal') {
    return SR.containsCompetingRecommendationSignal(input.text || '', input.card || null);
  }

  if (op === 'inferCategoryBias') {
    const SFM = ctx.SterlonFlavorMatch;
    if (!SFM || typeof SFM.inferCategoryBias !== 'function') {
      throw new Error('SterlonFlavorMatch.inferCategoryBias required');
    }
    const cases = input.cases || [
      { text: 'What cigar would pair with this bourbon?', expect: 'cigar' },
      { text: 'What should I pour with my full-bodied cigar?', expect: 'spirit' },
      { text: 'show me something with caramel and chocolate', expect: null },
      { text: 'Suggest a cigar with cocoa and espresso notes', expect: 'cigar' }
    ];
    return cases.map(function (c) {
      var bias = SFM.inferCategoryBias(c.text);
      return {
        text: c.text,
        bias: bias,
        ok: bias === c.expect
      };
    });
  }

  if (op === 'productTagAliasCrossMatch') {
    const SFM = ctx.SterlonFlavorMatch;
    if (!SFM || typeof SFM.scoreMenu !== 'function') {
      throw new Error('SterlonFlavorMatch.scoreMenu required');
    }
    const text = input.text || 'something peaty';
    const category = input.category || 'cigar';
    const result = SFM.scoreMenu(text, { category });
    const top = result.rankings[0] || null;
    return {
      memberTags: result.memberTags,
      confident: result.confident,
      topName: top ? top.name : null,
      topCategory: top ? top.category : null,
      topMatched: top ? top.matched : [],
      smokeViaPeatAlias: top ? top.matched.indexOf('smoke') !== -1 : false
    };
  }

  if (op === 'parseFlavorTags') {
    const SFM = ctx.SterlonFlavorMatch;
    if (!SFM || typeof SFM.parseFlavorTags !== 'function') {
      throw new Error('SterlonFlavorMatch.parseFlavorTags required');
    }
    const cases = input.cases || [
      { text: 'show me something with caramel and chocolate' },
      { text: 'That pour had dark chocolate and cedar notes' },
      { text: 'peated smoke and iodine' }
    ];
    return cases.map(function (c) {
      var tags = SFM.parseFlavorTags(c.text);
      var tagsRepeat = SFM.parseFlavorTags(c.text);
      return {
        text: c.text,
        tags: tags,
        stableOnRepeat: JSON.stringify(tags) === JSON.stringify(tagsRepeat)
      };
    });
  }

  if (op === 'flavorSeekingIntent') {
    const SFM = ctx.SterlonFlavorMatch;
    if (!SFM) throw new Error('SterlonFlavorMatch required');
    const cases = input.cases || [
      {
        text: 'That pour had dark chocolate and cedar notes',
        seeking: false,
        route: false
      },
      {
        text: 'show me something with caramel and chocolate',
        seeking: true,
        route: true
      },
      {
        text: 'I noticed dark chocolate and cedar on the palate',
        seeking: false,
        route: false
      }
    ];
    return cases.map(function (c) {
      var seeking = SFM.hasFlavorSeekingIntent(c.text);
      var route = SFM.shouldAttemptFlavorRoute(c.text);
      return {
        text: c.text,
        hasFlavorSeekingIntent: seeking,
        shouldAttemptFlavorRoute: route,
        ok: seeking === c.seeking && route === c.route
      };
    });
  }

  if (op === 'classifyExpertiseBranchLong') {
    const RT = ctx.SterlonChatRouter;
    if (!RT || typeof RT.classifyExpertiseBranch !== 'function') {
      throw new Error('SterlonChatRouter.classifyExpertiseBranch required');
    }
    const text = input.text ||
      'Tell me what makes the Liga Privada No. 9 draw differently from other Nicaraguan full-bodies — ' +
      "I've heard it has something to do with the broadleaf wrapper and the fermentation process" +
      ' and whether that changes how the smoke sits on the palate compared to other ligero-forward blends from the same factory and aging program' +
      ' and whether that changes how the smoke sits on the palate compared to other ligero-forward blends from the same factory and aging program.';
    return {
      textLen: text.length,
      over400: text.length > 400,
      branch: RT.classifyExpertiseBranch(text),
      isExpertise: !!(RT.isExpertiseIntent && RT.isExpertiseIntent(text))
    };
  }

}
