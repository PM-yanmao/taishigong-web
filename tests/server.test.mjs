/* ===== 服务端测试（server/guard.mjs / prompt.mjs / session.mjs） =====
 * 直接 import .mjs，不启动 HTTP 服务器、不联网、不调用真实模型。
 * session.mjs 只测 getSession（纯内存）；不调用 record/logFallback，避免写 logs/。
 *
 * 对齐的当前语义：
 *   - normalizeCitations：模型没给 citation 时保持 []，不再回退 white[0]
 *   - server/index.mjs 的 json() 签名与 token/限流属于 HTTP 层，本文件不启动服务、不测
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHORS,
  OVERREACH,
  checkInput,
  checkEnvelope,
  normalizeCitations,
  citeMatches,
} from '../server/guard.mjs';
import { buildSystem, buildUser, buildRetryNote } from '../server/prompt.mjs';
import { getSession } from '../server/session.mjs';
import { loadBrowserGlobals } from './helpers/load-browser-globals.mjs';

const frontend = loadBrowserGlobals();

/** 通过 checkOutput 的合法正文：130 个「你」，无标点、无禁用词。 */
const VALID_TEXT = '你'.repeat(130);

const PAYLOAD = {
  nodeId: 'L1',
  nextOptionId: 'A',
  text: '我出言为他辩护',
  nodeTitle: '朝议',
  era: '天汉二年十一月',
  sceneText: '李陵降。',
  intent: 'DEFEND',
  intentLabel: '直言辩护',
  stateBands: { jian: '中', ming: '中', cai: '中', quan: '中' },
  usedImagery: [],
};

function validData(extra = {}) {
  return {
    text: VALID_TEXT,
    nextOptionId: 'A',
    citation: [{ source: '《报任安书》', text: '人固有一死，或重于泰山，或轻于鸿毛' }],
    selfCheck: { pass: true },
    ...extra,
  };
}

const toHost = (value) => JSON.parse(JSON.stringify(value));

/* ------------------------------------------------------------ checkInput */

test('checkInput：拒绝过短/过长，边界 4 与 40 字符可接受', () => {
  assert.equal(checkInput('').ok, false);
  assert.match(checkInput('').reason, /字数太短/);
  assert.equal(checkInput('一二三').ok, false);
  assert.match(checkInput('一二三').reason, /字数太短/);
  assert.equal(checkInput('  一二三  ').ok, false, '首尾空白应先 trim 再计长');

  assert.equal(checkInput('一二三四').ok, true);
  assert.equal(checkInput('你'.repeat(40)).ok, true);
  assert.equal(checkInput('你'.repeat(41)).ok, false);
  assert.match(checkInput('你'.repeat(41)).reason, /一行足矣/);

  // 非法输入不外抛异常
  assert.equal(checkInput(null).ok, false);
  assert.equal(checkInput(undefined).ok, false);
  assert.equal(checkInput(123456).ok, true, '数字会先被 String() 转为 6 位字符串，按长度规则放行');
});

test('checkInput：越界只在 hint 里分类，不拦截', () => {
  const military = checkInput('我带兵造反');
  assert.equal(military.ok, true, '越界不是格式错误，不应拒绝');
  assert.equal(military.hint?.id, 'MILITARY');
  assert.ok(military.hint.label, 'hint 应带可读 label');

  const wealth = checkInput('我纳钱赎死');
  assert.equal(wealth.ok, true);
  assert.equal(wealth.hint?.id, 'WEALTH');

  assert.equal(checkInput('你开口说了一句话').hint, null);
});

/* ------------------------------------------------------------ checkEnvelope */

test('checkEnvelope：合法返回体无违规', () => {
  assert.deepEqual(checkEnvelope(validData(), PAYLOAD), []);
});

test('checkEnvelope：拒绝错 nextOptionId（可行时不得改边）', () => {
  const violations = checkEnvelope(validData({ nextOptionId: 'B' }), PAYLOAD);
  assert.ok(violations.includes('模型擅自改动了 nextOptionId'), `实际: ${violations.join(' | ')}`);

  // 判为做不到时服务端会统一置空，此时允许 nextOptionId 与给定值不同
  const notFeasible = checkEnvelope(validData({ feasible: false, nextOptionId: '' }), PAYLOAD);
  assert.equal(notFeasible.some((v) => v.includes('nextOptionId')), false, 'feasible=false 时不应判为改边');
});

test('checkEnvelope：拒绝结构缺失、类型错误与超短/违禁正文', () => {
  const missing = checkEnvelope({ citation: 'not-array' }, PAYLOAD);
  assert.ok(missing.includes('缺少 text'));
  assert.ok(missing.includes('缺少 citation 数组'));
  assert.ok(missing.includes('缺少 selfCheck'));

  const wrongType = checkEnvelope(validData({ nextOptionId: 123 }), PAYLOAD);
  assert.ok(wrongType.includes('nextOptionId 类型错误'));

  const short = checkEnvelope(validData({ text: '你好！' }), PAYLOAD);
  assert.ok(short.includes('正文不足 120 字'));
  assert.ok(short.some((v) => v.includes('感叹号或问句')), '感叹号应被语气校验拦下');

  const noSecondPerson = checkEnvelope(validData({ text: '此事已定。'.repeat(30) }), PAYLOAD);
  assert.ok(noSecondPerson.includes('未使用第二人称「你」'));

  const ooc = checkEnvelope(validData({ text: VALID_TEXT + '你听见武帝向他道歉。' }), PAYLOAD);
  assert.ok(ooc.includes('武帝人设不符'));

  // 场景级禁止项：L1 不得写成李陵归朝
  const sceneBan = checkEnvelope(validData({ text: VALID_TEXT + '李陵归朝了。' }), PAYLOAD);
  assert.ok(sceneBan.includes('触及本场景禁止项'));
});

