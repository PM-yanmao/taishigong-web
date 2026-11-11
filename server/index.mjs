/* 《太史公》本地演示接口 · 零依赖（Node 18+，仅用内置模块）
 * 同时托管静态站点与 /api，课堂演示直接访问 http://localhost:8787 即同源。
 * API Key 只存在服务端 .env，浏览器永远拿不到。
 * 启动：node server/index.mjs  （或双击 start.bat） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHORS, OVERREACH, FREEWRITE, MAX_CHARS, checkEnvelope, checkInput, normalizeCitations } from './guard.mjs';
import { buildSystem, buildUser, buildRetryNote } from './prompt.mjs';
import { getSession, record, logFallback } from './session.mjs';
import { sceneMeta, optionIds } from './scenes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/* ---------- .env（不进 git） ---------- */
function loadEnv() {
  const env = {};
  try {
    fs.readFileSync(path.join(HERE, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* 未配置 .env 时走离线包模式 */ }
  return env;
}
const fileEnv = loadEnv();
/* .env 里的值也放进 process.env，便于各模块（日志开关等）统一读取 */
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const CFG = {
  port: Math.min(65535, Math.floor(num(process.env.PORT || fileEnv.PORT, 8787))),
  host: process.env.TSG_HOST || fileEnv.TSG_HOST || '127.0.0.1',
  apiUrl: process.env.TSG_API_URL || fileEnv.TSG_API_URL || 'https://api.deepseek.com/chat/completions',
  apiKey: String(process.env.TSG_API_KEY ?? fileEnv.TSG_API_KEY ?? '').trim(),
  model: process.env.TSG_MODEL || fileEnv.TSG_MODEL || 'deepseek-flash',
  maxRetry: 1,
  /* 默认空 = 只服务同源页面；需要 GitHub Pages 跨域调用时显式列出来源（逗号分隔） */
  allowOrigin: String(process.env.TSG_ALLOW_ORIGIN ?? fileEnv.TSG_ALLOW_ORIGIN ?? '').trim(),
  /* 可选课堂口令：非空时 /api/generate* 必须带 X-TSG-Token */
  token: String(process.env.TSG_TOKEN || fileEnv.TSG_TOKEN || '').trim(),
  /* 每个 IP 每分钟最多生成次数（0 = 不限） */
  rateLimit: Math.floor(num(process.env.TSG_RATE_LIMIT, 30)),
  maxBody: 65536,
  logsOff: /^(0|off|false|no)$/i.test(String(process.env.TSG_LOG || fileEnv.TSG_LOG || '')),
  version: FREEWRITE.version || '1.2.0',
};

const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1';

/* 服务端权威接受的自书节点与本节点可选边：由 js/data/freewrite.js + 剧本数据推导，
 * 不再手写白名单，避免三份数据漂移。 */
const FREE_NODES = Object.freeze(Object.fromEntries(
  (FREEWRITE.openNodes || []).map((id) => [id, optionIds(id)])
));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

function cors(req, res) {
  const list = String(CFG.allowOrigin || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req && req.headers && req.headers.origin;
  if (!list.length || !origin) return;          // 默认只服务同源：不发放 CORS 头
  const allow = list.includes('*') ? '*' : (list.includes(origin) ? origin : '');
  if (!allow) return;
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TSG-Token');
  res.setHeader('Access-Control-Max-Age', '600');
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}
function json(req, res, code, obj) {
  cors(req, res);
  securityHeaders(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function forbid(req, res) {
  securityHeaders(res);
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('forbidden');
}
function notFound(req, res) {
  securityHeaders(res);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}
function readBody(req, max = CFG.maxBody) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) {
        const err = new Error('body too large');
        err.code = 'E_BODY_TOO_LARGE';
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    /* 用 Buffer 收集再整体解码，避免多字节 UTF-8 跨 chunk 被截成乱码 */
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/* ---------- 自书接口的入参白名单（防止拿本机 Key 当通用 LLM 用） ---------- */
function checkPayload(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'bad_body';
  const opts = FREE_NODES[p.nodeId];
  if (!opts || !sceneMeta(p.nodeId)) return 'bad_node';
  if (!opts.includes(String(p.nextOptionId || ''))) return 'bad_option';
  if (typeof p.text !== 'string' || !p.text.trim()) return 'bad_text';
  if (p.text.length > MAX_CHARS) return 'text_too_long';
  return null;
}
function authorized(req) {
  if (!CFG.token) return true;
  return String(req.headers['x-tsg-token'] || '') === CFG.token;
}

/* ---------- 极简限流：每个 IP 每分钟最多 N 次生成 ---------- */
const rateBuckets = new Map();
function rateLimited(ip) {
  if (!CFG.rateLimit) return false;
  const now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b || now > b.reset) { b = { count: 0, reset: now + 60000 }; rateBuckets.set(ip, b); }
  b.count += 1;
  if (rateBuckets.size > 5000) rateBuckets.clear();
  return b.count > CFG.rateLimit;
}

/* ---------- 静态文件（黑名单 + 路径边界双重校验） ---------- */
const REAL_ROOT = fs.realpathSync(ROOT);
const WITHIN = (base, target) => {
  const rel = path.relative(base, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return badRequest(req, res); }
  if (rel === '/' || rel === '') rel = '/index.html';
  /* 反斜杠与 NUL 一律拒绝：Windows 上 path.resolve 会把 \ 当分隔符，绕过下面的 / 分隔黑名单 */
  if (rel.includes('\0') || rel.includes('\\')) return forbid(req, res);
  const segments = rel.split('/').filter(Boolean);
  /* 服务端源码、日志、.env 与任何点开头的路径一律不对外 */
  if (segments.some((s) => s.startsWith('.'))) return forbid(req, res);
  if (segments[0] === 'server' || segments[0] === 'logs') return forbid(req, res);
  const target = path.resolve(ROOT, '.' + rel);
  if (!WITHIN(ROOT, target)) return forbid(req, res);
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) return notFound(req, res);
    /* 再验一次真实路径，防止软链接把仓库外的文件带进来 */
    fs.realpath(target, (e2, real) => {
      if (e2 || !WITHIN(REAL_ROOT, real)) return forbid(req, res);
      const ext = path.extname(real).toLowerCase();
      const isAsset = segments[0] === 'assets';
      securityHeaders(res);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
      });
      fs.createReadStream(real).pipe(res);
    });
  });
}
function badRequest(req, res) {
  securityHeaders(res);
  res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('bad request');
}

