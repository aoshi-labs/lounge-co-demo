/**
 * SterlonConciergeRecommendationProse companion — deep prose builders.
 * Extends SterlonConciergeRecommendationProse. Load after sterlon-concierge-recommendation-prose.js.
 */
(function (global) {
  'use strict';

  var S = global.SterlonConciergeProseShared;
  if (!S) return;

  function dedupeProseLines(lines) {
    var seen = Object.create(null);
    var out = [];
    (lines || []).forEach(function (line) {
      var key = String(line || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(line);
    });
    return out;
  }

  function whyBulletsToProse(whyItems) {
    var SR = S._SR();
    var PP = S._PP();
    var raw = (SR && typeof SR.normalizeWhyBullets === 'function') ? SR.normalizeWhyBullets(whyItems, []) : [];
    var bullets = dedupeProseLines(raw.map(PP.humanizeWhyBullet).filter(Boolean));
    if (!bullets.length) return '';
    if (bullets.length === 1) return bullets[0];
    var second = bullets[1].charAt(0).toLowerCase() + bullets[1].slice(1);
    return bullets[0].replace(/\.$/, '') + ', and ' + second;
  }

  function getCatalogSensoryPrelude(spiritName) {
    var MenuFlavorCatalog = global.MenuFlavorCatalog;
    if (typeof MenuFlavorCatalog === 'undefined' || !MenuFlavorCatalog.getProductByName) return null;
    var p = MenuFlavorCatalog.getProductByName(spiritName);
    if (p && p.presentation && p.presentation.sensoryPrelude) {
      return Object.assign({}, p.presentation.sensoryPrelude);
    }
    return null;
  }

  function pickDimensionPreludeOverlay(text) {
    var SO = S._SO();
    var SP = S._SP();
    var d = SO.getMergedEveningDimensions(text);
    if (d.social === 'friendsNewToCigars') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.friendsNewToCigars;
    if (d.rhythm === 'wontExhaust' || d.rhythm === 'easyToSitWith') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.wontExhaust;
    if (d.rhythm === 'secondWhiskey' || d.occasion === 'secondPour') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.secondWhiskey;
    if (d.occasion === 'outdoor' || d.atmosphere === 'outdoorNight') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.outdoorNight;
    if (d.occasion === 'longConversation') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.longConversation;
    if (d.occasion === 'afterDinner') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.afterDinner;
    if (d.social === 'hosting' || d.occasion === 'hosting') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.hosting;
    if (d.occasion === 'lateNight' || d.occasion === 'endOfNight') return SP.EVENING_DIMENSION_PRELUDE_OVERLAYS.lateNight;
    return null;
  }

  function buildSensoryPreludeProse(card, promptText) {
    var SO = S._SO();
    var RT = S._RT();
    var PP = S._PP();
    var SP = S._SP();
    var RR = S._RR();
    var sr = S._session();
    var mood = SO.getActiveEveningMood();
    var spiritOnly = !!(RT && RT.isSpiritOnlyRequest(promptText || ''))
      || ((!RT || !RT.isCigarOnlyRequest(promptText || '')) && (
           (RT && RT.inferCategoryFocus(promptText || '') === 'spirit')
           || sr.activeCategoryFocus === 'spirit'
         ));
    var spiritName = card && card.spirit ? String(card.spirit).trim() : '';
    var catalogPrelude = spiritName ? getCatalogSensoryPrelude(spiritName) : null;
    var turn = sr.lastRecommendationTurn;
    var slot = S._inferRecoSlot(turn, card);
    var TH = global.RecommendationTurnHelpers;
    var recoCtx = null;
    if (TH && slot) recoCtx = TH.getSlotContext(turn, slot);
    var deckKey = S._ctx().currentTurnDeckKey || 'bourbon';
    var key = recoCtx ? (recoCtx.preludeKey || deckKey) : deckKey;
    var tpl;
    if (catalogPrelude) {
      tpl = catalogPrelude;
    } else {
      var atomParagraph = '';
      if (RR && typeof RR.renderSensoryPreludeFromAtoms === 'function' && recoCtx && recoCtx.rationale && recoCtx.rationale.length) {
        atomParagraph = RR.renderSensoryPreludeFromAtoms(recoCtx.rationale, card);
      }
      if (atomParagraph) {
        var baseObs =
          (SP.SENSORY_PRELUDE_TEMPLATES[key] && SP.SENSORY_PRELUDE_TEMPLATES[key].observation) ||
          SP.SENSORY_PRELUDE_TEMPLATES.default.observation;
        tpl = { paragraph: atomParagraph, observation: baseObs };
      } else {
        tpl = Object.assign({}, SP.SENSORY_PRELUDE_TEMPLATES[key] || SP.SENSORY_PRELUDE_TEMPLATES.default);
      }
    }
    if (spiritOnly) {
      tpl = {
        paragraph: 'This pour stays composed on its own — enough body and finish to hold the room without asking for a cigar beside it.',
        observation: 'Worth sipping slowly; the flavor opens between sips rather than needing smoke to frame it.'
      };
    }
    var dimOverlay = pickDimensionPreludeOverlay(promptText);
    if (dimOverlay) {
      if (dimOverlay.paragraph) tpl.paragraph = dimOverlay.paragraph;
      if (dimOverlay.observation) tpl.observation = dimOverlay.observation;
    } else if (!spiritOnly) {
      var overlay = mood && SP.MOOD_PRELUDE_OVERLAYS[mood];
      if (overlay) {
        if (overlay.paragraph) tpl.paragraph = overlay.paragraph;
        if (overlay.observation) tpl.observation = overlay.observation;
      }
    }
    var paragraph = spiritOnly ? tpl.paragraph : PP.fillPreludeTemplate(tpl.paragraph, card);
    var observation = spiritOnly ? tpl.observation : PP.fillPreludeTemplate(tpl.observation, card);
    return { paragraph: paragraph, observation: observation };
  }

  function buildSommelierRecommendationProse(card, promptText, modelOptional) {
    var RT = S._RT();
    var PP = S._PP();
    var GP = S._GP();
    var SO = S._SO();
    var RR = S._RR();
    var sr = S._session();
    var SCRP = global.SterlonConciergeRecommendationProse;
    var turn = sr.lastRecommendationTurn;
    var slot = S._inferRecoSlot(turn, card);
    var TH = global.RecommendationTurnHelpers;
    var focus = sr.activeCategoryFocus || (RT ? RT.inferCategoryFocus(promptText) : null) || 'open';
    var modelProse = PP.scrubConciergePhrases(modelOptional || '').trim();
    var cigar = card.cigar;
    var spirit = card.spirit;
    var sealedCards = turn && turn.cards && turn.cards.length ? turn.cards : [card];
    var visibleOpts = { sealedCards: sealedCards };
    var cigarHit = modelProse && cigar && modelProse.toLowerCase().indexOf(cigar.toLowerCase().slice(0, 10)) !== -1;
    var spiritHit = modelProse && spirit && modelProse.toLowerCase().indexOf(spirit.toLowerCase().slice(0, 10)) !== -1;

    if (modelProse &&
        (cigarHit || spiritHit) &&
        (!GP.containsCompetingRecommendationSignal || !GP.containsCompetingRecommendationSignal(modelProse, card)) &&
        !PP.isGenericLeadProse(modelProse) &&
        !PP.isFrameworkLeadProse(modelProse)) {
      var whyBullets = card.why;
      if (TH && slot && turn) {
        var atoms = TH.getSlotRationale(turn, slot);
        if (atoms && atoms.length && RR && typeof RR.renderWhyBullets === 'function') {
          whyBullets = RR.renderWhyBullets(atoms, card.why);
        }
      }
      var whyProse = whyBulletsToProse(whyBullets);
      if (whyProse && modelProse.length < 140) {
        var modelLower = modelProse.toLowerCase();
        var whyLower = whyProse.toLowerCase();
        if (modelLower.indexOf(whyLower) === -1) {
          var firstWhy = whyProse.split(/[.!?]/)[0].trim().toLowerCase();
          if (firstWhy.length < 20 || modelLower.indexOf(firstWhy) === -1) {
            return S._visible(modelProse + ' ' + whyProse, promptText, undefined, visibleOpts);
          }
        }
      }
      return S._visible(modelProse, promptText, undefined, visibleOpts);
    }

    var SPIRIT_ANCHOR_POOL = [
      spirit + ' is where I\'d anchor tonight.',
      'Start with the ' + spirit + '.',
      'My pick: the ' + spirit + '.',
      'The ' + spirit + ' — that\'s the move.',
      'I\'d pour the ' + spirit + ' first.'
    ];
    var CIGAR_ANCHOR_POOL = [
      'Light the ' + cigar + ' first.',
      'The ' + cigar + ' is where this starts.',
      'My pick is the ' + cigar + '.',
      'The ' + cigar + ' — right in your lane.',
      'I\'d hand you the ' + cigar + '.'
    ];
    var OPEN_ANCHOR_POOL = [
      'Here\'s where I\'d start: ' + cigar + ' with the ' + spirit + '.',
      'My pick for tonight — ' + cigar + ', ' + spirit + '.',
      cigar + ' paired with the ' + spirit + '.',
      'The anchor is ' + cigar + ' with ' + spirit + '.',
      'My pick: ' + cigar + ' and the ' + spirit + '.'
    ];
    var OPlead = global.OntologyPolicy;
    var recoCtxLead =
      OPlead && typeof OPlead.buildRecoContext === 'function'
        ? OPlead.buildRecoContext({ promptText: promptText, sessionRuntime: sr })
        : null;
    var CEPlead = global.CoffeeEspressoProse;
    var lead;
    if (
      CEPlead &&
      typeof CEPlead.coffeePairingLead === 'function' &&
      recoCtxLead &&
      CEPlead.isActive(recoCtxLead) &&
      cigar &&
      spirit &&
      focus === 'pairing'
    ) {
      lead = CEPlead.coffeePairingLead(spirit, cigar);
    } else if (focus === 'spirit') {
      lead = SCRP.pickFromPool(SPIRIT_ANCHOR_POOL);
    } else if (focus === 'cigar') {
      lead = SCRP.pickFromPool(CIGAR_ANCHOR_POOL);
    } else {
      lead = SCRP.pickFromPool(OPEN_ANCHOR_POOL);
    }
    var prelude = buildSensoryPreludeProse(card, promptText);
    var middle = [prelude.paragraph, prelude.observation].filter(Boolean).join('\n\n');
    var HPC = global.HospitalityProseCompose;
    var OP = global.OntologyPolicy;
    var recoCtx =
      OP && typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({ promptText: promptText, sessionRuntime: sr })
        : null;
    if (HPC && typeof HPC.maybeComposeForSlot === 'function') {
      var composed = HPC.maybeComposeForSlot(middle, card, recoCtx, {
        slotKey: slot,
        turn: turn,
        turnHelpers: TH,
        isGenericLeadProse: PP.isGenericLeadProse,
        governanceMinWords: 30
      });
      if (composed.composed) middle = composed.text;
    }
    var body = PP.applyMoodToneToProse([lead, middle].filter(Boolean).join('\n\n'), SO.getActiveEveningMood());
    return S._visible(body, promptText, undefined, visibleOpts);
  }

  function buildGracefulDegradationProse(text, runtimeMode) {
    var RT = S._RT();
    var RuntimeMode = S._runtimeModeEnum();
    var sr = S._session();
    var set = sr.activeRecommendationSet;
    var setFocus = (set && set.categoryFocus && set.categoryFocus !== 'pairing') ? set.categoryFocus : null;
    var sessionFocus = (sr.activeCategoryFocus && sr.activeCategoryFocus !== 'pairing')
      ? sr.activeCategoryFocus : null;
    var focus = (RT && RT.inferCategoryFocus(text)) || setFocus || sessionFocus || 'open';
    var spiritOnly = (RT && RT.isSpiritOnlyRequest(text)) || focus === 'spirit';
    var cigarOnly = (RT && RT.isCigarOnlyRequest(text)) || focus === 'cigar';
    if (set && set.best && (runtimeMode === RuntimeMode.REFINEMENT || (RT && RT.isShorthandContinuityMessage(text)))) {
      if (spiritOnly && set.best.spirit) {
        return 'The room is moving a little slower than usual right now. Stay with the ' +
          set.best.spirit +
          ' for the moment; give me another beat and I will tune the next pour properly.';
      }
      if (cigarOnly && set.best.cigar) {
        return 'The room is moving a little slower than usual right now. Stay with the ' +
          set.best.cigar +
          ' for the moment; give me another beat and I will tune the next smoke properly.';
      }
      return 'The room is moving a little slower than usual right now. Stay with the ' +
        set.best.spirit + ' and ' + set.best.cigar +
        ' for the moment; give me another beat and I will tune the next move properly.';
    }
    if (set && set.best) {
      if (spiritOnly && set.best.spirit) {
        return 'The room is moving a little slower than usual right now. Your current pour still holds: ' +
          set.best.spirit +
          '. Give me another moment and I will get the next answer right.';
      }
      if (cigarOnly && set.best.cigar) {
        return 'The room is moving a little slower than usual right now. Your current smoke still holds: ' +
          set.best.cigar +
          '. Give me another moment and I will get the next answer right.';
      }
      return 'The room is moving a little slower than usual right now. Your current table still holds: ' +
        set.best.spirit + ' with the ' + set.best.cigar +
        '. Give me another moment and I will get the next answer right.';
    }
    if (spiritOnly) {
      return 'The room is moving a little slower than usual right now. Give me another moment and I will line up the right pour.';
    }
    if (cigarOnly) {
      return 'The room is moving a little slower than usual right now. Give me another moment and I will line up the right cigar.';
    }
    return 'The room is moving a little slower than usual right now. Give me another moment and I will get this right.';
  }

  function buildUnavailableDemoProductProse(product) {
    var category = product && product.category === 'spirit' ? 'spirit' : 'cigar';
    var name = product && product.name ? product.name : (category === 'spirit' ? 'that spirit' : 'that cigar');
    return name + ' is not in this demo version of the app yet, so I do not want to fake a pairing card for it. Ask me for something similar in the demo catalog and I will keep it honest.';
  }

  function buildRefinementLeadProse(axis, targetKey, newBest, priorBest, refinementTail) {
    var PP = S._PP();
    var sr = S._session();
    var next = newBest || {};
    var prior = priorBest || {};
    var spirit = next.spirit || '';
    var cigar = next.cigar || '';
    var spiritChanged = !!(prior.spirit && spirit && prior.spirit !== spirit);
    var cigarChanged = !!(prior.cigar && cigar && prior.cigar !== cigar);
    var focus = sr.activeCategoryFocus || 'open';
    var lead;

    if (axis === 'lighter' || axis === 'softer') {
      if (spiritChanged && focus !== 'cigar') {
        lead = 'If you want to soften the smoke a little, I\'d probably move toward the ' + spirit + ' instead.';
      } else if (spiritChanged) {
        lead = 'To soften the smoke a little, I\'d step to the ' + spirit + ' — rounder finish, same kind of evening.';
      } else if (cigarChanged) {
        lead = 'I\'d probably swap the cigar to the ' + cigar + ' — still works with the pour, just a gentler draw.';
      } else {
        lead = 'I\'d ease the smoke a touch — same mood, a little softer on the palate.';
      }
    } else if (axis === 'bolder') {
      if (spiritChanged) {
        lead = 'If you want a little more to sit with, I\'d pour the ' + spirit + ' instead.';
      } else {
        lead = 'I\'d push a little more body into the pour — richer, still clean on the finish.';
      }
    } else if (axis === 'budget') {
      if (spiritChanged) {
        lead = 'Closer to your number, I\'d pour the ' + spirit + ' — still drinks well beside the cigar.';
      } else {
        lead = 'I can keep you in the same lane without stretching the budget.';
      }
    } else if (axis === 'adventure' || axis === 'luxury') {
      if (targetKey === 'wildcard' && spirit) {
        lead = 'For something more adventurous tonight, I\'d reach for the ' + spirit + (cigar ? ' with the ' + cigar : '') + '.';
      } else if (spiritChanged) {
        lead = 'If you want a little more theatre in the glass, I\'d pour the ' + spirit + ' instead.';
      } else {
        lead = 'I\'d lean a touch more adventurous — same table, a bolder pour.';
      }
    } else if (sr.refinementChainDepth >= 3) {
      lead = 'We can keep nudging this, or start over — whichever you prefer.';
    } else if (spiritChanged) {
      lead = 'Then I\'d probably steer you to the ' + spirit + ' instead.';
    } else {
      lead = 'I\'d keep the same idea, just dialed a little differently for you.';
    }

    if (refinementTail && lead.indexOf(refinementTail) === -1) {
      lead = lead.replace(/\.$/, '') + '. ' + refinementTail;
    }
    return PP.humanizePresentationProse(lead);
  }

  Object.assign(global.SterlonConciergeRecommendationProse, {
    pickDimensionPreludeOverlay: pickDimensionPreludeOverlay,
    whyBulletsToProse: whyBulletsToProse,
    getCatalogSensoryPrelude: getCatalogSensoryPrelude,
    buildSensoryPreludeProse: buildSensoryPreludeProse,
    buildSommelierRecommendationProse: buildSommelierRecommendationProse,
    buildGracefulDegradationProse: buildGracefulDegradationProse,
    buildUnavailableDemoProductProse: buildUnavailableDemoProductProse,
    buildRefinementLeadProse: buildRefinementLeadProse
  });
})(typeof window !== 'undefined' ? window : global);