test('checkEnvelope：自造「」史料被拦，白名单内引用放行', () => {
  const forged = checkEnvelope(validData({ text: VALID_TEXT + '「此乃子虚乌有之史料」' }), PAYLOAD);
  assert.ok(forged.some((v) => v.startsWith('疑似自造史料')), `实际: ${forged.join(' | ')}`);

  const allowed = checkEnvelope(
    validData({ text: VALID_TEXT + '「人固有一死，或重于泰山，或轻于鸿毛」' }),
    PAYLOAD,
  );
  assert.equal(allowed.some((v) => v.startsWith('疑似自造史料')), false, '白名单原句不应被误判');
});

/* ------------------------------------------------------------ 引文规范化 */

test('normalizeCitations：非空输入只返回白名单原句，去重且最多 3 条', () => {
  const data = {
    citation: [
      { source: '《报任安书》', text: '人固有一死，或重于泰山' },
      { source: '《报任安书》', text: '人固有一死，或重于泰山' },
      { source: '我编的出处', text: '子虚乌有之句' },
    ],
  };
  const out = normalizeCitations(data);
  assert.equal(out, data, 'normalizeCitations 原地规范化并返回同一对象');
  assert.ok(Array.isArray(out.citation));
  assert.ok(out.citation.length >= 1 && out.citation.length <= 3);
  assert.equal(new Set(out.citation.map((q) => q.source + '|' + q.text)).size, out.citation.length, '引用需去重');
  for (const q of out.citation) {
    const matched = ANCHORS.quotations.some((white) => white.source === q.source && white.text === q.text);
    assert.ok(matched, `非白名单引用泄漏: ${q.source} / ${q.text}`);
  }
  // 第一条能匹配到原文 → 规范化为白名单整句
  assert.equal(out.citation[0].text, '人固有一死，或重于泰山，或轻于鸿毛');

  // 最多 3 条
  const many = normalizeCitations({
    citation: ANCHORS.quotations.map((q) => ({ source: q.source, text: q.text })),
  });
  assert.equal(many.citation.length, 3);
});

test('normalizeCitations：模型没给 citation 时保持 []，不凭空回退真实出处', () => {
  const empty = normalizeCitations({ citation: [] });
  assert.deepEqual(empty.citation, [], '空 citation 不应回退 white[0]');

  const missing = normalizeCitations({});
  assert.deepEqual(missing.citation, [], '缺 citation 字段应保持空数组');

  const nulled = normalizeCitations({ citation: null });
  assert.deepEqual(nulled.citation, []);

  // 非空但无法匹配的引用：仍必须被规范化成白名单句子，绝不外泄自造出处
  const unknown = normalizeCitations({ citation: [{ source: '乱写的出处', text: '子虚乌有之句' }] });
  assert.equal(unknown.citation.length, 1);
  assert.ok(
    ANCHORS.quotations.some((q) => q.source === unknown.citation[0].source && q.text === unknown.citation[0].text),
    '无法匹配的引用必须回落到白名单，而不是原样返回',
  );
});

test('citeMatches：允许半句/换标点，拒绝无关句子与过短片段', () => {
  const white = [ANCHORS.quotations[1].text]; // 人固有一死，或重于泰山，或轻于鸿毛
  assert.equal(citeMatches('人固有一死', white), true);
  assert.equal(citeMatches('或重于泰山或轻于鸿毛', white), true);
  assert.equal(citeMatches('完全无关的句子啊啊', white), false);
  assert.equal(citeMatches('人固', white), false, '少于 4 个有效字不应判为命中');
  assert.equal(citeMatches('', white), false);
});

/* ------------------------------------------------------------ prompt */

