/* ===== 引擎契约测试（js/engine.js） =====
 * 引擎是纯函数层：resolve 判定、collect 收集、settle 结算。
 * 这里只依赖真实剧本数据 + 一个最小 VM realm，不启动浏览器。
 *
 * 对齐的当前语义：
 *   - resolve 会再次校验 showIf：隐藏选项被直接调用时返回 !ok / error='hidden_option'
 *   - VARIANTS[12] 的 plot 阈值是 quan>=95（raw 83–100 的 HIDDEN 线两档都可达）
 *   - scenes.p2.js A3/C「了此残生」是 terminal:{endingId:13, cause:'T3'}，不再是 badIf
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserGlobals, toHost } from './helpers/load-browser-globals.mjs';

const env = loadBrowserGlobals();
const { data, engine, intent } = env;
const SCENES = data.SCENES;

/** 用宿主对象构造状态，再交给 VM 里的引擎消费。 */
function stateWith(patch = {}) {
  const state = engine.createState();
  Object.assign(state, patch);
  return state;
}

/* ------------------------------------------------------------ createState */

test('createState：四维各 50，空标记/碎片/历史，无 route/badCause', () => {
  const state = toHost(engine.createState());
  assert.deepEqual(state, {
    jian: 50, ming: 50, cai: 50, quan: 50,
    flags: {}, pieces: [], history: [],
    route: null, badCause: null,
  });
  // 每次调用互相独立（不能共享可变数组）
  const a = engine.createState();
  const b = engine.createState();
  a.flags.someFlag = 1;
  a.pieces.push(1);
  assert.deepEqual(toHost(b.flags), {});
  assert.deepEqual(toHost(b.pieces), []);
});

/* ------------------------------------------------------------ resolve */

test('resolve：合法选项推进下一节点，携带 effect', () => {
  const r = toHost(engine.resolve(SCENES, engine.createState(), 'P1', 'A'));
  assert.equal(r.ok, true);
  assert.equal(r.nextNodeId, 'P2');
  assert.deepEqual(r.effect, { d: { jian: 10 }, flags: { travel: 1, truth: 1 }, piece: 1 });
  assert.equal(r.endingId, undefined);

  // 选项 next 为 END_OF_STORY 哨兵时也返回 ok + nextNodeId
  const atEnd = toHost(engine.resolve(SCENES, engine.createState(), 'A3', 'A'));
  assert.equal(atEnd.ok, true);
  assert.equal(atEnd.nextNodeId, data.END_OF_STORY);
  assert.equal(atEnd.endingId, undefined);
});

test('resolve：非法节点 / 非法选项 / 未配置出边都返回 !ok 且不崩溃', () => {
  const noNode = toHost(engine.resolve(SCENES, engine.createState(), 'NOPE', 'A'));
  assert.equal(noNode.ok, false);
  assert.match(noNode.error, /节点不存在/);

  const noOption = toHost(engine.resolve(SCENES, engine.createState(), 'P1', 'ZZZ'));
  assert.equal(noOption.ok, false);
  assert.match(noOption.error, /选项不存在/);

  // 合成场景：选项既无 next 也无 terminal 属于数据错误，应返回错误而不是 undefined
  const brokenScenes = { X: { id: 'X', options: [{ id: 'A', text: '无出边' }] } };
  const broken = toHost(engine.resolve(brokenScenes, engine.createState(), 'X', 'A'));
  assert.equal(broken.ok, false);
  assert.match(broken.error, /未配置 next\/terminal/);
});

