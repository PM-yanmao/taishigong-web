/* ===== 本地接口客户端 =====
 * 只负责探测与一次 /api/generate 调用；Key 永远不进浏览器。
 * 任何失败都由 app.js 回退到离线剧本包，课堂演示不中断。 */
(function (g) {
  function base() {
    var c = g.TSG_CONFIG || {};
    return String(c.apiBase || '').replace(/\/$/, '');
  }
  function headers(extra) {
    var c = g.TSG_CONFIG || {};
    var h = { 'Content-Type': 'application/json' };
    if (c.token) h['X-TSG-Token'] = String(c.token);
    return Object.assign(h, extra || {});
  }

  function request(path, opts, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 5000);
    var init = Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {});
    return fetch(base() + path, init).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) {
        var err = new Error('HTTP ' + r.status);
        err.status = r.status;                 // 让上层区分 401（要口令）与普通失败
        throw err;
      }
      return r.json();
    }).catch(function (e) { clearTimeout(timer); throw e; });
  }

  function status() {
    var c = g.TSG_CONFIG || {};
    return request('/api/health', { method: 'GET' }, c.statusTimeoutMs || 1800)
      .then(function (j) { return { online: true, model: j.model, hasKey: !!j.hasKey, hasToken: !!j.hasToken, anchors: j.anchors }; })
      .catch(function () { return { online: false, model: null, hasKey: false, hasToken: false, anchors: null }; });
  }

  function generate(payload) {
    var c = g.TSG_CONFIG || {};
    return request('/api/generate', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    }, c.timeoutMs || 15000).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || '生成失败');
      return j.data;
    });
  }

  /** SSE 流式：返回 Promise<完整 envelope | null>；null 表示应回退离线剧本包。
   *  handlers: onDelta(text), onRetry(violations), onFallback(info), onError(err) */
  function generateStream(payload, handlers) {
    var c = g.TSG_CONFIG || {};
    var h = handlers || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, c.streamTimeoutMs || 32000);
    var done = function (v) { clearTimeout(timer); return v; };
    var init = { method: 'POST', headers: headers(), body: JSON.stringify(payload) };
    if (ctrl) init.signal = ctrl.signal;

    return fetch(base() + '/api/generate-stream', init).then(function (r) {
      if (!r.ok) {
        var err = new Error('HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      if (!r.body || !r.body.getReader || typeof TextDecoder === 'undefined') throw new Error('stream unsupported');
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
      function pump() {
        return reader.read().then(function (x) {
          if (x.done) return done(null);
          buf = (buf + dec.decode(x.value, { stream: true })).replace(/\r\n/g, '\n');
          var idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            var frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            var ev = 'message', data = null;
            frame.split('\n').forEach(function (line) {
              if (line.indexOf('event:') === 0) ev = line.slice(6).trim();
              else if (line.indexOf('data:') === 0) data = line.slice(5).trim();
            });
            if (!data) continue;                       // ': keep-alive' 注释帧
            var j;
            try { j = JSON.parse(data); } catch (e) { continue; }
            if (ev === 'delta') { if (h.onDelta) h.onDelta(j.text || ''); }
            else if (ev === 'retry') { if (h.onRetry) h.onRetry(j.violations || []); }
            else if (ev === 'done') return done(j.data || null);
            else if (ev === 'fallback') { if (h.onFallback) h.onFallback(j); return done(null); }
          }
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      clearTimeout(timer);
      if (h.onError) h.onError(e);
      return null;
    });
  }

  g.TSG_Client = { base: base, status: status, generate: generate, generateStream: generateStream };
})(typeof globalThis !== 'undefined' ? globalThis : this);
