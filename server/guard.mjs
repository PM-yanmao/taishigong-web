/* 服务端权威校验：复用前端同一份规则，杜绝两份规则漂移。 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const A = require('../js/data/anchors.js');
globalThis.TSG_ANCHORS = A;
const OVERREACH = require('../js/data/overreach.js');
globalThis.TSG_OVERREACH = OVERREACH;
require('../js/guard.js');
const G = globalThis.TSG_Guard;

export const ANCHORS = A;
export { OVERREACH };

/** 服务端额外检查：citation 必须来自白名单；场景级禁止项 */
export function checkEnvelope(data, payload) {
  const v = [];
  const envelope = G.validateEnvelope(data);
  if (!envelope.ok) v.push(...envelope.violations);
  if (!data || typeof data !== 'object') return v;

  /* 模型判为做不到时会把 nextOptionId 置空；由服务端 finalize 统一裁决，不算违规 */
  const notFeasible = data && (data.feasible === false || data.feasible === 'false');
  if (!notFeasible && data.nextOptionId !== payload.nextOptionId) {
    v.push('模型擅自改动了 nextOptionId');
  }
  const out = G.checkOutput(data.text || '', payload);
  if (!out.ok) v.push(...out.violations);

  const facts = A.nodeFacts[payload.nodeId];
  if (facts) {
    const banned = {
      L1: [/李陵[^。]{0,6}(归|未降|没有降)/, /武帝[^。]{0,6}(收回|赦)/],
      L3: [/(赎金|援手|救兵)[^。]{0,6}(到|来|出现)/, /无需代价/],
    }[payload.nodeId] || [];
    banned.forEach(re => { if (re.test(data.text || '')) v.push('触及本场景禁止项'); });
  }
  return [...new Set(v)];
}

export function checkInput(text) {
  return G.checkInput(text, {});
}

/* 模型常把史料原句改写半句或换标点；按连续片段判定是否可考，
 * 再把 citation 规范化成白名单原句——考据折页永远显示能查到的句子。 */
export function citeMatches(candidate, texts) {
  const clean = s => String(s || '').replace(/[，。；：、！？\s「」『』《》"']/g, '');
  const c = clean(candidate);
  return texts.some(t => {
    const w = clean(t);
    const n = Math.min(8, c.length, w.length);
    if (n < 4) return false;
    for (let i = 0; i + n <= c.length; i++) if (w.indexOf(c.slice(i, i + n)) >= 0) return true;
    for (let i = 0; i + n <= w.length; i++) if (c.indexOf(w.slice(i, i + n)) >= 0) return true;
    return false;
  });
}

export function normalizeCitations(data) {
  const white = A.quotations;
  const seen = new Set(), out = [];
  (Array.isArray(data.citation) ? data.citation : []).forEach(c => {
    const src = String((c && c.source) || '').trim();
    const hit = white.find(q => q.source === src && citeMatches(c && c.text, [q.text]))
      || white.find(q => citeMatches(c && c.text, [q.text]))
      || white.find(q => q.source === src);
    const pick = hit || white[0];
    const key = pick.source + '|' + pick.text;
    if (!seen.has(key)) { seen.add(key); out.push({ source: pick.source, text: pick.text }); }
  });
  if (!out.length) out.push({ source: white[0].source, text: white[0].text });
  data.citation = out.slice(0, 3);
  return data;
}
