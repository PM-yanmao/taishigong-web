/* ===== 测试用最小浏览器全局环境 =====
 * 《太史公》前端是「经典 <script>」：没有 import/export，靠全局作用域互相引用。
 * 这里用 node:vm 造一个最小 realm，按 index.html 的加载顺序把脚本执行一遍，
 * 使引擎、数据、校验层以浏览器里完全相同的方式共享全局。
 *
 * 只排除三处会真正操作 DOM 的脚本：
 *   js/ui/radar.js、js/ui/screens.js、js/app.js
 * 其余脚本（含 config/anchor/overreach/store/client）保持原顺序执行。
 *
 * 零依赖：只用 node:fs / node:path / node:vm / node:url。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/** taishigong-web/ 根目录（本文件位于 tests/helpers/） */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 与 index.html 一致的脚本顺序；跳过依赖真实 DOM 的 radar/screens/app。 */
export const CLASSIC_SCRIPT_ORDER = Object.freeze([
  'js/data/freewrite.js',
  'config.js',
  'js/data/anchors.js',
  'js/data/overreach.js',
  'js/engine.js',
  'js/data/scenes.p1.js',
  'js/data/scenes.p2.js',
  'js/data/scenes.js',
  'js/data/endings.js',
  'js/data/characters.js',
  'js/store.js',
  'js/intent.js',
  'js/guard.js',
  'js/data/genpack.js',
  'js/compose.js',
  'js/client.js',
]);

function makeStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
    setItem: (k, v) => { mem.set(String(k), String(v)); },
    removeItem: (k) => { mem.delete(String(k)); },
    clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
}

/** 最小 document/window 桩：加载的脚本在顶层不碰 DOM，桩只为防御性兜底。 */
function makeSandbox() {
  const element = () => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    addEventListener() {},
    focus() {},
  });
  return {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: element,
      createTextNode: () => ({}),
      body: element(),
      documentElement: element(),
      addEventListener() {},
      removeEventListener() {},
    },
    location: { href: 'http://localhost/', origin: 'http://localhost', search: '', hash: '' },
    navigator: { userAgent: 'node-test' },
    // 离线：任何真实网络调用直接拒绝，测试绝不出网。
    fetch: () => Promise.reject(new Error('tests must stay offline')),
  };
}

