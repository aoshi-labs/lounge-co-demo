/**
 * parse-budget.test.mjs — unit tests for RecommendationBudget.
 * Run from docs/visionboard:
 *   node assets/javascript/recommendation-runtime/parse-budget.test.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function loadModule() {
  const ctx = vm.createContext({ console, global: {}, window: {} });
  ctx.global = ctx.window = ctx;
  const src = readFileSync(path.join(__dirname, 'parse-budget.js'), 'utf8');
  vm.runInContext(src, ctx);
  return ctx.RecommendationBudget;
}

function main() {
  const RB = loadModule();

  console.log('\n[1] Non-budget text returns mode:none');
  assert('"30 minute smoke" → none', RB.parseBudgetIntent('30 minute smoke').mode === 'none');
  assert('"level 3 cigar" → none', RB.parseBudgetIntent('level 3 cigar').mode === 'none');
  assert('"ring gauge 50" → none', RB.parseBudgetIntent('ring gauge 50').mode === 'none');
  assert('"pair me a bourbon" → none', RB.parseBudgetIntent('pair me a bourbon').mode === 'none');
  assert('empty string → none', RB.parseBudgetIntent('').mode === 'none');

  console.log('\n[2] ceiling mode');
  assert('"under $20" → ceiling 20', RB.parseBudgetIntent('under $20').ceiling === 20);
  assert('"below 15" → ceiling 15', RB.parseBudgetIntent('below 15').ceiling === 15);
  assert('"less than $25" → ceiling 25', RB.parseBudgetIntent('less than $25').ceiling === 25);
  assert('"$20 or less" → ceiling 20', RB.parseBudgetIntent('$20 or less').ceiling === 20);
  assert('"max $30" → ceiling 30', RB.parseBudgetIntent('max $30').ceiling === 30);
  assert('"at most 18" → ceiling 18', RB.parseBudgetIntent('at most 18').ceiling === 18);
  const c20 = RB.parseBudgetIntent('under $20');
  assert('"under $20" mode is ceiling', c20.mode === 'ceiling');
  assert('"under $20" max is 20', c20.max === 20);

  console.log('\n[3] around mode');
  const a30 = RB.parseBudgetIntent('around $30');
  assert('"around $30" → mode around', a30.mode === 'around');
  assert('"around $30" → target 30', a30.target === 30);
  assert('"around $30" → min < 30', a30.min < 30);
  assert('"around $30" → max > 30', a30.max > 30);
  const ish25 = RB.parseBudgetIntent('$25-ish cigar');
  assert('"$25-ish" → mode around', ish25.mode === 'around');
  assert('"$25-ish" → target 25', ish25.target === 25);

  console.log('\n[4] range mode');
  const r = RB.parseBudgetIntent('between $10 and $20');
  assert('"between $10 and $20" → range', r.mode === 'range');
  assert('"between $10 and $20" → min 10', r.min === 10);
  assert('"between $10 and $20" → max 20', r.max === 20);
  assert('"between $10 and $20" → ceiling null', r.ceiling === null);

  console.log('\n[5] session ceiling fallback');
  const sc = RB.parseBudgetIntent('give me a cigar', 40);
  assert('session fallback → ceiling mode', sc.mode === 'ceiling');
  assert('session fallback → ceiling 40', sc.ceiling === 40);
  const noSc = RB.parseBudgetIntent('under $20', 40);
  assert('explicit beats session ceiling', noSc.ceiling === 20);

  console.log('\n[6] budgetAppliesToCigars / budgetAppliesToSpirits');
  assert('cigar focus → cigars yes', RB.budgetAppliesToCigars('cigar') === true);
  assert('pairing focus → cigars yes', RB.budgetAppliesToCigars('pairing') === true);
  assert('spirit focus → cigars no', RB.budgetAppliesToCigars('spirit') === false);
  assert('null focus → cigars no', RB.budgetAppliesToCigars(null) === false);
  assert('spirit focus → spirits yes', RB.budgetAppliesToSpirits('spirit') === true);
  assert('null focus → spirits yes', RB.budgetAppliesToSpirits(null) === true);
  assert('cigar focus → spirits no', RB.budgetAppliesToSpirits('cigar') === false);
  assert('pairing focus → spirits no', RB.budgetAppliesToSpirits('pairing') === false);

  console.log('\n' + (fail === 0 ? 'All' : fail + ' FAILED,') + ' ' + pass + ' passed.\n');
  if (fail > 0) process.exit(1);
}

main();