test('resolve：权威裁决层再校验 showIf，隐藏选项直接调用返回 hidden_option', () => {
  // P6/E 需要 truth >= 4 才可见
  const hidden = toHost(engine.resolve(SCENES, engine.createState(), 'P6', 'E'));
  assert.equal(hidden.ok, false);
  assert.equal(hidden.error, 'hidden_option');
  assert.equal(hidden.nextNodeId, undefined);
  assert.equal(hidden.endingId, undefined);

  const shown = toHost(engine.resolve(SCENES, stateWith({ flags: { truth: 4 } }), 'P6', 'E'));
  assert.equal(shown.ok, true);
  assert.equal(shown.nextNodeId, 'L1');

  // A1/D（隐藏线入口）需要 hypocrisy >= 3
  assert.equal(toHost(engine.resolve(SCENES, engine.createState(), 'A1', 'D')).error, 'hidden_option');
  const hiddenLine = toHost(engine.resolve(SCENES, stateWith({ flags: { hypocrisy: 3 } }), 'A1', 'D'));
  assert.equal(hiddenLine.ok, true);
  assert.equal(hiddenLine.nextNodeId, 'H1');
  assert.equal(hiddenLine.effect.route, 'HIDDEN');

  // visibleOptions 与 resolve 的可见性必须一致
  const visibleDefault = toHost(engine.visibleOptions(SCENES.P6, engine.createState())).map((o) => o.id);
  const visibleUnlocked = toHost(engine.visibleOptions(SCENES.P6, stateWith({ flags: { truth: 4 } }))).map((o) => o.id);
  assert.ok(!visibleDefault.includes('E'), 'truth < 4 时隐藏选项 E 不应可见');
  assert.ok(visibleUnlocked.includes('E'), 'truth >= 4 时隐藏选项 E 应可见');
});

test('resolve：terminal（BAD END）优先返回 endingId 与 badCause', () => {
  const r = toHost(engine.resolve(SCENES, engine.createState(), 'P6', 'D'));
  assert.equal(r.ok, true);
  assert.equal(r.endingId, 13);
  assert.equal(r.badCause, 'T1');
  assert.equal(r.nextNodeId, undefined);
});

test('resolve：A3/C「了此残生」为 terminal T3，不受 jian 数值影响', () => {
  const low = toHost(engine.resolve(SCENES, engine.createState(), 'A3', 'C'));
  assert.equal(low.ok, true);
  assert.equal(low.endingId, 13);
  assert.equal(low.badCause, 'T3');
  assert.equal(low.nextNodeId, undefined);
  assert.deepEqual(low.effect, { d: { jian: 5 } });

  // 旧版 badIf(max:39) 依赖数值；新版直接终局，jian 再高也一样触发
  const high = toHost(engine.resolve(SCENES, stateWith({ jian: 99 }), 'A3', 'C'));
  assert.equal(high.ok, true);
  assert.equal(high.endingId, 13);
  assert.equal(high.badCause, 'T3');

  // 模拟 app.js 链路：collect 记下 badCause 后 settle 应落到结局 13 的 silkworm 分档
  const terminalState = engine.collect(engine.createState(), {
    ...(low.effect || {}),
    nodeId: 'A3',
    optionId: 'C',
    badCause: low.badCause,
  });
  const result = toHost(engine.settle(terminalState));
  assert.equal(result.endingId, 13);
  assert.equal(result.name, '戛然而止');
  assert.equal(result.variant, 'silkworm');
});

test('resolve：gate 不满足时不可选；selectableWhenFailing + failTerminal 走凶多吉少', () => {
  // 属性门槛：L3/X3 需要 cai >= 80
  assert.equal(toHost(engine.resolve(SCENES, stateWith({ cai: 79 }), 'L3', 'X3')).ok, false);
  assert.match(toHost(engine.resolve(SCENES, stateWith({ cai: 79 }), 'L3', 'X3')).error, /gate_failed/);
  const pass = toHost(engine.resolve(SCENES, stateWith({ cai: 80 }), 'L3', 'X3'));
  assert.equal(pass.ok, true);
  assert.equal(pass.nextNodeId, 'R1');
  assert.equal(pass.effect.route, 'REDEEM');

  // 标记门槛：L2A/C 需要 companion >= 1
  assert.equal(toHost(engine.resolve(SCENES, engine.createState(), 'L2A', 'C')).ok, false);
  assert.equal(toHost(engine.resolve(SCENES, stateWith({ flags: { companion: 1 } }), 'L2A', 'C')).ok, true);

  // 门槛失败但允许冒险：ming < 55 时 L2A/B 直接 BAD END T2；刚好 55 则正常推进
  const failTerminal = toHost(engine.resolve(SCENES, stateWith({ ming: 54 }), 'L2A', 'B'));
  assert.equal(failTerminal.ok, true);
  assert.equal(failTerminal.endingId, 13);
  assert.equal(failTerminal.badCause, 'T2');
  const justPass = toHost(engine.resolve(SCENES, stateWith({ ming: 55 }), 'L2A', 'B'));
  assert.equal(justPass.ok, true);
  assert.equal(justPass.nextNodeId, 'L3');
  assert.equal(justPass.endingId, undefined);
});

