/**
 * cigar-smoke-estimate.test.mjs — unit tests for CigarSmokeEstimate.
 * Run from docs/visionboard:
 *   node assets/javascript/recommendation-runtime/cigar-smoke-estimate.test.mjs
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
  const src = readFileSync(path.join(__dirname, 'cigar-smoke-estimate.js'), 'utf8');
  vm.runInContext(src, ctx);
  return ctx.CigarSmokeEstimate;
}

function main() {
  const CSE = loadModule();
  const parse = CSE.parseSmokeMinutesFromSpec;

  console.log('\n[1] parseSmokeMinutesFromSpec — hour strings');
  assert('"2 hr+" → 130', parse('2 hr+') === 130);
  assert('"2 hr" → 120', parse('2 hr') === 120);
  assert('"2 hrs" → 120', parse('2 hrs') === 120);
  assert('"2 hours" → 120', parse('2 hours') === 120);
  assert('"1.5 hr" → 90', parse('1.5 hr') === 90);
  assert('"1 hour" → 60', parse('1 hour') === 60);

  console.log('\n[2] parseSmokeMinutesFromSpec — plain minute strings');
  assert('"90 min" → 90', parse('90 min') === 90);
  assert('"45 min" → 45', parse('45 min') === 45);
  assert('"30 min" → 30', parse('30 min') === 30);
  assert('"60" → 60', parse('60') === 60);

  console.log('\n[3] parseSmokeMinutesFromSpec — range strings');
  assert('"45-60 min" → 52.5', parse('45-60 min') === 52.5);
  assert('"45–60 min" (en dash) → 52.5', parse('45–60 min') === 52.5);
  assert('"60 to 90" → 75', parse('60 to 90') === 75);
  assert('"30-45" → 37.5', parse('30-45') === 37.5);

  console.log('\n[4] parseSmokeMinutesFromSpec — sanity guard (no pathological values)');
  assert('empty string → null', parse('') === null);
  assert('null → null', parse(null) === null);
  assert('"abc" → null', parse('abc') === null);
  assert('"0 min" → null (not > 0)', parse('0 min') === null);

  console.log('\n[5] parseStickDimensions');
  const dims = CSE.parseStickDimensions('6x50');
  assert('6x50 length=6', dims && dims.length === 6);
  assert('6x50 ring=50', dims && dims.ring === 50);
  assert('no match → null', CSE.parseStickDimensions('robusto') === null);

  console.log('\n[6] resolveTargetSmokeMinutes — soft pacing');
  assert('no ctx → null', CSE.resolveTargetSmokeMinutes(null) === null);
  assert('quickSmoke → 45', CSE.resolveTargetSmokeMinutes({ quickSmoke: true, promptText: '' }) === 45);
  assert('afterDinner → 75', CSE.resolveTargetSmokeMinutes({ afterDinner: true, promptText: '' }) === 75);
  assert('default → 60', CSE.resolveTargetSmokeMinutes({ promptText: '' }) === 60);

  console.log('\n[7] smokeMinutesFitPenalty — soft scoring');
  const ctx60 = { promptText: '' };
  assert('exact match → 0 penalty', CSE.smokeMinutesFitPenalty(60, ctx60) === 0);
  assert('within 8 min → 0 penalty', CSE.smokeMinutesFitPenalty(65, ctx60) === 0);
  assert('far over → non-zero penalty', CSE.smokeMinutesFitPenalty(90, ctx60) > 0);
  assert('penalty never > 0.12', CSE.smokeMinutesFitPenalty(200, ctx60) <= 0.12);

  console.log('\n' + (fail === 0 ? 'All' : fail + ' FAILED,') + ' ' + pass + ' passed.\n');
  if (fail > 0) process.exit(1);
}

main();
