/**
 * OntologyPolicyScoringExt — high-proof bourbon maduro + after-dinner scoring.
 * Extends OntologyPolicyCore. Load after ontology-policy-core.js.
 */
(function (global) {
  'use strict';

  var OPC = global.OntologyPolicyCore;
  var normalizeText = OPC.normalizeText;
  var productBlob = OPC.productBlob.bind(OPC);

  function isHighProofBourbonContext(ctx, spirit) {
    var s = OPC.productBlob(spirit);
    var proof = spirit && spirit.spec && spirit.spec.proof != null ? Number(spirit.spec.proof) : null;
    var whiskeyLike = /\b(bourbon|rye|whiskey|whisky|kentucky)\b/.test(s);
    return !!(
      ctx && ctx.highProofBourbon ||
      (proof != null && proof >= 100 && whiskeyLike)
    );
  }
  var HIGH_PROOF_MADURO_RULES = {
    boost: {
      broadleaf: 0.46,
      smoothSanAndres: 0.12,
      mataFinaBrazil: 0.18,
      costaRican: 0.12,
      ecuadorMaduro: 0.02,
      sweetThreePerHit: 0.08,
      sweetThreeCap: 0.24
    },
    penalty: {
      dryPowerRegions: 0.28,
      ligeroHeavy: 0.32,
      doubleLigero: 0.42,
      generalPepperSpice: 0.18,
      sharpPepper: 0.34,
      pepperHeavyMaduro: 0.26,
      dryMineral: 0.14,
      nicaraguaMexicoPepperStack: 0.38,
      nicaraguanWrapperHeat: 0.26,
      sensoryPepperSix: 0.16,
      sensoryPepperSeven: 0.24,
      fullStrength: 0.14,
      fullBodyHighProofCollision: 0.22
    },
    clampMin: -0.9,
    clampMax: 0.58
  };
  function highProofBourbonMaduroDelta(product, ctx, spirit) {
    if (!isHighProofBourbonContext(ctx || {}, spirit)) return 0;
    var rules = HIGH_PROOF_MADURO_RULES;
    var blob = OPC.productBlob(product);
    var sensory = product && product.sensory ? product.sensory : {};
    var wrapper = normalizeText(product && product.spec && product.spec.wrapper);
    var body = normalizeText((product && product.spec && product.spec.body) || '');
    var strength = product && product.spec && product.spec.strength != null ? Number(product.spec.strength) : 5;
    var score = 0;

    if (/\b(connecticut broadleaf|broadleaf maduro|broadleaf)\b/.test(wrapper + ' ' + blob)) score += rules.boost.broadleaf;
    if (
      /\b(san andr(?:es)?)\b/.test(wrapper + ' ' + blob) ||
      /\b(mexico|mexican)\b.*\bmaduro\b/.test(wrapper + ' ' + blob) ||
      /\bmaduro\b.*\b(mexico|mexican)\b/.test(wrapper + ' ' + blob)
    ) {
      score += rules.boost.smoothSanAndres;
    }
    if (/\b(mata fina|brazil|brazilian)\b/.test(blob)) score += rules.boost.mataFinaBrazil;
    if (/\b(costa rica|costa rican)\b/.test(blob)) score += rules.boost.costaRican;
    if (/\b(ecuadorian maduro|ecuador maduro)\b/.test(blob)) score += rules.boost.ecuadorMaduro;

    if (/\b(cream|creamy|milk chocolate|dark chocolate|chocolate|cocoa|molasses|caramel|brown sugar|vanilla|raisin|sweet raisin)\b/.test(blob)) {
      var sweetHits = 0;
      if (/\b(cream|creamy)\b/.test(blob)) sweetHits += 1;
      if (/\b(chocolate|cocoa)\b/.test(blob)) sweetHits += 1;
      if (/\b(molasses|caramel|brown sugar|vanilla|raisin|sweet raisin)\b/.test(blob)) sweetHits += 1;
      score += Math.min(rules.boost.sweetThreeCap, sweetHits * rules.boost.sweetThreePerHit);
    }

    if (/\b(estel|jalapa|honduras|honduran)\b/.test(blob)) score -= rules.penalty.dryPowerRegions;
    if (/\b(double ligero)\b/.test(blob)) score -= rules.penalty.doubleLigero;
    else if (/\bligero\b/.test(blob)) score -= rules.penalty.ligeroHeavy;
    if (/\b(pepper|spice|spicy)\b/.test(blob)) score -= rules.penalty.generalPepperSpice;
    if (/\b(black pepper|red pepper|cayenne|chili|chile|cracked pepper|pepper bomb|spicy finish)\b/.test(blob)) score -= rules.penalty.sharpPepper;
    if (/\bmaduro\b/.test(wrapper + ' ' + blob) && /\b(pepper|spice|spicy)\b/.test(blob)) score -= rules.penalty.pepperHeavyMaduro;
    if (/\b(mineral|dry|walnut|espresso|charred oak)\b/.test(blob)) score -= rules.penalty.dryMineral;
    if (/\b(nicaragua|nicaraguan)\b/.test(blob) && /\b(san andr|pepper|earth)\b/.test(blob)) score -= rules.penalty.nicaraguaMexicoPepperStack;
    if (/\b(nicaragua|nicaraguan)\b/.test(wrapper) && /\b(pepper|spice|earth)\b/.test(blob)) score -= rules.penalty.nicaraguanWrapperHeat;
    if (sensory.pepper != null && Number(sensory.pepper) >= 6) score -= rules.penalty.sensoryPepperSix;
    if (sensory.pepper != null && Number(sensory.pepper) >= 7) score -= rules.penalty.sensoryPepperSeven;
    if (strength >= 7 || body === 'full') score -= rules.penalty.fullStrength;
    if ((strength >= 7 || body === 'full') && (/\bligero\b/.test(blob) || /\b(pepper|spice)\b/.test(blob))) {
      score -= rules.penalty.fullBodyHighProofCollision;
    }

    return Math.max(rules.clampMin, Math.min(rules.clampMax, score));
  }
  function afterDinnerCigarDelta(product, ctx) {
    if (!ctx || !ctx.afterDinner) return 0;
    var blob = OPC.productBlob(product);
    var wrapper = normalizeText(product && product.spec && product.spec.wrapper);
    var sensory = product && product.sensory ? product.sensory : {};
    var strength = product && product.spec && product.spec.strength != null ? Number(product.spec.strength) : 5;
    var score = 0;

    if (/\b(connecticut broadleaf|broadleaf maduro|broadleaf)\b/.test(wrapper + ' ' + blob)) score += 0.28;
    if (/\b(molasses|caramel|brown sugar|vanilla|raisin|sweet raisin|toffee|honey)\b/.test(blob)) score += 0.22;
    if (/\b(cream|creamy|milk chocolate|dark chocolate|chocolate|cocoa)\b/.test(blob)) score += 0.2;

    if (/\b(cayenne|black pepper|red pepper|cracked pepper|pepper bomb|sharp spice|spicy finish)\b/.test(blob)) {
      score -= 0.3;
    } else if (/\b(pepper|spice|spicy)\b/.test(blob)) {
      score -= 0.16;
    }
    if (/\b(dry|mineral|nicotine|ligero|double ligero)\b/.test(blob)) score -= 0.18;
    if (sensory.pepper != null && Number(sensory.pepper) >= 7) score -= 0.2;
    if (strength >= 8) score -= 0.12;

    return Math.max(-0.55, Math.min(0.55, score));
  }

  Object.assign(global.OntologyPolicyCore, {
    isHighProofBourbonContext: isHighProofBourbonContext,
    HIGH_PROOF_MADURO_RULES: HIGH_PROOF_MADURO_RULES,
    highProofBourbonMaduroDelta: highProofBourbonMaduroDelta,
    afterDinnerCigarDelta: afterDinnerCigarDelta
  });
})(typeof window !== 'undefined' ? window : global);
