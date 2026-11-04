/* 《太史公》本地演示接口 · 零依赖（Node 18+，仅用内置模块）
 * 同时托管静态站点与 /api，课堂演示直接访问 http://localhost:8787 即同源。
 * API Key 只存在服务端 .env，浏览器永远拿不到。
 * 启动：node server/index.mjs  （或双击 start.bat） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHORS, OVERREACH, checkEnvelope, checkInput, normalizeCitations } from './guard.mjs';
import { buildSystem, buildUser, buildRetryNote } from './prompt.mjs';
import { getSession, record, logFallback } from './session.mjs';

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
const CFG = {
  port: Number(process.env.PORT || fileEnv.PORT || 8787),
  host: process.env.TSG_HOST || fileEnv.TSG_HOST || '127.0.0.1',
  apiUrl: process.env.TSG_API_URL || fileEnv.TSG_API_URL || 'https://api.deepseek.com/chat/completions',
  apiKey: process.env.TSG_API_KEY || fileEnv.TSG_API_KEY || '',
  model: process.env.TSG_MODEL || fileEnv.TSG_MODEL || 'deepseek-flash',
  maxRetry: 1,
  allowOrigin: process.env.TSG_ALLOW_ORIGIN || fileEnv.TSG_ALLOW_ORIGIN || '*',
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', CFG.allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => {
      buf += c;
      if (buf.length > 65536) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  /* 服务端源码、日志与 .env 一律不对外 */
  if (/^\/(server|logs)\//i.test(rel) || /\.env/i.test(rel) || /(^|\/)\./.test(rel)) {
    res.writeHead(403); return res.end('forbidden');
  }
  const target = path.resolve(ROOT, '.' + rel);
  if (!target.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(target).pipe(res);
  });
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
  const facts = ANCHORS.nodeFacts[p.nodeId] || null;
  /* 可行性判定交给模型；前端传来的 hint 只作为参考提示写进 user 消息 */
  const system = buildSystem(ANCHORS, facts);
  const baseUser = buildUser({
    ...p,
    recentTexts: p.recentTexts && p.recentTexts.length ? p.recentTexts : session.recentTexts,
    usedImagery: p.usedImagery && p.usedImagery.length ? p.usedImagery : session.usedImagery,
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

function sseHead(res) {
  cors(res);
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
  const p = await readBody(req);
  const input = checkInput(p.text);
  if (!input.ok) return json(res, 400, { ok: false, error: 'input_rejected', reason: input.reason });
  if (!CFG.apiKey) {
    logFallback(p.sessionId, p, 'no_key');
    return json(res, 200, { ok: false, error: 'no_key' });
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
      return json(res, 200, { ok: false, error: 'provider_error', detail: String(e.message).slice(0, 160) });
    }
  }
  if (!last || violations.length) {
    logFallback(p.sessionId, p, 'guard_failed: ' + violations.join('|'));
    return json(res, 200, { ok: false, error: 'guard_failed', violations });
  }
  return json(res, 200, { ok: true, data: finalize(last, p) });
}

/* ---------- /api/generate-stream（SSE，课堂演示主链路） ---------- */
async function handleGenerateStream(req, res) {
  const p = await readBody(req);
  sseHead(res);
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
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (u.pathname === '/api/health') {
    return json(res, 200, { ok: true, model: CFG.model, hasKey: !!CFG.apiKey, anchors: ANCHORS.version, nodeVersion: '1.0.0' });
  }
  if (u.pathname === '/api/generate-stream' && req.method === 'POST') {
    try { return await handleGenerateStream(req, res); }
    catch (e) {
      if (!res.headersSent) return json(res, 200, { ok: false, error: 'bad_request', detail: String(e.message).slice(0, 160) });
      sseSend(res, 'fallback', { error: 'server_error', detail: String(e.message).slice(0, 160) });
      return res.end();
    }
  }
  if (u.pathname === '/api/generate' && req.method === 'POST') {
    try { return await handleGenerate(req, res); }
    catch (e) { return json(res, 200, { ok: false, error: 'bad_request', detail: String(e.message).slice(0, 160) }); }
  }
  if (u.pathname.startsWith('/api/')) return json(res, 404, { ok: false, error: 'not_found' });
  return serveStatic(req, res, u.pathname);
});

server.listen(CFG.port, CFG.host, () => {
  console.log('');
  console.log('  太史公 · 本地演示服务已启动');
  console.log('  打开  http://localhost:' + CFG.port + '   监听 ' + CFG.host);
  console.log('  接口  ' + (CFG.apiKey ? '已配置 Key（在线生成）' : '未配置 Key（自动走离线剧本包）'));
  console.log('  模型  ' + CFG.model + '   锚点库 v' + ANCHORS.version);
  console.log('  日志  logs/generate-*.jsonl（教师课后抽查）');
  console.log('');
});
