#!/usr/bin/env node

/**
 * Local preview server with automatic content rebuilds.
 * Run `npm run dev`; newly added Markdown or image files are picked up and
 * data/blog-content.json is regenerated. Refresh the browser to see changes.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent } from './build-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8000);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function rebuild(label) {
  try {
    buildContent();
    if (label) console.log('[dev] ' + label + '，内容已重新生成，刷新浏览器查看。');
  } catch (error) {
    console.error('[dev] 内容构建失败：' + error.message);
  }
}

rebuild('启动');

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch (error) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[dev] http://127.0.0.1:' + PORT);
  console.log('[dev] 监听 data/ 下的 Markdown 与图片变化');
});

let timer = 0;
fs.watch(DATA_DIR, { recursive: true }, (event, filename) => {
  if (!filename) return;
  if (filename.split(path.sep).join('/') === 'blog-content.json') return;
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(filename), 160);
});

process.on('SIGINT', () => {
  console.log('\n[dev] 已停止');
  process.exit(0);
});
