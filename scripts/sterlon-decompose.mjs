#!/usr/bin/env node
/**
 * sterlon-decompose.mjs — AST-aware codemod helper for sterlon-chat.js.
 *
 * Safely removes named function/variable declarations from the sterlon-chat.js
 * IIFE using acorn for structural boundaries. The brace-counting bug that
 * corrupted the file in previous text-based approaches is structurally
 * impossible here because we operate on AST node ranges, not raw braces.
 *
 * Usage:
 *   node scripts/sterlon-decompose.mjs \
 *     --file assets/javascript/sterlon-chat.js \
 *     --remove sym1,sym2,sym3
 *
 *   node scripts/sterlon-decompose.mjs \
 *     --file assets/javascript/sterlon-chat.js \
 *     --from-modules assets/javascript/mod1.js,assets/javascript/mod2.js
 *
 *   Add --dry-run to preview without writing.
 *   Add --also-remove sym4,sym5 for non-exported private helpers.
 *
 * Run from the docs/visionboard/ directory.
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use acorn from the local node_modules installed alongside this script.
const require = createRequire(import.meta.url);
const acorn = require(path.join(__dirname, '../node_modules/acorn/dist/acorn.js'));

const parse = (src, opts) =>
  acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', ranges: true, ...opts });

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ── Symbol extraction from module exports ────────────────────────────────────

/**
 * Parse a module file and extract all property keys from
 * `window.XYZ = { key1: ..., key2: ... }` assignment expressions.
 */
function extractExportedSymbols(filePath) {
  const code = readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = parse(code);
  } catch (e) {
    console.error(`  Cannot parse module ${path.basename(filePath)}: ${e.message}`);
    return new Set();
  }
  const symbols = new Set();

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'AssignmentExpression' &&
      node.expression.left.type === 'MemberExpression' &&
      (node.expression.left.object.name === 'window' || node.expression.left.object.name === 'global') &&
      node.expression.right.type === 'ObjectExpression'
    ) {
      node.expression.right.properties.forEach(prop => {
        const key = prop.key && (prop.key.name || prop.key.value);
        if (key) symbols.add(key);
      });
    }
    for (const k of Object.keys(node)) {
      if (['type','start','end','loc','range'].includes(k)) continue;
      const child = node[k];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === 'string') visit(child);
    }
  }

  visit(ast);
  return symbols;
}

// ── Syntax validation via re-parse ──────────────────────────────────────────

function validateSyntax(src, label) {
  try {
    parse(src);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `${e.message} (line ${e.loc && e.loc.line})` };
  }
}

// ── IIFE body extraction ─────────────────────────────────────────────────────

/**
 * Returns the statement array inside the outermost IIFE.
 * Recognises:
 *   (function () { ... })()
 *   (function () { ... }).call(this)
 * Falls back to ast.body if not found.
 */
function findIIFEBody(ast) {
  for (const stmt of ast.body) {
    if (stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    // (function() { ... })()
    if (expr.type === 'CallExpression' && expr.callee.type === 'FunctionExpression') {
      return expr.callee.body.body;
    }
    // (function() { ... }).call(this)
    if (
      expr.type === 'CallExpression' &&
      expr.callee.type === 'MemberExpression' &&
      expr.callee.object.type === 'FunctionExpression'
    ) {
      return expr.callee.object.body.body;
    }
  }
  return null;
}

// ── Leading comment capture ──────────────────────────────────────────────────

/**
 * Given the sorted list of comments (by start) and the node's start position,
 * walks backward through comments to find any contiguous block of comments
 * separated from the node and from each other only by whitespace.
 * Returns the earliest start of that contiguous comment block.
 */
function findLeadingCommentStart(source, comments, nodeStart) {
  // Get comments that end before the node starts, sorted by end position descending
  const before = comments
    .filter(c => c.end <= nodeStart)
    .sort((a, b) => b.end - a.end);

  let leadStart = nodeStart;
  for (const c of before) {
    // There must be only whitespace between c.end and the current leadStart
    const gap = source.slice(c.end, leadStart);
    if (/^\s*$/.test(gap)) {
      leadStart = c.start;
    } else {
      break;
    }
  }
  return leadStart;
}

// ── Range collection ────────────────────────────────────────────────────────

function collectRanges(source, bodyStmts, removeSet, comments) {
  const ranges = [];
  const found = new Set();
  const notFound = new Set([...removeSet]);

  function process(stmt) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      const name = stmt.id.name;
      if (!removeSet.has(name)) return;
      found.add(name);
      notFound.delete(name);
      const start = findLeadingCommentStart(source, comments, stmt.start);
      // Include trailing newline(s) so we don't leave orphan blank lines
      let end = stmt.end;
      while (end < source.length && (source[end] === '\r' || source[end] === '\n')) end++;
      ranges.push({ start, end, name });
    }

    if (stmt.type === 'VariableDeclaration') {
      const matchingNames = stmt.declarations
        .filter(d => d.id && d.id.type === 'Identifier' && removeSet.has(d.id.name))
        .map(d => d.id.name);

      if (matchingNames.length === 0) return;

      if (matchingNames.length < stmt.declarations.length) {
        // Partial match — warn and skip to avoid breaking multi-declarator stmts
        console.warn(
          `  SKIP: declaration [${matchingNames.join(', ')}] shares a VariableDeclaration ` +
          `with other names — remove them manually.`
        );
        return;
      }

      matchingNames.forEach(n => { found.add(n); notFound.delete(n); });
      const start = findLeadingCommentStart(source, comments, stmt.start);
      let end = stmt.end;
      while (end < source.length && (source[end] === '\r' || source[end] === '\n')) end++;
      ranges.push({ start, end, name: matchingNames.join(', ') });
    }
  }

  for (const stmt of bodyStmts) process(stmt);
  return { ranges, found, notFound };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = parseArgs();
