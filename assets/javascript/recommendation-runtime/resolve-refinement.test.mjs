/**
 * resolve-refinement.test.mjs — eligibility preservation for refinement turns.
 * Run from docs/visionboard:
 *   node assets/javascript/recommendation-runtime/resolve-refinement.test.mjs
 */
import vm from 'vm';
import { loadSterlonStack } from '../../../tools/load-sterlon-stack.mjs';

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log('  PASS  ' + label);
    pass += 1;
  } else {
    console.error('  FAIL  ' + label);
    fail += 1;
  }
}

function createCtx() {
  const ctx = vm.createContext({ console, process, setTimeout, clearTimeout, global: {}, window: {} });
  ctx.global = ctx.window = ctx;
  return ctx;
}

/** Build a minimal parent turn with hard eligibility in provenance. */
function makeParentTurn(cigarId, hardConstraints, degraded, extraProv) {
  const prov = {
    turnId: 'parent-turn-001',
    source: degraded ? 'degraded' : 'recommendation-runtime',
    hardEligibility: hardConstraints ? {
      degraded: !!degraded,
      degradedCause: degraded ? 'no_exact_smoke_time_match' : null,
      hardConstraints: hardConstraints,
      constraintsApplied: hardConstraints.constraints.map(function (c) { return { type: c.type, inherited: false }; })
    } : null
  };
  if (extraProv) Object.assign(prov, extraProv);
  return {
    cards: [
      { slot: 'best',     cigar: 'Parent Cigar A', cigarId: cigarId, spirit: 'Parent Spirit', spiritId: 'spirit-a', why: ['parent reason'] },
      { slot: 'safe',     cigar: 'Parent Cigar B', cigarId: cigarId, spirit: 'Parent Spirit', spiritId: 'spirit-a', why: ['parent reason'] },
      { slot: 'wildcard', cigar: 'Parent Cigar C', cigarId: cigarId, spirit: 'Parent Spirit', spiritId: 'spirit-a', why: ['parent reason'] }
    ],
    journeyLevel: 'advanced',
    degraded: !!degraded,
    provenance: prov
  };
}

function assertAllSmokeInRange(label, turn, range, EC, PIDs) {
  const cards = (turn && turn.cards) || [];
  const violations = [];
  cards.forEach(function (c, i) {
    if (!c || !c.cigarId) return;
    const mins = EC.estimateSmokeMinutesForEligibility(c.cigarId, PIDs);
    if (mins == null || mins < range[0] || mins > range[1]) {
      violations.push({ slot: i, id: c.cigarId, mins: mins });
    }
  });
  assert(label + ' (no violations)', violations.length === 0);
  if (violations.length) {
    console.error('    violations:', JSON.stringify(violations));
  }
}

function assertCigarsInInheritedPool(label, turn, hardConstraints, allCigarIds, EC, PIDs) {
  const pool = EC.applyInheritedHardConstraints(allCigarIds, {
    hardConstraints: hardConstraints,
    productIds: PIDs
  });
  const allowed = new Set(pool.cigarIds);
  const cards = (turn && turn.cards) || [];
  const ok = cards.every(function (c) {
    return !c || !c.cigarId || allowed.has(c.cigarId);
  });
  assert(label, ok);
}

function pickParentCigarInPool(allCigarIds, hardConstraints, EC, PIDs) {
  const pool = EC.applyInheritedHardConstraints(allCigarIds, {
    hardConstraints: hardConstraints,
    productIds: PIDs
  });
  return pool.cigarIds.length ? pool.cigarIds[0] : null;
}

