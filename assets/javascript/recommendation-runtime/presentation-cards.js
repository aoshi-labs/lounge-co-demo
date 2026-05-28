/**
 * RecommendationPresentation — Phase D presentation-only card fields.
 *
 * Display names and UI metadata are derived from sealed catalog ids.
 * Must NOT assign slots, resolve products from prose/[[RECO]], or mutate turn authority.
 */
(function (global) {
  'use strict';

  var PRESENTATION_AUTHORITY_VERSION = 1;

  function PIDs() {
    return global.RecommendationProductIds || null;
  }

  function PP() {
    return global.SterlonProsePipeline || null;
  }

  function sealIds(card) {
    var pid = PIDs();
    if (!pid || !card) return card;
    var ids = pid.resolveProductIds(card);
    var out = Object.assign({}, card, {
      cigarId: ids.cigarId,
      spiritId: ids.spiritId,
      foodId: ids.foodId
    });
    if (ids.cigarId) out.cigar = pid.displayNameForId('cigar', ids.cigarId) || null;
    if (ids.spiritId) out.spirit = pid.displayNameForId('spirit', ids.spiritId) || null;
    if (ids.foodId) out.food = pid.displayNameForId('food', ids.foodId) || null;
    return out;
  }

  /**
   * Lock runtime ids and overwrite display copy from catalog — ignores LLM/prose product strings.
   */
  function enforceRuntimePresentation(cards) {
    return (cards || []).map(function (c) {
      return sealIds(c);
    });
  }

  function cigarPresentationMeta(cigarId) {
    var pid = PIDs();
    if (!pid || !cigarId) {
      return { cigarVitola: '', cigarSmokeTime: '', cigarStickSize: '' };
    }
    var p = pid.getById('cigar', cigarId);
    if (!p) return { cigarVitola: '', cigarSmokeTime: '', cigarStickSize: '' };
    var stick = p.stickSize || '';
    var smoke = (p.spec && p.spec.smokeTime) || '';
    var vitola = '';
    if (stick) {
      var parts = stick.split('·');
      if (parts.length >= 2) vitola = parts[parts.length - 1].trim();
    }
    return { cigarVitola: vitola, cigarSmokeTime: smoke, cigarStickSize: stick };
  }

  function productDisplayNamesFromCards(cards) {
    var pid = PIDs();
    var names = [];
    (cards || []).forEach(function (card) {
      if (!card) return;
      if (pid) {
        if (card.cigarId) names.push(pid.displayNameForId('cigar', card.cigarId));
        if (card.spiritId) names.push(pid.displayNameForId('spirit', card.spiritId));
        if (card.foodId) names.push(pid.displayNameForId('food', card.foodId));
      } else {
        if (card.cigar) names.push(card.cigar);
        if (card.spirit) names.push(card.spirit);
        if (card.food) names.push(card.food);
      }
    });
    return names.filter(Boolean);
  }

  function hasStructuredRecoBlock(text) {
    return /\[\[RECO\]\][\s\S]*?\[\[\/RECO\]\]/i.test(String(text || ''));
  }

  /**
   * Strip accidental [[RECO]] blocks from gateway output; emit telemetry when stripped.
   */
  function stripLlmRecoAuthority(text) {
    var raw = String(text || '');
    if (!hasStructuredRecoBlock(raw)) {
      return raw.trim();
    }
    var tel = global.SterlonTelemetry;
    if (tel && typeof tel.emit === 'function') {
      tel.emit('gateway_reco_block_stripped', { module: 'presentation-cards' });
    }
    var pipeline = PP();
    if (pipeline && typeof pipeline.stripStructuredRecoBlocks === 'function') {
      return pipeline.stripStructuredRecoBlocks(raw);
    }
    return raw.replace(/\[\[RECO\]\][\s\S]*?\[\[\/RECO\]\]/gi, '').trim();
  }

  function displayNamesForEmphasis(cards) {
    var pid = PIDs();
    var names = [];
    (cards || []).forEach(function (card) {
      if (!card) return;
      if (pid) {
        if (card.cigarId) {
          var cn = pid.displayNameForId('cigar', card.cigarId);
          if (cn) names.push(cn);
        }
        if (card.spiritId) {
          var sn = pid.displayNameForId('spirit', card.spiritId);
          if (sn) names.push(sn);
        }
      } else {
        if (card.cigar) names.push(card.cigar);
        if (card.spirit) names.push(card.spirit);
      }
    });
    return names.filter(Boolean);
  }

  var api = {
    PRESENTATION_AUTHORITY_VERSION: PRESENTATION_AUTHORITY_VERSION,
    enforceRuntimePresentation: enforceRuntimePresentation,
    sealIds: sealIds,
    cigarPresentationMeta: cigarPresentationMeta,
    productDisplayNamesFromCards: productDisplayNamesFromCards,
    displayNamesForEmphasis: displayNamesForEmphasis,
    hasStructuredRecoBlock: hasStructuredRecoBlock,
    stripLlmRecoAuthority: stripLlmRecoAuthority
  };

  global.RecommendationPresentation = api;

  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.presentation = api;
  }
})(typeof window !== 'undefined' ? window : global);
