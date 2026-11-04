/* ===== src/engine.js ===== */
/**
 * 《太史公》核心引擎骨架（预保留代码，数据无关）— v1.1
 * ------------------------------------------------------------------
 * 设计依据：docs/04-决策基线（锁定版 v1.1）§7 §8 §11
 *           docs/05-李陵之祸分支系统设计（三幕式）
 *
 * 三层职责（对应"一项判定 + 一项收集"）：
 *   resolve()  判定：这一步的后果 / 下一个节点 / 是否终点
 *   collect()  收集：累加四维数值、标记、图鉴碎片
 *   settle()   结算：结局判定 / 雷达图 / 相似度 / 图鉴进度
 *
 * v1.1 变更：
 *   1) 图鉴与结局解耦——碎片由"答对史实选项"产出（effect.piece），不由结局产出
 *   2) 结局表移除 gallery 字段；新增 PIECES 图鉴碎片表
 *   3) 图片一律走插槽机制，缺失即占位，不阻塞
 * ------------------------------------------------------------------
 */

/* ============================== 基础常量 ============================== */
const KEYS = Object.freeze(['jian', 'ming', 'cai', 'quan']);
const KEYS_CN = Object.freeze({ jian: '坚韧', ming: '名节', cai: '财富', quan: '权谋' });

/** 初始值：锁定 各 50；范围 0–100；不允许负值（基线 §3） */
const INIT = Object.freeze({ jian: 50, ming: 50, cai: 50, quan: 50 });
const MIN_VALUE = 0;
const MAX_VALUE = 100;
const clamp = (v) => Math.min(MAX_VALUE, Math.max(MIN_VALUE, v));

/** 司马迁基线 = 正统路径终值。剧本定稿后由脚本导出覆盖（基线 §7） */
const ORTHODOX_BASELINE = Object.freeze({ jian: 100, ming: 100, cai: 45, quan: 45 });

/* ============================== 分支与结局 ============================== */
const ROUTES = Object.freeze([
  'PUNISH',  // 受刑线
  'HIDDEN',  // 隐藏权谋线（受刑线的暗面）
  'DIE',     // 赴死线
  'REDEEM',  // 赎罪线
  'FLATTER', // 逢迎线
  'RETIRE',  // 辞官线
  'BAD',     // 戛然而止
]);

/** 结局元数据：12 个主结局 + 13 戛然而止。orthodox 仅结局1为真（加特效） */
const ENDINGS = Object.freeze([
  { id: 1,  route: 'PUNISH',  name: '史家绝唱',     orthodox: true  },
  { id: 2,  route: 'PUNISH',  name: '抑郁而终',     orthodox: false },
  { id: 3,  route: 'DIE',     name: '士可杀不可辱', orthodox: false },
  { id: 4,  route: 'DIE',     name: '无名之悲',     orthodox: false },
  { id: 5,  route: 'REDEEM',  name: '隐姓埋名',     orthodox: false },
  { id: 6,  route: 'REDEEM',  name: '愤世嫉俗',     orthodox: false },
  { id: 7,  route: 'FLATTER', name: '高官厚禄',     orthodox: false },
  { id: 8,  route: 'FLATTER', name: '晚节不保',     orthodox: false },
  { id: 9,  route: 'RETIRE',  name: '山河行记',     orthodox: false },
  { id: 10, route: 'RETIRE',  name: '江畔隐士',     orthodox: false },
  { id: 11, route: 'HIDDEN',  name: '春秋笔法',     orthodox: false },
  { id: 12, route: 'HIDDEN',  name: '谋反败露',     orthodox: false },
  { id: 13, route: 'BAD',     name: '戛然而止',     orthodox: false },
]);
const ENDING_BY_ID = Object.freeze(Object.fromEntries(ENDINGS.map((e) => [e.id, e])));

/* ============================== 图鉴（史实线拼合） ============================== */

/**
 * 图鉴 = 司马迁真实生平图，切成 12 片，3 行 × 4 列。
 * 每片由正统史实路径上的一个"正确选项"点亮（effect.piece = 1..12）。
 * 支线不产出碎片（基线 §11.1）。
 */
