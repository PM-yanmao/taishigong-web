/* ===== src/ui/screens.js ===== */
/**
 * 界面模板（经典脚本，只产出 HTML 字符串，不持有业务状态）
 */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/** 场域背景映射：10 张共用图覆盖 22 页（见 docs/07-美术需求清单.md） */
var NODE_BG = {
  P1: 'bg_river', P2: 'bg_lamp', P3: 'bg_archive', P4: 'bg_road', P5: 'bg_palace',
  P6: 'bg_camp', L1: 'bg_court', L2A: 'bg_trial', L2B: 'bg_road', L2C: 'bg_lamp',
  L3: 'bg_prison', A1: 'bg_lamp', A2: 'bg_palace', A3: 'bg_lamp',
  H1: 'bg_palace', H2: 'bg_archive', B1: 'bg_lamp', B2: 'bg_river',
  C1: 'bg_lamp', C2: 'bg_lamp', D1: 'bg_execution', R1: 'bg_road',
};

function bgPath(node) {
  var name = NODE_BG[node.id];
  return name ? 'assets/bg/' + name + '.jpg' : node.art || '';
}

/** 背景图插槽：缺图时由全局 error 捕获替换为占位块 */
function artBg(path, label) {
  return '<div class="art" data-label="' + esc(label) + '"><img src="' + esc(asset(path)) + '" alt=""></div>';
}

function gateReason(opt) {
  var g = opt.gate;
  if (!g) return '';
  if (g.failTerminal) return '凶多吉少';
  if (g.stat === 'cai') return '家贫，无钱可赎';
  if (g.stat) return '需' + KEYS_CN[g.stat] + ' ≥ ' + g.min;
  if (g.flag === 'companion') return '无旧识可托';
  return '条件不足';
}

function renderOptions(node, state) {
  var html = '';
  var opts = visibleOptions(node, state);
  opts.forEach(function (o, i) {
    var ok = !o.gate || passGate(state, o.gate);
    /* 门槛不足但允许冒险的选项（如「当庭指斥酷吏（凶多吉少）」）：
     * 必须可点，点了由 engine.resolve 走 failTerminal。旧版把它一并 disabled，分支永远打不开。 */
    var risky = !ok && !!(o.gate && o.gate.selectableWhenFailing);
    var cls = 'opt' + ((!ok && !risky) ? ' locked' : '') + (risky ? ' risky' : '');
    var lock = '';
    if (!ok) {
      lock = '<span class="opt-lock' + (risky ? ' warn' : '') + '">' + esc(gateReason(o)) + '</span>';
    }
    html +=
      '<button class="' + cls + '" data-action="choose" data-opt="' + esc(o.id) + '"' +
      ((ok || risky) ? '' : ' disabled aria-disabled="true"') + '>' +
      '<span class="opt-id">' + (i + 1) + '</span>' +
      '<span class="opt-text">' + esc(o.text) + '</span>' +
      lock +
      '</button>';
  });
  return html;
}

/* ---------------- 开始界面 ---------------- */
function startScreen(db, info) {
  var runs = storeAllRuns(db);
  var last = db.activeId && db.players[db.activeId] ? db.players[db.activeId] : null;
  var canResume = !!(last && last.current);
  var st = (info && info.netStatus) || { online: false };
  var modeText = st.online && st.hasKey ? '在线生成 · ' + esc(st.model || '') : '离线剧本包';
  return (
    '<section class="screen start">' +
    artBg('assets/title.jpg', '开始界面') +
    '<div class="start-inner">' +
    '<h1 class="title">太史公</h1>' +
    '<p class="subtitle">一个人的史记，和一整个时代的选择</p>' +
    '<div class="menu">' +
    '<button class="btn primary" data-action="go-id">开始</button>' +
    (canResume
      ? '<button class="btn" data-action="resume">继续 · ' + esc(last.id) + '</button>'
      : '<button class="btn" disabled title="没有未完成的记录">继续</button>') +
    '<button class="btn" data-action="go-gallery">图鉴 ' + storePieces(db).length + '/12</button>' +
    '<button class="btn" data-action="go-characters">人物档案</button>' +
    '<button class="btn" data-action="go-leader">排行榜 · ' + runs.length + ' 次</button>' +
    '<button class="btn" data-action="go-profile">个人面板</button>' +
    '<button class="btn" data-action="go-settings">设置 · ' + modeText + '</button>' +
    '</div>' +
    '<p class="foot">一台设备，多人轮流记录。图鉴由众人合力拼全。自书之笔不计图鉴。</p>' +
    '</div>' +
    '</section>'
  );
}

