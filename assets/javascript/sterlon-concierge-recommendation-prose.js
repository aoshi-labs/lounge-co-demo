/** SterlonConciergeRecommendationProse — evening, refinement, and recommendation copy. */
(function (global) {
  'use strict';

  var S = global.SterlonConciergeProseShared;
  if (!S) return;

  function buildDimensionLeadProse(text) {
    var SO = S._SO();
    var d = SO.getMergedEveningDimensions(text);
    var t = (text || '').toLowerCase();
    if (d.rhythm === 'secondWhiskey' || d.occasion === 'secondPour' || /\bsecond (whiskey|whisky)\b/.test(t)) {
      return 'For a second whiskey, I would shift the energy — still interesting, but easier to sit with while the room keeps talking.';
    }
    if (d.occasion === 'outdoor' || d.atmosphere === 'outdoorNight' || /\bbetter outside\b/.test(t)) {
      return 'Outside at night, I would keep the pour calm — enough character to notice, nothing that fights the air or the conversation.';
    }
    if (d.social === 'friendsNewToCigars') {
      return 'If your friends are newer to cigars, I would start approachable — medium body, friendly flavor, nothing that demands a lecture between puffs.';
    }
    if (d.rhythm === 'wontExhaust' || d.rhythm === 'easyToSitWith') {
      return 'If you do not want the evening to wear you out, I would pour something with a softer cadence — present, but easy to return to between stories.';
    }
    if (d.rhythm === 'opensSlowly') {
      return 'For something that opens slowly, I would lean on texture and patience in the glass — interest that arrives, not announces.';
    }
    if (d.occasion === 'afterDinner') {
      return 'After dinner, I would pour something with warmth and a composed finish — rich enough to feel intentional, never cloying.';
    }
    if (d.occasion === 'longConversation') {
      return 'For a long conversation, I would set something that evolves quietly beside the cigar — always another note to notice, never a rush.';
    }
    if (d.social === 'hosting' || d.occasion === 'hosting') {
      return 'With guests at the table, I would pour something conversation-friendly — enough presence to share, not enough to steal the room.';
    }
    if (d.occasion === 'lateNight' || d.occasion === 'endOfNight') {
      return 'Late in the evening, I would keep the rhythm contemplative — depth you can sip slowly while the room thins out.';
    }
    if (d.occasion === 'celebratory' || d.social === 'groupCelebration') {
      return 'For a night worth marking, I would pour something with a little theatre — celebratory energy without turning the table loud.';
    }
    if (d.occasion === 'solo') {
      return 'For a solo pour, I would keep the pacing personal — one glass, one chair, flavors that reward attention without demanding it.';
    }
    return null;
  }

  function buildHesitantOpenerProse(text) {
    var GP = S._GP();
    var t = (text || '').toLowerCase();
    if (/\b(smoky|smoke|peat)\b/.test(t) && /\b(not too|but not|without|a little)\b/.test(t)) {
      return GP.validateExpertiseProse(
        'We can find smoke without letting it take over the room — a whisper of peat with a softer finish, or something quieter first and we build from there. Which sounds closer?'
      );
    }
    return GP.validateExpertiseProse(
      'No rush. Tonight could go a few different directions.\n\nDo you want something quieter and smoother, or something with a little more weight and smoke behind it?'
    );
  }

  function buildAnchoredCigarPairingProse(cigar, promptText, spiritName) {
    var RT = S._RT();
    var PP = S._PP();
    var SO = S._SO();
    var label = PP.shortProductLabel(cigar.name, 'cigar');
    var offMenu = !!(RT && RT.matchOffMenuCigarInText(promptText)) || !!(RT && RT.matchOffMenuCigarInText(cigar.name));
    if (!spiritName) {
      var fallback = offMenu
        ? 'For ' + label + ' — not on tonight\'s rail, but absolutely in the conversation — I would score a pour from the rail beside it.'
        : 'For ' + label + ', I would score a pour from tonight\'s rail beside it.';
      return S._visible(PP.applyMoodToneToProse(fallback, SO.getActiveEveningMood()), promptText);
    }
    var spiritLabel = PP.shortProductLabel(spiritName, 'spirit');
    var lead = 'For ' + label + ', I would probably pour the ' + spiritLabel + ' beside it.';
    if (offMenu) {
      lead = 'For ' + label + ' — not on tonight\'s rail, but absolutely in the conversation — I would probably pour the ' + spiritLabel + ' beside it.';
    }
    var body = PP.applyMoodToneToProse(
      lead + '\n\n' +
        'The cigar wants malt sweetness and dry spice in the glass more than something pale, unless you are deliberately chasing smoke on smoke.\n\n' +
        'Cedar from the smoke, honey-toffee from the pour, and a clean finish that resets between draws.',
      SO.getActiveEveningMood()
    );
    return S._visible(body, promptText);
  }
  function buildClosingProse(text) {
    var set = S._session().activeRecommendationSet;
    if (set && set.best && set.best.cigar && set.best.spirit) {
      return 'Logged. ' + set.best.cigar + ' with the ' + set.best.spirit + ' — enjoy the rest of the night.';
    }
    return 'Good night. Come back when you\'re ready — I\'ll have something waiting.';
  }

  function buildReferentClarifyProse(candidates) {
    if (!candidates || !candidates.length) {
      return 'Happy to — which pour or cigar are you thinking of? If you mean tonight\'s pairing, just say the word.';
    }
    var names = candidates.slice(0, 3).map(function (c) { return c.name; });
    if (names.length === 1) {
      return 'Just to confirm — did you mean ' + names[0] + '?';
    }
    return 'Which did you have in mind — ' + names.slice(0, -1).join(', ') + ', or ' + names[names.length - 1] + '?';
  }

  function roleLabelForEntry(entry) {
    if (entry.role === 'best') return 'BEST PICK';
    if (entry.role === 'refined') return 'REFINED OPTION';
    if (entry.role === 'wildcard') return 'CONTRAST WILDCARD';
    return 'earlier pick';
  }

  function buildRecallProse(entry) {
    var GP = S._GP();
    var sr = S._session();
    if (entry.role === 'best' && entry.category === 'cigar' && sr.activeRecommendationSet) {
      var spirit = sr.activeRecommendationSet.best.spirit;
      var prose = 'That was the ' + entry.name + '.';
      if (spirit) {
        prose += '\n\nStill one of my favorites when a pour like the ' + spirit + ' is carrying this much depth.';
      }
      return GP.validateExpertiseProse(prose);
    }
    var role = roleLabelForEntry(entry);
    var category = entry.category === 'spirit' ? 'pour' : entry.category;
    var tagHint = entry.tags && entry.tags.indexOf('smoke') >= 0
      ? ' Smoke and depth on the palate.'
      : entry.tags && entry.tags.indexOf('japanese') >= 0
        ? ' Orchard fruit and sandalwood.'
        : ' Still in play from this thread.';
    return 'From your ' + role + ': ' + entry.name + ' (' + category + ').' + tagHint;
  }

  function buildComparisonProse(entries) {
    var lines = entries.slice(0, 3).map(function (e, i) {
      var tag = e.tags && e.tags[0] ? e.tags[0] : 'balanced';
      return (i + 1) + '. ' + e.name + ' — ' + tag + ' character, ' + roleLabelForEntry(e).toLowerCase() + ' tier.';
    });
    return 'Side by side in this session: ' + lines.join(' ') + ' Tell me which direction you prefer and I will refine from there.';
  }

  function buildTimeGreeting() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function buildGreetingProse(text) {
    var t = String(text || '').toLowerCase();
    if (/\b(hello|hi|hey|good (morning|afternoon|evening))\b/.test(t)) {
      return 'Good to have you. Are you leaning cigar, a pour, or a full pairing tonight?';
    }
    return buildTimeGreeting() + '. Tell me the mood — restrained, rich, or something with a little theatre — and I will take it from there.';
  }

  function buildDeferralProse() {
    return 'Take your time. When something pulls you — softer, bolder, or a full pairing — say the word and I will meet you there.';
  }

  function buildSoftAmbiguityProse(text) {
    var RT = S._RT();
    if (RT && RT.isHesitantOpenerIntent(text)) return buildHesitantOpenerProse(text);
    var t = (text || '').toLowerCase();
    if (/\b(maybe|perhaps|not sure|kind of|sort of)\b/.test(t)) {
      return 'We can keep it loose — tell me whether you want softer, richer, or a full pairing, and I will narrow from there.';
    }
    return buildClarificationProse(text);
  }

  function buildClarificationProse(text) {
    var RT = S._RT();
    if (RT && RT.isDeferralPrompt(text)) return buildDeferralProse();
    var t = (text || '').toLowerCase();
    var axis = RT && RT.detectClarificationAxis ? RT.detectClarificationAxis(text) : null;
    if (/what do you recommend/.test(t)) {
      return 'Happy to. Are we building around a cigar, a pour, or a full pairing at the table?';
    }
    if (axis === 'intensity' || /something good/.test(t)) {
      return 'For tonight, I would lean either softer and more polished, or deeper with a little smoke. Which feels closer?';
    }
    if (/help me/.test(t)) {
      return 'Quiet and refined, celebratory, or a little adventurous — which room are we dressing for?';
    }
    return 'Happy to narrow it — cigar-first, whiskey-forward, or a composed pairing flight?';
  }

  function pickFromPool(pool) {
    if (!pool || !pool.length) return '';
    var idx = (S._session().turnCount || 0) % pool.length;
    return pool[idx];
  }

  function buildRecommendationLeadProse(text) {
    var RT = S._RT();
    var SO = S._SO();
    var GP = S._GP();
    var SP = S._SP();
    var PP = S._PP();
    var sr = S._session();
    var t = String(text || '').toLowerCase();
    var route = sr.flavorRoute || S._resolveFlavorRoute(text);
    var SFM = global.SterlonFlavorMatch;
    if (SFM && route) {
      var flavorLead = SFM.buildFlavorLeadProse(route, route.memberTags);
      if (flavorLead) return GP.validateExpertiseProse(flavorLead);
    }
    var dimensionLead = buildDimensionLeadProse(text);
    if (dimensionLead) return GP.validateExpertiseProse(dimensionLead);
    var mood = SO.getActiveEveningMood();
    var focus = sr.activeCategoryFocus || (RT && RT.inferCategoryFocus(text));
    if (mood === 'decompress' || mood === 'calm') {
      if (focus === 'cigar' || /\bcigar\b/.test(t)) {
        return PP.applyMoodToneToProse('Something unhurried in that lane — nothing that fights the room.', mood);
      }
      return PP.applyMoodToneToProse('Something slower in that lane — present, but easy to sit with.', mood);
    }
    if (mood === 'celebratory') {
      return 'For a night worth marking, something with a little theatre in it.';
    }
    if (focus === 'spirit' || /\b(whiskey|whisky|bourbon|scotch)\b/.test(t) || /\bforward\b/.test(t)) {
      return pickFromPool(SP.SPIRIT_LEAD_POOL);
    }
    if (focus === 'cigar' || /\bcigar\b/.test(t)) {
      return pickFromPool(SP.CIGAR_LEAD_POOL);
    }
    if (focus === 'pairing' || /\bpairing|flight\b/.test(t)) {
      return pickFromPool(SP.PAIRING_LEAD_POOL);
    }
    if (/\bsmooth\b/.test(t) && /\b(interesting|adventur|curious)\b/.test(t)) {
      return 'Smooth, but with something to discover — here is where I would start.';
    }
    return pickFromPool(SP.OPEN_LEAD_POOL);
  }

  global.SterlonConciergeRecommendationProse = {
    buildDimensionLeadProse: buildDimensionLeadProse,
    buildHesitantOpenerProse: buildHesitantOpenerProse,
    buildAnchoredCigarPairingProse: buildAnchoredCigarPairingProse,
    buildClosingProse: buildClosingProse,
    buildReferentClarifyProse: buildReferentClarifyProse,
    roleLabelForEntry: roleLabelForEntry,
    buildRecallProse: buildRecallProse,
    buildComparisonProse: buildComparisonProse,
    buildTimeGreeting: buildTimeGreeting,
    buildGreetingProse: buildGreetingProse,
    buildDeferralProse: buildDeferralProse,
    buildSoftAmbiguityProse: buildSoftAmbiguityProse,
    buildClarificationProse: buildClarificationProse,
    pickFromPool: pickFromPool,
    buildRecommendationLeadProse: buildRecommendationLeadProse,
  };
})(typeof window !== 'undefined' ? window : global);
