import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = 7654;

const MIME = {
  html: 'text/html', js: 'text/javascript', css: 'text/css',
  png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml',
  json: 'application/json', ico: 'image/x-icon', woff2: 'font/woff2'
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/sterlon.html';
  const filePath = path.join(root, urlPath);
  const ext = filePath.split('.').pop();
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found: ' + urlPath);
  }
}).listen(PORT, () => console.log('Sterlon visionboard: http://localhost:' + PORT));
