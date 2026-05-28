/* eligibility-constraints.test.js
   Run with: node eligibility-constraints.test.js (from this directory)
   Plain-node assertions — no test framework required. */

(function () {
  'use strict';

  var pass = 0;
  var fail = 0;

  function assert(label, condition) {
    if (condition) {
      console.log('  PASS  ' + label);
      pass++;
    } else {
      console.error('  FAIL  ' + label);
      fail++;
    }
  }

  /* ── Minimal mock catalog ──────────────────────────────────────────────── */

  var PRODUCTS = {
    /* Nicaragua 30-min */
    'nic-30': {
      id: 'nic-30', name: 'Test Nic Robusto', category: 'cigar',
      spec: { smokeTime: '30 min', body: 'Medium', strength: 3 },
      menuLine: 'Test Nic Robusto · 5 × 50 · Robusto · Medium · Nicaragua · $10 · Notes: cedar'
    },
    /* Nicaragua 60-min */
    'nic-60': {
      id: 'nic-60', name: 'Test Nic Toro', category: 'cigar',
      spec: { smokeTime: '60 min', body: 'Medium-Full', strength: 4 },
      menuLine: 'Test Nic Toro · 6 × 54 · Toro · Medium-Full · Nicaragua · $14 · Notes: cedar'
    },
    /* Nicaragua 90-min */
    'nic-90': {
      id: 'nic-90', name: 'Test Nic Churchill', category: 'cigar',
      spec: { smokeTime: '90 min', body: 'Full', strength: 5 },
      menuLine: 'Test Nic Churchill · 7 × 50 · Churchill · Full · Nicaragua · $18 · Notes: earth'
    },
    /* Dominican Republic 30-min */
    'dom-30': {
      id: 'dom-30', name: 'Test Dom Robusto', category: 'cigar',
      spec: { smokeTime: '30 min', body: 'Medium', strength: 3 },
      menuLine: 'Test Dom Robusto · 5 × 50 · Robusto · Medium · Dominican · $10 · Notes: cream'
    },
    /* Dominican Republic 60-min */
    'dom-60': {
      id: 'dom-60', name: 'Test Dom Toro', category: 'cigar',
      spec: { smokeTime: '60 min', body: 'Medium-Full', strength: 4 },
      menuLine: 'Test Dom Toro · 6 × 54 · Toro · Medium-Full · Dominican · $13 · Notes: cream'
    },
    /* Honduras 45-min */
    'hon-45': {
      id: 'hon-45', name: 'Test Hon Corona', category: 'cigar',
      spec: { smokeTime: '45 min', body: 'Medium', strength: 3 },
      menuLine: 'Test Hon Corona · 5.5 × 43 · Corona · Medium · Honduras · $9 · Notes: spice'
    },
    /* Unknown smoke time, Nicaragua */
    'nic-unk': {
      id: 'nic-unk', name: 'Test Nic Unknown', category: 'cigar',
      spec: { body: 'Medium', strength: 3 },
      menuLine: 'Test Nic Unknown · 5 × 50 · Robusto · Medium · Nicaragua · $10 · Notes: cedar'
    },
    /* Blended filler: Nicaragua / Honduras */
    'blend-nic-hon': {
      id: 'blend-nic-hon', name: 'Test Blend', category: 'cigar',
      spec: { smokeTime: '60 min', body: 'Medium', filler: 'Nicaragua / Honduras' },
      menuLine: 'Test Blend · 6 × 52 · Toro · Medium · Nicaragua · $12 · Notes: spice'
    }
  };

  var ALL_IDS = Object.keys(PRODUCTS);

  var mockProductIds = {
    getById: function (category, id) {
      if (category !== 'cigar') return null;
      return PRODUCTS[id] || null;
    }
  };

  /* Load the module */
  global.RecommendationProductIds = mockProductIds;
  /* No CigarSmokeEstimate — use direct spec.smokeTime parsing */
  delete global.CigarSmokeEstimate;

  require('./eligibility-constraints.js');

  var EC = global.RecommendationEligibilityConstraints;
  if (!EC) {
    console.error('FATAL: RecommendationEligibilityConstraints did not attach to global.');
    process.exit(1);
  }

  /* ── Helper ──────────────────────────────────────────────────────────────── */

  function apply(prompt, ids) {
    return EC.applyHardEligibilityConstraints(ids || ALL_IDS, {
      promptText: prompt,
      productIds: mockProductIds,
      toleranceMinutes: 10
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     1. No hard constraints — pool unchanged
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[1] No hard constraints — pool returned unchanged');
  var noConstraint = apply('recommend me a good cigar with bourbon');
  assert('cigarIds length equals input length', noConstraint.cigarIds.length === ALL_IDS.length);
  assert('degraded is false', noConstraint.degraded === false);
  assert('constraintsApplied is empty', noConstraint.constraintsApplied.length === 0);
  assert('hardConstraints.constraints is empty', noConstraint.hardConstraints.constraints.length === 0);

  /* ═══════════════════════════════════════════════════════════════════════
     2. "30-minute smoke" — only 30-min cigars survive; none above max range
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[2] "30-minute smoke" returns no cigar above max range [20,40]');
  var smoke30 = apply('30-minute smoke with my bourbon');
  assert('targetSmokeMinutes is 30', smoke30.hardConstraints.targetSmokeMinutes === 30);
  assert('allowedRange is [20, 40]', smoke30.hardConstraints.smokeAllowedRange[0] === 20 && smoke30.hardConstraints.smokeAllowedRange[1] === 40);
  assert('degraded is false', smoke30.degraded === false);
  var allSatisfy30 = smoke30.cigarIds.every(function (id) {
    var mins = EC.estimateSmokeMinutesForEligibility(id, mockProductIds);
    return mins != null && mins >= 20 && mins <= 40;
  });
  assert('every returned cigar is within [20, 40] min', allSatisfy30);
  assert('nic-30 is included', smoke30.cigarIds.indexOf('nic-30') !== -1);
  assert('dom-30 is included', smoke30.cigarIds.indexOf('dom-30') !== -1);
  assert('nic-60 is excluded', smoke30.cigarIds.indexOf('nic-60') === -1);
  assert('nic-90 is excluded', smoke30.cigarIds.indexOf('nic-90') === -1);
  assert('hon-45 is excluded', smoke30.cigarIds.indexOf('hon-45') === -1);
  assert('nic-unk (unknown time) is excluded', smoke30.cigarIds.indexOf('nic-unk') === -1);

  /* ═══════════════════════════════════════════════════════════════════════
     3. "quick 30 min cigar" — same result as above
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[3] "quick 30 min cigar" — same as explicit 30-minute constraint');
  var quick30 = apply('give me a quick 30 min cigar');
  assert('targetSmokeMinutes is 30', quick30.hardConstraints.targetSmokeMinutes === 30);
  assert('nic-30 included', quick30.cigarIds.indexOf('nic-30') !== -1);
  assert('nic-60 excluded', quick30.cigarIds.indexOf('nic-60') === -1);

  /* ═══════════════════════════════════════════════════════════════════════
     4. "I have 20 minutes" — targets 20, not 30 or 45
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[4] "I have 20 minutes" — targets 20 min, range [10, 30]');
  var have20 = apply('I have 20 minutes for a smoke');
  assert('targetSmokeMinutes is 20, not 30 or 45', have20.hardConstraints.targetSmokeMinutes === 20);
  assert('allowedRange[0] is 10', have20.hardConstraints.smokeAllowedRange[0] === 10);
  assert('allowedRange[1] is 30', have20.hardConstraints.smokeAllowedRange[1] === 30);
  assert('nic-30 included (30 min ≤ 30)', have20.cigarIds.indexOf('nic-30') !== -1);
  assert('hon-45 excluded (45 > 30)', have20.cigarIds.indexOf('hon-45') === -1);

  /* ═══════════════════════════════════════════════════════════════════════
     5. "Nicaraguan cigar" — only confirmed Nicaraguan-origin cigars
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[5] "Nicaraguan cigar" — only Nicaragua-origin cigars returned');
  var nicOrigin = apply('recommend me a Nicaraguan cigar');
  assert('requiredOriginCountry is Nicaragua', nicOrigin.hardConstraints.requiredOriginCountry === 'Nicaragua');
  assert('degraded is false', nicOrigin.degraded === false);
  assert('nic-30 included', nicOrigin.cigarIds.indexOf('nic-30') !== -1);
  assert('nic-60 included', nicOrigin.cigarIds.indexOf('nic-60') !== -1);
  assert('nic-90 included', nicOrigin.cigarIds.indexOf('nic-90') !== -1);
  assert('nic-unk included (unknown time, but origin matches)', nicOrigin.cigarIds.indexOf('nic-unk') !== -1);
  assert('dom-30 excluded', nicOrigin.cigarIds.indexOf('dom-30') === -1);
  assert('dom-60 excluded', nicOrigin.cigarIds.indexOf('dom-60') === -1);
  assert('hon-45 excluded', nicOrigin.cigarIds.indexOf('hon-45') === -1);
  /* blend-nic-hon has menuLine Nicaragua — should match primary origin */
  assert('blend-nic-hon included (primary origin Nicaragua)', nicOrigin.cigarIds.indexOf('blend-nic-hon') !== -1);

  /* ═══════════════════════════════════════════════════════════════════════
     6. "30-minute Nicaraguan cigar" — both constraints applied
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[6] "30-minute Nicaraguan cigar" — both smoke time and origin applied');
  var both = apply('give me a 30-minute Nicaraguan cigar');
  assert('both constraints detected', both.hardConstraints.constraints.length === 2);
  assert('only nic-30 survives', both.cigarIds.length === 1 && both.cigarIds[0] === 'nic-30');
  assert('degraded is false', both.degraded === false);
  assert('constraintsApplied has 2 entries', both.constraintsApplied.length === 2);
  assert('smoke_time constraint beforeCount recorded', both.constraintsApplied[0].beforeCount === ALL_IDS.length);
  assert('origin constraint beforeCount is post-smoke count', both.constraintsApplied[1].beforeCount === both.constraintsApplied[0].afterCount);

  /* ═══════════════════════════════════════════════════════════════════════
     7. Degraded path — constraints empty the pool
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[7] Degraded — constraints empty the pool');
  /* Only pass Cuban cigars (none in mock) with a 30-min constraint */
  var cubans = apply('30-minute Cuban cigar');
  assert('degraded is true', cubans.degraded === true);
  assert('cigarIds is empty', cubans.cigarIds.length === 0);
  assert('degradedCause is no_combined_hard_constraint_match', cubans.degradedCause === 'no_combined_hard_constraint_match');
  assert('constraintsApplied still has entries', cubans.constraintsApplied.length >= 1);
  /* beforeCount on smoke_time constraint should equal total input */
  assert('smoke_time beforeCount recorded', cubans.constraintsApplied[0].beforeCount === ALL_IDS.length);

  /* Degraded with smoke-only */
  var warnFired = false;
  var origWarn = console.warn;
  console.warn = function (msg) { if (String(msg).indexOf('Hard eligibility emptied') !== -1) warnFired = true; };
  var degradedSmoke = apply('I need a 15-minute cigar');
  console.warn = origWarn;
  /* 15 ± 10 = [5, 25] — no cigars have smokeTime in that range in mock catalog */
  assert('degraded is true for impossible smoke range', degradedSmoke.degraded === true);
  assert('degradedCause is no_exact_smoke_time_match', degradedSmoke.degradedCause === 'no_exact_smoke_time_match');
  assert('console.warn fired for degraded pool', warnFired);

  /* ═══════════════════════════════════════════════════════════════════════
     8. cards do not reorder, change count, or replace products
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[8] Card count and product identities preserved');
  var countCheck = apply('recommend me a cigar');
  assert('output cigarIds count equals input', countCheck.cigarIds.length === ALL_IDS.length);
  /* With an origin constraint, the returned IDs are the exact filtered subset */
  var domCheck = apply('Dominican cigar');
  var domIds = domCheck.cigarIds;
  var allAreDom = domIds.every(function (id) {
    var p = mockProductIds.getById('cigar', id);
    return EC.normalizeOriginCountry('Dominican') === EC.normalizeOriginCountry(
      (p.menuLine || '').split(' · ')[4] || ''
    );
  });
  assert('all returned IDs are Dominican-origin', allAreDom);
  assert('cardsOut does not gain extra IDs', domIds.indexOf('nic-30') === -1);

  /* ═══════════════════════════════════════════════════════════════════════
     9. normalizeOriginCountry handles aliases
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[9] normalizeOriginCountry handles aliases and canonical names');
  assert('"nicaraguan" → Nicaragua', EC.normalizeOriginCountry('nicaraguan') === 'Nicaragua');
  assert('"Nicaraguan" → Nicaragua', EC.normalizeOriginCountry('Nicaraguan') === 'Nicaragua');
  assert('"dominican" → Dominican Republic', EC.normalizeOriginCountry('dominican') === 'Dominican Republic');
  assert('"cuban" → Cuba', EC.normalizeOriginCountry('cuban') === 'Cuba');
  assert('"Honduras" → Honduras', EC.normalizeOriginCountry('Honduras') === 'Honduras');
  assert('"Nicaragua" passthrough', EC.normalizeOriginCountry('Nicaragua') === 'Nicaragua');
  assert('null input → null', EC.normalizeOriginCountry(null) === null);

  /* ═══════════════════════════════════════════════════════════════════════
     10. estimateSmokeMinutesForEligibility parses spec.smokeTime correctly
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[10] estimateSmokeMinutesForEligibility parses spec values');
  assert('"30 min" → 30', EC.estimateSmokeMinutesForEligibility('nic-30', mockProductIds) === 30);
  assert('"45 min" → 45', EC.estimateSmokeMinutesForEligibility('hon-45', mockProductIds) === 45);
  assert('"90 min" → 90', EC.estimateSmokeMinutesForEligibility('nic-90', mockProductIds) === 90);
  assert('no smokeTime → null', EC.estimateSmokeMinutesForEligibility('nic-unk', mockProductIds) === null);
  /* Range string */
  var rangeProduct = { spec: { smokeTime: '45-60 min' } };
  assert('"45-60 min" range → 52.5', EC.estimateSmokeMinutesForEligibility(rangeProduct, null) === 52.5);
  /* "2 hr+" sentinel */
  var longProduct = { spec: { smokeTime: '2 hr+' } };
  assert('"2 hr+" → 130', EC.estimateSmokeMinutesForEligibility(longProduct, null) === 130);

  /* ═══════════════════════════════════════════════════════════════════════
     11. hardConstraints does NOT change for vague "quick smoke" (no number)
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[11] Vague "quick smoke" without explicit number is NOT a hard constraint');
  var quickVague = EC.extractHardConstraints({ promptText: 'give me a quick smoke with bourbon', toleranceMinutes: 10 });
  assert('no smoke_time constraint for vague "quick smoke"', quickVague.targetSmokeMinutes === null);
  assert('constraints array is empty', quickVague.constraints.length === 0);

  /* ═══════════════════════════════════════════════════════════════════════
     12. Refinement scenario — hardConstraints preserved in provenance shape
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[12] hardConstraints shape is inspectable for turn provenance');
  var hc = EC.extractHardConstraints({ promptText: '30-minute Nicaraguan cigar', toleranceMinutes: 10 });
  assert('targetSmokeMinutes is 30', hc.targetSmokeMinutes === 30);
  assert('requiredOriginCountry is Nicaragua', hc.requiredOriginCountry === 'Nicaragua');
  assert('two constraints present', hc.constraints.length === 2);
  assert('smoke constraint has allowedRange', Array.isArray(hc.smokeAllowedRange));
  /* A refinement turn that reads provenance.hardEligibility.hardConstraints would find these fields. */
  var result = apply('30-minute Nicaraguan cigar');
  assert('provenance-ready hardConstraints accessible from result', result.hardConstraints.targetSmokeMinutes === 30);
  assert('constraintsApplied is an array', Array.isArray(result.constraintsApplied));

  /* ═══════════════════════════════════════════════════════════════════════
     13. CSE estimate clamp — reject out-of-range / non-finite before hard gate
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[13] CSE estimateSmokeMinutes clamp rejects bad internal values');
  global.CigarSmokeEstimate = {
    estimateSmokeMinutes: function () { return 500; }
  };
  assert('CSE 500 falls through to spec "30 min"', EC.estimateSmokeMinutesForEligibility('nic-30', mockProductIds) === 30);
  global.CigarSmokeEstimate = {
    estimateSmokeMinutes: function () { return '45'; }
  };
  assert('CSE string "45" coerced to 45', EC.estimateSmokeMinutesForEligibility({ spec: {} }, null) === 45);
  global.CigarSmokeEstimate = {
    estimateSmokeMinutes: function () { return NaN; }
  };
  assert('CSE NaN falls through to spec "45 min"', EC.estimateSmokeMinutesForEligibility('hon-45', mockProductIds) === 45);
  delete global.CigarSmokeEstimate;

  /* ═══════════════════════════════════════════════════════════════════════
     14. applyInheritedHardConstraints — smoke-time filter
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[14] applyInheritedHardConstraints — smoke-time inheritance');
  var inherited30Constraints = {
    targetSmokeMinutes: 30,
    smokeAllowedRange: [20, 40],
    requiredOriginCountry: null,
    constraints: [{ type: 'smoke_time', mode: 'hard', targetSmokeMinutes: 30, allowedRange: [20, 40] }]
  };
  var inh30 = EC.applyInheritedHardConstraints(ALL_IDS, { hardConstraints: inherited30Constraints, productIds: mockProductIds });
  assert('30-min inherited: not degraded', inh30.degraded === false);
  assert('30-min inherited: nic-30 included', inh30.cigarIds.indexOf('nic-30') !== -1);
  assert('30-min inherited: dom-30 included', inh30.cigarIds.indexOf('dom-30') !== -1);
  assert('30-min inherited: nic-60 excluded', inh30.cigarIds.indexOf('nic-60') === -1);
  assert('30-min inherited: nic-90 excluded', inh30.cigarIds.indexOf('nic-90') === -1);
  assert('30-min inherited: inherited flag set', inh30.inherited === true);
  assert('30-min inherited: constraintsApplied has smoke_time', inh30.constraintsApplied.length > 0 && inh30.constraintsApplied[0].type === 'smoke_time');
  assert('30-min inherited: constraint marked inherited', inh30.constraintsApplied[0].inherited === true);

  /* ═══════════════════════════════════════════════════════════════════════
     15. applyInheritedHardConstraints — origin filter
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[15] applyInheritedHardConstraints — origin inheritance');
  var inheritedNicConstraints = {
    targetSmokeMinutes: null,
    smokeAllowedRange: null,
    requiredOriginCountry: 'Nicaragua',
    constraints: [{ type: 'origin', mode: 'hard', requiredOriginCountry: 'Nicaragua' }]
  };
  var inhNic = EC.applyInheritedHardConstraints(ALL_IDS, { hardConstraints: inheritedNicConstraints, productIds: mockProductIds });
  assert('Nicaraguan inherited: not degraded', inhNic.degraded === false);
  assert('Nicaraguan inherited: nic-30 included', inhNic.cigarIds.indexOf('nic-30') !== -1);
  assert('Nicaraguan inherited: nic-60 included', inhNic.cigarIds.indexOf('nic-60') !== -1);
  assert('Nicaraguan inherited: dom-30 excluded', inhNic.cigarIds.indexOf('dom-30') === -1);
  assert('Nicaraguan inherited: hon-45 excluded', inhNic.cigarIds.indexOf('hon-45') === -1);

  /* ═══════════════════════════════════════════════════════════════════════
     16. applyInheritedHardConstraints — combined + degraded
  ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n[16] applyInheritedHardConstraints — combined + degraded');
  var combined = {
    targetSmokeMinutes: 30, smokeAllowedRange: [20, 40],
    requiredOriginCountry: 'Honduras',
    constraints: [
      { type: 'smoke_time', mode: 'hard', targetSmokeMinutes: 30, allowedRange: [20, 40] },
      { type: 'origin', mode: 'hard', requiredOriginCountry: 'Honduras' }
    ]
  };
  var inhCombined = EC.applyInheritedHardConstraints(ALL_IDS, { hardConstraints: combined, productIds: mockProductIds });
  assert('combined 30min+Honduras: degraded (no match)', inhCombined.degraded === true);
  assert('combined: cause is no_combined', inhCombined.degradedCause === 'no_combined_hard_constraint_match');
  assert('combined: cigarIds is empty', inhCombined.cigarIds.length === 0);

  var noConstraints = { targetSmokeMinutes: null, requiredOriginCountry: null, constraints: [] };
  var inhNone = EC.applyInheritedHardConstraints(ALL_IDS, { hardConstraints: noConstraints, productIds: mockProductIds });
  assert('no constraints: returns full pool', inhNone.cigarIds.length === ALL_IDS.length);
  assert('no constraints: not degraded', inhNone.degraded === false);

  /* ── Summary ────────────────────────────────────────────────────────────── */
  console.log('\n' + (fail === 0 ? 'All' : fail + ' FAILED,') + ' ' + pass + ' passed.\n');
  if (fail > 0) process.exit(1);
})();
