/* 《太史公》站点配置
 * apiBase 为空 = 同源（课堂演示直接开 http://localhost:8787，最佳路径）。
 * 从 GitHub Pages 打开时同源没有 /api，前端会自动降级为离线剧本包模式。
 * 若确实要从 https 页面调本机接口，可在设置页填 http://127.0.0.1:8787；
 * 注意浏览器对 https → http 的混合内容限制，各浏览器行为不一致。 */
(function (g) {
  var saved = '', token = '';
  try {
    saved = (g.sessionStorage && g.sessionStorage.getItem('tsg:apiBase')) || '';
    token = (g.sessionStorage && g.sessionStorage.getItem('tsg:token')) || '';
  } catch (e) {}
  /* 课堂口令也可以走 URL：?token=xxx（存进 sessionStorage 后从地址栏抹掉） */
  try {
    var m = /[?&]token=([^&]+)/.exec((g.location && g.location.search) || '');
    if (m) {
      token = decodeURIComponent(m[1]);
      g.sessionStorage && g.sessionStorage.setItem('tsg:token', token);
      if (g.history && g.history.replaceState) {
        g.history.replaceState(null, '', (g.location.pathname || '/') + (g.location.hash || ''));
      }
    }
  } catch (e) {}
  /* 自书开放范围与字数由 js/data/freewrite.js 单点定义（服务端读同一份） */
  var F = g.TSG_FREEWRITE || {};
  g.TSG_CONFIG = {
    apiBase: saved,
    token: token,
    port: 8787,
    freeLimit: F.perRun || 3,
    minChars: F.minChars || 4,
    maxChars: F.maxChars || 40,
    openNodes: F.openNodes || ['L1', 'L3'],
    offlineNodes: F.offlineNodes || ['L1', 'L3'],
    timeoutMs: 15000,
    streamTimeoutMs: 32000,
    stream: true,
    statusTimeoutMs: 1800,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