/* ---------- 模型调用（单次为常态，最多重试一次） ---------- */
function parseContent(s) {
  let t = String(s || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}
async function callModel(messages) {
  const r = await fetch(CFG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CFG.apiKey },
    body: JSON.stringify({
      model: CFG.model, messages,
      response_format: { type: 'json_object' },
      temperature: 0.85, max_tokens: 1400, stream: false,
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!r.ok) throw new Error('provider HTTP ' + r.status);
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content || '';
  if (!content.trim()) throw new Error('provider returned empty content');
  return parseContent(content);
}

/* ---------- 提示词准备：流式 / 非流式共用，避免两份规则漂移 ---------- */
function preparePrompt(p) {
  const session = getSession(p.sessionId);
  const meta = sceneMeta(p.nodeId) || {};
  /* 场景原文、标题、年代一律取服务端剧本数据；客户端传来的同名字段不采用 */
  const facts = ANCHORS.nodeFacts[p.nodeId] || null;
  const system = buildSystem(ANCHORS, facts);
  /* 前情与已用意象仍由客户端带（跨刷新续写用），但只收短文本，降低注入面 */
  const clip = (arr, n, max) => (Array.isArray(arr) ? arr : [])
    .slice(-n).map((s) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').slice(0, max)).filter(Boolean);
  const recent = clip(p.recentTexts, 2, 260);
  const imagery = clip(p.usedImagery, 6, 8);
  const baseUser = buildUser({
    ...p,
    nodeTitle: meta.title || '',
    era: meta.era || '',
    sceneText: meta.text || '',
    recentTexts: recent.length ? recent : session.recentTexts,
    usedImagery: imagery.length ? imagery : session.usedImagery,
  }, session);
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: baseUser }] };
}
function finalize(data, p) {
  data.source = 'server';
  /* 模型自己判为做不到：这一页只是念头被现实压回，不推进剧情、不给下一节点 */
  const notFeasible = data.feasible === false || data.feasible === 'false';
  data.feasible = !notFeasible;
  if (notFeasible) {
    data.overreach = String(data.overreach || '此非其时所能为').slice(0, 24);
    data.nextOptionId = '';
  }
  normalizeCitations(data);
  record(p.sessionId, p, data, { source: 'server' });
  return data;
}