/* ---------------- ID 输入（不使用原生 form 提交，避免整页刷新） ---------------- */
function idScreen() {
  return (
    '<section class="screen id">' +
    '<div class="panel">' +
    '<h2>留下你的 ID</h2>' +
    '<p class="hint">同一个 ID 再次进入，会接着你上次的记录。回车或点「进入」。</p>' +
    '<div class="id-form">' +
    '<input id="id-input" maxlength="16" placeholder="例：元封、长安客、司马门下" autofocus>' +
    '<div class="row"><button class="btn primary" type="button" data-action="enter-player">进入</button>' +
    '<button class="btn" type="button" data-action="home">返回</button></div>' +
    '</div>' +
    '<p class="err" id="id-err"></p>' +
    '</div>' +
    '</section>'
  );
}

/* ---------------- 情景页 ---------------- */
function hudHTML(state) {
  var v = state.cai;
  return (
    '<div class="hud" title="财富：显性数值">' +
    '<span class="hud-label">财富</span>' +
    '<span class="hud-bar"><i style="width:' + v + '%"></i></span>' +
    '<span class="hud-num">' + v + '</span>' +
    '</div>'
  );
}

/* 起句示例：降低空白恐惧，同时示范「什么算一行能过的输入」 */
var FREE_SAMPLES = {
  L1: ['把父亲那卷竹简收进袖中', '先看杜周的颜色再开口', '只说李陵平日为人，不判其罪'],
  L3: ['问狱吏赎钱要几时纳齐', '把那卷未写完的简要回来', '应下受刑，只求留下一支笔'],
};
function samplesHTML(nodeId) {
  var list = FREE_SAMPLES[nodeId] || [];
  if (!list.length) return '';
  return '<div class="freewrite-samples">' + list.map(function (s) {
    return '<button class="sample" data-action="free-sample" data-text="' + esc(s) + '">' + esc(s) + '</button>';
  }).join('') + '</div>';
}

function sceneScreen(node, state, extra) {
  var paras = String(node.text || '')
    .split('\n\n')
    .filter(function (s) { return s.trim(); })
    .map(function (s) { return '<p>' + esc(s.trim()) + '</p>'; })
    .join('');
  var progress = (state.history || []).length + 1;
  var ex = extra || {};
  var cfg = (typeof TSG_CONFIG !== 'undefined' && TSG_CONFIG) || { freeLimit: 3, maxChars: 40 };
  var open = (cfg.openNodes || []).indexOf(node.id) >= 0;
  var left = (typeof ex.freeLeft === 'number') ? ex.freeLeft : cfg.freeLimit;
  var free = open && !node.autoEnd
    ? '<div class="freewrite' + (left <= 0 ? ' spent' : '') + '">' +
        '<button class="freewrite-toggle" data-action="free-toggle">' +
        '或，自书一行<span class="freewrite-left">（尚余 ' + left + ' 次）</span></button>' +
        (ex.freeOpen
          ? '<div class="freewrite-body">' +
            '<p class="freewrite-hint">写你想做的动作或态度，不写结果。越出身份与制度的事也可以写——史官自会写它为何落空。</p>' +
            samplesHTML(node.id) +
            '<textarea id="free-input" maxlength="' + cfg.maxChars + '" rows="2" placeholder="一行即可……"></textarea>' +
            '<div class="freewrite-row">' +
            '<button class="btn primary" data-action="free-submit">落笔</button>' +
            '<button class="btn" data-action="free-cancel">收起</button>' +
            '</div>' +
            '<p class="freewrite-err" id="free-err"></p>' +
            '</div>'
          : '') +
        '</div>'
    : '';
  return (
    '<section class="screen scene">' +
    artBg(bgPath(node), node.title) +
    hudHTML(state) +
    '<div class="scene-inner">' +
    '<header class="scene-head">' +
    '<span class="era">' + esc(node.era || '') + '</span>' +
    '<h2>' + esc(node.title) + '</h2>' +
    '</header>' +
    '<div class="prose">' + paras + '</div>' +
    (node.autoEnd
      ? '<div class="options"><button class="btn primary" data-action="finish">继续</button></div>'
      : '<div class="options" data-count="' + visibleOptions(node, state).length + '">' +
        renderOptions(node, state) +
        '</div>') +
    free +
    '<p class="progress">第 ' + progress + ' 页</p>' +
    '</div>' +
    '</section>'
  );
}

