/**
 * Headless live smoke — first 10 catalog prompts against sterlon.html.
 * Usage: node tools/sterlon-live-10.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.STERLON_URL || 'http://localhost:7654/sterlon.html';
const WAIT_MS = Number(process.env.STERLON_TURN_WAIT_MS || 15000);

const PROMPTS = [
  'Something with caramel and chocolate under $15',
  'Best bourbon to pair with a Padron 1926',
  'Full-bodied Nicaraguan cigar around $20',
  'Peated scotch with a bold cigar',
  'Mild Connecticut wrapper for a morning smoke',
  'Whiskey under $40 that is not too sweet',
  'What pairs with Arturo Fuente Hemingway Short Story?',
  'Best value cigar in the catalog',
  'Rye whiskey with spice and oak',
  'Maduro cigar with coffee and leather notes',
];

async function sendPrompt(page, text) {
  const composer = page.getByRole('textbox', { name: 'Message Sterlon' });
  await composer.waitFor({ state: 'visible', timeout: 20000 });
  await composer.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

async function latestAssistantText(page) {
  return page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('#chat .ai-bubble')];
    const last = bubbles[bubbles.length - 1];
    return last ? last.textContent.trim().replace(/\s+/g, ' ') : '';
  });
}

async function waitForNewReply(page, prevCount) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const count = await page.locator('#chat .ai-bubble').count();
    const typing = await page.locator('.typing-dots').count();
    if (count > prevCount && typing === 0) {
      await page.waitForTimeout(500);
      return count;
    }
    await page.waitForTimeout(400);
  }
  return page.locator('#chat .ai-bubble').count();
}

async function waitForCatalogReady(page) {
  await page
    .waitForFunction(() => document.documentElement.dataset.catalogReady === 'true', null, {
      timeout: 30000,
    })
    .catch(() => {});
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Sterlon|Catalog|validateCards|Uncaught/i.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err.message || err)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitForCatalogReady(page);

  const newChat = page.getByRole('button', { name: 'New chat' });
  if (await newChat.isVisible().catch(() => false)) {
    await newChat.click();
    await page.waitForTimeout(800);
  }

  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    const prevCount = await page.locator('#chat .ai-bubble').count();
    console.log(`\n--- Turn ${i + 1}/${PROMPTS.length} ---`);
    console.log('PROMPT:', prompt);
    await sendPrompt(page, prompt);
    await waitForNewReply(page, prevCount);
    const reply = await latestAssistantText(page);
    const ok = reply.length > 20;
    console.log('REPLY:', reply.slice(0, 200) + (reply.length > 200 ? '…' : ''));
    console.log(ok ? 'PASS' : 'FAIL (no prose)');
    results.push({ turn: i + 1, prompt, ok, replyLen: reply.length });
  }

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== Live 10: ${passed}/${PROMPTS.length} passed ===`);
  if (consoleErrors.length) {
    console.log('Console errors:', consoleErrors.length);
    consoleErrors.slice(0, 5).forEach((e) => console.log(' -', e.slice(0, 200)));
  }

  if (passed !== PROMPTS.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
