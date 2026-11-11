/* ===== 美术资产清单 · 由 tools/art_pipeline.py --scan 生成，请勿手改 =====
 * 运行时零依赖，浏览器端经典脚本：挂载 globalThis.TSG_SCENE_ART；Node 可 require()。
 * ids  ：场景节点 id → 已就位的场景插画（只登记真实存在的文件；缺图时前端回退 assets/bg/）。
 * webp ：原图路径 → 已生成的 WebP（<picture> 优先加载 WebP，jpg 回退）。
 * 重新生成：python tools/art_pipeline.py --scan --optimize
 */
(function (g) {
  var ART = {
    "version": 1,
    "ids": {},
    "webp": {
      "assets/bg/bg_archive.jpg": "assets/webp/bg/bg_archive.webp",
      "assets/bg/bg_camp.jpg": "assets/webp/bg/bg_camp.webp",
      "assets/bg/bg_court.jpg": "assets/webp/bg/bg_court.webp",
      "assets/bg/bg_execution.jpg": "assets/webp/bg/bg_execution.webp",
      "assets/bg/bg_lamp.jpg": "assets/webp/bg/bg_lamp.webp",
      "assets/bg/bg_palace.jpg": "assets/webp/bg/bg_palace.webp",
      "assets/bg/bg_prison.jpg": "assets/webp/bg/bg_prison.webp",
      "assets/bg/bg_river.jpg": "assets/webp/bg/bg_river.webp",
      "assets/bg/bg_road.jpg": "assets/webp/bg/bg_road.webp",
      "assets/bg/bg_trial.jpg": "assets/webp/bg/bg_trial.webp",
      "assets/char/char_duzhou.jpg": "assets/webp/char/char_duzhou.webp",
      "assets/char/char_liling.jpg": "assets/webp/char/char_liling.webp",
      "assets/char/char_renan.jpg": "assets/webp/char/char_renan.webp",
      "assets/char/char_simaqian.jpg": "assets/webp/char/char_simaqian.webp",
      "assets/char/char_simatan.jpg": "assets/webp/char/char_simatan.webp",
      "assets/char/char_wudi.jpg": "assets/webp/char/char_wudi.webp",
      "assets/char/char_yangyun.jpg": "assets/webp/char/char_yangyun.webp",
      "assets/ending/ending_01.jpg": "assets/webp/ending/ending_01.webp",
      "assets/ending/ending_02.jpg": "assets/webp/ending/ending_02.webp",
      "assets/ending/ending_03.jpg": "assets/webp/ending/ending_03.webp",
      "assets/ending/ending_04.jpg": "assets/webp/ending/ending_04.webp",
      "assets/ending/ending_05.jpg": "assets/webp/ending/ending_05.webp",
      "assets/ending/ending_06.jpg": "assets/webp/ending/ending_06.webp",
      "assets/ending/ending_07.jpg": "assets/webp/ending/ending_07.webp",
      "assets/ending/ending_08.jpg": "assets/webp/ending/ending_08.webp",
      "assets/ending/ending_09.jpg": "assets/webp/ending/ending_09.webp",
      "assets/ending/ending_10.jpg": "assets/webp/ending/ending_10.webp",
      "assets/ending/ending_11.jpg": "assets/webp/ending/ending_11.webp",
      "assets/ending/ending_12.jpg": "assets/webp/ending/ending_12.webp",
      "assets/ending/ending_13.jpg": "assets/webp/ending/ending_13.webp",
      "assets/mural.jpg": "assets/webp/mural.webp",
      "assets/title.jpg": "assets/webp/title.webp"
    }
  };
  g.TSG_SCENE_ART = ART;
  if (typeof module !== 'undefined' && module.exports) module.exports = ART;
})(typeof globalThis !== 'undefined' ? globalThis : this);