/* ---------------- 结局页 ---------------- */
function endingScreen(result, db) {
  var t = getEndingText(result.endingId, result.variant);
  var paras = String(t.body || '')
    .split('\n\n')
    .filter(function (s) { return s.trim(); })
    .map(function (s) { return '<p>' + esc(s.trim()) + '</p>'; })
    .join('');
  var radar = TSG_Radar.buildSVG({
    player: result.radar.player,
    orthodox: result.radar.orthodox,
    similarity: result.similarity,
    size: 560,
  });
  var owned = result.gallery.owned;
  var total = result.gallery.total;
  return (
    '<section class="screen ending' + (result.orthodox ? ' orthodox' : '') + '">' +
    artBg('assets/ending/ending_' + String(result.endingId).padStart(2, '0') + '.jpg', t.title) +
    '<div class="ending-inner">' +
    '<header class="ending-head">' +
    '<span class="ending-no">结局 ' + result.endingId + (result.orthodox ? ' · 正统' : '') + '</span>' +
    '<h1>' + esc(t.title) + '</h1>' +
    '<p class="ending-sub">' + esc(t.subtitle || '') + '</p>' +
    '</header>' +
    '<div class="prose">' + paras + '</div>' +
    '<div class="radar-block">' +
    '<div class="radar-holder">' + radar + '</div>' +
    TSG_Radar.legendHTML() +
    '</div>' +
    '<div class="ending-foot">' +
    '<p class="gallery-line">图鉴收集 <b>' + owned + '</b> / ' + total +
    '（' + Math.round((owned / total) * 100) + '%）</p>' +
    '<p class="gallery-line dim">人格相似度 <b>' + result.similarity + '</b> / 100　—— 与司马迁四维的接近程度，非收集率</p>' +
    (function () {
      var names = { truth: '直笔', favor: '上意', companion: '交游', hypocrisy: '伪饰', travel: '远行', evidence: '罪证' };
      var f = result.flags || {};
      var marks = Object.keys(names).filter(function (k) { return (f[k] || 0) > 0; })
        .map(function (k) { return names[k]; }).join(' · ');
      return marks ? '<p class="gallery-line dim">本局史迹　' + esc(marks) + '</p>' : '';
    })() +
    (result.customCount ? '<p class="gallery-line dim">本局自书 <b>' + result.customCount + '</b> 次　—— 自书之笔不计图鉴，排行榜单列</p>' : '') +
    '<div class="row">' +
    '<button class="btn primary" data-action="play-again">再来一局</button>' +
    '<button class="btn" data-action="guide">攻略</button>' +
    '<button class="btn" data-action="home">回到开始</button>' +
    '</div></div>' +
    '</div>' +
    '</section>'
  );
}

