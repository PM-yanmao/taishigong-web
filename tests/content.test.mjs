/* 文案规范测试（作者定的六条）：
 *  - 每页 150–260 字；选项文案 8–18 字
 *  - 第二人称「你」；叙述层不用感叹号/问号（直接引语里的史料标点不算）
 *  - 不出现 anchors.lexicon.deny 里的时代错置词
 *  - 结局文案里的"几个字"计数与引文一致（至少不出现已修正的旧错值）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserGlobals, toHost } from './helpers/load-browser-globals.mjs';

const boot = loadBrowserGlobals();
const { data, anchors } = boot;
const SCENES = data.SCENES;

const trimmed = (s) => String(s == null ? '' : s).trim();

test('页长：22 个节点正文都在 150–260 字', () => {
  for (const [id, node] of Object.entries(SCENES)) {
    const len = trimmed(node.text).length;
    assert.ok(len >= 150 && len <= 260, `${id} 正文 ${len} 字，超出 150–260`);
  }
});

test('选项文案：8–18 字，且不用问句', () => {
  for (const [id, node] of Object.entries(SCENES)) {
    for (const o of node.options || []) {
      const t = trimmed(o.text);
      assert.ok(t.length >= 8 && t.length <= 18, `${id}/${o.id} 文案 ${t.length} 字：「${t}」`);
      assert.equal(/[?？]$/.test(t), false, `${id}/${o.id} 选项文案不得是问句`);
    }
  }
});

test('叙述层：不用感叹号/问号（史料直接引语的标点除外）', () => {
  const stripQuotes = (t) => t
    .replace(/"[^"]*"/g, '""')
    .replace(/「[^」]*」/g, '「」')
    .replace(/\"[^\"]*\"/g, '""');
  for (const [id, node] of Object.entries(SCENES)) {
    const narrative = stripQuotes(trimmed(node.text));
    assert.equal(/[!?！？]/.test(narrative), false, `${id} 叙述层出现感叹号或问句`);
  }
});

test('时代词表：剧本不出现现代器物/概念', () => {
  const deny = [...(anchors.lexicon.deny || [])];
  for (const [id, node] of Object.entries(SCENES)) {
    for (const w of deny) assert.equal(trimmed(node.text).includes(w), false, `${id} 出现禁用词「${w}」`);
  }
});

test('结局文案：「几个字」的计数与引文一致', () => {
  const json = JSON.stringify(data.ENDING_TEXTS);
  assert.equal(json.includes('十四个字'), false, '结局文案仍含旧错误计数「十四个字」');

  const len = (s) => [...s.replace(/[，。；：、！？「」『』《》"'（）()]/g, '')].length;
  const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const cases = [
    ['因为诬上，卒从吏议', 8],   // 结局 3：史书记载「因为诬上，卒从吏议」
    ['太史令司马迁', 6],         // 结局 4：后世修史只留六个字
    ['徙其家属于边', 6],         // 结局 8：诏书六个字
    ['瘐死狱中', 4],             // 结局 13：判词后添四个字
  ];
  for (const [quote, n] of cases) {
    assert.equal(json.includes(quote), true, `结局文案缺少引文「${quote}」`);
    assert.equal(json.includes(`${CN[n - 1]}个字`), true, `结局文案缺少计数「${CN[n - 1]}个字」（${quote}）`);
    assert.equal(len(quote), n, `引文「${quote}」实际 ${len(quote)} 字，与文案计数不符`);
  }
});

test('锚点库：引文白名单非空、版本号合法', () => {
  assert.ok(anchors.quotations.length >= 10);
  for (const q of anchors.quotations) {
    assert.ok(q.source && q.text, '引文缺少出处或原文');
    assert.ok(trimmed(q.text).length >= 4);
  }
  assert.match(anchors.version, /^\d+\.\d+\.\d+$/);
});
