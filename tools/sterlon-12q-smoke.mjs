/**
 * Sterlon 12-question browser smoke (Playwright).
 * Many turns are client-only (refinement, expertise cache) — no POST to the gateway.
 *
 *   cd docs/visionboard
 *   node tools/sterlon-12q-smoke.mjs
 *
 * Optional: HEADED=1 STERLON_BASE_URL=http://127.0.0.1:9999
 */
import { chromium } from 'playwright';

const BASE = process.env.STERLON_BASE_URL || 'http://127.0.0.1:8888';
const HEADED = process.env.HEADED === '1' || process.env.HEADED === 'true';
const POST_WAIT_MS = parseInt(process.env.POST_WAIT_MS || '12000', 10) || 12000;

const QUESTIONS = [
  'Hello',
  'What should I try tonight?',
  'Lighter on the best pick',
  'What do you recommend for a peated whisky and a full-bodied cigar?',
  'Bolder on the refined option',
  'Tell me about Lagavulin 16 in two short lines.',
  "I'm not sure yet.",
  'What would you pour with a Padron 1926?',
  'Something smoother — still interesting, not sleepy.',
  "Having friends over who usually don't smoke — what should I pour?",
  'Help me pick a wildcard pour for the end of the night.',
  'Good evening.'
];

function stagingMs(q) {
  if (/recommend|tonight|pour|pairing|wildcard|friends|Padron|pick|smoother|Hello|Good evening|not sure|Lagavulin|two short/i.test(q)) {
    return /Hello|Good evening|not sure yet|Lagavulin|two short/i.test(q) ? 9000 : 22000;
  }
  return 12000;
}

function waitForGatewayPost(page, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const onResponse = (resp) => {
      if (settled) return;
      try {
        const u = resp.url();
        if (!u.includes('/api/sterlon/chat')) return;
        if (resp.request().method() !== 'POST') return;
        settled = true;
        page.off('response', onResponse);
        resolve(resp);
      } catch {
        /* ignore */
      }
    };
    page.on('response', onResponse);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      page.off('response', onResponse);
      resolve(null);
    }, ms);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage();
  const results = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[page]', msg.text());
  });

  await page.goto(`${BASE}/sterlon.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.waitForTimeout(500);

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const n = i + 1;

    const postPromise = waitForGatewayPost(page, POST_WAIT_MS);

    await page.getByRole('textbox', { name: 'Message Sterlon' }).fill(q);
    await page.getByRole('button', { name: 'Send' }).click();

    const resp = await postPromise;
    let status = 'client-only';
    let ct = '';
    if (resp) {
      status = String(resp.status());
      ct = resp.headers()['content-type'] || '';
    }

    await page.waitForTimeout(stagingMs(q));

    const degraded = await page.getByText('The room is moving a little slower than usual tonight').count();

    results.push({
      n,
      q,
      status,
      sse: /event-stream/i.test(ct),
      degraded
    });
    console.log(`Q${n} ${resp ? `POST=${status}` : 'client-only'}${/event-stream/i.test(ct) ? ' SSE' : ''} degraded=${degraded}`);
  }

  await browser.close();

  console.log('\n=== Summary ===');
  for (const r of results) {
    const tag = r.status === 'client-only' ? 'local' : r.status;
    console.log(`${String(r.n).padStart(2)}. [${tag}] ${r.q.slice(0, 58)}${r.q.length > 58 ? '…' : ''}`);
  }

  const badPosts = results.filter((r) => r.status !== 'client-only' && r.status !== '200');
  if (badPosts.length) {
    console.log('\nFailed gateway responses:', badPosts.map((b) => `${b.n}:${b.status}`).join(', '));
    process.exitCode = 1;
  } else {
    const posts = results.filter((r) => r.status === '200').length;
    console.log(`\nCompleted 12 turns. Gateway POST 200 on ${posts} turn(s); others were client-only (expected).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
