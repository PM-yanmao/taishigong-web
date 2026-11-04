/* ===== src/store.js ===== */
/**
 * 本机记录存储（经典脚本）
 * 一台设备多人轮流玩：按 ID 分桶，全部存 localStorage，可导出/导入 JSON。
 */
var STORE_KEY = 'tsg:records:v1';
var STORE_MEM = null;

function storeEmpty() {
  return { version: 1, activeId: null, players: {} };
}

function storeLoad() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return STORE_MEM || storeEmpty();
    var db = JSON.parse(raw);
    if (!db || db.version !== 1) return storeEmpty();
    return db;
  } catch (e) {
    return STORE_MEM || storeEmpty();
  }
}

function storeSave(db) {
  STORE_MEM = db;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    /* 隐私模式或配额不足：退回内存，靠导出兜底 */
  }
}

function storeEnter(db, rawId) {
  var id = String(rawId || '').trim().slice(0, 16);
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

function storeSaveCurrent(db, id, nodeId, state) {
  var p = db.players[id];
  if (!p) return;
  p.current = { nodeId: nodeId, state: state };
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
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function storeImport(db, text) {
  var data = JSON.parse(text);
  if (!data || data.version !== 1 || !data.players) throw new Error('存档格式不正确');
  return data;
}
