/**
 * Single-turn Sterlon smoke — default prompt: 30 min Nicaragua cigar.
 * Usage (from docs/visionboard):
 *   STERLON_URL=http://127.0.0.1:8080/sterlon.html?fresh=1 node tools/sterlon-one-turn-test.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.STERLON_URL || 'http://127.0.0.1:8080/sterlon.html?fresh=1';
const PROMPT = process.env.STERLON_PROMPT || 'a 30 min smoke from nicaragua';
const WAIT_MS = Number(process.env.STERLON_TURN_WAIT_MS || 90000);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let gatewayStatus = null;
  let gatewayMock = false;

  page.on('response', async (resp) => {
    try {
      if (!resp.url().includes('/api/sterlon/chat') || resp.request().method() !== 'POST') return;
      gatewayStatus = resp.status();
      const body = await resp.text();
      gatewayMock = body.includes('[MOCK]');
    } catch {
      /* ignore */
    }
  });

  console.log('URL:', BASE);
  console.log('PROMPT:', PROMPT);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page
    .waitForFunction(() => document.documentElement.dataset.catalogReady === 'true', null, { timeout: 45000 })
    .catch(() => console.warn('catalogReady timeout — continuing'));

  const composer = page.getByRole('textbox', { name: 'Message Sterlon' });
  await composer.waitFor({ state: 'visible', timeout: 20000 });
  const prevBubbles = await page.locator('#chat .ai-bubble').count();
  await composer.fill(PROMPT);
  await page.getByRole('button', { name: 'Send' }).click();

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const count = await page.locator('#chat .ai-bubble').count();
    const cards = await page.locator('.reco-card, .recommendation-card, [class*="reco"]').count();
    const typing = await page.locator('.typing-dots').count();
    if (count > prevBubbles && typing === 0) {
      await page.waitForTimeout(800);
      const reply = await page.evaluate(() => {
        const bubbles = [...document.querySelectorAll('#chat .ai-bubble')];
        const last = bubbles[bubbles.length - 1];
        return last ? last.innerText.trim() : '';
      });
      const cardCount = await page.locator('.flight-card, .reco-slot-card, .sterlon-reco-card, .reco-card').count();
      const runtime = await page.evaluate(() =>
        window.Sterlon && typeof window.Sterlon.getRuntimeMode === 'function' ? window.Sterlon.getRuntimeMode() : 'unknown'
      );

      console.log('\n--- RESULT ---');
      console.log('Runtime mode:', runtime);
      console.log('Gateway POST status:', gatewayStatus ?? 'none');
      console.log('Gateway mock:', gatewayMock);
      console.log('Reply length:', reply.length);
      console.log('Card-like elements:', cardCount);
      console.log('Reply preview:', reply.slice(0, 400) + (reply.length > 400 ? '…' : ''));

      const pass =
        gatewayStatus === 200 &&
        !gatewayMock &&
        reply.length > 40 &&
        !/\[MOCK\]/.test(reply);
      console.log(pass ? '\nPASS' : '\nFAIL');
      await browser.close();
      process.exit(pass ? 0 : 1);
    }
    await page.waitForTimeout(500);
  }

  await browser.close();
  console.error('FAIL: timed out waiting for Sterlon reply');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
