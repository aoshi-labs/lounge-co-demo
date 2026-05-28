#!/usr/bin/env node
/**
 * Fail CI when Sterlon architecture "pilot" residue reappears.
 * Run from docs/visionboard: npm run audit:pilot-residue
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const visionboardRoot = path.join(__dirname, '..');
const repoRoot = path.join(visionboardRoot, '../..');

const SCAN_ROOTS = [
  path.join(visionboardRoot, 'assets'),
  path.join(visionboardRoot, 'tools'),
  path.join(visionboardRoot, 'fixtures'),
  path.join(repoRoot, 'AGENTS.md'),
  path.join(repoRoot, 'CLAUDE.md')
];

const ALLOWLIST_PATHS = [
  /node_modules/,
  /\.tsv$/,
  /\.csv$/,
  /Cigar_Spirit Research Tracker/,
  /docs[\\/]internal[\\/]BUSINESS_MODEL\.md$/,
  /docs[\\/]internal[\\/]ROADMAP\.md$/,
  /docs[\\/]web[\\/]/,
  /audit-pilot-residue\.mjs$/
];

const ALLOWLIST_LINE = [
  /co-pilot/i,
  /Copilot/i,
  /audit:pilot-residue/i,
  /npm run audit:pilot-residue/i,
  /typescript\.js/,
  /prism-sqf/,
  /prism-sas/,
  /Pilot G2/i,
  /Pilot cigar/i,
  /venue pilot/i,
  /paid pilot/i,
  /design-partner/i,
  /pilot venue/i,
  /pilot-sized/i
];

const PATTERNS = [
  { re: /\bpilot\b/i, label: 'pilot word' },
  { re: /\bPILOT\b/, label: 'PILOT token' },
  { re: /pilotFlight|pilotDeck|pilotCards|pilotBourbon|pilotSpirit|pilotSkus|pilot rail|pilot stick|pilot menu|pilot-flight|setPilot|skip_pilot|load_pilot|PILOT_/i, label: 'pilot architecture' },
  { re: /SPI-PILOT-/, label: 'SPI-PILOT SKU prefix' }
];

const EXT_OK = new Set([
  '.js',
  '.mjs',
  '.html',
  '.md',
  '.json',
  '.py',
  '.css',
  ''
]);

function allowedPath(filePath) {
  return ALLOWLIST_PATHS.some((re) => re.test(filePath));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    out.push(dir);
    return out;
  }
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (allowedPath(full)) continue;
    walk(full, out);
  }
  return out;
}

function scanFile(filePath) {
  if (allowedPath(filePath)) return [];
  const ext = path.extname(filePath);
  if (!EXT_OK.has(ext)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  const hits = [];
  text.split(/\r?\n/).forEach((line, idx) => {
    if (ALLOWLIST_LINE.some((re) => re.test(line))) return;
    for (const pat of PATTERNS) {
      if (pat.re.test(line)) {
        hits.push({ file: rel, line: idx + 1, label: pat.label, snippet: line.trim().slice(0, 120) });
        break;
      }
    }
  });
  return hits;
}

const files = [];
for (const root of SCAN_ROOTS) {
  walk(root, files);
}

const violations = [];
for (const file of files.sort()) {
  violations.push(...scanFile(file));
}

if (violations.length) {
  console.error(`PILOT RESIDUE AUDIT FAILED — ${violations.length} hit(s):\n`);
  for (const v of violations.slice(0, 80)) {
    console.error(`  ${v.file}:${v.line} [${v.label}] ${v.snippet}`);
  }
  if (violations.length > 80) {
    console.error(`  … and ${violations.length - 80} more`);
  }
  process.exit(1);
}

console.log('Pilot residue audit passed (0 Sterlon architecture hits).');
