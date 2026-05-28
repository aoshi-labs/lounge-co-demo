/** SterlonConciergeExpertise — product expertise prose branches. */
(function (global) {
  'use strict';

  var S = global.SterlonConciergeProseShared;
  if (!S) return;

  function buildConfidenceBoundaryProse(text) {
    var RT = S._RT();
    var PP = S._PP();
    var GP = S._GP();
    var SP = S._SP();
    if (!RT) return GP.validateExpertiseProse('');
    var offSpirit = RT.matchOffMenuProductInText(text);
    var offCigar = RT.matchOffMenuCigarInText(text);
    var named = offSpirit || offCigar || RT.matchMenuProductInText(text);
    if (named && SP.OFF_MENU_SPIRIT_GUIDANCE[named.name]) {
      return GP.validateExpertiseProse(SP.OFF_MENU_SPIRIT_GUIDANCE[named.name]);
    }
    if (named && named.category === 'cigar' && SP.OFF_MENU_CIGAR_GUIDANCE[named.name]) {
      return GP.validateExpertiseProse(SP.OFF_MENU_CIGAR_GUIDANCE[named.name]);
    }
    if (named && named.category === 'cigar' && RT.matchOffMenuCigarInText(text)) {
      var key = Object.keys(SP.OFF_MENU_CIGAR_GUIDANCE).find(function (k) { return named.name.indexOf(k) === 0; });
      if (key) return GP.validateExpertiseProse(SP.OFF_MENU_CIGAR_GUIDANCE[key]);
    }
    var label = named ? PP.shortProductLabel(named.name, named.category) : 'that bottle';
    var category = named ? named.category : 'spirit';
    return GP.validateExpertiseProse(
      category === 'cigar'
        ? 'I have not spent enough evenings with ' + label + ' on this rail to quote it the way I would a cigar we keep in regular rotation. Stylistically I can sketch the lane — body, spice, and finish — and if you want a composed pairing from tonight\'s list, ask what spirit pairs well with it.'
        : 'I have not spent enough evenings with ' + label + ' on this table to guide you confidently yet. Stylistically I can sketch the lane — blended harmony, gentle oak, easy finish — but for something I know pour by pour tonight, say the word and I will point you to the rail.'
    );
  }

  function sensoryComparativeLine(subjectLabel, altLabel, axis) {
    var lines = {
      softer: altLabel + ' opens more slowly beside the cigar — citrus and spice lift where ' + subjectLabel + ' leans heavier on oak and caramel.',
      lessPeat: altLabel + ' keeps the evening weight in the bourbon lane without chasing smoke in the glass.',
      lessAggressive: altLabel + ' sits softer on the palate — same depth, less edge between sips.',
      warmer: altLabel + ' feels warmer in the glass — toffee and baking spice curling around the cigar.',
      rounder: altLabel + ' rounds the finish — the caramel line lingers a touch softer where ' + subjectLabel + ' stays more angular.',
      moreElegant: altLabel + ' trades drama for silk — citrus lift and cream where ' + subjectLabel + ' leans darker oak.',
      richer: altLabel + ' adds plushness without leaving the lane — more to sit with, not more noise.',
      cigarForward: 'If you want the cigar to lead, ' + altLabel + ' steps back in the glass so cedar and spice stay in front.'
    };
    return lines[axis] || lines.softer;
  }

  function adjacentSpiritOnLadder(name, steps) {
    var ladder = S._spiritLadder();
    var idx = ladder.indexOf(name);
    if (idx === -1) return null;
    var next = ladder[idx + steps];
    return next && next !== name ? next : null;
  }

  function adjacentCigarOnLadder(name, steps) {
    var ladder = S._cigarLadder();
    var idx = ladder.indexOf(name);
    if (idx === -1) return null;
    var next = ladder[idx + steps];
    return next && next !== name ? next : null;
  }

  function buildContextualExpertiseProse(subject, text) {
    var RT = S._RT();
    var PP = S._PP();
    var GP = S._GP();
    if (!RT) return GP.validateExpertiseProse('');
    var name = subject.name;
    var label = PP.shortProductLabel(name, subject.category);
    var profile = RT.getExpertiseNarrative(name);
    var key = RT.pickContextualKey(text);
    if (profile && profile.contextual && profile.contextual[key]) {
      return GP.validateExpertiseProse(profile.contextual[key]);
    }
    if (subject.category === 'spirit') {
      var fallbacks = {
        afterDinner: label + ' usually lands better after you have eaten — the weight and finish make more sense when your palate is not looking for something light.',
        acquiredTaste: label + ' rewards patience. First sip can feel assertive; the character opens up when you sip slowly and let the finish settle.',
        winter: label + ' fits a colder evening well — something you sip slowly rather than rush through.',
        summerEvening: label + ' can still work on a warm night — pour a little lighter and let the cigar stay medium-bodied so nothing overheats on the palate.',
        lateNight: label + ' belongs late in the evening — the room is quiet and the finish has space to unfold.',
        firstCigar: 'For a first cigar I would keep the pour gentler than ' + label + ' — save the heavier glass until they already like a little structure beside the smoke.',
        specialOccasion: label + ' suits a special evening when you want one pour to feel like the main event.',
        celebratory: label + ' works for a celebratory night when you want weight and character without rushing the glass.',
        longConversation: label + ' is built for a long conversation — it changes slowly, so there is always something to notice between stories.',
        tooHeavyForBeginner: label + ' can feel like a lot upfront for a beginner — I would ease them in with something softer, then bring this back once they like smoke in the glass.',
        casual: label + ' works on a casual night if you want one pour to focus on. It is not really a background spirit.'
      };
      return GP.validateExpertiseProse(fallbacks[key] || fallbacks.afterDinner);
    }
    var cigarFallbacks = {
      afterDinner: label + ' is an after-table smoke for most people — richer flavor once you are settled in, not while you are still grazing.',
      acquiredTaste: label + ' can feel full early if you are newer to cigars; the balance usually shows more in the second third if you keep the pace slow.',
      lateNight: label + ' is a late-night cigar — dense flavor that rewards a settled pace.',
      longConversation: label + ' burns evenly enough for a long conversation if you keep the draw relaxed.',
      casual: label + ' is fine for a casual night if you want one cigar for the evening. Lighter social pacing keeps it from running bitter.'
    };
    return GP.validateExpertiseProse(cigarFallbacks[key] || cigarFallbacks.afterDinner);
  }

  function buildSensoryFollowupProse(subject, text) {
    var RT = S._RT();
    var PP = S._PP();
    var GP = S._GP();
    if (!RT) return GP.validateExpertiseProse('');
    var name = subject.name;
    var label = PP.shortProductLabel(name, subject.category);
    var profile = RT.getExpertiseNarrative(name);
    var key = RT.pickSensoryKey(text);
    if (profile && profile.sensory && profile.sensory[key]) {
      return GP.validateExpertiseProse(profile.sensory[key]);
    }
    if (subject.category === 'spirit') {
      var fallbacks = {
        smokeLinger: 'The smoke on ' + label + ' tends to linger — dry and savory rather than cloying — so you notice it between sips more than on a lighter malt.',
        finishDry: 'The finish on ' + label + ' stays relatively dry; sweetness, if it shows up, usually arrives mid-palate rather than hanging on at the end.',
        evolution: label + ' opens up as you go. The first sips are often more direct; the middle of the glass is where nuance usually appears.'
      };
      return GP.validateExpertiseProse(fallbacks[key] || fallbacks.smokeLinger);
    }
    var cigarFallbacks = {
      smokeLinger: 'The smoke from ' + label + ' hangs in the retrohale — spice and cedar building slowly rather than hitting all at once.',
      finishDry: 'The finish stays clean if you pace it; puff too fast and pepper can take over before the creamier notes return.',
      evolution: 'The second third is where ' + label + ' usually shows its balance — the first third is more about lighting and initial spice.'
    };
    return GP.validateExpertiseProse(cigarFallbacks[key] || cigarFallbacks.smokeLinger);
  }

  function buildComparativeCuriosityProse(subject, text) {
    var RT = S._RT();
    var PP = S._PP();
    var GP = S._GP();
    if (!RT) return GP.validateExpertiseProse('');
    var name = subject.name;
    var label = PP.shortProductLabel(name, subject.category);
    var profile = RT.getExpertiseNarrative(name);
    var axis = RT.pickComparativeAxis(text);
    if (profile && profile.comparative && profile.comparative[axis]) {
      var comp = profile.comparative[axis];
      return GP.validateExpertiseProse(comp.line);
    }
    var altName;
    var line;
    var softerAxes = { softer: 1, lessPeat: 1, lessAggressive: 1, moreElegant: 1, rounder: 1, warmer: 1, cigarForward: 1 };
    if (subject.category === 'spirit') {
      altName = adjacentSpiritOnLadder(name, softerAxes[axis] ? -1 : 1);
      if (!altName) altName = name;
      line = sensoryComparativeLine(label, PP.shortProductLabel(altName, 'spirit'), axis);
    } else {
      altName = adjacentCigarOnLadder(name, softerAxes[axis] ? -1 : 1);
      if (!altName) altName = name;
      line = sensoryComparativeLine(label, PP.shortProductLabel(altName, 'cigar'), axis);
    }
    return GP.validateExpertiseProse(line);
  }

  function productInActiveRecommendation(name, category) {
    var set = S._session().activeRecommendationSet;
    if (!set || !name) return false;
    var slots = [set.best, set.refined, set.wildcard];
    return slots.some(function (slot) {
      if (!slot) return false;
      if (category === 'spirit') return slot.spirit === name;
      if (category === 'cigar') return slot.cigar === name;
      return false;
    });
  }

  function buildExpertiseProse(subject) {
    var RT = S._RT();
    var GP = S._GP();
    var PK = global.ProductKnowledge;
    var name = subject.name;
    var category = subject.category;
    if (PK && typeof PK.getProductTeachingBrief === 'function') {
      var brief = PK.getProductTeachingBrief(name);
      if (brief) {
        var paras = brief.split(/\n\n+/).filter(Boolean).slice(0, 3);
        var prose = paras.join('\n\n');
        var profile = RT && RT.getExpertiseNarrative ? RT.getExpertiseNarrative(name) : null;
        if (profile && profile.pairingBridge && productInActiveRecommendation(name, category)) {
          prose += '\n\n' + profile.pairingBridge;
        }
        return GP.validateExpertiseProse(prose);
      }
    }
    var profile2 = RT && RT.getExpertiseNarrative ? RT.getExpertiseNarrative(name) : null;
    var paragraphs;
    if (profile2 && profile2.paragraphs) {
      paragraphs = profile2.paragraphs.slice();
    } else if (category === 'spirit') {
      paragraphs = [
        name + ' is on tonight\'s list — a pour with its own character worth slowing down for.',
        'On the palate you get malt and oak in balance, with a finish that stays clean rather than noisy.',
        'It is the kind of spirit you sip between conversations, not rush through.'
      ];
    } else {
      paragraphs = [
        name + ' is a steady, well-made smoke — even burn, focused flavor, and a finish that does not turn bitter early.',
        'The retrohale builds gradually, which gives you time to notice cedar, spice, and sweetness in layers.',
        'It rewards a calm pace more than constant puffing.'
      ];
    }
    var leadParagraphs = paragraphs.slice(0, 2);
    var prose2 = leadParagraphs.join('\n\n');
    if (profile2 && profile2.pairingBridge && productInActiveRecommendation(name, category)) {
      prose2 += '\n\n' + profile2.pairingBridge;
    }
    return GP.validateExpertiseProse(prose2);
  }

  function buildJourneyExpertiseProse(subject, text) {
    var RT = S._RT();
    var PP = S._PP();
    var GP = S._GP();
    var label = PP.shortProductLabel(subject.name, subject.category);
    var WJ = global.WhiskeyJourney;
    if (!WJ) {
      return GP.validateExpertiseProse(
        'The whiskey journey runs Novice → Intermediate → Advanced on our bourbon rail. Tell me where you are and I will point you to a pour that fits.'
      );
    }
    var t = (text || '').toLowerCase();
    if (/\b(whiskey journey|bourbon journey|what is the journey)\b/.test(t) && (!RT || !RT.matchMenuProductInText(text))) {
      return GP.validateExpertiseProse(WJ.buildFrameworkProse());
    }
    if (subject.category === 'spirit' && WJ.buildProductJourneyProse) {
      var prose = WJ.buildProductJourneyProse(subject.name, { shortLabel: label });
      if (prose) return GP.validateExpertiseProse(prose);
    }
    return GP.validateExpertiseProse(WJ.buildFrameworkProse());
  }

  function buildSpecExpertiseProse(subject) {
    var PP = S._PP();
    var GP = S._GP();
    var label = PP.shortProductLabel(subject.name, subject.category);
    var fm = global.SterlonFlavorMatch;
    if (fm && typeof fm.buildSpecProse === 'function') {
      var prose = fm.buildSpecProse(subject.name, { shortLabel: label });
      if (prose) return GP.validateExpertiseProse(prose);
    }
    return GP.validateExpertiseProse(
      'I do not have verified bottling specs on file for ' + label + ' — I can walk through how it drinks on our rail instead.'
    );
  }

  function buildAwardsExpertiseProse(subject) {
    var PP = S._PP();
    var GP = S._GP();
    var label = PP.shortProductLabel(subject.name, subject.category);
    var fm = global.SterlonFlavorMatch;
    if (fm && typeof fm.buildAwardsProse === 'function') {
      var prose = fm.buildAwardsProse(subject.name, { shortLabel: label });
      if (prose) return GP.validateExpertiseProse(prose);
    }
    return GP.validateExpertiseProse(
      'I do not keep verified competition results on file for ' + label + ' — happy to walk through how it drinks on our rail instead.'
    );
  }

  function buildEducationalPairingComparisonProse(text) {
    var GP = S._GP();
    var t = (text || '').toLowerCase();
    if (/\bconnecticut\b/.test(t) && /\b(maduro|espresso|bourbon)\b/.test(t)) {
      return GP.validateExpertiseProse(
        'Connecticut with espresso keeps the lane lighter — cream, nuts, and gentle spice that respect bitter coffee without turning the cup heavy.\n\n' +
          'Maduro with bourbon is a power pairing: darker wrapper sugars and cocoa meet caramel and oak in the glass, so each draw feels richer and slower.\n\n' +
          'The short version: espresso wants elegance and clarity; bourbon can carry Maduro\'s depth without washing either one out.'
      );
    }
    if (/\bespresso\b/.test(t) && /\b(coffee|morning)\b/.test(t)) {
      return GP.validateExpertiseProse(
        'Morning coffee pairings usually stay medium-bodied and smooth — enough flavor to notice beside the cup, not so much weight that the espresso turns bitter on the finish.\n\n' +
          'Maduro and bourbon pairings save their richness for later in the day when the palate can carry more sweetness and oak.'
      );
    }
    return GP.validateExpertiseProse(
      'Those two pairings sit at different weights on the palate — one stays brighter and conversational, the other builds warmth and depth in the glass.\n\n' +
        'Tell me which mood you are closer to and I can land a specific flight.'
    );
  }

  function buildExpertiseProseForBranch(branch, subject, text) {
    var RT = S._RT();
    if (!RT || !RT.ExpertiseBranch) return buildExpertiseProse(subject);
    var EB = RT.ExpertiseBranch;
    if (branch === EB.CONFIDENCE) return buildConfidenceBoundaryProse(text);
    if (branch === EB.AWARDS) return buildAwardsExpertiseProse(subject);
    if (branch === EB.SPEC) return buildSpecExpertiseProse(subject);
    if (branch === EB.JOURNEY) return buildJourneyExpertiseProse(subject, text);
    if (branch === EB.CONTEXTUAL) return buildContextualExpertiseProse(subject, text);
    if (branch === EB.SENSORY) return buildSensoryFollowupProse(subject, text);
    if (branch === EB.COMPARATIVE) return buildComparativeCuriosityProse(subject, text);
    return buildExpertiseProse(subject);
  }


  global.SterlonConciergeExpertise = {
    buildConfidenceBoundaryProse: buildConfidenceBoundaryProse,
    sensoryComparativeLine: sensoryComparativeLine,
    adjacentSpiritOnLadder: adjacentSpiritOnLadder,
    adjacentCigarOnLadder: adjacentCigarOnLadder,
    buildContextualExpertiseProse: buildContextualExpertiseProse,
    buildSensoryFollowupProse: buildSensoryFollowupProse,
    buildComparativeCuriosityProse: buildComparativeCuriosityProse,
    productInActiveRecommendation: productInActiveRecommendation,
    buildExpertiseProse: buildExpertiseProse,
    buildJourneyExpertiseProse: buildJourneyExpertiseProse,
    buildSpecExpertiseProse: buildSpecExpertiseProse,
    buildAwardsExpertiseProse: buildAwardsExpertiseProse,
    buildExpertiseProseForBranch: buildExpertiseProseForBranch,
    buildEducationalPairingComparisonProse: buildEducationalPairingComparisonProse,
  };
})(typeof window !== 'undefined' ? window : global);
