/**
 * Golden fixture runner — compare freeze outputs to committed expected JSON.
 * Run from docs/visionboard: node tools/sterlon-reco-freeze/run.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';
import { createSterlonVmContext, loadSterlonStack, visionboardRoot } from '../load-sterlon-stack.mjs';
import { executeFreezeCase } from './execute.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(visionboardRoot, 'fixtures', 'sterlon-reco');
const inputsDir = path.join(fixturesDir, 'inputs');
const expectedDir = path.join(fixturesDir, 'expected');

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function runAll() {
  if (!fs.existsSync(inputsDir)) {
    console.error('Missing inputs dir:', inputsDir);
    process.exit(1);
  }
  const files = fs.readdirSync(inputsDir).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.error('No fixture JSON files in', inputsDir);
    process.exit(1);
  }

  let failed = 0;
  for (const file of files.sort()) {
    const id = file.replace(/\.json$/, '');
    const inputPath = path.join(inputsDir, file);
    const expectedPath = path.join(expectedDir, file);
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    const ctx = createSterlonVmContext();
    loadSterlonStack(ctx);
    if (ctx.RecommendationEntropy && typeof ctx.RecommendationEntropy.resetGlobalMetrics === 'function') {
      ctx.RecommendationEntropy.resetGlobalMetrics();
    }

    let actual;
    try {
      actual = executeFreezeCase(ctx, input);
    } catch (e) {
      console.error('\nFAIL', id, 'execute threw:', e.message);
      failed++;
      continue;
    }

    /** Round-trip through JSON so vm-created objects compare to host-parsed expected. */
    const actualNorm = JSON.parse(JSON.stringify(actual));

    if (!fs.existsSync(expectedPath)) {
      console.error('\nFAIL', id, 'missing expected file:', expectedPath);
      failed++;
      continue;
    }

    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    if (!isDeepStrictEqual(actualNorm, expected)) {
      console.error('\nFAIL', id, 'output mismatch.');
      console.error('--- expected (first 2000 chars) ---\n', stableStringify(expected).slice(0, 2000));
      console.error('--- actual (first 2000 chars) ---\n', stableStringify(actualNorm).slice(0, 2000));
      failed++;
    } else {
      process.stdout.write('.');
    }
  }

  console.log(failed ? '\n\nFAILED: ' + failed + ' fixture(s)' : '\n\nAll sterlon-reco freeze fixtures passed.');
  process.exit(failed ? 1 : 0);
}

runAll();