const dryRun = !!args['dry-run'];

const targetFile = args.file;
if (!targetFile) {
  console.error('Usage: sterlon-decompose.mjs --file <path> --remove <sym1,sym2> [--dry-run]');
  process.exit(1);
}

// Build the removal set
const removeSet = new Set();

if (args.remove) {
  args.remove.split(',').map(s => s.trim()).filter(Boolean).forEach(s => removeSet.add(s));
}
if (args['also-remove']) {
  args['also-remove'].split(',').map(s => s.trim()).filter(Boolean).forEach(s => removeSet.add(s));
}
if (args['from-modules']) {
  const modulePaths = args['from-modules'].split(',').map(s => s.trim()).filter(Boolean);
  for (const mp of modulePaths) {
    const absPath = path.resolve(process.cwd(), mp);
    console.log(`  Auto-deriving symbols from: ${path.basename(absPath)}`);
    extractExportedSymbols(absPath).forEach(s => removeSet.add(s));
  }
}

if (removeSet.size === 0) {
  console.error('No symbols specified. Use --remove, --also-remove, or --from-modules.');
  process.exit(1);
}

const absTarget = path.resolve(process.cwd(), targetFile);
const source = readFileSync(absTarget, 'utf8');

console.log(`\n── sterlon-decompose ──────────────────────────────────────────────────`);
console.log(`Target : ${absTarget}`);
console.log(`Lines  : ${source.split('\n').length}`);
console.log(`Symbols: ${[...removeSet].sort().join(', ')}`);

// Validate source before touching it
const beforeCheck = validateSyntax(source, 'source');
if (!beforeCheck.ok) {
  console.error(`\nERROR: source file already has a syntax error: ${beforeCheck.message}`);
  console.error('Refusing to modify a corrupt file. Fix it first.');
  process.exit(1);
}

// Parse with comment collection
const comments = [];
const ast = parse(source, {
  onComment: (block, text, start, end) => comments.push({ block, text, start, end })
});

// Find IIFE body
const iifeBody = findIIFEBody(ast);
if (!iifeBody) {
  console.warn('Warning: Could not detect IIFE wrapper — scanning top-level body.');
}
const bodyStmts = iifeBody || ast.body;

// Collect ranges
const { ranges, found, notFound } = collectRanges(source, bodyStmts, removeSet, comments);

console.log(`\nFound    (${found.size}) : ${[...found].sort().join(', ') || '(none)'}`);
if (notFound.size > 0) {
  console.log(`Not found(${notFound.size}) : ${[...notFound].sort().join(', ')}`);
  console.log('  (These may already be removed, be in nested scopes, or have different names)');
}
console.log(`Deletions: ${ranges.length}`);

if (ranges.length === 0) {
  console.log('\nNothing to remove.');
  process.exit(0);
}

if (dryRun) {
  console.log('\n── Dry run preview ──────────────────────────────────────────────────');
  ranges.forEach(r => {
    const preview = source.slice(r.start, Math.min(r.start + 120, r.end))
      .replace(/\n/g, '↵').replace(/\s+/g, ' ');
    console.log(`  [${r.name}] lines ${source.slice(0, r.start).split('\n').length}–` +
      `${source.slice(0, r.end).split('\n').length}: ${preview}…`);
  });
  console.log('\nDry run — no files written.');
  process.exit(0);
}

// Apply deletions in reverse order (highest offset first)
ranges.sort((a, b) => b.start - a.start);

let result = source;
for (const range of ranges) {
  result = result.slice(0, range.start) + result.slice(range.end);
}

// Collapse runs of 4+ newlines down to 3 (keeps section separators but removes excessive gaps)
result = result.replace(/\n{4,}/g, '\n\n\n');

// Validate the result before writing
const afterCheck = validateSyntax(result, 'result');
if (!afterCheck.ok) {
  console.error(`\nERROR: result has a syntax error after removal: ${afterCheck.message}`);
  console.error('File NOT written. This is a bug in sterlon-decompose.mjs — please report.');
  process.exit(2);
}

console.log(`\nResult lines: ${result.split('\n').length}`);
console.log(`Syntax check: PASS`);

writeFileSync(absTarget, result, 'utf8');
console.log(`\nWrote: ${absTarget}`);
console.log(`Lines removed: ${source.split('\n').length - result.split('\n').length}`);
