/**
 * Regenerate expected/*.json from inputs/*.json (run explicitly after intentional changes).
 * Run from docs/visionboard: node tools/sterlon-reco-freeze/update-golden.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSterlonVmContext, loadSterlonStack, visionboardRoot } from '../load-sterlon-stack.mjs';
import { executeFreezeCase } from './execute.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(visionboardRoot, 'fixtures', 'sterlon-reco');
const inputsDir = path.join(fixturesDir, 'inputs');
const expectedDir = path.join(fixturesDir, 'expected');

if (!fs.existsSync(expectedDir)) {
  fs.mkdirSync(expectedDir, { recursive: true });
}

const files = fs.readdirSync(inputsDir).filter((f) => f.endsWith('.json'));
for (const file of files.sort()) {
  const inputPath = path.join(inputsDir, file);
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const ctx = createSterlonVmContext();
  loadSterlonStack(ctx);
  const actual = executeFreezeCase(ctx, input);
  const outPath = path.join(expectedDir, file);
  fs.writeFileSync(outPath, JSON.stringify(actual, null, 2) + '\n', 'utf8');
  console.log('Wrote', outPath);
}
console.log('Done. Review diffs before commit.');