/* ---------------- 人物档案 ---------------- */
function charactersScreen() {
  var cards = CHARACTERS.map(function (c) {
    return (
      '<article class="char-card">' +
      '<div class="char-thumb" data-label="' + esc(c.name) + '">' +
      '<img src="' + esc(asset(c.portrait)) + '" alt="' + esc(c.name) + '">' +
      '</div>' +
      '<div class="char-meta">' +
      '<h3>' + esc(c.name) + '</h3>' +
      '<p class="char-title">' + esc(c.title) + '</p>' +
      '<p class="char-bio">' + esc(c.bio) + '</p>' +
      '</div></article>'
    );
  }).join('');
  return (
    '<section class="screen characters">' +
    '<div class="page-inner">' +
    '<header class="page-head"><h2>人物档案</h2>' +
    '<p class="hint">你在游戏里遇见的，都是《史记》《汉书》里真实存在的人。</p></header>' +
    '<div class="char-grid">' + cards + '</div>' +
    '<div class="row"><button class="btn" data-action="home">返回</button></div>' +
    '</div></section>'
  );
}

/* ---------------- 图鉴 ---------------- */
function galleryScreen(db) {
  var ownedList = storePieces(db);
  var owned = {};
  ownedList.forEach(function (p) { owned[p] = true; });
  var cells = '';
  PIECES.forEach(function (p) {
    var has = !!owned[p.id];
    var cell = galleryCell(p.id);
    var px = (cell.col * 100) / (GALLERY_COLS - 1);
    var py = (cell.row * 100) / (GALLERY_ROWS - 1);
    var pos = 'background-position:' + px.toFixed(2) + '% ' + py.toFixed(2) + '%';
    var img = has ? 'background-image:url(&quot;' + esc(asset('assets/mural.jpg')) + '&quot;);' : '';
    cells +=
      '<div class="piece' + (has ? ' has' : '') + '" style="' + (has ? img + pos : '') + '" title="' + esc(has ? p.name : '未点亮') + '">' +
      (has ? '' : '<span class="piece-no">' + p.id + '</span>') +
      '</div>';
  });
  return (
    '<section class="screen gallery">' +
    '<div class="gallery-inner">' +
    '<header class="page-head"><h2>图鉴 · 司马迁生平图</h2>' +
    '<p class="hint">已点亮 ' + ownedList.length + ' / 12 片（' + Math.round((ownedList.length / 12) * 100) + '%）。只有答对史实选项才会点亮；众人合力方能拼全。</p></header>' +
    '<div class="mural"><div class="grid">' + cells + '</div></div>' +
    '<div class="piece-names">' +
    PIECES.map(function (p) {
      return '<span class="' + (owned[p.id] ? 'on' : 'off') + '">' + (owned[p.id] ? esc(p.name) : '？？') + '</span>';
    }).join('') +
    '</div>' +
    '<div class="row"><button class="btn" data-action="home">返回</button>' +
    '<button class="btn" data-action="export">导出存档</button>' +
    '<label class="btn file-btn">导入存档<input type="file" accept="application/json" data-action="import" hidden></label></div>' +
    '</div></section>'
  );
}

