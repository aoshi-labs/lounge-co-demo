/**
 * Sterlon → Groq dev gateway (OpenAI-compatible chat completions).
 * POST /api/sterlon/chat — same JSON body the visionboard sends today.
 *
 * Env vars (all optional except GROQ_API_KEY):
 *   GROQ_API_KEY          — required (unless GROQ_MOCK=true)
 *   PORT                  — default 8787
 *   GROQ_MODEL            — default openai/gpt-oss-120b
 *   GROQ_MAX_RETRIES      — retry attempts on 429/502/503 (default 3, max 5)
 *   GROQ_REQUEST_INTERVAL_MS — minimum ms between outgoing Groq calls (default 0)
 *   GROQ_MOCK             — if "true", skip Groq entirely; return synthetic response
 *
 * Optional .env in this directory (simple KEY=value lines), e.g.:
 *   GROQ_MAX_RETRIES=3
 *   GROQ_REQUEST_INTERVAL_MS=800
 *   GROQ_MOCK=false
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // missing file
  }
}

function loadDotEnv() {
  const repoRootEnv = path.join(__dirname, '../../../..', '.env');
  [path.join(__dirname, '.env'), repoRootEnv].forEach(loadEnvFile);
}

loadDotEnv();

const PORT = parseInt(process.env.PORT || '8787', 10) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const STATIC_ROOT = path.resolve(process.env.STATIC_ROOT || path.join(__dirname, '..', '..'));
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_MAX_RETRIES = Math.min(5, Math.max(0, parseInt(process.env.GROQ_MAX_RETRIES || '3', 10) || 3));
const GROQ_REQUEST_INTERVAL_MS = Math.max(0, parseInt(process.env.GROQ_REQUEST_INTERVAL_MS || '0', 10) || 0);
const GROQ_MOCK = process.env.GROQ_MOCK === 'true';
const LLM_BACKEND = GROQ_MOCK ? 'mock' : 'groq';

// Timestamp of the last outgoing Groq call — used for GROQ_REQUEST_INTERVAL_MS throttle.
let lastGroqCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build a synthetic mock response (non-streaming only) so CI/offline runs don't need a key.
function buildMockResponse(groqBody) {
  const mockText =
    '[MOCK] Sterlon gateway is running in mock mode. ' +
    'Model: ' + groqBody.model + '. ' +
    'This response is deterministic and does not call Groq.';
  return JSON.stringify({
    id: 'mock-' + Date.now(),
    object: 'chat.completion',
    model: groqBody.model,
    choices: [{ index: 0, message: { role: 'assistant', content: mockText }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  });
}

// Call Groq with retry+backoff for 429, 502, 503 responses.
// Respects retry-after header when present. Falls back to exponential backoff with jitter.
async function callGroqWithRetry(groqBody, apiKey) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
  let attempt = 0;
  while (true) {
    // Enforce minimum inter-request interval before every outgoing call.
    if (GROQ_REQUEST_INTERVAL_MS > 0) {
      const sinceLastCall = Date.now() - lastGroqCallAt;
      if (sinceLastCall < GROQ_REQUEST_INTERVAL_MS) {
        await sleep(GROQ_REQUEST_INTERVAL_MS - sinceLastCall);
      }
    }
    lastGroqCallAt = Date.now();

    const groqRes = await fetch(GROQ_URL, { method: 'POST', headers, body: JSON.stringify(groqBody) });

    if (groqRes.ok) return groqRes;

    const retryable = groqRes.status === 429 || groqRes.status === 502 || groqRes.status === 503;
    if (!retryable || attempt >= GROQ_MAX_RETRIES) return groqRes;

    // Determine wait time: prefer retry-after header, otherwise exponential backoff + jitter.
    let waitMs;
    const retryAfter = groqRes.headers.get('retry-after');
    if (retryAfter) {
      const secs = parseFloat(retryAfter);
      waitMs = isNaN(secs) ? 1000 : Math.min(secs * 1000, 18000);
    } else {
      const base = Math.pow(2, attempt) * 1000;
      const jitter = Math.floor(Math.random() * 500);
      waitMs = base + jitter;
    }

    attempt++;
    console.warn(
      'Groq ' + groqRes.status + ' on attempt ' + attempt + '/' + (GROQ_MAX_RETRIES + 1) +
      ' — retrying in ' + waitMs + ' ms'
    );
    await sleep(waitMs);
    // Drain the response body to avoid connection leaks before retrying.
    await groqRes.arrayBuffer().catch(() => {});
  }
}

function resolveGroqModel(requested) {
  const r = (requested || '').trim();
  if (!r || r === 'sterlon-default' || r === 'sterlon-demo') return DEFAULT_GROQ_MODEL;
  return r;
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2'
};

function sendStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    pathname = '/';
  }
  if (pathname.startsWith('/api/')) return false;

  const requested = pathname === '/' ? '/animation-lab/index.html' : decodeURIComponent(pathname);
  const candidate = path.resolve(STATIC_ROOT, '.' + requested);
  if (!candidate.startsWith(STATIC_ROOT + path.sep) && candidate !== STATIC_ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return true;
  }

  let filePath = candidate;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    if (path.extname(requested)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return true;
    }
    filePath = path.join(STATIC_ROOT, 'animation-lab', 'index.html');
  }

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return true;
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const base = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, base);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...base, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'sterlon-groq-gateway',
        post: '/api/sterlon/chat',
        backend: LLM_BACKEND,
        groqModelDefault: DEFAULT_GROQ_MODEL,
        groqKeyConfigured: Boolean(process.env.GROQ_API_KEY),
        mock: GROQ_MOCK
      })
    );
    return;
  }

  if (sendStatic(req, res)) return;

  if (req.method !== 'POST' || req.url !== '/api/sterlon/chat') {
    res.writeHead(404, { ...base, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey && !GROQ_MOCK) {
    res.writeHead(500, { ...base, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'GROQ_API_KEY is not set in server environment' }));
    return;
  }

  let payload;
  try {
    payload = JSON.parse((await readRequestBody(req)) || '{}');
  } catch {
    res.writeHead(400, { ...base, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const stream = payload.stream === true;
  const groqBody = {
    model: resolveGroqModel(payload.model),
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    stream,
    max_tokens: typeof payload.max_tokens === 'number' ? payload.max_tokens : 1024,
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7
  };

  // GROQ_MOCK: return synthetic response without calling Groq.
  if (GROQ_MOCK) {
    if (stream) {
      // For streaming, emit a single data chunk then done.
      const mockText = '[MOCK] Sterlon gateway mock mode — model: ' + groqBody.model;
      const chunk = JSON.stringify({
        id: 'mock-' + Date.now(),
        object: 'chat.completion.chunk',
        choices: [{ delta: { content: mockText }, finish_reason: null, index: 0 }]
      });
      res.writeHead(200, { ...base, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('data: ' + chunk + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.writeHead(200, { ...base, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(buildMockResponse(groqBody));
    }
    return;
  }

  let groqRes;
  try {
    groqRes = await callGroqWithRetry(groqBody, apiKey);
  } catch (err) {
    res.writeHead(502, { ...base, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Groq fetch failed', message: String(err && err.message ? err.message : err) }));
    return;
  }

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    res.writeHead(groqRes.status, { ...base, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(errText.slice(0, 8000));
    return;
  }

  if (stream) {
    const ct = groqRes.headers.get('content-type') || 'text/event-stream; charset=utf-8';
    res.writeHead(200, {
      ...base,
      'Content-Type': ct,
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    if (!groqRes.body) {
      res.end();
      return;
    }
    const reader = groqRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength) res.write(Buffer.from(value));
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
    res.end();
    return;
  }

  const buf = Buffer.from(await groqRes.arrayBuffer());
  res.writeHead(200, { ...base, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(buf);
});

server.listen(PORT, HOST, () => {
  console.log('Sterlon demo listening at http://' + HOST + ':' + PORT);
  console.log('  Static root:', STATIC_ROOT);
  console.log('  POST /api/sterlon/chat');
  console.log('  LLM backend:', LLM_BACKEND);
  console.log('  Default model:', DEFAULT_GROQ_MODEL);
  console.log('  Max retries on 429/5xx:', GROQ_MAX_RETRIES);
  if (GROQ_REQUEST_INTERVAL_MS > 0) console.log('  Request interval throttle:', GROQ_REQUEST_INTERVAL_MS + ' ms');
  if (GROQ_MOCK) console.log('  *** MOCK MODE — Groq will not be called ***');
});