test('passGate：属性与标记阈值边界', () => {
  assert.equal(engine.passGate(stateWith({ jian: 59 }), { stat: 'jian', min: 60 }), false);
  assert.equal(engine.passGate(stateWith({ jian: 60 }), { stat: 'jian', min: 60 }), true);
  assert.equal(engine.passGate(stateWith({ flags: { truth: 3 } }), { flag: 'truth', min: 4 }), false);
  assert.equal(engine.passGate(stateWith({ flags: { truth: 4 } }), { flag: 'truth', min: 4 }), true);
  assert.equal(engine.passGate(engine.createState(), {}), true, '空条件应放行');
});

/* ------------------------------------------------------------ collect */

test('collect：四维夹在 0..100，标记累加、碎片去重、历史追加', () => {
  const clamped = toHost(engine.collect(engine.createState(), { d: { jian: 999, ming: -999, cai: -30, quan: 30 } }));
  assert.equal(clamped.jian, 100);
  assert.equal(clamped.ming, 0);
  assert.equal(clamped.cai, 20);
  assert.equal(clamped.quan, 80);
  for (const value of [clamped.jian, clamped.ming, clamped.cai, clamped.quan]) {
    assert.ok(value >= 0 && value <= 100, `数值越界: ${value}`);
  }

  const once = engine.collect(engine.createState(), { flags: { truth: 1 }, piece: 7, route: 'PUNISH', badCause: 'T2' });
  const twice = engine.collect(once, { flags: { truth: 2, travel: 1 }, piece: 7, nodeId: 'P1', optionId: 'A' });
  const got = toHost(twice);
  assert.deepEqual(got.flags, { truth: 3, travel: 1 });
  assert.deepEqual(got.pieces, [7], '同一碎片不得重复收集');
  assert.deepEqual(got.history, [{ nodeId: 'P1', optionId: 'A' }]);
  assert.equal(got.route, 'PUNISH');
  assert.equal(got.badCause, 'T2');

  // 碎片按收集顺序追加（galleryProgress 负责去重排序）
  const twoPieces = toHost(engine.collect(once, { piece: 1 }));
  assert.deepEqual(twoPieces.pieces, [7, 1]);
});

test('collect：纯函数，不修改传入 state', () => {
  const before = engine.createState();
  const snapshot = JSON.stringify(toHost(before));
  const after = engine.collect(before, { d: { jian: 50 }, flags: { truth: 1 }, piece: 3, nodeId: 'P1', optionId: 'A' });
  assert.equal(JSON.stringify(toHost(before)), snapshot, 'collect 不应修改原 state');
  assert.notEqual(JSON.stringify(toHost(after)), snapshot);
  // 空 effect 也不得产生副作用
  assert.equal(JSON.stringify(toHost(engine.collect(before, {}))), snapshot);
});

test('clamp：边界值', () => {
  assert.equal(engine.clamp(-1), 0);
  assert.equal(engine.clamp(0), 0);
  assert.equal(engine.clamp(55), 55);
  assert.equal(engine.clamp(100), 100);
  assert.equal(engine.clamp(101), 100);
});

/* ------------------------------------------------------------ settle */