/* ---------- SSE 流式 ----------
 * 模型仍输出 JSON（prompt / schema / 校验一律不动），
 * 服务端从残缺 JSON 里增量提取 text 字段的当前值，边收边推给前端。 */
function extractTextField(raw) {
  const m = raw.match(/"text"\s*:\s*"/);
  if (!m) return '';
  let i = m.index + m[0].length, out = '';
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') return out;                 // 字段已闭合
    if (ch === '\\') {
      const n = raw[i + 1];
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '';
      else if (n === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 4; }
        else out += n;
      } else if (n === undefined) return out;
      else out += n;
      i += 2; continue;
    }
    out += ch; i++;
  }
  return out;                                  // 未闭合：返回当前已收到的部分
}

async function streamModel(messages, onRaw) {
  const r = await fetch(CFG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CFG.apiKey },
    body: JSON.stringify({
      model: CFG.model, messages,
      response_format: { type: 'json_object' },
      temperature: 0.85, max_tokens: 1400, stream: true,
    }),
    signal: AbortSignal.timeout(22000),
  });
  if (!r.ok) throw new Error('provider HTTP ' + r.status);
  if (!r.body) throw new Error('provider returned no stream');
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim();
        if (!d || d === '[DONE]') continue;
        try {
          const c = JSON.parse(d).choices?.[0]?.delta?.content || '';
          if (c) { raw += c; onRaw(raw); }
        } catch (e) { /* 单个上游帧异常，继续 */ }
      }
    }
  }
  return raw;
}

function sseHead(req, res) {
  cors(req, res);
  securityHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}
function sseSend(res, event, data) {
  try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
}

/* 单次取稿：首轮流式；重写轮改非流式（只需结果，避免二次流的不确定性）。
 * 流式 JSON 残缺但正文已收完整时，直接从增量提取结果重建 envelope。 */
async function obtain(messages, useStream, push, p) {
  if (!useStream) return callModel(messages);
  let lastRaw = '';
  try {
    const raw = await streamModel(messages, r => { lastRaw = r; push(r, false); });
    push(raw, true);
    if (!raw.trim()) throw new Error('empty stream');
    return parseContent(raw);
  } catch (e) {
    const t = extractTextField(lastRaw);
    if (t && t.length >= 120) {
      return {
        text: t, nextOptionId: p.nextOptionId, citation: [], examNote: '',
        selfCheck: { pass: true, by: 'recovered' },
      };
    }
    return callModel(messages);
  }
}

