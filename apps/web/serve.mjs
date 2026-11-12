/**
 * Lightweight zero-dependency dev server for NeoBus Frontend Control Tower (`apps/web`).
 *
 * Serves `apps/web/public/control-tower.html` at http://localhost:4000
 * and proxies `/api/v1/*` and `/health` requests to the NestJS backend at http://localhost:3000.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WEB_PORT ?? 4000);
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3000';
const HTML_FILE = path.join(__dirname, 'public', 'control-tower.html');

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  // Proxy /api/v1/* or /health to NestJS backend if requested via same origin
  if (url.startsWith('/api/v1') || url === '/health') {
    try {
      const targetUrl = `${API_ORIGIN}${url}`;
      const headers = { ...req.headers };
      delete headers.host;

      const bodyChunks = [];
      for await (const chunk of req) {
        bodyChunks.push(chunk);
      }
      const bodyBuffer = Buffer.concat(bodyChunks);

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body:
          req.method !== 'GET' && req.method !== 'HEAD' && bodyBuffer.length > 0
            ? bodyBuffer
            : undefined,
      });

      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      const text = await upstream.text();
      res.end(text);
      return;
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'OFFLINE',
            message: `Backend API at ${API_ORIGIN} is unreachable (${err.message})`,
          },
        }),
      );
      return;
    }
  }

  // Serve Interactive Control Tower Dashboard HTML
  fs.readFile(HTML_FILE, 'utf-8', (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading control-tower.html');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`⚡ NeoBus Interactive Control Tower UI running at: http://localhost:${PORT}`);
  console.log(`🔗 Proxying /api/v1/* and /health to backend API at: ${API_ORIGIN}`);
});
