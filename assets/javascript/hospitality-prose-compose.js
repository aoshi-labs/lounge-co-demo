/**
 * HospitalityProseCompose — editorial layers for thin slot prose (presentation only).
 */
(function (global) {
  'use strict';

  var FLAVOR_KW =
    /\b(woodsy|spice[- ]?forward|cream|nutty|earthy|cocoa|cedar|leather|pepper|sweet|toasty|coffee|malt|pairing|finish|smoke)\b/i;

  function shouldComposeHospitalityProse(slotBodyText, opts) {
    opts = opts || {};
    var text = String(slotBodyText || '').trim();
    if (!text) return { compose: true, reason: 'empty' };

    var words = text.split(/\s+/).filter(Boolean);
    var sentences = text.split(/[.!?]+/).filter(function (s) {
      return s.trim().length > 3;
    });

    if (words.length < 30) return { compose: true, reason: 'word-count-' + words.length };
    if (text.length < 180) return { compose: true, reason: 'char-count-' + text.length };
    if (sentences.length < 2) return { compose: true, reason: 'sentence-count-' + sentences.length };

    if (opts.isGenericLeadProse && opts.isGenericLeadProse(text)) {
      return { compose: true, reason: 'generic-lead' };
    }
    var govMin = opts.governanceMinWords != null ? opts.governanceMinWords : 30;
    if (words.length < govMin) return { compose: true, reason: 'below-governance-floor' };

    if (!FLAVOR_KW.test(text.toLowerCase())) return { compose: true, reason: 'no-flavor-keyword' };

    return { compose: false, reason: 'sufficient-editorial' };
  }

  function pickNarrativeLayers(ctx, slotKey, card) {
    var layers = [];
    var slot = slotKey === 'safe' ? 'refined' : slotKey;
    var coffeeCtx =
      ctx && !ctx.boldAsk && (ctx.morningSession || ctx.coffeeEspressoPairing);
    if (coffeeCtx) {
      if (slot === 'wildcard') {
        layers.push('pairing', 'atmosphere');
      } else if (ctx.comfortAsk || slot === 'refined') {
        layers.push('pairing', 'comfort');
      } else {
        layers.push('pairing', 'comfort');
      }
    } else if (ctx && ctx.comfortAsk) {
      layers.push('comfort', 'pairing');
    } else if (slot === 'wildcard') {
      layers.push('pairing', 'atmosphere');
    } else {
      layers.push('pairing', 'smokeTime');
    }
    if (ctx && (ctx.afterDinner || ctx.celebration || ctx.sessionAtmosphere)) {
      if (layers.indexOf('atmosphere') === -1) layers.push('atmosphere');
    }
    if (layers.length < 2) layers.push('smokeTime');
    return layers.slice(0, 3);
  }

  function layerPairing(card, turnHelpers, slotKey, turn) {
    var bullets = card.why || [];
    if (turnHelpers && slotKey && turn && typeof turnHelpers.getSlotRationale === 'function') {
      var atoms = turnHelpers.getSlotRationale(turn, slotKey === 'refined' ? 'safe' : slotKey);
      var RR = global.RecommendationRuntime;
      if (atoms && atoms.length && RR && typeof RR.renderWhyBullets === 'function') {
        bullets = RR.renderWhyBullets(atoms, bullets);
      }
    }
    if (!bullets.length) return '';
    var line = bullets[0];
    if (bullets.length > 1) {
      var second = bullets[1].charAt(0).toLowerCase() + bullets[1].slice(1);
      line = line.replace(/\.$/, '') + ', and ' + second;
    }
    return line;
  }

  function layerAtmosphere(ctx) {
    if (!ctx) return '';
    if (!ctx.boldAsk && (ctx.morningSession || ctx.coffeeEspressoPairing)) {
      return 'Beside the cup, the flight stays elegant — enough flavor to notice, nothing that turns the espresso bitter on the finish.';
    }
    if (ctx.afterDinner) return 'After dinner, the pairing stays warm and composed — rich enough to feel intentional.';
    if (ctx.celebration) return 'For a night worth marking, the flight keeps a celebratory cadence without turning loud.';
    if (ctx.sessionAtmosphere === 'outdoorNight') {
      return 'Outside at night, the smoke stays calm enough to notice beside the pour.';
    }
    if (ctx.quickSmoke || (ctx.targetSmokeMinutes != null && ctx.targetSmokeMinutes <= 50)) {
      return 'The pacing stays unhurried but respectful of a shorter window.';
    }
    return '';
  }

  function layerSmokeTime(card, ctx) {
    var CSE = global.CigarSmokeEstimate;
    var PIDs = global.RecommendationProductIds;
    if (!CSE || !card || !card.cigar) return '';
    var p = PIDs && typeof PIDs.getProductRef === 'function' ? PIDs.getProductRef('cigar', card.cigar) : null;
    if (!p) return '';
    var mins = CSE.estimateSmokeMinutes(p);
    return CSE.formatSmokeTimeLine(mins, ctx);
  }

  function layerComfort(card) {
    var PIDs = global.RecommendationProductIds;
    var CC = global.ComfortCalibration;
    if (!card || !card.cigar || !PIDs || !CC) return '';
    var p = PIDs.getProductRef('cigar', card.cigar);
    if (!p) return '';
    var agg = CC.nicotineAggression(p);
    var soph = CC.flavorSophistication(p);
    if (soph > agg) {
      return 'Approachable in strength, but still interesting on flavor — comfortable sophistication, not safe blandness.';
    }
    return 'Keeps the strength approachable while the flavor still has somewhere to go between sips.';
  }

  function layerCraftsmanship(card) {
    var PIDs = global.RecommendationProductIds;
    if (!PIDs || !card || !card.cigar) return '';
    var p = PIDs.getProductRef('cigar', card.cigar);
    var g = (p && p.guidance) || {};
    if (g.wrapperRole) return String(g.wrapperRole).replace(/\.$/, '') + '.';
    return '';
  }

  function proseAlreadyContains(base, addition) {
    var b = String(base || '').toLowerCase();
    var a = String(addition || '').trim();
    if (!a) return true;
    if (b.indexOf(a.toLowerCase()) !== -1) return true;
    var firstSentence = a.split(/[.!?]/)[0].trim();
    return firstSentence.length > 24 && b.indexOf(firstSentence.toLowerCase()) !== -1;
  }

  function composeEditorialParagraph(layers, card, ctx, opts) {
    opts = opts || {};
    var parts = [];
    layers.forEach(function (layer) {
      var bit = '';
      if (layer === 'pairing') {
        bit = layerPairing(card, opts.turnHelpers, opts.slotKey, opts.turn);
      } else if (layer === 'atmosphere') bit = layerAtmosphere(ctx);
      else if (layer === 'smokeTime') bit = layerSmokeTime(card, ctx);
      else if (layer === 'comfort') bit = layerComfort(card);
      else if (layer === 'craftsmanship') bit = layerCraftsmanship(card);
      if (bit) parts.push(bit);
    });
    return parts.join(' ').trim();
  }

  function maybeComposeForSlot(slotBodyText, card, ctx, opts) {
    var trigger = shouldComposeHospitalityProse(slotBodyText, opts);
    if (!trigger.compose) return { text: slotBodyText, composed: false, reason: trigger.reason };
    var layers = pickNarrativeLayers(ctx, opts.slotKey, card);
    var composed = composeEditorialParagraph(layers, card, ctx, opts);
    if (!composed) return { text: slotBodyText, composed: false, reason: 'empty-compose' };
    var base = String(slotBodyText || '').trim();
    if (proseAlreadyContains(base, composed)) {
      return { text: base, composed: false, reason: 'duplicate-pairing-line' };
    }
    var text = base && base.length >= 40 ? base + ' ' + composed : composed;
    return { text: text, composed: true, reason: trigger.reason };
  }

  global.HospitalityProseCompose = {
    shouldComposeHospitalityProse: shouldComposeHospitalityProse,
    pickNarrativeLayers: pickNarrativeLayers,
    composeEditorialParagraph: composeEditorialParagraph,
    maybeComposeForSlot: maybeComposeForSlot
  };
})(typeof window !== 'undefined' ? window : global);