/* ---------- /api/generate（非流式，保留兼容与兜底） ---------- */
async function handleGenerate(req, res) {
  let p;
  try { p = await readBody(req); }
  catch (e) {
    return json(req, res, e.code === 'E_BODY_TOO_LARGE' ? 413 : 400, { ok: false, error: 'bad_request' });
  }
  const bad = checkPayload(p);
  if (bad) return json(req, res, 400, { ok: false, error: 'bad_request', detail: bad });
  const input = checkInput(p.text);
  if (!input.ok) return json(req, res, 400, { ok: false, error: 'input_rejected', reason: input.reason });
  if (!CFG.apiKey) {
    logFallback(p.sessionId, p, 'no_key');
    return json(req, res, 200, { ok: false, error: 'no_key' });
  }

  let last = null, violations = [];
  const messages = preparePrompt(p).messages;
  for (let attempt = 0; attempt <= CFG.maxRetry; attempt++) {
    try {
      last = await callModel(messages);
      violations = checkEnvelope(last, p);
      if (!violations.length) break;
      if (attempt < CFG.maxRetry) messages.push(
        { role: 'assistant', content: JSON.stringify(last) },
        { role: 'user', content: buildRetryNote(violations) }
      );
    } catch (e) {
      logFallback(p.sessionId, p, 'provider_error: ' + e.message);
      return json(req, res, 200, { ok: false, error: 'provider_error', detail: String(e.message).slice(0, 160) });
    }
  }
  if (!last || violations.length) {
    logFallback(p.sessionId, p, 'guard_failed: ' + violations.join('|'));
    return json(req, res, 200, { ok: false, error: 'guard_failed', violations });
  }
  return json(req, res, 200, { ok: true, data: finalize(last, p) });
}

/* ---------- /api/generate-stream（SSE，课堂演示主链路） ---------- */
async function handleGenerateStream(req, res) {
  let p;
  try { p = await readBody(req); }
  catch (e) {
    return json(req, res, e.code === 'E_BODY_TOO_LARGE' ? 413 : 400, { ok: false, error: 'bad_request' });
  }
  const bad = checkPayload(p);
  if (bad) return json(req, res, 400, { ok: false, error: 'bad_request', detail: bad });
  sseHead(req, res);
  const keep = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch (e) {} }, 3000);
  const stop = () => { clearInterval(keep); try { res.end(); } catch (e) {} };
  try {
    const input = checkInput(p.text);
    if (!input.ok) { sseSend(res, 'fallback', { error: 'input_rejected', reason: input.reason }); return stop(); }
    if (!CFG.apiKey) {
      logFallback(p.sessionId, p, 'no_key');
      sseSend(res, 'fallback', { error: 'no_key' }); return stop();
    }

    const messages = preparePrompt(p).messages;
    let lastPushed = '', pushAt = 0;
    const push = (raw, force) => {
      const t = extractTextField(raw);
      if (!t || t === lastPushed) return;
      const now = Date.now();
      if (!force && t.length - lastPushed.length < 6 && now - pushAt < 90) return;
      lastPushed = t; pushAt = now;
      sseSend(res, 'delta', { text: t });
    };

    let last = null, violations = [];
    for (let attempt = 0; attempt <= CFG.maxRetry; attempt++) {
      lastPushed = '';
      if (attempt > 0) sseSend(res, 'retry', { violations });
      let roundData;
      try {
        roundData = await obtain(messages, attempt === 0, push, p);
      } catch (e) {
        logFallback(p.sessionId, p, 'provider_error: ' + e.message);
        sseSend(res, 'fallback', { error: 'provider_error', detail: String(e.message).slice(0, 160) });
        return stop();
      }
      if (attempt > 0 && roundData && roundData.text) sseSend(res, 'delta', { text: roundData.text });
      last = roundData;
      violations = checkEnvelope(last, p);
      if (!violations.length) break;
      if (attempt < CFG.maxRetry) messages.push(
        { role: 'assistant', content: JSON.stringify(last) },
        { role: 'user', content: buildRetryNote(violations) }
      );
    }

    if (!last || violations.length) {
      logFallback(p.sessionId, p, 'guard_failed: ' + violations.join('|'));
      sseSend(res, 'fallback', { error: 'guard_failed', violations });
      return stop();
    }
    sseSend(res, 'done', { data: finalize(last, p) });
    stop();
  } catch (e) {
    sseSend(res, 'fallback', { error: 'server_error', detail: String(e.message).slice(0, 160) });
    stop();
  }
}