/* ---------------- 排行榜 ---------------- */
function leaderScreen(db, onlyOrthodox) {
  /* 文案承诺「按人格相似度排序」：同分再按时间倒序 */
  var runs = storeAllRuns(db)
    .filter(function (x) { return !onlyOrthodox || x.run.orthodox; })
    .sort(function (a, b) { return (b.run.similarity - a.run.similarity) || (b.run.at - a.run.at); })
    .slice(0, 50);
  var rows = runs.map(function (x, i) {
    var name = (ENDING_BY_ID[x.run.endingId] || {}).name || '？';
    var d = new Date(x.run.at);
    var date = (d.getMonth() + 1) + '/' + d.getDate();
    return (
      '<tr><td class="rank">' + (i + 1) + '</td>' +
      '<td>' + esc(x.player) + '</td>' +
      '<td>' + esc(name) + (x.run.orthodox ? ' <span class="tag">正统</span>' : '') +
        (x.run.customCount ? ' <span class="tag custom">自书 ' + x.run.customCount + '</span>' : '') + '</td>' +
      '<td class="num">' + x.run.similarity + '</td>' +
      '<td class="num">' + x.run.galleryOwned + '/12</td>' +
      '<td class="date">' + date + '</td></tr>'
    );
  }).join('');
  if (!runs.length) {
    rows = '<tr><td colspan="6" class="empty">还没有记录。去玩一局吧。</td></tr>';
  }
  return (
    '<section class="screen leader">' +
    '<div class="page-inner">' +
    '<header class="page-head"><h2>排行榜</h2>' +
    '<p class="hint">按"人格相似度"排序——与司马迁的四维之比，越接近越前。自书局单列标记。</p></header>' +
    '<div class="row"><button class="btn' + (onlyOrthodox ? ' primary' : '') + '" data-action="leader-filter">' +
      (onlyOrthodox ? '仅看正统局 · 点击显示全部' : '只看正统局') + '</button></div>' +
    '<table class="table"><thead><tr><th>#</th><th>玩家</th><th>结局</th><th>相似度</th><th>图鉴</th><th>日期</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<div class="row"><button class="btn" data-action="home">返回</button></div>' +
    '</div></section>'
  );
}

/* ---------------- 个人面板 ---------------- */
function profileScreen(db) {
  var ids = Object.keys(db.players);
  if (!ids.length) {
    return (
      '<section class="screen profile"><div class="page-inner">' +
      '<header class="page-head"><h2>个人面板</h2></header>' +
      '<p class="hint">还没有任何记录。</p>' +
      '<div class="row"><button class="btn" data-action="home">返回</button></div>' +
      '</div></section>'
    );
  }
  var active = db.players[db.activeId] ? db.activeId : ids[0];
  var p = db.players[active];
  var last = p.runs.length ? p.runs[p.runs.length - 1] : null;
  var radar = last
    ? TSG_Radar.buildSVG({ player: last.stats, orthodox: ORTHODOX_BASELINE, similarity: last.similarity, size: 520 })
    : '<p class="hint">还没有完成任何一局。</p>';
  var chips = ids.map(function (id) {
    return '<button class="chip' + (id === active ? ' on' : '') + '" data-action="profile-switch" data-id="' + esc(id) + '">' + esc(id) + '</button>';
  }).join('');
  return (
    '<section class="screen profile">' +
    '<div class="page-inner">' +
    '<header class="page-head"><h2>个人面板</h2>' +
    '<p class="hint">本机共 ' + ids.length + ' 位记录者。点击头像查看各自与司马迁的对照。</p></header>' +
    '<div class="chips">' + chips + '</div>' +
    '<div class="profile-body">' +
    '<div class="radar-holder">' + radar + '</div>' +
    '<div class="profile-meta">' +
    '<p>记录者：<b>' + esc(active) + '</b></p>' +
    '<p>完成局数：<b>' + p.runs.length + '</b></p>' +
    '<p>最近结局：<b>' + (last ? esc((ENDING_BY_ID[last.endingId] || {}).name || '？') : '—') + '</b></p>' +
    '<p>最近相似度：<b>' + (last ? last.similarity : '—') + '</b></p>' +
    '</div></div>' +
    '<div class="row"><button class="btn" data-action="home">返回</button></div>' +
    '</div></section>'
  );
}