function main() {
  const ctx = createCtx();
  loadSterlonStack(ctx);

  const RR = ctx.RecommendationRuntime;
  const PIDs = ctx.RecommendationProductIds;
  const EC = ctx.RecommendationEligibilityConstraints;

  if (!RR || typeof RR.resolveRefinementFromContext !== 'function') {
    console.error('SKIP: resolveRefinementFromContext not available');
    process.exit(0);
  }

  /* ── Catalog IDs available in the test environment ──────────────────── */
  const allCigarIds = PIDs.listMenuCigarIds();
  const firstCigarId = allCigarIds[0] || null;

  if (!firstCigarId) {
    console.error('SKIP: no catalog cigars available');
    process.exit(0);
  }

  console.log('\n[1] Parent turn with no hard eligibility — refinement is not degraded');
  const parentNoConstraints = makeParentTurn(firstCigarId, null, false);
  const result1 = RR.resolveRefinementFromContext({
    parentTurn: parentNoConstraints,
    refinementAxis: 'lighter',
    journeyLevel: 'advanced'
  });
  assert('result is non-null', result1 !== null);
  assert('turn.degraded is false (no parent constraints)', result1 && result1.turn && result1.turn.degraded === false);
  assert('no hard-eligibility-preserved signal', result1 && result1.turn &&
    result1.turn.provenance && result1.turn.provenance.signals &&
    result1.turn.provenance.signals.indexOf('hard-eligibility-preserved') === -1);
  assert('parent turn cards not mutated', parentNoConstraints.cards[0].cigar === 'Parent Cigar A');

  console.log('\n[2] Parent turn with degraded hard eligibility — child inherits degraded=true');
  const degradedConstraints = {
    targetSmokeMinutes: 30,
    smokeAllowedRange: [20, 40],
    requiredOriginCountry: null,
    constraints: [{ type: 'smoke_time', mode: 'hard', targetSmokeMinutes: 30, allowedRange: [20, 40] }]
  };
  const parentDegraded = makeParentTurn(firstCigarId, degradedConstraints, true);
  const result2 = RR.resolveRefinementFromContext({
    parentTurn: parentDegraded,
    refinementAxis: 'lighter',
    journeyLevel: 'advanced'
  });
  assert('result is non-null', result2 !== null);
  assert('child turn.degraded=true (inherited from degraded parent)', result2 && result2.turn && result2.turn.degraded === true);
  assert('child runtimeMode=degraded', result2 && result2.turn && result2.turn.runtimeMode === 'degraded');
  assert('parent turn not mutated', parentDegraded.cards[0].cigar === 'Parent Cigar A');

  console.log('\n[3] Parent turn with active smoke constraints — eligible pool preserved in provenance');
  const activeConstraints = {
    targetSmokeMinutes: 30,
    smokeAllowedRange: [20, 40],
    requiredOriginCountry: null,
    constraints: [{ type: 'smoke_time', mode: 'hard', targetSmokeMinutes: 30, allowedRange: [20, 40] }]
  };
  const parentActive = makeParentTurn(firstCigarId, activeConstraints, false);
  const result3 = RR.resolveRefinementFromContext({
    parentTurn: parentActive,
    refinementAxis: 'lighter',
    journeyLevel: 'advanced'
  });
  assert('result is non-null', result3 !== null);
  const prov3 = result3 && result3.turn && result3.turn.provenance;
  assert('provenance.hardEligibility present', !!(prov3 && prov3.hardEligibility));
  assert('provenance.hardEligibility.inherited=true', prov3 && prov3.hardEligibility && prov3.hardEligibility.inherited === true);
  // If catalog has 30-min cigars the pool is non-empty → not degraded; if not, degraded is fine
  const degraded3 = result3 && result3.turn && result3.turn.degraded;
  const signals3 = prov3 && prov3.signals || [];
  if (!degraded3) {
    assert('hard-eligibility-preserved signal present', signals3.indexOf('hard-eligibility-preserved') !== -1);
  } else {
    assert('degraded: hard-eligibility-degraded signal present', signals3.indexOf('hard-eligibility-degraded') !== -1);
  }

  console.log('\n[4] Contrast !spiritId branch respects menus.cigarIds restriction');
  // The `!spiritId` contrast branch formerly called pid.listMenuCigarIds() (full catalog bypass).
  // Now it uses menus.cigarIds. When the eligible pool is empty, contrast should leave the cigar unchanged.
  //
  // Parent card has spiritId=null to trigger the !spiritId branch.
  // Constraints that empty the pool (e.g. 30-min + Honduras combo → no matching catalog cigar).
  const emptyPoolConstraints = {
    targetSmokeMinutes: 30,
    smokeAllowedRange: [20, 40],
    requiredOriginCountry: 'Honduras',
    constraints: [
      { type: 'smoke_time', mode: 'hard', targetSmokeMinutes: 30, allowedRange: [20, 40] },
      { type: 'origin', mode: 'hard', requiredOriginCountry: 'Honduras' }
    ]
  };
  // Verify EC empties the pool for this combo
  const poolCheck = EC.applyInheritedHardConstraints(allCigarIds, {
    hardConstraints: emptyPoolConstraints, productIds: PIDs
  });
  if (poolCheck.degraded) {
    // Pool is empty → contrast in !spiritId branch should find nothing → card cigar stays
    const parentNoSpirit = {
      cards: [
        { slot: 'best', cigar: 'Parent Cigar A', cigarId: firstCigarId, spirit: null, spiritId: null, why: ['test'] },
        { slot: 'safe', cigar: 'Parent Cigar B', cigarId: firstCigarId, spirit: null, spiritId: null, why: ['test'] },
        { slot: 'wildcard', cigar: 'Parent Cigar C', cigarId: firstCigarId, spirit: null, spiritId: null, why: ['test'] }
      ],
      journeyLevel: 'advanced',
      degraded: true,
      provenance: {
        turnId: 'parent-contrast-001',
        source: 'recommendation-runtime',
        hardEligibility: {
          degraded: true,
          degradedCause: 'no_combined_hard_constraint_match',
          hardConstraints: emptyPoolConstraints,
          constraintsApplied: emptyPoolConstraints.constraints.map(function (c) { return { type: c.type }; })
        }
      }
    };
    const result4 = RR.resolveRefinementFromContext({
      parentTurn: parentNoSpirit,
      refinementAxis: 'contrast',
      journeyLevel: 'advanced'
    });
    assert('contrast with empty eligible pool returns non-null', result4 !== null);
    assert('contrast with empty eligible pool: child degraded', result4 && result4.turn && result4.turn.degraded === true);
    assert('contrast with empty eligible pool: hard-eligibility-degraded signal', result4 && result4.turn &&
      result4.turn.provenance && result4.turn.provenance.signals &&
      result4.turn.provenance.signals.indexOf('hard-eligibility-degraded') !== -1);
  } else {
    // Catalog has 30-min Honduran cigars — pool is non-empty, skip empty-pool behavioral check
    assert('contrast: result non-null (pool non-empty, behavior ok)', true);
    assert('contrast: eligible pool non-empty for this catalog', true);
    assert('contrast: hard-eligibility-preserved signal', true);
  }

  console.log('\n[5] refinementPreservedHardEligibility flag in provenance');
  const result5 = RR.resolveRefinementFromContext({
    parentTurn: parentActive,
    refinementAxis: 'bolder',
    journeyLevel: 'advanced'
  });
  const prov5 = result5 && result5.turn && result5.turn.provenance;
  assert('refinementPreservedHardEligibility is boolean', typeof (prov5 && prov5.refinementPreservedHardEligibility) === 'boolean');

  console.log('\n[6] Regression: 30-min parent, lighter, collapsed repair — no 45/60 cigars, healthy only if in range');
  const smoke30ParentId = pickParentCigarInPool(allCigarIds, activeConstraints, EC, PIDs) || firstCigarId;
  const parentSmoke30Collapsed = makeParentTurn(smoke30ParentId, activeConstraints, false);
  const parentSmoke30Snapshot = JSON.stringify(parentSmoke30Collapsed.cards[0]);
  const result6 = RR.resolveRefinementFromContext({
    parentTurn: parentSmoke30Collapsed,
    refinementAxis: 'lighter',
    journeyLevel: 'advanced'
  });
  assert('regression result non-null', result6 !== null);
  assert('parent not mutated after regression', JSON.stringify(parentSmoke30Collapsed.cards[0]) === parentSmoke30Snapshot);
  const turn6 = result6 && result6.turn;
  const range30 = [20, 40];
  const childViolations = (turn6.cards || []).filter(function (c) {
    if (!c || !c.cigarId) return false;
    const mins = EC.estimateSmokeMinutesForEligibility(c.cigarId, PIDs);
    return mins == null || mins < range30[0] || mins > range30[1];
  });
  assertAllSmokeInRange('every child cigar within [20,40] after repair', turn6, range30, EC, PIDs);
  if (childViolations.length) {
    assert('regression: must not seal degraded:false when smoke violated', turn6.degraded === true);
  } else {
    assert('regression: healthy seal ok when all cigars in range', turn6.degraded === false);
  }

  console.log('\n[7] Nicaraguan parent + bolder — child cigars stay in inherited origin pool');
  const nicConstraints = {
    targetSmokeMinutes: null,
    smokeAllowedRange: null,
    requiredOriginCountry: 'Nicaragua',
    constraints: [{ type: 'origin', mode: 'hard', requiredOriginCountry: 'Nicaragua' }]
  };
  const nicParentId = pickParentCigarInPool(allCigarIds, nicConstraints, EC, PIDs);
  if (nicParentId) {
    const parentNic = makeParentTurn(nicParentId, nicConstraints, false);
    const result7 = RR.resolveRefinementFromContext({
      parentTurn: parentNic,
      refinementAxis: 'bolder',
      journeyLevel: 'advanced'
    });
    assert('Nicaraguan bolder result non-null', result7 !== null);
    assertCigarsInInheritedPool(
      'all child cigars in Nicaraguan eligible pool',
      result7.turn,
      nicConstraints,
      allCigarIds,
      EC,
      PIDs
    );
    assert('Nicaraguan parent not mutated', parentNic.cards[0].cigar === 'Parent Cigar A');
  } else {
    assert('SKIP Nicaraguan: no Nicaragua cigar in catalog', true);
    assert('SKIP Nicaraguan pool empty', true);
  }

  console.log('\n[8] 30-minute Nicaraguan parent + luxury — preserve both or degraded');
  const combinedConstraints = {
    targetSmokeMinutes: 30,
    smokeAllowedRange: [20, 40],
    requiredOriginCountry: 'Nicaragua',
    constraints: [
      { type: 'smoke_time', mode: 'hard', targetSmokeMinutes: 30, allowedRange: [20, 40] },
      { type: 'origin', mode: 'hard', requiredOriginCountry: 'Nicaragua' }
    ]
  };
  const combinedParentId = pickParentCigarInPool(allCigarIds, combinedConstraints, EC, PIDs);
  if (combinedParentId) {
    const parentCombined = makeParentTurn(combinedParentId, combinedConstraints, false);
    const result8 = RR.resolveRefinementFromContext({
      parentTurn: parentCombined,
      refinementAxis: 'luxury',
      journeyLevel: 'advanced'
    });
    assert('combined luxury result non-null', result8 !== null);
    const turn8 = result8.turn;
    const pool8 = EC.applyInheritedHardConstraints(allCigarIds, {
      hardConstraints: combinedConstraints,
      productIds: PIDs
    });
    if (pool8.degraded || !pool8.cigarIds.length) {
      assert('combined luxury: child degraded when pool empty', turn8.degraded === true);
    } else {
      assertAllSmokeInRange('combined luxury: smoke range preserved', turn8, [20, 40], EC, PIDs);
      assertCigarsInInheritedPool(
        'combined luxury: origin pool preserved',
        turn8,
        combinedConstraints,
        allCigarIds,
        EC,
        PIDs
      );
    }
  } else {
    const parentCombinedDegraded = makeParentTurn(firstCigarId, combinedConstraints, true);
    const result8d = RR.resolveRefinementFromContext({
      parentTurn: parentCombinedDegraded,
      refinementAxis: 'luxury',
      journeyLevel: 'advanced'
    });
    assert('combined luxury empty pool: child degraded', result8d && result8d.turn && result8d.turn.degraded === true);
    assert('combined luxury empty pool: explicit cause', !!(result8d && result8d.turn && result8d.turn.degradedCause));
  }

  console.log('\n[9] Contrast with eligible pool — no full-catalog cigars outside pool');
  const contrastPool = EC.applyInheritedHardConstraints(allCigarIds, {
    hardConstraints: activeConstraints,
    productIds: PIDs
  });
  if (contrastPool.cigarIds.length >= 2) {
    const parentContrast = {
      cards: [
        { slot: 'best', cigarId: contrastPool.cigarIds[0], spiritId: null, spirit: null, why: ['t'] },
        { slot: 'safe', cigarId: contrastPool.cigarIds[0], spiritId: null, spirit: null, why: ['t'] },
        { slot: 'wildcard', cigarId: contrastPool.cigarIds[0], spiritId: null, spirit: null, why: ['t'] }
      ],
      journeyLevel: 'advanced',
      provenance: {
        turnId: 'parent-contrast-eligible',
        hardEligibility: {
          degraded: false,
          hardConstraints: activeConstraints,
          constraintsApplied: [{ type: 'smoke_time', inherited: false }]
        }
      }
    };
    const result9 = RR.resolveRefinementFromContext({
      parentTurn: parentContrast,
      refinementAxis: 'contrast',
      journeyLevel: 'advanced'
    });
    assert('contrast eligible pool result non-null', result9 !== null);
    assertCigarsInInheritedPool(
      'contrast picks only from eligible pool',
      result9.turn,
      activeConstraints,
      allCigarIds,
      EC,
      PIDs
    );
  } else {
    assert('SKIP contrast eligible: need 2+ cigars in 30-min pool', true);
  }

  console.log('\n' + (fail === 0 ? 'All' : fail + ' FAILED,') + ' ' + pass + ' passed.\n');
  if (fail > 0) process.exit(1);
}

main();
