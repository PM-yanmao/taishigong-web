/* 自书（free-write）契约测试：
 *  - js/data/freewrite.js 与 config.js / 剧本 / 锚点库 / 剧本包 / 服务端一致
 *  - 服务端 scenes.mjs 与浏览器剧本数据同源
 *  - 意图 candidates：只给既有边、排除 terminal、多候选按亲和建议排序
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserGlobals, toHost, PROJECT_ROOT } from './helpers/load-browser-globals.mjs';
import { SCENES as SERVER_SCENES, optionIds, sceneMeta } from '../server/scenes.mjs';

const boot = loadBrowserGlobals();
const { data, anchors, genpack, intent, engine } = boot;
const FREE = toHost(boot.globals.TSG_FREEWRITE);
const CFG = toHost(boot.globals.TSG_CONFIG);

test('freewrite：开放节点都存在，且 config.js 读取同一份配置', () => {
  assert.equal(FREE.version, '1.2.0');
  assert.ok(Array.isArray(FREE.openNodes) && FREE.openNodes.length >= 6);
  for (const id of FREE.openNodes) assert.ok(data.SCENES[id], `开放节点 ${id} 不存在`);
  for (const id of FREE.offlineNodes) {
    assert.ok(FREE.openNodes.includes(id), `离线节点 ${id} 必须在开放列表里`);
  }
  assert.equal(CFG.openNodes.length, FREE.openNodes.length);
  assert.deepEqual(CFG.openNodes, FREE.openNodes);
  assert.equal(CFG.freeLimit, FREE.perRun);
  assert.equal(CFG.maxChars, FREE.maxChars);
  assert.ok(FREE.perRun >= 3 && FREE.perRun <= 10);
  assert.ok(FREE.minChars >= 2 && FREE.maxChars >= 20 && FREE.maxChars <= 120);
});

test('freewrite：每个开放节点都有场景级锚点与离线剧本包设定', () => {
  for (const id of FREE.openNodes) {
    const facts = anchors.nodeFacts[id];
    assert.ok(facts, `${id} 缺少 anchors.nodeFacts`);
    assert.ok(Array.isArray(facts.immutable) && facts.immutable.length);
    assert.ok(Array.isArray(facts.permitted) && facts.permitted.length);
    assert.ok(Array.isArray(facts.forbidden) && facts.forbidden.length);
    assert.ok(genpack.settings[id], `${id} 缺少 genpack.settings（在线失败回退时要用）`);
  }
});

test('freewrite：开放节点的非 terminal 选项与服务端白名单一致', () => {
  for (const id of FREE.openNodes) {
    const expect = (data.SCENES[id].options || [])
      .filter((o) => !o.terminal)
      .map((o) => o.id)
      .sort();
    /* optionIds 来自 vm 里的服务端模块（跨 realm 数组），转成宿主数组再比 */
    const actual = Array.from(optionIds(id)).sort();
    assert.deepEqual(actual, expect, `${id} 服务端可自书边与前端不一致`);
    assert.ok(sceneMeta(id).text.length > 0, `${id} 服务端缺少场景原文`);
  }
});

test('server/scenes.mjs：与浏览器剧本数据同源', () => {
  assert.deepEqual(Object.keys(SERVER_SCENES).sort(), Object.keys(data.SCENES).sort());
  for (const [id, node] of Object.entries(data.SCENES)) {
    assert.equal(SERVER_SCENES[id].title, node.title);
    assert.equal(SERVER_SCENES[id].era, node.era);
    assert.equal(SERVER_SCENES[id].text, node.text);
  }
});

test('intent.candidates：只返回既有边，排除 terminal，多候选可信', () => {
  const state = engine.createState();
  const l1 = intent.candidates(data.SCENES.L1, state, '我要开口为李陵辩护', 'DEFEND');
  assert.ok(l1.length >= 1);
  assert.equal(l1[0].id, 'A'); // 意图亲和 + 字面重合
  for (const c of l1) {
    assert.ok(['A', 'B', 'C'].includes(c.id), `自书不得产生新边: ${c.id}`);
    assert.ok(c.score > 0);
  }
  // terminal 选项永远不进落点候选（P6/D 是 BAD END）
  const p6 = intent.candidates(data.SCENES.P6, state, '当众讥讽武帝用人', 'DEFEND');
  assert.equal(p6.some((c) => c.id === 'D'), false);
  // 纯白噪音：没有可承接的走向
  assert.equal(intent.candidates(data.SCENES.L1, state, '站着不动', '').length, 0);
  // 门不够的选项不进候选（L3/X3 需要 cai>=80）
  const l3 = intent.candidates(data.SCENES.L3, state, '变卖家产纳钱赎死', 'MERCY');
  assert.equal(l3.some((c) => c.id === 'X3'), false);
});

test('freewrite：每局 5 笔、一行最多 60 字，且能覆盖全部开放节点', () => {
  assert.equal(FREE.perRun, 5);
  assert.equal(FREE.maxChars, 60);
  assert.equal(FREE.openNodes.length, 6);
  assert.deepEqual(FREE.offlineNodes, ['L1', 'L3']);
});
