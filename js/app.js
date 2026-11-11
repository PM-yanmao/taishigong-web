/* ===== src/app.js ===== */
/**
 * 主循环与路由（经典脚本）
 * 状态唯一真值：APP.state（可序列化）。所有数值变更都必须经过 engine.collect()。
 *
 * v1.1 修复：
 *   · ID 界面不再用原生 form 提交（避免 submit 未拦截导致整页刷新、回到开头）
 *   · 改为「按钮点击 + 回车」两条路径，均走 appEnterPlayer()
 *   · 全局异常兜底：任何渲染错误都会显示错误面板，而不是留白
 */
var APP = {
  screen: 'start',
  db: null,
  playerId: null,
  nodeId: null,
  state: null,
  result: null,
  /* ---- 自书 feature ---- */
  mode: 'auto',                 // auto | pack | server
  netStatus: { online: false, hasKey: false },
  sessionId: 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
  freeLeft: 3,
  freeOpen: false,
  customCount: 0,
  customHistory: [],
  usedImagery: [],
  recentTexts: [],
  generatedPage: null,
  pendingOptionId: null,
  streamText: '',
  streamRetrying: false,
  leaderOnlyOrthodox: false,
  busy: false,
};

function appBoot() {
  APP.db = storeLoad();
  APP.playerId = APP.db.activeId || null;
  var cfg = (typeof TSG_CONFIG !== 'undefined' && TSG_CONFIG) || {};
  APP.freeLeft = cfg.freeLimit || 3;
  document.documentElement.classList.add('tsg-ready');
  /* 事件处理器统一兜底：任何渲染/点击异常都变成错误面板，而不是控制台里静默失效 */
  document.addEventListener('click', function (e) {
    try { appClick(e); } catch (err) { appFail((err && err.message) || String(err)); }
  });
  document.addEventListener('keydown', appKey);
  document.addEventListener('change', appChange);
  document.addEventListener('error', appImgError, true);
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', function (ev) {
      appFail(ev && ev.message ? ev.message : '脚本错误');
    });
  }
  appRender();
  appProbe();
}

/** 探测本地接口；失败即离线剧本包模式，不打断演示 */
function appProbe() {
  if (typeof TSG_Client === 'undefined') return;
  try {
    Promise.resolve(TSG_Client.status()).then(function (s) {
      APP.netStatus = s || { online: false, hasKey: false };
      if (APP.screen === 'start' || APP.screen === 'settings') appRender();
    }).catch(function () {});
  } catch (e) {
    /* 极老浏览器没有 fetch 时：保持离线模式，不弹错误面板 */
    APP.netStatus = { online: false, hasKey: false };
  }
}

/** 当前 run 的自书计数等：随存档一起持久化，续玩不能重置上限 */
function appRunMeta() {
  return {
    freeLeft: APP.freeLeft,
    customCount: APP.customCount,
    recentTexts: APP.recentTexts.slice(-2),
    usedImagery: APP.usedImagery.slice(-6),
  };
}
function appSaveCurrent(nodeId) {
  if (APP.playerId) storeSaveCurrent(APP.db, APP.playerId, nodeId, APP.state, appRunMeta());
}

function appOnline() {
  if (APP.mode === 'pack') return false;
  if (APP.mode === 'server') return !!(APP.netStatus.online && APP.netStatus.hasKey);
  return !!(APP.netStatus.online && APP.netStatus.hasKey);
}