/* ---------------- 自书生成页 ---------------- */
function generatedScreen(page, state, info) {
  var paras = String(page.text || '')
    .split('\n\n')
    .filter(function (s) { return s.trim(); })
    .map(function (s, i) { return '<p style="animation-delay:' + (0.12 + i * 0.14).toFixed(2) + 's">' + esc(s.trim()) + '</p>'; })
    .join('');
  var cites = (page.citation || []).map(function (c) {
    return '<li>' + esc(c.source) + '：' + esc(c.text) + '</li>';
  }).join('');
  var src = page.source === 'server' ? '在线生成' : '离线剧本包';
  var node = (typeof SCENES !== 'undefined' && info && SCENES[info.nodeId]) || null;
  var facts = (node && typeof TSG_ANCHORS !== 'undefined' && TSG_ANCHORS.nodeFacts[node.id]) || null;
  var inst = facts && facts.institution ? facts.institution : '';
  var over = !!page.overreach;
  /* 越界页直接把本页既有选项摆出来，玩家的「做不到」自然滑回「能做的事」 */
  var foot = (over && node)
    ? '<p class="exam-line">你面前仍只有这几件事可做。</p>' +
      '<div class="options">' + renderOptions(node, state) + '</div>'
    : '<div class="options"><button class="btn primary" data-action="generated-continue">继续</button></div>';
  return (
    '<section class="screen scene generated">' +
    artBg(page.art || 'assets/bg/bg_court.jpg', page.nodeTitle || '') +
    hudHTML(state) +
    '<div class="scene-inner">' +
    '<header class="scene-head">' +
    '<span class="era">' + esc(page.era || '') + '</span>' +
    '<h2>' + esc(page.nodeTitle || '') + '</h2>' +
    '<span class="selfmark">自书 · ' + esc(src) + '</span>' +
    '</header>' +
    '<div class="prose' + (page.noUnroll ? '' : ' unroll') + '">' + paras + '</div>' +
    '<details class="exam">' +
    '<summary>' + (over ? '史官按 · 何以做不到' : '史官按 · 本页何为史实，何为留白') + '</summary>' +
    '<p class="exam-line">' + esc(page.examNote || '') + '</p>' +
    (inst ? '<p class="exam-line">制度 · ' + esc(inst) + '</p>' : '') +
    (cites ? '<ul class="exam-cites">' + cites + '</ul>' : '') +
    '<p class="exam-foot">你自书的一行：' + esc(page.playerText || '') + '</p>' +
    '</details>' +
    foot +
    '</div></section>'
  );
}

/* ---------------- 流式：逐字落笔 ---------------- */
function streamParagraphs(text) {
  var ps = String(text || '').split('\n\n').filter(function (s) { return s.trim(); });
  if (!ps.length) return '<p><span class="caret" aria-hidden="true"></span></p>';
  return ps.map(function (s, i) {
    return '<p>' + esc(s.trim()) + (i === ps.length - 1 ? '<span class="caret" aria-hidden="true"></span>' : '') + '</p>';
  }).join('');
}

function streamingScreen(node, state, page) {
  node = node || {};
  var retrying = !!(page && page.retrying);
  return (
    '<section class="screen scene generated streaming">' +
    artBg((page && page.art) || bgPath(node), node.title || '') +
    hudHTML(state) +
    '<div class="scene-inner">' +
    '<header class="scene-head">' +
    '<span class="era">' + esc(node.era || '') + '</span>' +
    '<h2>' + esc(node.title || '') + '</h2>' +
    '<span class="selfmark">自书 · 在线生成' + (retrying ? ' · 史官复核中' : '') + '</span>' +
    '</header>' +
    '<div class="prose stream-prose" id="stream-prose">' + streamParagraphs(page && page.text) + '</div>' +
    '<p class="stream-hint" id="stream-hint">' + (retrying ? '前稿有违史实，另书一稿……' : '墨迹未干……') + '</p>' +
    '</div></section>'
  );
}

/* ---------------- 生成中 ---------------- */
function pendingScreen(node, state) {
  return (
    '<section class="screen scene pending">' +
    artBg(node ? bgPath(node) : 'assets/bg/bg_lamp.jpg', '墨迹未干') +
    '<div class="scene-inner">' +
    '<header class="scene-head"><span class="era">' + esc(node ? node.era : '') + '</span>' +
    '<h2>墨迹未干</h2></header>' +
    '<div class="prose"><p>史官正据史实，理这一行笔墨。</p></div>' +
    '</div></section>'
  );
}

