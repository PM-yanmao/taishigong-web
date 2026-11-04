/* 会话滚动记忆 + 教师课后抽查日志。
 * history 不逐轮重发，只保留 300 字摘要，避免 token 随进度线性增长。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(ROOT, 'logs');
const sessions = new Map();

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function append(file, obj) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, file), JSON.stringify(obj) + '\n', 'utf8');
  } catch (e) { /* 日志失败不影响演示 */ }
}

export function getSession(id) {
  const key = String(id || 'default').slice(0, 64);
  if (!sessions.has(key)) sessions.set(key, { summary: '', recentTexts: [], usedImagery: [], turns: 0 });
  return sessions.get(key);
}

export function record(id, payload, data, meta) {
  const s = getSession(id);
  s.turns += 1;
  s.recentTexts.push(String(data.text || '').slice(0, 260));
  if (s.recentTexts.length > 2) s.recentTexts.shift();
  if (data.imagery) s.usedImagery.push(data.imagery);
  if (s.usedImagery.length > 6) s.usedImagery.shift();

  const gist = `第${s.turns}次自书于${payload.era || ''}：${String(payload.text || '').slice(0, 24)}；归为${payload.intentLabel || payload.intent || ''}。`;
  s.summary = (s.summary + gist).slice(-300);

  append(`generate-${stamp()}.jsonl`, {
    at: new Date().toISOString(),
    session: id,
    nodeId: payload.nodeId,
    intent: payload.intent,
    playerText: payload.text,
    nextOptionId: data.nextOptionId,
    source: meta.source,
    violations: meta.violations || [],
    examNote: data.examNote,
    textLen: String(data.text || '').length,
    text: data.text,
  });
  return s;
}

export function logFallback(id, payload, reason) {
  append(`fallback-${stamp()}.jsonl`, {
    at: new Date().toISOString(), session: id, nodeId: payload.nodeId,
    playerText: payload.text, reason,
  });
}