function appRender() {
  var host = document.getElementById('app');
  if (!host) return;
  var html;
  try {
    switch (APP.screen) {
      case 'id':
        html = idScreen();
        break;
      case 'scene':
        if (APP.nodeId && SCENES[APP.nodeId] && APP.state) {
          html = sceneScreen(SCENES[APP.nodeId], APP.state, {
            freeLeft: APP.freeLeft,
            freeOpen: APP.freeOpen,
          });
        } else {
          APP.screen = 'start';
          html = startScreen(APP.db, APP);
        }
        break;
      case 'pending':
        html = pendingScreen(SCENES[APP.nodeId], APP.state);
        break;
      case 'streaming':
        html = streamingScreen(SCENES[APP.nodeId], APP.state, {
          text: APP.streamText, retrying: APP.streamRetrying,
          art: (typeof bgPath === 'function' ? bgPath(SCENES[APP.nodeId] || {}) : ''),
        });
        break;
      case 'generated':
        html = generatedScreen(APP.generatedPage, APP.state, APP);
        break;
      case 'ending':
        html = endingScreen(APP.result, APP.db);
        break;
      case 'settings':
        html = settingsScreen(APP);
        break;
    case 'gallery':
        html = galleryScreen(APP.db);
        break;
      case 'characters':
        html = charactersScreen();
        break;
      case 'leader':
        html = leaderScreen(APP.db, APP.leaderOnlyOrthodox);
        break;
      case 'profile':
        html = profileScreen(APP.db);
        break;
      default:
        APP.screen = 'start';
        html = startScreen(APP.db, APP);
    }
  } catch (err) {
    appFail((err && err.message) || String(err));
    return;
  }
  host.innerHTML = html;
  if (APP.screen === 'id') {
    var input = document.getElementById('id-input');
    if (input) input.focus();
  }
  if (APP.screen === 'scene' && APP.freeOpen) {
    var ta = document.getElementById('free-input');
    if (ta) ta.focus();
  }
  if ((APP.screen === 'scene' || APP.screen === 'generated' || APP.screen === 'pending' || APP.screen === 'streaming') &&
      typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

function appFail(msg) {
  var host = document.getElementById('app');
  if (!host) return;
  APP.busy = false;                       // 生成中出错后不要永久锁住自书按钮
  host.innerHTML =
    '<section class="screen"><div class="panel" style="margin:12vh auto">' +
    '<h2>出了点问题</h2>' +
    '<p class="hint">' + esc(msg) + '</p>' +
    '<p class="hint">可以点下面的按钮回到开始；若反复出现，多半是本机存档损坏，可清除记录重来。</p>' +
    '<div class="row"><button class="btn" data-action="home">回到开始</button>' +
    '<button class="btn" data-action="hard-reset">清除本机记录</button></div>' +
    '</div></section>';
}

/* ---------------- 主循环动作 ---------------- */

function appResetFree() {
  var cfg = (typeof TSG_CONFIG !== 'undefined' && TSG_CONFIG) || {};
  APP.freeLeft = cfg.freeLimit || 3;
  APP.freeOpen = false;
  APP.customCount = 0;
  APP.customHistory = [];
  APP.usedImagery = [];
  APP.recentTexts = [];
  APP.generatedPage = null;
  APP.pendingOptionId = null;
  APP.streamText = '';
  APP.streamRetrying = false;
  APP.busy = false;
}

function appBeginRun() {
  APP.nodeId = START_NODE;
  APP.state = createState();
  APP.result = null;
  appResetFree();
  APP.screen = 'scene';
  appSaveCurrent(APP.nodeId);
  appRender();
}

function appResumeRun() {
  var p = APP.playerId && APP.db.players[APP.playerId];
  /* 存档节点可能因剧本改版而消失：退回重开一局，而不是卡在空白页 */
  if (!p || !p.current || !SCENES[p.current.nodeId]) return appBeginRun();
  APP.nodeId = p.current.nodeId;
  APP.state = p.current.state || createState();
  appResetFree();
  /* 恢复 run 级计数：否则「继续」会重置自书 3 次上限、清掉排行榜的自书标记 */
  var meta = p.current.meta;
  if (meta) {
    APP.freeLeft = typeof meta.freeLeft === 'number' ? meta.freeLeft : APP.freeLeft;
    APP.customCount = meta.customCount || 0;
    APP.recentTexts = Array.isArray(meta.recentTexts) ? meta.recentTexts.slice(-2) : [];
    APP.usedImagery = Array.isArray(meta.usedImagery) ? meta.usedImagery.slice(-6) : [];
  }
  APP.screen = 'scene';
  appRender();
}

function appEnterPlayer() {
  var input = document.getElementById('id-input');
  var res = storeEnter(APP.db, input ? input.value : '');
  var err = document.getElementById('id-err');
  if (!res.ok) {
    if (err) err.textContent = res.error;
    return;
  }
  APP.playerId = APP.db.activeId;
  if (res.player.current) return appResumeRun();
  return appBeginRun();
}

function appChoose(optId, opts) {
  var node = SCENES[APP.nodeId];
  if (!node || !APP.state) return;
  var o = opts || {};
  try {
    var r = resolve(SCENES, APP.state, APP.nodeId, optId);
    if (!r.ok) return;
    var effect = Object.assign({}, r.effect || {});
    /* 自书自动承接的选项：照常推进分支与数值，但不点亮图鉴
     *（攻略与页面文案都承诺「自书之笔不产出碎片」）。 */
    if (o.skipPiece) delete effect.piece;
    APP.state = collect(APP.state, Object.assign(effect, {
      nodeId: APP.nodeId,
      optionId: optId,
      badCause: r.badCause,
    }));

    /* 存档必须指向"下一步要显示的节点"。
     * v1.2：旧版在推进前存当前节点，导致「继续」从已答过的一页重开，
     * 可反复重答同一选项刷数值/碎片。这里先算下一步再落盘。 */
    if (r.endingId || r.nextNodeId === END_OF_STORY) return appFinish();

    var next = SCENES[r.nextNodeId];
    if (!next) return appFinish();
    APP.nodeId = r.nextNodeId;
    appSaveCurrent(APP.nodeId);
    if (next.autoEnd) return appRender();
    APP.screen = 'scene';
    appRender();
  } catch (err) {
    appFail((err && err.message) || String(err));
  }
}

function appFinish() {
  APP.result = settle(APP.state);
  APP.result.customCount = APP.customCount;
  if (APP.playerId && APP.db.players[APP.playerId]) {
    storeSaveRun(APP.db, APP.playerId, {
      endingId: APP.result.endingId,
      variant: APP.result.variant,
      similarity: APP.result.similarity,
      stats: APP.result.stats,
      pieces: APP.result.gallery.pieces,
      galleryOwned: APP.result.gallery.owned,
      orthodox: APP.result.orthodox,
      customCount: APP.customCount,
      at: Date.now(),
    });
  }
  APP.screen = 'ending';
  appRender();
}

/* ---------------- 自书：意图归一 → 生成 → 引擎裁决 ----------------
 * 关键：生成物只是一页正文，绝不写 state。
 * 点击「继续」后仍调用 appChoose(既有选项 id)，
 * 于是 resolve / collect / settle 与 13 结局体系完全不变。 */

function appStateBands() {
  var s = APP.state || {};
  function band(v) { v = v == null ? 50 : v; return v >= 75 ? '高' : v >= 45 ? '中' : '低'; }
  return { jian: band(s.jian), ming: band(s.ming), cai: band(s.cai), quan: band(s.quan) };
}

function appFreeError(msg) {
  var el = document.getElementById('free-err');
  if (el) el.textContent = msg;
}

function appHome() {
  APP.screen = 'start';
  appRender();
}

/** 生成页面 → 下一节点。 */
function appFreeWrite(text) {
  if (APP.busy) return;
  var cfg = (typeof TSG_CONFIG !== 'undefined' && TSG_CONFIG) || {};
  var node = SCENES[APP.nodeId];
  if (!node) return;
  if ((cfg.openNodes || []).indexOf(APP.nodeId) < 0) return appFreeError('此页尚不可自书。');

  var chk = TSG_Guard.checkInput(text, { nodeId: APP.nodeId, state: APP.state });
  if (!chk.ok) return appFreeError(chk.reason);
  var hint = chk.hint || null;              // 词表只给提示，不再替模型下结论
  if (APP.freeLeft <= 0) return appFreeError('本局自书已用尽。');

  var online = appOnline();
  /* 在线：能不能做到，交给模型读制度自行判断；
   * 离线：没有模型，词表命中才退回预制否定段兜底。 */
  var over = online ? null : hint;
  var cls = over ? { intent: 'REFUSAL', label: over.label } : TSG_Intent.classify(text);
  var nextOptionId = over ? '' : TSG_Intent.resolveOption(node, APP.state, text, cls.matched === false ? '' : cls.intent);
  if (!over && !nextOptionId) return appFreeError('此页没有可承接的走向，请直接选一项。');

  APP.busy = true;
  APP.freeOpen = false;
  APP.pendingOptionId = nextOptionId;
  APP.streamText = '';
  APP.streamRetrying = false;
  var useStream = online && cfg.stream !== false;
  APP.screen = 'pending';
  appRender();

  var payload = {
    sessionId: APP.sessionId,
    nodeId: APP.nodeId,
    nodeTitle: node.title,
    era: node.era,
    sceneText: node.text,
    text: String(text).trim(),
    intent: cls.intent,
    intentLabel: cls.label,
    hint: hint ? { id: hint.id, label: hint.label } : null,
    nextOptionId: nextOptionId,
    stateBands: appStateBands(),
    recentTexts: APP.recentTexts.slice(-2),
    usedImagery: APP.usedImagery.slice(-6),
  };

  var pack = function (reason) {
    /* 离线、或在线失败回退时：词表命中的越界一律走预制否定段，避免被当成正常动作生成 */
    var o = over || hint;
    var data = o
      ? TSG_Compose.buildRefusal({ overreachId: o.id, nodeId: payload.nodeId })
      : TSG_Compose.build({
          text: payload.text,
          intent: cls.intent,
          nodeId: payload.nodeId,
          nextOptionId: nextOptionId,
          toneSeed: APP.customCount + APP.sessionId.length,
          usedImagery: APP.usedImagery,
        });
    if (data) appShowGenerated(data, payload, cls, reason, false, o);
  };

  if (!appOnline()) return pack('pack');

  /* 在线且支持流：立刻切到逐字页，首字到达时间通常远早于整段完成 */
  if (useStream && typeof TSG_Client.generateStream === 'function') {
    APP.screen = 'streaming';
    appRender();
    TSG_Client.generateStream(payload, {
      onDelta: function (t) { APP.streamText = t; appUpdateStream(t); },
      onRetry: function () {
        APP.streamRetrying = true;
        APP.streamText = '';
        appUpdateStream('');
        var hint = document.getElementById('stream-hint');
        if (hint) hint.textContent = '前稿有违史实，另书一稿……';
        var mark = document.querySelector && document.querySelector('.streaming .selfmark');
        if (mark) mark.textContent = '自书 · 在线生成 · 史官复核中';
      },
      onFallback: function () {},
      onError: function () {},
    }).then(function (data) {
      if (!data) return pack('stream-fallback');
      var out = TSG_Guard.checkOutput(data.text, payload);
      var env = TSG_Guard.validateEnvelope(data);
      if (!out.ok || !env.ok) return pack('guard');
      data.source = 'server';
      appShowGenerated(data, payload, cls, null, true, over);
    });
    return;
  }

  /* 非流式兜底（关闭 stream、浏览器不支持 ReadableStream 等） */
  TSG_Client.generate(payload).then(function (data) {
    var out = TSG_Guard.checkOutput(data.text, payload);
    var env = TSG_Guard.validateEnvelope(data);
    if (!out.ok || !env.ok) return pack('guard');
    data.source = 'server';
    appShowGenerated(data, payload, cls, null, false, over);
  }).catch(function () { pack('error'); });
}

function appUpdateStream(text) {
  if (APP.screen !== 'streaming') return;
  var el = document.getElementById('stream-prose');
  if (el && typeof streamParagraphs === 'function') el.innerHTML = streamParagraphs(text);
}

function appShowGenerated(data, payload, cls, fallbackReason, alreadyStreamed, over) {
  var isOver = !!over || !!data.overreach;
  var node = SCENES[APP.nodeId] || {};
  APP.generatedPage = {
    noUnroll: !!alreadyStreamed,
    overreach: isOver,
    text: data.text,
    citation: data.citation || [],
    examNote: data.examNote || '',
    source: data.source || 'pack',
    playerText: payload.text,
    nodeTitle: node.title,
    era: node.era,
    art: (typeof bgPath === 'function' ? bgPath(node) : ''),
  };
  APP.recentTexts.push(String(data.text || '').slice(0, 260));
  if (APP.recentTexts.length > 2) APP.recentTexts.shift();
  if (data.imagery) APP.usedImagery.push(data.imagery);
  /* 三次限制对所有自书一视同仁，越界也不例外；越界只不自动推进剧情 */
  if (isOver) APP.pendingOptionId = null;
  APP.customHistory.push({
    nodeId: payload.nodeId, text: payload.text, intent: cls.intent,
    source: APP.generatedPage.source, fallback: fallbackReason || null,
    overreach: isOver ? (data.overreach || (over && over.id) || null) : null,
  });
  APP.customCount += 1;
  APP.freeLeft = Math.max(0, APP.freeLeft - 1);
  APP.busy = false;
  APP.screen = 'generated';
  /* 立刻落盘：否则在生成页直接关页面，重进后自书次数会回到扣减前 */
  appSaveCurrent(APP.nodeId);
  appRender();
}

function appGeneratedContinue() {
  var opt = APP.pendingOptionId;
  APP.pendingOptionId = null;
  APP.generatedPage = null;
  APP.screen = 'scene';
  /* 自书自动承接既有选项：推进分支与数值，但这一笔不点亮图鉴 */
  if (opt) return appChoose(opt, { skipPiece: true });
  appRender();
}

/* ---------------- 事件 ---------------- */

function appClick(e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
  if (!el) return;
  var action = el.getAttribute('data-action');

  if (action === 'choose') {
    if (el.disabled) return;
    return appChoose(el.getAttribute('data-opt'));
  }
  switch (action) {
    case 'go-id':
      APP.screen = 'id';
      return appRender();
    case 'enter-player':
      return appEnterPlayer();
    case 'resume':
      return appResumeRun();
    case 'home':
      return appHome();
    case 'go-gallery':
      APP.screen = 'gallery';
      return appRender();
    case 'go-characters':
      APP.screen = 'characters';
      return appRender();
    case 'go-leader':
      APP.screen = 'leader';
      return appRender();
    case 'go-profile':
      APP.screen = 'profile';
      return appRender();
    case 'profile-switch':
      APP.db.activeId = el.getAttribute('data-id');
      APP.playerId = APP.db.activeId;          // 同步当前玩家，避免「继续」接上别人的存档
      storeSave(APP.db);
      return appRender();
    case 'play-again':
      return appBeginRun();
    case 'finish':
      return appFinish();
    case 'export':
      return storeExport(APP.db);
    case 'guide':
      tsgOpenGuide();
      return;
    /* ---- 自书 feature ---- */
    case 'free-toggle':
      if (APP.freeLeft <= 0) return;
      APP.freeOpen = !APP.freeOpen;
      return appRender();
    case 'free-cancel':
      APP.freeOpen = false;
      return appRender();
    case 'free-submit': {
      var ta = document.getElementById('free-input');
      return appFreeWrite(ta ? ta.value : '');
    }
    case 'free-sample': {
      /* 起句示例：点一下填进输入框，玩家可改可删再落笔 */
      var taSample = document.getElementById('free-input');
      if (taSample) {
        taSample.value = el.getAttribute('data-text') || '';
        taSample.focus();
      }
      return;
    }
    case 'generated-continue':
      return appGeneratedContinue();
    case 'go-settings':
      APP.screen = 'settings';
      return appRender();
    case 'net-probe':
      return appProbe();
    case 'mode-auto':
    case 'mode-pack':
    case 'mode-server':
      APP.mode = action.slice(5);
      return appRender();
    case 'stream-on':
    case 'stream-off':
      if (typeof TSG_CONFIG !== 'undefined') TSG_CONFIG.stream = action === 'stream-on';
      return appRender();
    case 'api-save': {
      var ab = document.getElementById('api-base');
      var val = ab ? String(ab.value || '').trim().replace(/\/$/, '') : '';
      if (typeof TSG_CONFIG !== 'undefined') TSG_CONFIG.apiBase = val;
      try { sessionStorage.setItem('tsg:apiBase', val); } catch (e) {}
      APP.apiBase = val;
      return appProbe();
    }
    case 'token-save': {
      var tb = document.getElementById('api-token');
      var tk = tb ? String(tb.value || '').trim() : '';
      if (typeof TSG_CONFIG !== 'undefined') TSG_CONFIG.token = tk;
      try { sessionStorage.setItem('tsg:token', tk); } catch (e) {}
      return appProbe();
    }
    case 'clear-records': {
      if (!window.confirm('清除本机全部记录？所有玩家的 ID、局数、图鉴都会删除，无法恢复。')) return;
      storeClear();
      APP.db = storeEmpty();
      APP.playerId = null;
      APP.result = null;
      APP.nodeId = null;
      APP.state = null;
      return appHome();
    }
    case 'hard-reset': {
      storeClear();
      APP.db = storeEmpty();
      APP.playerId = null;
      APP.result = null;
      APP.nodeId = null;
      APP.state = null;
      APP.busy = false;
      return appHome();
    }
    case 'leader-filter':
      APP.leaderOnlyOrthodox = !APP.leaderOnlyOrthodox;
      return appRender();
  }
}

function appChange(e) {
  var t = e.target;
  if (!t || t.getAttribute('data-action') !== 'import' || !t.files || !t.files[0]) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var db = storeImport(APP.db, String(reader.result));
      APP.db = db;
      APP.playerId = db.activeId || null;
      storeSave(db);
      APP.screen = 'start';
      appRender();
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  };
  reader.readAsText(t.files[0]);
}

function appKey(e) {
  var tag = e.target && e.target.tagName;
  var typing = tag === 'TEXTAREA' || tag === 'INPUT';
  if (APP.screen === 'id' && e.key === 'Enter') return appEnterPlayer();
  if (typing && e.key === 'Enter' && tag === 'TEXTAREA' && APP.freeOpen) {
    e.preventDefault();
    var ta = document.getElementById('free-input');
    return appFreeWrite(ta ? ta.value : '');
  }
  if (typing) return;

  if (APP.screen === 'scene' && /^[1-9]$/.test(e.key)) {
    var node = SCENES[APP.nodeId];
    if (!node) return;
    var opts = visibleOptions(node, APP.state);
    var opt = opts[Number(e.key) - 1];
    var usable = !!opt && (!opt.gate || passGate(APP.state, opt.gate) || opt.gate.selectableWhenFailing);
    if (usable) appChoose(opt.id);
    return;
  }
  if (e.key === 'Enter' && APP.screen === 'generated') return appGeneratedContinue();
  if (e.key === 'Escape' && APP.screen !== 'start') {
    if (APP.busy) return;                       // 生成中不打断
    APP.screen = 'start';
    return appRender();
  }
}

/** 站点版：图片为真实相对路径，无需 base64 映射 */
function asset(p) { return p; }

/** 图片缺失 → 占位块（全局委托，只绑一次） */
function appImgError(e) {
  var img = e.target;
  if (!img || img.tagName !== 'IMG') return;
  var box = (img.closest && (img.closest('.art') || img.closest('.char-thumb'))) || null;
  if (box) {
    box.classList.add('missing');
    img.remove();
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', appBoot);
  else appBoot();
}

/* 调试/冒烟测试入口（生产环境无副作用） */
if (typeof globalThis !== 'undefined') {
  globalThis.TSG_DEBUG = {
    APP: APP,
    boot: appBoot,
    begin: appBeginRun,
    choose: appChoose,
    finish: appFinish,
    click: appClick,
    key: appKey,
    enterPlayer: appEnterPlayer,
    enter: function (id) {
      var r = storeEnter(APP.db, id);
      APP.playerId = APP.db.activeId;
      return r;
    },
    pieces: function () { return storePieces(APP.db); },
    runs: function () { return storeAllRuns(APP.db); },
    resume: appResumeRun,
  };
}


/* ============================================================
   结局页 · 攻略
   内容由 SCENES / PIECES 实时生成，与剧本数据同源，不会走样。
   ============================================================ */
var tsgGuideOpenedAt = 0;

function tsgGuideExists() {
  return !!document.getElementById('tsg-guide');
}

/** 扫一遍剧本，按碎片编号 1..12 取出对应的场景与史实选项 */
function tsgGuideRowsHTML() {
  var out = [];
  for (var i = 1; i <= GALLERY_TOTAL; i++) {
    var hit = null;
    for (var nid in SCENES) {
      var node = SCENES[nid];
      var opts = (node && node.options) || [];
      for (var k = 0; k < opts.length; k++) {
        var ef = opts[k].effect;
        if (ef && ef.piece === i) { hit = { node: node, opt: opts[k] }; break; }
      }
      if (hit) break;
    }
    if (!hit) continue;
    var pc = PIECES[i - 1] || {};
    out.push(
      '<div class="tsg-g-row">' +
      '<div class="tsg-g-no">' + String(i).padStart(2, '0') + '</div>' +
      '<div class="tsg-g-scene">' + esc(hit.node.title) + '</div>' +
      '<div class="tsg-g-pick">' + esc(String(hit.opt.id)) + '</div>' +
      '<div class="tsg-g-text">' + esc(hit.opt.text) + '</div>' +
      '<div class="tsg-g-piece">图鉴 ' + esc(pc.name || '') + '</div>' +
      '</div>'
    );
  }
  return out.join('');
}

function tsgGuideHTML() {
  return (
    '<div class="tsg-guide-box">' +
    '<div class="tsg-guide-head">' +
    '<h3>攻略 · 史实线十二步</h3>' +
    '<span>史实线 · 十二片</span>' +
    '</div>' +
    '<p class="tsg-guide-sub">只有下列选项会点亮图鉴，走支线不产出碎片。走满这十二步，即为结局一「史家绝唱」，图鉴 12 / 12。</p>' +
    tsgGuideRowsHTML() +
    '<div class="tsg-guide-foot">' +
    '结局一的判定：受刑线，<b>坚韧 ≥ 80</b> 且 <b>财富 &lt; 80</b>。<br>' +
    '十二步里只有第 6 步（李陵出征前）的正解是 <b>C</b>，其余皆为首项——最容易漏的就是这一处。<br>' +
    '自书之笔只生成正文，不产出碎片，也不计入这十二步。<br>' +
    '点按空白处或按 Esc 关闭。' +
    '</div>' +
    '<div class="tsg-guide-close">' +
    '<button class="btn" data-action="guide-close">收起</button>' +
    '</div>' +
    '</div>'
  );
}

function tsgOpenGuide() {
  if (tsgGuideExists()) return;
  var box = document.createElement('div');
  box.id = 'tsg-guide';
  box.innerHTML = tsgGuideHTML();
  box.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-action="guide-close"]') : null;
    if (btn) { tsgCloseGuide(); return; }
    if (ev.target === box && Date.now() - tsgGuideOpenedAt > 120) tsgCloseGuide();
  });
  document.body.appendChild(box);
  tsgGuideOpenedAt = Date.now();
}

function tsgCloseGuide() {
  var box = document.getElementById('tsg-guide');
  if (box && box.parentNode) box.parentNode.removeChild(box);
}

document.addEventListener('keydown', function (ev) {
  if (ev && ev.key === 'Escape' && tsgGuideExists()) tsgCloseGuide();
}, true);