test('settle：13 个结局判定表逐条核对且结果稳定', () => {
  const cases = [
    { route: 'PUNISH', patch: { jian: 90, cai: 60, flags: { truth: 6 } }, endingId: 1, name: '史家绝唱', orthodox: true, variant: null },
    { route: 'PUNISH', patch: { jian: 10, ming: 20 }, endingId: 2, name: '抑郁而终', orthodox: false, variant: 'depressed' },
    { route: 'DIE', patch: { ming: 80 }, endingId: 3, name: '士可杀不可辱', orthodox: false, variant: null },
    { route: 'DIE', patch: { ming: 20 }, endingId: 4, name: '无名之悲', orthodox: false, variant: 'hasty' },
    { route: 'REDEEM', patch: { ming: 50 }, endingId: 6, name: '愤世嫉俗', orthodox: false, variant: null },
    { route: 'REDEEM', patch: { ming: 30, jian: 30 }, endingId: 5, name: '隐姓埋名', orthodox: false, variant: 'numb' },
    { route: 'FLATTER', patch: { quan: 80, ming: 30, flags: { favor: 3, hypocrisy: 1 } }, endingId: 7, name: '高官厚禄', orthodox: false, variant: null },
    { route: 'FLATTER', patch: { quan: 10, ming: 50 }, endingId: 8, name: '晚节不保', orthodox: false, variant: 'late' },
    { route: 'RETIRE', patch: { jian: 60, flags: { travel: 2 } }, endingId: 9, name: '山河行记', orthodox: false, variant: null },
    { route: 'RETIRE', patch: { jian: 10 }, endingId: 10, name: '江畔隐士', orthodox: false, variant: 'default' },
    { route: 'HIDDEN', patch: { quan: 80, flags: { evidence: 1 } }, endingId: 11, name: '春秋笔法', orthodox: false, variant: null },
    /* VARIANTS[12]：quan>=95 为 plot，其余为 rash */
    { route: 'HIDDEN', patch: { quan: 95 }, endingId: 12, name: '谋反败露', orthodox: false, variant: 'plot' },
    { route: 'HIDDEN', patch: { quan: 80 }, endingId: 12, name: '谋反败露', orthodox: false, variant: 'rash' },
  ];

  for (const c of cases) {
    const state = stateWith({ ...c.patch, route: c.route });
    const first = toHost(engine.settle(state));
    const second = toHost(engine.settle(state));
    assert.equal(first.endingId, c.endingId, `route=${c.route} ${JSON.stringify(c.patch)} 应判为结局 ${c.endingId}`);
    assert.equal(first.name, c.name);
    assert.equal(first.orthodox, c.orthodox);
    assert.equal(first.variant, c.variant);
    assert.deepEqual(first, second, '同一 state 的结算结果必须稳定');
    assert.ok(first.endingId >= 1 && first.endingId <= 13, `结局 id 越界: ${first.endingId}`);
  }

  // 未知 route 是数据错误，应显式抛出而不是静默返回
  assert.throws(() => engine.settle(stateWith({ route: 'NOPE' })), /未知 route/);
});

test('settle：结局 12 分档阈值是 quan>=95（94 与 95 的边界）', () => {
  const rash = toHost(engine.settle(stateWith({ route: 'HIDDEN', quan: 94 })));
  assert.equal(rash.endingId, 12);
  assert.equal(rash.variant, 'rash');

  const plot = toHost(engine.settle(stateWith({ route: 'HIDDEN', quan: 95 })));
  assert.equal(plot.endingId, 12);
  assert.equal(plot.variant, 'plot');

  /* HIDDEN 线到 H2 时 quan 实际落在 83–100：两档都必须可达。
   * 这里用端点值再确认一次（plot 只在 95+ 命中，所以 83 应落到 rash）。 */
  assert.equal(toHost(engine.settle(stateWith({ route: 'HIDDEN', quan: 83 }))).variant, 'rash');
  assert.equal(toHost(engine.settle(stateWith({ route: 'HIDDEN', quan: 100 }))).variant, 'plot');
});

test('settle：badCause 直接命中 BAD END 13 的三种死因分档', () => {
  const expected = { T1: 'prison', T2: 'court', T3: 'silkworm' };
  for (const [cause, variant] of Object.entries(expected)) {
    const result = toHost(engine.settle(stateWith({ route: 'PUNISH', badCause: cause })));
    assert.equal(result.endingId, 13, `badCause=${cause} 应判为结局 13`);
    assert.equal(result.name, '戛然而止');
    assert.equal(result.variant, variant, `badCause=${cause} 的文案分档错误`);
  }
});

