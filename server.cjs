'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || '0.0.0.0';
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/engine.js', ['engine.js', 'text/javascript; charset=utf-8']],
  ['/audio.js', ['audio.js', 'text/javascript; charset=utf-8']],
  ['/art.js', ['art.js', 'text/javascript; charset=utf-8']],
  ['/mobile-state.js', ['mobile-state.js', 'text/javascript; charset=utf-8']],
  ['/assets/carefree.mp3', ['assets/carefree.mp3', 'audio/mpeg']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']]
]);
const assetNames = ['cottage', 'flowers', 'ground', 'crate', 'portal', 'friend-0', 'friend-1', 'art-preview'];
for (let theme = 0; theme < 3; theme += 1) assetNames.push(`sky-${theme}`, `hills-${theme}`, `tree-${theme}`);
for (const name of assetNames) publicFiles.set(`/assets/${name}.png`, [`assets/${name}.png`, 'image/png']);

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  if (pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }
  const resource = publicFiles.get(pathname);
  if (!resource) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  fs.readFile(path.join(__dirname, resource[0]), (error, content) => {
    if (error) {
      response.writeHead(500);
      response.end('Unable to load resource');
      return;
    }
    response.writeHead(200, {
      'Content-Type': resource[1],
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Set PORT to another value and retry.`
    : error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Sprout Adventure is ready at http://127.0.0.1:${port}`);
  console.log('Press Ctrl+C to stop the server.');
});
