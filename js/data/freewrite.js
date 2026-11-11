/* ===== 自书开放的留白节点 · 前端与服务端唯一数据源 =====
 * 只改这里，就能决定：
 *   - 哪些页面允许玩家自己写一行（openNodes）
 *   - 每局能写几笔（perRun）
 *   - 一行多少字（minChars / maxChars）
 *   - 离线剧本包模式仍开放的页面（offlineNodes，因为离线没有模型，
 *     只能用 L1/L3 的预制素材，其余页面等联网后再开放）
 * 由 config.js 读取，server/guard.mjs 与 server/index.mjs 也读取同一份。
 * UMD：浏览器 globalThis.TSG_FREEWRITE，Node require() 同一份。 */
(function (g) {
  var F = {
    version: '1.3.0',
    /* 在线模式下开放自书的页面：朝议 → 议罪 → 生死抉择 → 世态炎凉 → 武帝审查 → 任安之信 */
    openNodes: ['L1', 'L2A', 'L3', 'A1', 'A2', 'A3'],
    /* 离线剧本包模式只保留有预制素材的两页 */
    offlineNodes: ['L1', 'L3'],
    perRun: 5,
    minChars: 4,
    maxChars: 60,
  };
  g.TSG_FREEWRITE = F;
  if (typeof module !== 'undefined' && module.exports) module.exports = F;
})(typeof globalThis !== 'undefined' ? globalThis : this);
