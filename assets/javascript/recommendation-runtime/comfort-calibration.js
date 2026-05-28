/**
 * ComfortCalibration — sophistication vs nicotine aggression for comfortAsk prompts.
 * Pure module; load before ontology-cigar-context.js.
 */
(function (global) {
  'use strict';

  var TOTAL_CAP = 0.12;
  var AGGRESSION_CAP = 0.08;
  var SOPHISTICATION_CAP = 0.05;

  function num(v, fallback) {
    var n = Number(v);
    return isNaN(n) ? fallback : n;
  }

  function nicotineAggression(product) {
    var spec = (product && product.spec) || {};
    var sensory = (product && product.sensory) || {};
    var strength = num(spec.strength, 5);
    var pepper = num(sensory.pepper, 5);
    return strength * 0.55 + pepper * 0.45;
  }

  function flavorSophistication(product) {
    var spec = (product && product.spec) || {};
    var sensory = (product && product.sensory) || {};
    var tier = num(spec.tier, 5);
    var sweetness = num(sensory.sweetness, 5);
    var cocoa = num(sensory.cocoa, 5);
    var body = num(sensory.body, 5);
    return tier * 0.35 + sweetness * 0.2 + cocoa * 0.2 + body * 0.25;
  }

  function comfortCalibrationDelta(product, ctx) {
    if (!ctx || !ctx.comfortAsk) return 0;
    if (ctx.boldAsk || ctx.fullBodyAsk) return 0;

    var aggression = nicotineAggression(product);
    var sophistication = flavorSophistication(product);

    var aggressionPenalty = Math.min(AGGRESSION_CAP, Math.max(0, (aggression - 5.5) * 0.04));
    var sophisticationBonus = Math.min(SOPHISTICATION_CAP, Math.max(0, (sophistication - 5) * 0.03));

    var delta = sophisticationBonus - aggressionPenalty;
    if (delta > TOTAL_CAP) return TOTAL_CAP;
    if (delta < -TOTAL_CAP) return -TOTAL_CAP;
    return delta;
  }

  function isConnecticutWrapper(product) {
    var w = product && product.spec && product.spec.wrapper ? String(product.spec.wrapper) : '';
    return /connecticut/i.test(w);
  }

  global.ComfortCalibration = {
    nicotineAggression: nicotineAggression,
    flavorSophistication: flavorSophistication,
    comfortCalibrationDelta: comfortCalibrationDelta,
    isConnecticutWrapper: isConnecticutWrapper,
    TOTAL_CAP: TOTAL_CAP
  };
})(typeof window !== 'undefined' ? window : global);