const GALLERY_TOTAL = 12;
const GALLERY_COLS = 3;   // 母图为 3 列 × 4 行（按图鉴长卷的版式）
const GALLERY_ROWS = 4;
const PIECES = Object.freeze([
  { id: 1,  name: '壮游江淮',       note: '二十而南游江、淮，上会稽，探禹穴' },
  { id: 2,  name: '父丧受命',       note: '余死，汝必为太史；为太史，无忘吾所欲论著矣' },
  { id: 3,  name: '太史令拒贿',     note: '据实掌籍，不为润笔所动' },
  { id: 4,  name: '泰山封禅直笔',   note: '随武帝东封泰山，直书其事' },
  { id: 5,  name: '朝中不结党',     note: '与清流往来，不附酷吏' },
  { id: 6,  name: '李陵出征前示忧', note: '私忧其孤军深入，预作后路之思' },
  { id: 7,  name: '朝议·为李陵辩护', note: '李陵事亲孝，与士信，临财廉，常奋不顾身以殉国家之急' },
  { id: 8,  name: '议罪·伏法认罪',   note: '诬罔主上，当死' },
  { id: 9,  name: '生死·接受宫刑',   note: '所以隐忍苟活，幽于粪土之中而不辞者，恨私心有所不尽' },
  { id: 10, name: '世态炎凉·闭门著书', note: '退而深惟，发愤著书' },
  { id: 11, name: '武帝审查·秉笔直书', note: '其文直，其事核' },
  { id: 12, name: '任安之信·发愤著书', note: '究天人之际，通古今之变，成一家之言' },
]);
const galleryCell = (piece) =>
  piece == null ? null : { row: Math.floor((piece - 1) / GALLERY_COLS), col: (piece - 1) % GALLERY_COLS };

/* ============================== 结局判定规则 ============================== */

/**
 * 每 route 一组规则：按"特异性优先"排序，末条必须无条件兜底（fallback:true）。
 * 判定只读进入该 route 时的最终数值。
 */
const RULES = Object.freeze({
  /* 判定读「本局攒下的标记」：序章的每一次取舍，都要在这里兑现。
   * truth 直笔 / favor 上意 / companion 交游 / hypocrisy 伪饰 / travel 远行 / evidence 罪证 */
  PUNISH: [
    { id: 1, test: (s) => s.jian >= 80 && s.cai < 80 && (s.flags?.truth ?? 0) >= 6 }, // 直笔贯穿，写成全书
    { id: 2, test: () => true, fallback: true },
  ],
  HIDDEN: [
    { id: 11, test: (s) => s.quan >= 80 && (s.flags?.evidence ?? 0) >= 1 }, // 夹层里的罪证留到了最后
    { id: 12, test: () => true, fallback: true },
  ],
  DIE: [
    { id: 3, test: (s) => s.ming >= 70 },
    { id: 4, test: () => true, fallback: true },
  ],
  REDEEM: [
    /* 赎死须先损名节聚财，故阈值单独校准；彻底失节者落「隐姓埋名」 */
    { id: 6, test: (s) => s.ming >= 45 },
    { id: 5, test: () => true, fallback: true },
  ],
  FLATTER: [
    { id: 7, test: (s) => s.quan >= 70 && s.ming < 40 && (s.flags?.favor ?? 0) >= 3 && (s.flags?.hypocrisy ?? 0) < 2 },
    { id: 8, test: () => true, fallback: true },
  ],
  RETIRE: [
    { id: 9, test: (s) => s.jian >= 60 && (s.flags?.travel ?? 0) >= 2 },
    { id: 10, test: () => true, fallback: true },
  ],
  BAD: [{ id: 13, test: () => true, fallback: true }],
});

/** 兜底结局的文案分档（不新增结局，只新增文本变体） */
const VARIANTS = Object.freeze({
  2: [
    { key: 'depressed', test: (s) => s.jian < 50 },
    { key: 'unfinished', test: () => true },
  ],
  4: [
    { key: 'nameless', test: (s) => s.ming >= 40 },
    { key: 'hasty', test: () => true },
  ],
  5: [
    { key: 'hermit', test: (s) => s.jian >= 50 },
    { key: 'numb', test: () => true },
  ],
  8: [
    { key: 'late', test: (s) => s.ming >= 40 },
    { key: 'fence', test: () => true },
  ],
  10: [{ key: 'default', test: () => true }],
  12: [
    { key: 'plot', test: (s) => s.quan >= 80 },
    { key: 'rash', test: () => true },
  ],
  13: [
    { key: 'prison', test: (s) => s.badCause === 'T1' },
    { key: 'court', test: (s) => s.badCause === 'T2' },
    { key: 'silkworm', test: (s) => s.badCause === 'T3' },
  ],
});

/* ============================== 一、判定 resolve ============================== */

/**
 * @param {Object} scenes   场景表 { [nodeId]: { options: Option[] } }
 * @param {Object} state    当前状态
 * @param {string} nodeId   当前节点
 * @param {string} optionId 玩家点击的选项
 * @returns {{ok:boolean, error?:string, nextNodeId?:string, endingId?:number, badCause?:string, effect?:Object}}
 */
