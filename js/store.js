/* ===== src/store.js ===== */
/**
 * 本机记录存储（经典脚本）
 * 一台设备多人轮流玩：按 ID 分桶，全部存 localStorage，可导出/导入 JSON。
 *
 * v1.2：导入/读取一律过白名单清洗（防坏档白屏与 SVG/XSS 注入），
 *       并新增「清除本机记录」；续玩还需保存 run 级计数（自书次数等）。
 */
var STORE_KEY = 'tsg:records:v1';
var STORE_MEM = null;

var STORE_STATS = ['jian', 'ming', 'cai', 'quan'];
var STORE_ROUTES = ['PUNISH', 'HIDDEN', 'DIE', 'REDEEM', 'FLATTER', 'RETIRE', 'BAD'];

function storeEmpty() {
  return { version: 1, activeId: null, players: {} };
}

function storeInt(v, min, max, dflt) {
  var n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  n = Math.round(n);
  return Math.min(max, Math.max(min, n));
}
function storeStr(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').slice(0, max || 16);
}
function storeStats(src) {
  var out = {};
  STORE_STATS.forEach(function (k) { out[k] = storeInt(src && src[k], 0, 100, 50); });
  return out;
}
function storeFlags(src) {
  var out = {};
  if (!src || typeof src !== 'object') return out;
  Object.keys(src).slice(0, 20).forEach(function (k) {
    if (!/^[a-z][a-z0-9_]{0,15}$/.test(k)) return;
    out[k] = storeInt(src[k], 0, 999, 0);
  });
  return out;
}
function storePieceList(src) {
  var seen = {}, out = [];
  (Array.isArray(src) ? src : []).forEach(function (p) {
    var n = storeInt(p, 1, 12, 0);
    if (n && !seen[n]) { seen[n] = 1; out.push(n); }
  });
  return out.sort(function (a, b) { return a - b; });
}
function storeState(src) {
  if (!src || typeof src !== 'object') return createState();
  var st = createState();
  STORE_STATS.forEach(function (k) { st[k] = storeInt(src[k], 0, 100, 50); });
  st.flags = storeFlags(src.flags);
  st.pieces = storePieceList(src.pieces);
  st.history = (Array.isArray(src.history) ? src.history : []).slice(-64).map(function (h) {
    return { nodeId: storeStr(h && h.nodeId, 8), optionId: storeStr(h && h.optionId, 8) };
  });
  st.route = STORE_ROUTES.indexOf(src.route) >= 0 ? src.route : null;
  st.badCause = src.badCause ? storeStr(src.badCause, 8) : null;
  return st;
}
function storeMeta(src) {
  if (!src || typeof src !== 'object') return null;
  return {
    freeLeft: storeInt(src.freeLeft, 0, 99, 3),
    customCount: storeInt(src.customCount, 0, 999, 0),
    recentTexts: (Array.isArray(src.recentTexts) ? src.recentTexts : []).slice(-2).map(function (t) { return storeStr(t, 260); }),
    usedImagery: (Array.isArray(src.usedImagery) ? src.usedImagery : []).slice(-6).map(function (t) { return storeStr(t, 8); }),
  };
}

/** 读档 → 白名单清洗；坏档不会再把页面顶成白屏 */
function storeLoad() {
  var raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) {}
  if (!raw) return STORE_MEM ? storeNormalize(STORE_MEM) : storeEmpty();
  try {
    return storeNormalize(JSON.parse(raw));
  } catch (e) {
    return storeEmpty();
  }
}

function storeNormalize(db) {
  if (!db || typeof db !== 'object' || db.version !== 1 ||
      !db.players || typeof db.players !== 'object' || Array.isArray(db.players)) return storeEmpty();
  var out = storeEmpty();
  Object.keys(db.players).slice(0, 200).forEach(function (rawId) {
    var src = db.players[rawId];
    if (!src || typeof src !== 'object') return;
    var id = storeStr(src.id || rawId, 16);
    if (!id) return;
    var player = { id: id, created: storeInt(src.created, 0, 9e15, 0), runs: [], current: null };
    (Array.isArray(src.runs) ? src.runs : []).slice(-200).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var endingId = storeInt(r.endingId, 1, 13, 1);
      player.runs.push({
        endingId: endingId,
        variant: r.variant ? storeStr(r.variant, 16) : null,
        similarity: storeInt(r.similarity, -100, 200, 0),
        stats: storeStats(r.stats),
        pieces: storePieceList(r.pieces),
        galleryOwned: storeInt(r.galleryOwned, 0, 12, 0),
        orthodox: r.orthodox === true,
        customCount: storeInt(r.customCount, 0, 999, 0),
        at: storeInt(r.at, 0, 9e15, 0),
      });
    });
    var cur = src.current;
    if (cur && typeof cur === 'object' && typeof cur.nodeId === 'string') {
      player.current = { nodeId: storeStr(cur.nodeId, 8), state: storeState(cur.state), meta: storeMeta(cur.meta) };
    }
    out.players[id] = player;
  });
  out.activeId = out.players[db.activeId] ? db.activeId : null;
  return out;
}

function storeSave(db) {
  STORE_MEM = db;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    /* 隐私模式或配额不足：退回内存，靠导出兜底 */
  }
}

/** 清除本机全部记录（共享设备下课前用） */
function storeClear() {
  STORE_MEM = null;
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
}

function storeEnter(db, rawId) {
  var id = storeStr(rawId, 16).trim();
  if (!id) return { ok: false, error: '请输入 ID' };
  if (!db.players[id]) {
    db.players[id] = { id: id, created: Date.now(), runs: [], current: null };
  }
  db.activeId = id;
  storeSave(db);
  return { ok: true, player: db.players[id] };
}

function storeSaveRun(db, id, run) {
  var p = db.players[id];
  if (!p) return;
  p.runs.push(run);
  p.current = null;
  storeSave(db);
}

/** nodeId 必须是「下一步要显示的节点」；meta 保存自书次数等 run 级计数 */
function storeSaveCurrent(db, id, nodeId, state, meta) {
  var p = db.players[id];
  if (!p) return;
  p.current = { nodeId: nodeId, state: state, meta: meta || null };
  storeSave(db);
}

function storeAllRuns(db) {
  var out = [];
  Object.keys(db.players).forEach(function (id) {
    var p = db.players[id];
    (p.runs || []).forEach(function (r) {
      out.push({ player: id, run: r });
    });
  });
  return out.sort(function (a, b) { return b.run.at - a.run.at; });
}

function storePieces(db) {
  var set = {};
  Object.keys(db.players).forEach(function (id) {
    (db.players[id].runs || []).forEach(function (r) {
      (r.pieces || []).forEach(function (p) { set[p] = true; });
    });
  });
  return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
}

function storeExport(db) {
  var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'taishigong-save-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  /* 立即 revoke 会让部分浏览器下载失败；留 1.2s 再回收 */
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
}

/** 导入：先解析，再走与读档相同的白名单清洗 */
function storeImport(db, text) {
  var data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('不是合法的 JSON 文件'); }
  if (!data || data.version !== 1 || !data.players) throw new Error('存档格式不正确');
  var clean = storeNormalize(data);
  if (!Object.keys(clean.players).length) throw new Error('存档里没有可用的玩家记录');
  return clean;
}
