/* ===== 离线剧本包生成器测试（js/compose.js + js/data/genpack.js） =====
 * 离线/回退链路：build 拼装史实留白正文，buildRefusal 生成「角色视角的否定」。
 * 两者都只是文本产物，绝不写 state、绝不新增节点。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserGlobals, toHost } from './helpers/load-browser-globals.mjs';

const env = loadBrowserGlobals();
const { compose, genpack, intent, guard, overreachRules } = env;

const FRAME_INTENTS = Object.keys(genpack.frames);
const TONE_WORDS = genpack.tones.map((t) => t.word);

function buildArgs(extra = {}) {
  return { intent: 'WRITE', nodeId: 'L1', text: '你提笔写下一行', nextOptionId: 'A', toneSeed: 0, usedImagery: [], ...extra };
}

/** 离线产物不能是空壳：必须是一页完整正文（含引用与自检字段）。 */
function assertValidPack(pack, label) {
  assert.equal(typeof pack, 'object', `${label} 应返回对象`);
  assert.ok(pack, `${label} 不应为 null`);
  assert.equal(typeof pack.text, 'string', `${label}.text 应为字符串`);
  assert.ok(pack.text.trim().length >= 150, `${label} 正文过短: ${pack.text.length}`);
  assert.ok(!/[!?！？]/.test(pack.text), `${label} 正文出现感叹号/问句`);
  assert.ok(pack.text.includes('你'), `${label} 正文必须使用第二人称「你」`);
  assert.ok(Array.isArray(pack.citation), `${label}.citation 应为数组`);
  assert.ok(pack.citation.length > 0, `${label} 缺少史料引用`);
  for (const q of pack.citation) {
    assert.ok(q.source && q.text, `${label} 的引用缺 source/text`);
  }
  assert.equal(pack.selfCheck?.pass, true, `${label}.selfCheck.pass`);
  assert.equal(pack.source, 'pack');
}

test('genpack 数据：意图帧与 intent.js 的意图表一一对应', () => {
  const intentIds = intent.INTENTS.map((i) => i.id).sort();
  assert.deepEqual([...FRAME_INTENTS].sort(), intentIds, 'genpack.frames 的键应与 TSG_Intent.INTENTS 的 id 完全一致');

  for (const intentId of FRAME_INTENTS) {
    const frame = genpack.frames[intentId];
    assert.ok(frame.opening.trim(), `${intentId}.opening`);
    assert.equal(frame.middle.length, 3, `${intentId}.middle 应为 3 段`);
    for (const line of frame.middle) assert.ok(line.trim(), `${intentId}.middle 不能有空段`);
    assert.ok(frame.closing.trim(), `${intentId}.closing`);
    assert.ok(frame.citation.length > 0, `${intentId} 缺少引用`);
    assert.ok(frame.examNote.trim(), `${intentId} 缺少 examNote`);
  }
  for (const nodeId of Object.keys(genpack.settings)) {
    assert.ok(genpack.settings[nodeId].line.trim(), `settings.${nodeId}.line 不能为空`);
  }
  assert.ok(genpack.tones.length >= 2, '至少需要两组可轮换意象');
  assert.ok(genpack.pads.length > 0, '缺少补白段落');
});

test('TSG_Compose.build：所有意图都产出完整正文，并携带既有选项 id', () => {
  for (const intentId of FRAME_INTENTS) {
    const pack = toHost(compose.build(buildArgs({ intent: intentId, nextOptionId: 'A' })));
    assertValidPack(pack, `build(${intentId})`);
    assert.equal(pack.nextOptionId, 'A', '生成物必须原样带回既有选项 id');
    assert.ok(TONE_WORDS.includes(pack.imagery), `${intentId} 的 imagery 应来自 tones：${pack.imagery}`);
    assert.equal(guard.checkOutput(pack.text, {}).ok, true, `build(${intentId}) 产物应能通过前端史官校验`);
  }
});

test('TSG_Compose.build：未知意图回退 WRITE，未知节点仍可拼装', () => {
  const fallback = toHost(compose.build(buildArgs({ intent: 'NOT_AN_INTENT' })));
  const write = toHost(compose.build(buildArgs({ intent: 'WRITE' })));
  assert.equal(fallback.text, write.text, '未知 intent 应回退到 WRITE 帧');
  assertValidPack(fallback, 'build(unknown intent)');

  const unknownNode = toHost(compose.build(buildArgs({ nodeId: 'NOPE' })));
  assertValidPack(unknownNode, 'build(unknown node)');
});

