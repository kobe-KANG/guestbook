// 로컬 개발 서버: 코드 위에 데이터 저장소(content/에 clone)를 덮어서 보여 준다 — 배포(deploy.yml)와 같은 규칙.
//   git clone <데이터 저장소> content
//   API_URL=https://<프로젝트>.vercel.app node scripts/serve.mjs   → http://localhost:8765
// content/가 없으면 코드 저장소의 기본값(js/map-data.js 등)만으로 보인다. data/guests.json은 없으면 더미 하객.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT || 8765);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
};
// 데이터 저장소가 덮어쓰는 경로 (deploy.yml Build site와 같게)
const fromData = (path) => /^(img|audio)\//.test(path) || path === 'js/map-data.js' || path.startsWith('data/');

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '').replace(/\\/g, '/') || 'index.html';
  if (path.startsWith('..')) return res.writeHead(400).end();
  if (path === 'js/env.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    return res.end(`const SITE_ENV = ${JSON.stringify({ apiUrl: process.env.API_URL || '' })};`);
  }
  for (const file of fromData(path) ? [join('content', path), path] : [path]) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
      return res.end(body);
    } catch {}
  }
  res.writeHead(404).end('Not found');
}).listen(PORT, () => console.log(`http://localhost:${PORT}  (API: ${process.env.API_URL || '없음 — ?api=<주소>'})`));
