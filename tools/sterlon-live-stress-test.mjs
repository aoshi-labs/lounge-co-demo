/**
 * Sterlon live conversational stress test (browser + gateway).
 * Run from docs/visionboard (servers must be up):
 *   npx --yes serve -l 3456 .
 *   cd tools/sterlon-groq-gateway && npm start
 *   node tools/sterlon-live-stress-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const visionboardRoot = path.join(__dirname, '..');
const BASE_URL = process.env.STERLON_TEST_URL || 'http://127.0.0.1:3456/sterlon.html';
const OUT_JSON = path.join(__dirname, 'stress-test-results.json');
const OUT_MD = path.join(__dirname, 'stress-test-results.md');
const PER_TURN_TIMEOUT_MS = 120_000;

const QUESTIONS = [
  'I usually drink Maker\u2019s Mark. What cigar would move me one step more premium without getting too intense?',
  'Give me something smoky and late-night with bourbon energy, but not overly strong.',
  'What\u2019s the difference between Montecristo White and Arturo Fuente Hemingway?',
  'I want a cigar around $10 that still feels classy.',
  'What bourbon pairs best with a creamy Connecticut cigar?',
  'Make that recommendation bolder.',
  'Now give me something more adventurous but still approachable.',
  'What cigar would you recommend for someone who likes Hennessy XO?',
  'Teach me the difference between medium body and medium-full body cigars.',
  'I only have 35 minutes tonight. What should I smoke?',
  'What\u2019s a good cigar for someone new to maduros?',
  'Give me a premium pairing under $40 total.',
  'What\u2019s the wrapper actually doing in this cigar?',
  'I usually smoke Padron 1964s. What else should I try?',
  'What\u2019s a really good \u2018everyday\u2019 cigar that doesn\u2019t feel boring?',
  'I\u2019m celebrating tonight. Give me something luxurious.',
  'What drink would completely ruin this cigar pairing?',
  'Tell me more about the filler tobacco in that recommendation.',
  'I want something woody, leathery, and slow-burning for a rainy night.',
  'Between all the cigars you recommended tonight, which one best fits me and why?'
];

const FRESH_SPOT_CHECKS = [
  { id: 'fresh-1', q: QUESTIONS[0] },
  { id: 'fresh-3', q: QUESTIONS[2] },
  { id: 'fresh-9', q: QUESTIONS[8] },
  { id: 'fresh-11', q: QUESTIONS[10] }
];

function analyzeResponse(text, routing) {
  const lower = (text || '').toLowerCase();
  const flags = [];
  if (/\bcheap\b/.test(lower)) flags.push('cheap-language');
  if (/\bexpensive\b/.test(lower)) flags.push('expensive-language');
  if (/(as an ai|language model|i cannot)/i.test(text || '')) flags.push('ai-disclaimer');
  if ((text || '').length < 40) flags.push('very-short');
  if ((text || '').length > 1200) flags.push('very-long');
  if (/good to have you/i.test(text || '')) flags.push('greeting-template-leak');
  if (/tell me the mood/i.test(text || '')) flags.push('clarification-template-leak');
  return { flags, routing };
}

async function waitForTurnComplete(page) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('.sterlon-send-btn');
      const typing = document.getElementById('typing-indicator');
      return btn && !btn.disabled && !typing;
    },
    { timeout: PER_TURN_TIMEOUT_MS }
  );
  await page.waitForTimeout(800);
}

async function sendQuestion(page, text) {
  const composer = page.locator('#composer');
  await composer.fill(text);
  await page.locator('.sterlon-send-btn').click();
  await waitForTurnComplete(page);
}

async function captureTurn(page, label, text) {
  const response = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('#chat .ai-bubble')];
    const last = bubbles[bubbles.length - 1];
    return last ? last.innerText.trim() : '';
  });
  const routing = await page.evaluate((memberText) => {
    const S = window.Sterlon;
    if (!S) return { error: 'Sterlon API missing' };
    return {
      runtimeMode: S.interpretRuntimeMode(memberText),
      expertiseIntent: S.isExpertiseIntent(memberText),
      categoryFocus: S.inferCategoryFocus(memberText),
      spiritOnly: S.isSpiritOnlyRequest(memberText),
      cigarOnly: S.isCigarOnlyRequest(memberText),
      priceCeiling: S.parseBudgetCeiling(memberText),
      historyLen: S.getConversationHistory().length,
      gateway: S.getRuntimeMode ? S.getRuntimeMode() : null
    };
  }, text);
  const analysis = analyzeResponse(response, routing);
  return { label, prompt: text, response, routing, analysis };
}

async function freshSession(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.send === 'function', { timeout: 30_000 });
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (_) {}
    if (typeof newChat === 'function') newChat();
  });
  await page.waitForTimeout(500);
}

async function runFreshSpotChecks(page) {
  const results = [];
  for (const item of FRESH_SPOT_CHECKS) {
    await freshSession(page);
    await sendQuestion(page, item.q);
    results.push(await captureTurn(page, item.id, item.q));
  }
  return results;
}

async function runLongSession(page) {
  await freshSession(page);
  const results = [];
  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const q = QUESTIONS[i];
    await sendQuestion(page, q);
    results.push(await captureTurn(page, `long-${i + 1}`, q));
  }
  return results;
}

function summarize(allTurns) {
  const issues = [];
  const wins = [];
  for (const t of allTurns) {
    if (t.analysis.flags.length) {
      issues.push({ label: t.label, flags: t.analysis.flags, prompt: t.prompt.slice(0, 80) });
    } else if ((t.response || '').length > 80) {
      wins.push({ label: t.label, mode: t.routing.runtimeMode });
    }
  }
  const routingChecks = [
    { label: 'long-3', expect: 'expertise', turn: allTurns.find((t) => t.label === 'long-3') },
    { label: 'long-5', expect: 'recommendation', turn: allTurns.find((t) => t.label === 'long-5') },
    { label: 'long-6', expect: 'refinement', turn: allTurns.find((t) => t.label === 'long-6') },
    { label: 'long-9', expect: 'expertise', turn: allTurns.find((t) => t.label === 'long-9') }
  ];
  const routingMistakes = routingChecks.filter((c) => c.turn && c.turn.routing.runtimeMode !== c.expect);
  return { issues, wins, routingMistakes };
}

async function main() {
  const consoleErrors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => typeof window.send === 'function', { timeout: 30_000 });

  const gatewayOk = await page.evaluate(() => {
    return window.Sterlon && window.Sterlon.isGatewayConfigured && window.Sterlon.isGatewayConfigured();
  });

  const fresh = await runFreshSpotChecks(page);
  const longSession = await runLongSession(page);
  const allTurns = [...fresh, ...longSession];
  const summary = summarize(allTurns);

  const report = {
    at: new Date().toISOString(),
    baseUrl: BASE_URL,
    gatewayConfigured: gatewayOk,
    consoleErrors: [...new Set(consoleErrors)],
    turnCount: allTurns.length,
    fresh,
    longSession,
    summary,
    pass:
      consoleErrors.length === 0 &&
      summary.routingMistakes.length === 0 &&
      !summary.issues.some((i) => i.flags.includes('cheap-language') || i.flags.includes('ai-disclaimer'))
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n');
  const md = [
    '# Sterlon live stress test',
    '',
    `**Date:** ${report.at}`,
    `**Gateway:** ${gatewayOk ? 'yes' : 'mock/fallback'}`,
    `**Pass:** ${report.pass ? 'YES' : 'NO'}`,
    '',
    '## Routing mistakes',
    ...(summary.routingMistakes.length
      ? summary.routingMistakes.map((m) => `- ${m.label}: expected ${m.expect}, got ${m.turn.routing.runtimeMode}`)
      : ['- none']),
    '',
    '## Flags',
    ...(summary.issues.length
      ? summary.issues.map((i) => `- ${i.label}: ${i.flags.join(', ')}`)
      : ['- none']),
    '',
    '## Console errors',
    ...(consoleErrors.length ? consoleErrors.map((e) => `- ${e}`) : ['- none']),
    '',
    '## Long session turns',
    ...longSession.map((t) => `### ${t.label}\n**Q:** ${t.prompt}\n**Mode:** ${t.routing.runtimeMode}\n**R:** ${t.response.slice(0, 500)}${t.response.length > 500 ? '…' : ''}\n`)
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);

  await browser.close();
  console.log(JSON.stringify({ pass: report.pass, turns: report.turnCount, routingMistakes: summary.routingMistakes.length, flags: summary.issues.length, out: OUT_MD }, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