/** VM 里的对象原型与宿主不同：断言/传出前统一 JSON 归一化为普通对象。 */
export function toHost(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 载入全部经典脚本。
 * @param {{ scripts?: string[] }} [options] 可覆盖脚本列表（默认按 index.html 顺序）
 * @returns {{
 *   context: vm.Context,
 *   evaluate: (expr: string) => any,
 *   data: Object,
 *   engine: Object,
 *   globals: Object,
 *   guard: Object,
 *   intent: Object,
 *   compose: Object,
 *   overreachRules: Object[],
 *   toHost: (value: any) => any,
 * }}
 */
export function loadBrowserGlobals(options = {}) {
  const scripts = options.scripts || CLASSIC_SCRIPT_ORDER;
  const context = vm.createContext(makeSandbox(), { name: 'taishigong-classic-scripts' });
  vm.runInContext('globalThis.window = globalThis;', context);

  for (const rel of scripts) {
    const file = path.join(PROJECT_ROOT, rel);
    const code = fs.readFileSync(file, 'utf8');
    // filename 让语法/运行时错误指向具体脚本行号
    vm.runInContext(code, context, { filename: rel.replaceAll('\\', '/') });
  }

  /** 读取表达式。顶层 const/let 只存在于全局词法环境，不挂 globalThis，
   *  所以像 SCENES / START_NODE / createState 这类都用表达式读取。 */
  const evaluate = (expr) => vm.runInContext(expr, context);
  /** 读表达式并转成宿主普通对象（跨 realm 的 Object.prototype 不同）。 */
  const json = (expr) => toHost(evaluate(expr));
  /** 调用引擎里的顶层函数（function 声明挂 globalThis，const 箭头函数不挂）。 */
  const engineCall = (name) => (...args) => evaluate(name)(...args);

  const data = {
    SCENES: json('SCENES'),
    START_NODE: evaluate('START_NODE'),
    END_OF_STORY: evaluate('END_OF_STORY'),
    ENDINGS: json('ENDINGS'),
    ENDING_TEXTS: json('ENDING_TEXTS'),
    PIECES: json('PIECES'),
    GALLERY_TOTAL: evaluate('GALLERY_TOTAL'),
    GALLERY_COLS: evaluate('GALLERY_COLS'),
    GALLERY_ROWS: evaluate('GALLERY_ROWS'),
    CHARACTERS: json('CHARACTERS'),
    ROUTES: json('ROUTES'),
    INIT: json('INIT'),
    ORTHODOX_BASELINE: json('ORTHODOX_BASELINE'),
    KEYS: json('KEYS'),
    KEYS_CN: json('KEYS_CN'),
    // VARIANTS 里是函数，只取分档 key 供断言
    VARIANT_KEYS: json('Object.fromEntries(Object.entries(VARIANTS).map(function (kv) { return [kv[0], kv[1].map(function (v) { return v.key; })]; }))'),
  };

  const engine = {
    createState: engineCall('createState'),
    resolve: engineCall('resolve'),
    collect: engineCall('collect'),
    settle: engineCall('settle'),
    judge: engineCall('judge'),
    visibleOptions: engineCall('visibleOptions'),
    passGate: engineCall('passGate'),
    galleryProgress: engineCall('galleryProgress'),
    galleryCell: engineCall('galleryCell'),
    similarity: engineCall('similarity'),
    clamp: engineCall('clamp'),
    validateRules: engineCall('validateRules'),
    validatePieces: engineCall('validatePieces'),
    checkSupply: engineCall('checkSupply'),
  };

  const globals = {
    TSG_FREEWRITE: context.TSG_FREEWRITE,
    TSG_CONFIG: context.TSG_CONFIG,
    TSG_ANCHORS: context.TSG_ANCHORS,
    TSG_OVERREACH: context.TSG_OVERREACH,
    TSG_Guard: context.TSG_Guard,
    TSG_Intent: context.TSG_Intent,
    TSG_GENPACK: context.TSG_GENPACK,
    TSG_Compose: context.TSG_Compose,
    TSG_Client: context.TSG_Client,
  };

  const guard = {
    checkInput: (...a) => context.TSG_Guard.checkInput(...a),
    classifyOverreach: (...a) => context.TSG_Guard.classifyOverreach(...a),
    checkOutput: (...a) => context.TSG_Guard.checkOutput(...a),
    validateEnvelope: (...a) => context.TSG_Guard.validateEnvelope(...a),
    denyWords: (...a) => context.TSG_Guard.denyWords(...a),
  };

  const intent = {
    INTENTS: json('TSG_Intent.INTENTS'),
    classify: (...a) => context.TSG_Intent.classify(...a),
    candidates: (...a) => context.TSG_Intent.candidates(...a),
    resolveOption: (...a) => context.TSG_Intent.resolveOption(...a),
  };

  const compose = {
    build: (...a) => context.TSG_Compose.build(...a),
    buildRefusal: (...a) => context.TSG_Compose.buildRefusal(...a),
    secondPerson: (...a) => context.TSG_Compose.secondPerson(...a),
  };

  return {
    context,
    evaluate,
    json,
    data,
    engine,
    globals,
    guard,
    intent,
    compose,
    anchors: json('TSG_ANCHORS'),
    genpack: json('TSG_GENPACK'),
    overreachRules: json('TSG_OVERREACH.rules.map(function (r) { return { id: r.id, label: r.label, when: r.allowWhen || null }; })'),
    toHost,
  };
}
