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
  g.TSG_CONFIG = {
    apiBase: saved,
    token: token,
    port: 8787,
    freeLimit: 3,
    minChars: 4,
    maxChars: 40,
    timeoutMs: 15000,
    streamTimeoutMs: 32000,
    stream: true,
    openNodes: ['L1', 'L3'],
    statusTimeoutMs: 1800,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