function resolve(scenes, state, nodeId, optionId) {
  const node = scenes[nodeId];
  if (!node) return { ok: false, error: `节点不存在: ${nodeId}` };
  const opt = node.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: `选项不存在: ${nodeId}/${optionId}` };

  // 门槛：默认不可选（灰化）；配置 selectableWhenFailing 才允许冒险
  if (opt.gate && !passGate(state, opt.gate) && !opt.gate.selectableWhenFailing) {
    return { ok: false, error: 'gate_failed', gate: opt.gate };
  }
  // 门槛失败但允许冒险，且配置了 failTerminal → 直接终局（"凶多吉少"）
  if (opt.gate && !passGate(state, opt.gate) && opt.gate.selectableWhenFailing && opt.gate.failTerminal) {
    const ft = opt.gate.failTerminal;
    return { ok: true, effect: opt.effect || {}, endingId: ft.endingId, badCause: ft.cause };
  }
  // 条件性终局：如坚韧过低时选择自尽 → BAD END
  if (opt.badIf) {
    const v = state[opt.badIf.stat] ?? 0;
    const trigger =
      opt.badIf.max != null ? v <= opt.badIf.max : opt.badIf.min != null ? v >= opt.badIf.min : false;
    if (trigger) {
      return { ok: true, effect: opt.effect || {}, endingId: opt.badIf.endingId, badCause: opt.badIf.cause };
    }
  }
  // 终局优先于一切（BAD END）
  if (opt.terminal) {
    return { ok: true, effect: opt.effect, endingId: opt.terminal.endingId, badCause: opt.terminal.cause };
  }
  if (!opt.next) return { ok: false, error: `选项未配置 next/terminal: ${nodeId}/${optionId}` };
  return { ok: true, effect: opt.effect, nextNodeId: opt.next };
}

/** 当前状态下玩家能看到的选项（showIf 条件选项如隐藏线入口） */
function visibleOptions(scene, state) {
  return (scene.options || []).filter((o) => !(o.showIf && !passGate(state, o.showIf)));
}
function passGate(state, gate) {
  if (gate.stat && (state[gate.stat] ?? 0) < gate.min) return false;
  if (gate.flag && (state.flags?.[gate.flag] ?? 0) < gate.min) return false;
  return true;
}

/* ============================== 二、收集 collect ============================== */

/**
 * effect = {
 *   d?: { jian:+10, ... },           // 四维增减
 *   flags?: { hypocrisy:+1, travel:+1 }, // 标记累加
 *   piece?: 7,                       // 图鉴碎片（仅史实正确选项携带）
 *   route?: 'PUNISH',                // 切换分支
 *   badCause?: 'T2',                 // BAD 死因
 *   nodeId?: 'E03', optionId?: 'A'   // 选择历史
 * }
 */
function collect(state, effect = {}) {
  const next = {
    ...state,
    flags: { ...(state.flags || {}) },
    pieces: [...(state.pieces || [])],
    history: [...(state.history || [])],
  };
  for (const k of KEYS) {
    if (effect.d && effect.d[k]) next[k] = clamp((next[k] ?? INIT[k]) + effect.d[k]);
  }
  for (const [k, v] of Object.entries(effect.flags || {})) {
    next.flags[k] = (next.flags[k] || 0) + v;
  }
  if (effect.piece != null && !next.pieces.includes(effect.piece)) {
    next.pieces.push(effect.piece);
  }
  if (effect.route) next.route = effect.route;
  if (effect.badCause) next.badCause = effect.badCause;
  if (effect.nodeId) next.history.push({ nodeId: effect.nodeId, optionId: effect.optionId });
  return next;
}
const createState = () => ({
  ...INIT,
  flags: {},
  pieces: [],
  history: [],
  route: null,
  badCause: null,
});

/* ============================== 三、结算 settle ============================== */
function judge(state) {
  if (state.badCause) return { endingId: 13, variant: pickVariant(13, state) };
  const rules = RULES[state.route];
  if (!rules) throw new Error(`未知 route: ${state.route}`);
  for (const r of rules) if (r.test(state)) return { endingId: r.id, variant: pickVariant(r.id, state) };
  throw new Error(`判定表未覆盖分支 ${state.route} —— 数据错误`);
}
function pickVariant(endingId, state) {
  const list = VARIANTS[endingId];
  if (!list) return null;
  for (const v of list) if (v.test(state)) return v.key;
  return list[list.length - 1].key;
}