test('TSG_Compose.build：场景前缀、文风种子与意象轮换', () => {
  // 场景前缀来自 genpack.settings
  const l3 = toHost(compose.build(buildArgs({ nodeId: 'L3' })));
  assert.ok(l3.text.includes(genpack.settings.L3.line), 'L3 产物应以 L3 场景句开头');

  // 同一输入必须确定性可复现
  const a = toHost(compose.build(buildArgs()));
  const b = toHost(compose.build(buildArgs()));
  assert.deepEqual(a, b);

  // 种子决定意象；已用意象会被跳过；用尽后回退第一组
  assert.equal(toHost(compose.build(buildArgs({ toneSeed: 0 }))).imagery, TONE_WORDS[0]);
  assert.equal(toHost(compose.build(buildArgs({ toneSeed: 1 }))).imagery, TONE_WORDS[1]);
  assert.equal(toHost(compose.build(buildArgs({ usedImagery: [TONE_WORDS[0]] }))).imagery, TONE_WORDS[1]);
  assert.equal(
    toHost(compose.build(buildArgs({ usedImagery: [...TONE_WORDS] }))).imagery,
    TONE_WORDS[0],
    '所有意象都用过时应回退第一组',
  );
});

test('TSG_Compose.secondPerson：改写为第二人称动作句', () => {
  assert.equal(compose.secondPerson('我提笔写下去。'), '你提笔写下去。');
  assert.equal(compose.secondPerson('提笔写下去！'), '你提笔写下去。');
  assert.equal(compose.secondPerson('你提笔写下去'), '你提笔写下去。');
  assert.equal(compose.secondPerson(''), '你。');
});

test('TSG_Compose.build / buildRefusal：不写 state、不修改入参', () => {
  const state = { jian: 50, ming: 50, cai: 50, quan: 50, flags: { truth: 1 }, route: 'PUNISH', pieces: [1] };
  const input = buildArgs({ state, intent: 'WRITE', nodeId: 'L3', usedImagery: [] });
  const snapshot = JSON.stringify(input);

  const built = compose.build(input);
  assert.equal(JSON.stringify(input), snapshot, 'build 不得修改入参（含 state）');
  assert.equal(Object.hasOwn(built, 'state'), false, 'build 返回值不应携带 state');
  assert.equal(Object.hasOwn(built, 'd'), false, 'build 返回值不应携带数值增减 d');
  assert.ok(Object.hasOwn(built, 'text') && Object.hasOwn(built, 'nextOptionId'), 'build 只产出文本与既有选项 id');

  const refusalInput = { overreachId: 'MILITARY', nodeId: 'L3', text: '我带兵造反', state, toneSeed: 2 };
  const refusalSnapshot = JSON.stringify(refusalInput);
  const refusal = compose.buildRefusal(refusalInput);
  assert.equal(JSON.stringify(refusalInput), refusalSnapshot, 'buildRefusal 不得修改入参（含 state）');
  assert.equal(Object.hasOwn(refusal, 'state'), false, 'buildRefusal 返回值不应携带 state');
  assert.equal(refusal.nextOptionId, '', '越界否定不推进剧情，nextOptionId 置空');
});

test('TSG_Compose.buildRefusal：越界输入返回「否定段」，全部越界规则可用', () => {
  for (const rule of overreachRules) {
    const pack = toHost(compose.buildRefusal({ overreachId: rule.id, nodeId: 'L3', text: '我带兵造反' }));
    assertValidPack(pack, `buildRefusal(${rule.id})`);
    assert.equal(pack.overreach, rule.id, `${rule.id} 应使用对应否定规则`);
    assert.equal(pack.nextOptionId, '', '否定的念头不产生新的边');
    assert.ok(!pack.text.includes('我带兵造反'), `${rule.id} 不得复述玩家用词/写成已执行`);
    assert.equal(guard.checkOutput(pack.text, {}).ok, true, `buildRefusal(${rule.id}) 产物应能通过前端史官校验`);
  }

  // 未知 overreachId 回退 GENERIC
  const generic = toHost(compose.buildRefusal({ overreachId: 'NOT_A_RULE', nodeId: 'L1', text: '我带兵造反' }));
  assert.equal(generic.overreach, 'GENERIC');
  assertValidPack(generic, 'buildRefusal(unknown)');

  // 缺省 overreachId 也应回退 GENERIC（不抛异常）
  const missing = toHost(compose.buildRefusal({ nodeId: 'L1', text: '我带兵造反' }));
  assert.equal(missing.overreach, 'GENERIC');
});
