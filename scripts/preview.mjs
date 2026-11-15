import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const portArgument = process.argv.indexOf('--port');
const port = Number(portArgument >= 0 ? process.argv[portArgument + 1] : process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    try {
      const content = await readFile(filename);
      return new Response(request.method === 'HEAD' ? null : content, { headers: { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }
};

http.createServer(async (incoming, outgoing) => {
  try {
    const origin = 'http://' + incoming.headers.host;
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const method = incoming.method || 'GET';
    const request = new Request(new URL(incoming.url, origin), {
      method,
      headers: incoming.headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks)
    });
    const response = await worker.fetch(request, { ASSETS });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end('Preview error');
  }
}).listen(port, '0.0.0.0', () => console.log(`Cow preview ready on ${port}`));