/* ---------- 路由 ---------- */
async function route(req, res) {
  const u = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'OPTIONS') { cors(req, res); res.writeHead(204); return res.end(); }
  if (u.pathname === '/api/health') {
    return json(req, res, 200, {
      ok: true, model: CFG.model, hasKey: !!CFG.apiKey, hasToken: !!CFG.token,
      anchors: ANCHORS.version, nodeVersion: CFG.version,
      freeNodes: FREEWRITE.openNodes || [], freeLimit: FREEWRITE.perRun || 5, maxChars: MAX_CHARS,
    });
  }
  if (u.pathname === '/api/generate-stream' && req.method === 'POST') {
    if (!authorized(req)) return json(req, res, 401, { ok: false, error: 'unauthorized' });
    if (rateLimited(req.socket.remoteAddress || 'unknown')) {
      return json(req, res, 429, { ok: false, error: 'rate_limited' });
    }
    return handleGenerateStream(req, res);
  }
  if (u.pathname === '/api/generate' && req.method === 'POST') {
    if (!authorized(req)) return json(req, res, 401, { ok: false, error: 'unauthorized' });
    if (rateLimited(req.socket.remoteAddress || 'unknown')) {
      return json(req, res, 429, { ok: false, error: 'rate_limited' });
    }
    return handleGenerate(req, res);
  }
  if (u.pathname.startsWith('/api/')) return json(req, res, 404, { ok: false, error: 'not_found' });
  return serveStatic(req, res, u.pathname);
}

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(() => route(req, res))
    .catch((e) => {
      console.error('[server_error]', e && (e.stack || e.message));
      if (!res.headersSent) json(req, res, 500, { ok: false, error: 'server_error' });
      else { try { res.end(); } catch (_) {} }
    });
});

/* 最后防线：任何未捕获的异步异常都不该结束课堂演示 */
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e && (e.stack || e.message || e));
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('');
    console.error('  端口 ' + CFG.port + ' 已被占用。可能已有一个服务在运行；');
    console.error('  关掉旧进程，或在 server/.env 里改 PORT 后重试。');
    console.error('');
    process.exit(1);
  }
  throw e;
});

server.listen(CFG.port, CFG.host, () => {
  console.log('');
  console.log('  太史公 · 本地演示服务已启动');
  console.log('  打开  http://localhost:' + CFG.port + '   监听 ' + CFG.host);
  console.log('  接口  ' + (CFG.apiKey ? '已配置 Key（在线生成）' : '未配置 Key（自动走离线剧本包）'));
  console.log('  模型  ' + CFG.model + '   锚点库 v' + ANCHORS.version + '   服务 v' + CFG.version);
  console.log('  自书  ' + (FREEWRITE.openNodes || []).join('/') + '（每局 ' + (FREEWRITE.perRun || 5) + ' 笔，一行 ≤ ' + MAX_CHARS + ' 字）');
  console.log('  口令  ' + (CFG.token ? '已启用（X-TSG-Token）' : '未启用（仅建议本机演示）'));
  console.log('  日志  ' + (CFG.logsOff ? '已关闭（TSG_LOG=off）' : 'logs/*.jsonl（教师课后抽查）'));
  if (!isLoopback(CFG.host)) {
    console.log('');
    console.log('  ⚠ 正在监听非本机地址：同一局域网内任何人都能访问本服务。');
    console.log('    建议设置 TSG_TOKEN 并在页面「设置」里填写口令；下课后立即 Ctrl+C。');
  }
  if (CFG.allowOrigin === '*') {
    console.log('  ⚠ TSG_ALLOW_ORIGIN=*：任何网站都能跨域调用本接口（会消耗你的 Key）。');
  }
  console.log('');
});