test('settle：雷达图、人格相似度、图鉴进度自洽', () => {
  const full = stateWith({
    jian: 100, ming: 100, cai: 45, quan: 45,
    route: 'PUNISH', flags: { truth: 6 },
    pieces: [12, 3, 3, 1],
    history: [{ nodeId: 'P1', optionId: 'A' }],
  });
  const result = toHost(engine.settle(full));

  // 与正统基线完全相同 → 相似度 100
  assert.equal(result.similarity, 100);
  assert.deepEqual(result.radar.player, { jian: 100, ming: 100, cai: 45, quan: 45 });
  assert.deepEqual(result.radar.orthodox, data.ORTHODOX_BASELINE);
  assert.deepEqual(result.stats, { jian: 100, ming: 100, cai: 45, quan: 45 });
  assert.deepEqual(result.flags, { truth: 6 });
  assert.deepEqual(result.history, [{ nodeId: 'P1', optionId: 'A' }]);

  // 图鉴：去重 + 排序 + 行列换算（piece 1 → row0/col0；piece 12 → row3/col2）
  assert.deepEqual(result.gallery.pieces, [1, 3, 12]);
  assert.equal(result.gallery.owned, 3);
  assert.equal(result.gallery.total, data.GALLERY_TOTAL);
  assert.equal(result.gallery.complete, false);
  assert.deepEqual(result.gallery.cells, [
    { id: 1, row: 0, col: 0 },
    { id: 3, row: 0, col: 2 },
    { id: 12, row: 3, col: 2 },
  ]);

  // 相似度公式：100 − 四维差绝对值平均（四舍五入）
  const zero = stateWith({ jian: 0, ming: 0, cai: 0, quan: 0, route: 'RETIRE' });
  const zeroResult = toHost(engine.settle(zero));
  assert.equal(zeroResult.similarity, 28); // 100 − (100+100+45+45)/4 = 27.5 → 28
  assert.equal(engine.similarity(engine.createState()), 73); // 50/50/50/50 → 72.5 → 73

  const gallery = toHost(engine.galleryProgress(stateWith({ pieces: [3, 1, 3] })));
  assert.deepEqual(gallery.pieces, [1, 3]);
  assert.equal(gallery.owned, 2);
  assert.equal(gallery.complete, false);

  // 满图鉴
  const complete = toHost(engine.galleryProgress(stateWith({ pieces: data.PIECES.map((p) => p.id) })));
  assert.equal(complete.owned, data.GALLERY_TOTAL);
  assert.equal(complete.complete, true);
});

/* ------------------------------------------------------------ intent */

test('TSG_Intent.classify：带 matched 字段，中性输入不假装命中', () => {
  const defend = toHost(intent.classify('我要开口为李陵辩护'));
  assert.equal(defend.intent, 'DEFEND');
  assert.equal(defend.matched, true);
  assert.ok(defend.confidence > 0 && defend.confidence <= 1);

  const neutral = toHost(intent.classify('随便看看'));
  assert.equal(neutral.matched, false, '无关键词命中时 matched 必须为 false');
  assert.equal(neutral.confidence, 0);
  assert.equal(neutral.intent, 'WRITE', 'classify 仍返回默认倾向，但 matched=false 表示不可信');

  const empty = toHost(intent.classify(''));
  assert.equal(empty.matched, false);
});

test('TSG_Intent.resolveOption：无字面重合/无亲和时返回 null，terminal 必须排除', () => {
  // 有意图亲和 → 走既有边
  assert.equal(toHost(intent.resolveOption(SCENES.L1, engine.createState(), '我要开口辩护', 'DEFEND')), 'A');

  // 无重合、无亲和 → null（不再静默取第一项）
  assert.equal(toHost(intent.resolveOption(SCENES.L1, engine.createState(), '带兵造反', null)), null);
  assert.equal(toHost(intent.resolveOption(SCENES.L1, engine.createState(), '带兵造反', 'MILITARY')), null);

  // gate 不满足的选项被过滤；过滤后无重合也返回 null
  assert.equal(toHost(intent.resolveOption(SCENES.L3, engine.createState(), '变卖纳钱赎死', 'MERCY')), null);
  const rich = toHost(intent.resolveOption(SCENES.L3, stateWith({ cai: 90 }), '变卖纳钱赎死', 'MERCY'));
  assert.equal(rich, 'X3');

  // P6/D 是 terminal：即使字面匹配也只能排除，不能映射到 BAD END
  const terminalMatch = toHost(intent.resolveOption(SCENES.P6, engine.createState(), '讥讽武帝', 'NOPE'));
  assert.equal(terminalMatch, null, 'terminal 选项必须被过滤，且不能回退到其他无重合选项');

  // 有字面重合的非 terminal 选项仍可命中
  const overlapHit = toHost(intent.resolveOption(SCENES.P6, engine.createState(), '随众称贺', 'FLATTER'));
  assert.ok(SCENES.P6.options.some((o) => o.id === overlapHit));
  assert.notEqual(overlapHit, 'D');
});