/* ---------------- 设置 ---------------- */
function settingsScreen(info) {
  var st = (info && info.netStatus) || { online: false };
  var mode = (info && info.mode) || 'auto';
  var cfg = (typeof TSG_CONFIG !== 'undefined' && TSG_CONFIG) || {};
  var badge = st.online && st.hasKey
    ? '接口已连接 · 模型 ' + esc(st.model || '') + ' · 锚点库 v' + esc(st.anchors || '?')
    : (st.online ? '接口在线，但未配置 Key' : '接口未连接');
  return (
    '<section class="screen settings">' +
    '<div class="page-inner">' +
    '<header class="page-head"><h2>设置 · 生成方式</h2>' +
    '<p class="hint">复杂功能在本地接口：史实锚点库、提示词组装、会话记忆、考据日志都在服务端；浏览器只拿结果。</p></header>' +
    '<div class="set-block"><h3>接口状态</h3><p class="hint">' + badge + '</p>' +
    '<div class="row"><button class="btn" data-action="net-probe">重新探测</button></div></div>' +
    '<div class="set-block"><h3>生成模式</h3><div class="row">' +
    '<button class="btn' + (mode === 'auto' ? ' primary' : '') + '" data-action="mode-auto">自动</button>' +
    '<button class="btn' + (mode === 'pack' ? ' primary' : '') + '" data-action="mode-pack">只用离线剧本包</button>' +
    '<button class="btn' + (mode === 'server' ? ' primary' : '') + '" data-action="mode-server">只用在线生成</button>' +
    '</div><p class="hint">自动 = 接口可用就在线生成，否则回退离线包。任何失败都不会打断演示。</p></div>' +
    '<div class="set-block"><h3>落笔方式</h3><div class="row">' +
    '<button class="btn' + (cfg.stream !== false ? ' primary' : '') + '" data-action="stream-on">流式逐字</button>' +
    '<button class="btn' + (cfg.stream === false ? ' primary' : '') + '" data-action="stream-off">整页呈现</button>' +
    '</div><p class="hint">流式首字几乎立即出现；整页呈现会等模型写完再显示。两种方式都不改变史实校验与结局判定。</p></div>' +
    '<div class="set-block"><h3>接口地址</h3>' +
    '<p class="hint">留空为同源。课堂演示请直接访问 http://localhost:' + (cfg.port || 8787) + '。</p>' +
    '<div class="set-row"><input id="api-base" placeholder="http://127.0.0.1:8787" value="' + esc((cfg && cfg.apiBase) || '') + '">' +
    '<button class="btn" data-action="api-save">保存并探测</button></div>' +
    '<p class="hint">若教师机在 server/.env 里设置了 TSG_TOKEN，请在这里填同一个口令；否则在线生成会返回 401 并自动回落离线包。</p>' +
    '<div class="set-row"><input id="api-token" placeholder="课堂口令（未设置可留空）" value="' + esc((cfg && cfg.token) || '') + '">' +
    '<button class="btn" data-action="token-save">保存口令</button></div></div>' +
    '<div class="set-block"><h3>本机记录</h3>' +
    '<p class="hint">一台设备多人轮流玩时，下课前可在这里清空本机所有玩家的 ID、局数与图鉴（不可恢复）。</p>' +
    '<div class="row"><button class="btn" data-action="clear-records">清除本机记录</button></div></div>' +
    '<div class="set-block"><h3>史实边界</h3>' +
    '<p class="hint">用户可改变司马迁怎么想、怎么做、看见什么；不可改变汉代发生了什么。' +
    '自书只生成叙事正文，节点、分支、数值、13 结局与图鉴一律由原引擎裁决。' +
    '每局限 ' + (cfg.freeLimit || 3) + ' 次，仅开放朝议与生死抉择两页。</p></div>' +
    '<div class="row"><button class="btn" data-action="home">返回</button></div>' +
    '</div></section>'
  );
}