/** 人格相似度 = 100 − 四维差绝对值的平均（基线 §7） */
function similarity(state, baseline = ORTHODOX_BASELINE) {
  const sum = KEYS.reduce((acc, k) => acc + Math.abs((state[k] ?? 0) - baseline[k]), 0);
  return Math.round(100 - sum / KEYS.length);
}

/** 图鉴进度 */
function galleryProgress(state) {
  const pieces = [...new Set(state.pieces || [])].sort((a, b) => a - b);
  return {
    pieces,
    owned: pieces.length,
    total: GALLERY_TOTAL,
    complete: pieces.length === GALLERY_TOTAL,
    cells: pieces.map((p) => ({ id: p, ...galleryCell(p) })),
  };
}

/** 结算：结局页 + 个人面板所需的全部数据 */
function settle(state) {
  const { endingId, variant } = judge(state);
  const meta = ENDING_BY_ID[endingId];
  return {
    endingId,
    variant,
    name: meta.name,
    orthodox: meta.orthodox,
    radar: {
      player: Object.fromEntries(KEYS.map((k) => [k, state[k] ?? 0])),
      orthodox: { ...ORTHODOX_BASELINE },
    },
    similarity: similarity(state),
    gallery: galleryProgress(state),
    stats: Object.fromEntries(KEYS.map((k) => [k, state[k] ?? 0])),
    flags: { ...state.flags },
    history: [...state.history],
  };
}

/* ============================== 四、开发期自检 ============================== */
function validateRules() {
  const problems = [];
  const seen = new Map();

  for (const route of ROUTES) {
    const rules = RULES[route];
    if (!Array.isArray(rules) || rules.length === 0) {
      problems.push(`route ${route} 没有规则`);
      continue;
    }
    if (!rules[rules.length - 1].fallback) problems.push(`route ${route} 末条不是兜底规则`);
    rules.forEach((r, i) => {
      if (r.fallback && i !== rules.length - 1) problems.push(`route ${route} 的兜底规则不在末位`);
      if (seen.has(r.id)) problems.push(`结局 ${r.id} 重复: ${seen.get(r.id)} / ${route}`);
      seen.set(r.id, route);
    });
  }
  for (const e of ENDINGS) {
    if (!seen.has(e.id)) problems.push(`结局 ${e.id} ${e.name} 未出现在规则中`);
    else if (seen.get(e.id) !== e.route) problems.push(`结局 ${e.id} 路由不一致`);
  }
  if (seen.size !== ENDINGS.length) problems.push('规则覆盖的结局数与结局表不一致');
  return problems;
}

/**
 * 校验场景数据：史实选项必须恰好产出 1..12 号碎片、无重复、无越界。
 * 在加载场景表后调用（开发期）；线上不调用。
 */
function validatePieces(scenes) {
  const problems = [];
  const seen = new Map();
  for (const [nodeId, node] of Object.entries(scenes)) {
    for (const opt of node.options || []) {
      const p = opt.effect?.piece;
      if (p == null) continue;
      if (!Number.isInteger(p) || p < 1 || p > GALLERY_TOTAL) problems.push(`${nodeId}/${opt.id} 碎片编号越界: ${p}`);
      if (seen.has(p)) problems.push(`碎片 ${p} 重复: ${seen.get(p)} / ${nodeId}/${opt.id}`);
      seen.set(p, `${nodeId}/${opt.id}`);
    }
  }
  for (let i = 1; i <= GALLERY_TOTAL; i++) if (!seen.has(i)) problems.push(`碎片 ${i} 无量产选项`);
  return { problems, map: Object.fromEntries(seen) };
}

/** 属性供给复核：供给 ≥（最高阈值 − 初始值）× 1.2（05 §10） */
function checkSupply(supply, maxThreshold, margin = 1.2) {
  return KEYS.map((k) => {
    const need = (maxThreshold[k] - INIT[k]) * margin;
    return { key: KEYS_CN[k], supply: supply[k], need: Math.round(need), ok: supply[k] >= need };
  });
}

/* ============================== 五、最小自测 ============================== */

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('engine.js')) {
  const errs = validateRules();
  console.log(errs.length ? '规则自检失败:\n- ' + errs.join('\n- ') : '规则自检通过（13 结局、7 分支、末条兜底）');
  let s = createState();
  s = collect(s, { d: { jian: 20, ming: 10 }, piece: 1 });
  s = collect(s, { flags: { travel: 2 }, piece: 7 });
  s.route = 'RETIRE';
  const r = settle(s);
  console.log('示例结算:', JSON.stringify({ endingId: r.endingId, name: r.name, similarity: r.similarity, gallery: r.gallery }, null, 2));
}
