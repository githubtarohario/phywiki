// 高校物理Wiki サーバー（外部依存なし / Node.js 18+）
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');
const CURRICULUM_FILE = path.join(DATA_DIR, 'curriculum.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

const STATUSES = ['todo', 'draft', 'done'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

// 一時ファイルに書いてから置き換え、書き込み途中で壊れないようにする
async function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, file);
}

// カリキュラム内の全トピックを id -> {topic, field, subject} で引けるようにする
async function loadTopicIndex() {
  const curriculum = await readJson(CURRICULUM_FILE, { subjects: [] });
  const index = new Map();
  for (const subject of curriculum.subjects) {
    for (const field of subject.fields) {
      for (const topic of field.topics) {
        index.set(topic.id, { topic, field, subject });
      }
    }
  }
  return { curriculum, index };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('本文が大きすぎます'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleApi(req, res, url) {
  // GET /api/curriculum : カリキュラム＋進捗
  if (url.pathname === '/api/curriculum' && req.method === 'GET') {
    const { curriculum } = await loadTopicIndex();
    const progress = await readJson(PROGRESS_FILE, {});
    return sendJson(res, 200, { ...curriculum, progress });
  }

  const m = url.pathname.match(/^\/api\/pages\/([a-z0-9-]+)$/);
  if (m) {
    const id = m[1];
    const { index } = await loadTopicIndex();
    // カリキュラムにある id だけ許可（任意パスへの書き込みを防ぐ）
    const entry = index.get(id);
    if (!entry) return sendJson(res, 404, { error: 'トピックが見つかりません' });
    const pageFile = path.join(PAGES_DIR, `${id}.md`);

    if (req.method === 'GET') {
      let content = '';
      try {
        content = await fs.readFile(pageFile, 'utf8');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      const progress = await readJson(PROGRESS_FILE, {});
      return sendJson(res, 200, {
        id,
        title: entry.topic.title,
        field: { id: entry.field.id, title: entry.field.title },
        subject: { id: entry.subject.id, title: entry.subject.title },
        content,
        status: progress[id]?.status || 'todo',
        updatedAt: progress[id]?.updatedAt || null,
      });
    }

    if (req.method === 'PUT') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (err) {
        if (err.status) throw err;
        return sendJson(res, 400, { error: 'JSONが不正です' });
      }
      if (typeof body.content !== 'string') return sendJson(res, 400, { error: 'content が必要です' });
      if (!STATUSES.includes(body.status)) return sendJson(res, 400, { error: 'status が不正です' });

      await fs.mkdir(PAGES_DIR, { recursive: true });
      await writeFileAtomic(pageFile, body.content);
      const progress = await readJson(PROGRESS_FILE, {});
      const updatedAt = new Date().toISOString();
      progress[id] = { status: body.status, updatedAt };
      await writeFileAtomic(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n');
      return sendJson(res, 200, { ok: true, updatedAt });
    }

    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  return sendJson(res, 404, { error: 'Not Found' });
}

async function serveStatic(res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message || 'サーバーエラー' });
  }
});

server.listen(PORT, () => {
  console.log(`高校物理Wiki: http://localhost:${PORT}`);
});