test('buildSystem：包含时间轴/制度/人物/引文/本场景等硬锚点', () => {
  const system = buildSystem(ANCHORS, ANCHORS.nodeFacts.L1);
  assert.equal(typeof system, 'string');
  assert.ok(system.length > 1000, '系统提示词应包含完整锚点块');

  assert.ok(system.includes('【不可改写的硬锚点 · 时间轴】'));
  assert.ok(system.includes(ANCHORS.timeline[0].fact), '应包含时间轴首条史实');
  assert.ok(system.includes('【不可改写的硬锚点 · 制度律令】'));
  assert.ok(system.includes('太史令秩六百石'));
  assert.ok(system.includes('【人物卡 · 状态与禁止】'));
  assert.ok(system.includes(ANCHORS.persons[0].name));
  assert.ok(system.includes(ANCHORS.persons[0].mustNot[0]), '人物卡应包含 mustNot 约束');
  assert.ok(system.includes('【史料暗引白名单'));
  assert.ok(system.includes(ANCHORS.quotations[0].text));
  assert.ok(system.includes('【语气规范】'));
  assert.ok(system.includes('【总边界】'));
  assert.ok(system.includes(ANCHORS.boundary));

  // 场景级 facts
  assert.ok(system.includes('【本场景不可变】'));
  assert.ok(system.includes('李陵已降匈奴'));
  assert.ok(system.includes('【本场景禁止】'));
  assert.ok(system.includes('【本场景制度依据】'));

  // 无 facts 也能生成（用于非开放节点）
  const plain = buildSystem(ANCHORS, undefined);
  assert.ok(plain.includes('【总边界】'));
  assert.equal(plain.includes('【本场景不可变】'), false);
});

test('buildUser：携带场景/玩家原文/选项 id/状态档位/记忆', () => {
  const withSession = { summary: '第2次自书于天汉二年十一月：我出言为他辩护；归为直言辩护。' };
  const user = buildUser(PAYLOAD, withSession);
  assert.ok(user.includes('【当前场景】朝议 · 天汉二年十一月'));
  assert.ok(user.includes('李陵降。'));
  assert.ok(user.includes('我出言为他辩护'));
  assert.ok(user.includes('【下一节点已有选项 id】A（原样返回）'));
  assert.ok(user.includes('坚韧 中、名节 中、财富 中、权谋 中'));
  assert.ok(user.includes('【本局滚动记忆】'), '应带上 session.summary');
  assert.ok(user.includes('先判可行性，再写这一页正文'));

  const rich = buildUser(
    { ...PAYLOAD, hint: { label: '直言辩护' }, recentTexts: ['第一页', '第二页', '第三页'], usedImagery: ['灯', '雪'] },
    undefined,
  );
  assert.ok(rich.includes('【参考提示】'));
  assert.ok(rich.includes('【前情摘要 / 最近两页】'));
  assert.ok(!rich.includes('第一页'), '最近两页只取末尾两页');
  assert.ok(rich.includes('第二页') && rich.includes('第三页'));
  assert.ok(rich.includes('【已用过的意象，本页请勿重复】灯、雪'));
});

test('buildRetryNote：逐条列出违规项', () => {
  const note = buildRetryNote(['正文不足 120 字', '出现感叹号或问句，违反语气规范']);
  assert.ok(note.includes('正文不足 120 字'));
  assert.ok(note.includes('出现感叹号或问句，违反语气规范'));
  assert.ok(note.includes('上一稿未通过史官校验'));
});

/* ------------------------------------------------------------ session */

test('session：getSession 是纯内存、稳定同引用的会话', () => {
  const first = getSession('player-a');
  assert.deepEqual(toHost(first), { summary: '', recentTexts: [], usedImagery: [], turns: 0 });
  const second = getSession('player-a');
  assert.equal(first, second, '同一 id 应返回同一个会话对象');

  const def1 = getSession();
  const def2 = getSession('');
  assert.equal(def1, def2, '空 id 应落到 default 会话');
  assert.equal(def1, getSession(null));

  // id 截断到 64 字符
  assert.equal(getSession('x'.repeat(100)), getSession('x'.repeat(64)));
  assert.notEqual(getSession('player-a'), getSession('player-b'));
});

test('session：会话数量有上限，最早的会话会被淘汰（防长演示内存膨胀）', () => {
  const first = getSession('lru-oldest');
  for (let i = 1; i <= 260; i++) getSession('lru-' + i);
  const later = getSession('lru-260');
  assert.equal(getSession('lru-260'), later, '最近创建的会话应仍在内存');
  assert.notEqual(getSession('lru-oldest'), first, '超过上限后最早会话应被淘汰并重建');
});

/* ------------------------------------------------------------ 前后端规则一致性 */

test('服务端与前端复用同一份校验规则（防漂移）', () => {
  // anchors/overreach 是同一份文件：数量与关键字段一致
  assert.equal(OVERREACH.rules.length, frontend.overreachRules.length);
  assert.deepEqual(OVERREACH.rules.map((r) => r.id), frontend.overreachRules.map((r) => r.id));
  assert.deepEqual(toHost(ANCHORS.quotations), frontend.anchors.quotations);

  // 长度规则一致（服务端不加载 config.js，默认值必须与前端一致）
  assert.equal(frontend.globals.TSG_CONFIG.minChars, 4);
  assert.equal(frontend.globals.TSG_CONFIG.maxChars, 40);
  // 前端结果来自 VM realm，先 JSON 归一化再比较
  const fromFrontend = (text) => JSON.parse(JSON.stringify(frontend.guard.checkInput(text, {})));
  for (const text of ['一二三', '一二三四', '你'.repeat(40), '你'.repeat(41), '我带兵造反', '我纳钱赎死']) {
    assert.deepEqual(checkInput(text), fromFrontend(text), `前后端 checkInput 结果不一致: ${text}`);
  }
});
