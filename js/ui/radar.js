/* ===== src/ui/radar.js ===== */
/**
 * 《太史公》人格雷达图 · 渲染模块（经典脚本，无需构建，双击即可用）— v1.1
 * ---------------------------------------------------------------
 * 用法（在页面中引入本文件后）：
 *   TSG_Radar.mount(document.getElementById('el'), {
 *     player:    { jian: 85, ming: 60, cai: 45, quan: 70 },
 *     orthodox:  { jian: 95, ming: 100, cai: 40, quan: 35 },
 *     similarity: 78
 *   });
 *
 * 设计约定：
 *   · 四角多边形，每个角 = 一项数值（0–100）
 *   · 司马迁 = 灰色虚线，不填充
 *   · 玩家   = 黄色实线 + 半透明填充
 *   · 轴外标注：属性名 / 你 xx / 史 xx / 差 ±x（正绿负红）
 *
 * v1.1（按 UI 规范 docs/09 修订）：
 *   · 轴标签 15→17px、数值 13→15px、刻度 10→11px、相似度 13→14/18px
 *   · 次级文字透明度 0.55→0.72（对比度 ≥4.5:1）
 *   · 网格线 0.16→0.22（非文字元素 ≥3:1）
 *   · 轴标签外扩 34→38，避免大字号挤压
 *   · 约定渲染尺寸不小于 1:1（480px），否则字号实际过小
 * ---------------------------------------------------------------
 */
(function (g) {
  'use strict';

  var AXES = [
    { key: 'jian', label: '坚韧', angle: -90 },
    { key: 'ming', label: '名节', angle: 0 },
    { key: 'cai', label: '财富', angle: 90 },
    { key: 'quan', label: '权谋', angle: 180 },
  ];

  var COLOR = {
    player: '#E8C35A',
    playerFill: 'rgba(232,195,90,0.22)',
    orthodox: 'rgba(226,226,226,0.72)',
    grid: 'rgba(226,226,226,0.22)',
    axis: 'rgba(226,226,226,0.34)',
    text: '#E6E0D2',
    sub: 'rgba(217,210,194,0.72)',
  };

  var FONT = {
    axis: 17,
    value: 15,
    tick: 11,
    sim: 14,
    simNum: 18,
  };

  function pt(cx, cy, R, angleDeg, value) {
    var a = (angleDeg * Math.PI) / 180;
    var r = (R * Math.max(0, Math.min(100, value))) / 100;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function polygon(points) {
    return points.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ');
  }

  function deltaText(d) {
    return (d > 0 ? '+' : '') + d;
  }

  function deltaColor(d) {
    if (d > 0) return '#8FBF7A';
    if (d < 0) return '#C97A6A';
    return COLOR.sub;
  }

  function buildSVG(opts) {
    opts = opts || {};
    /* 导入存档里的数值可能是字符串甚至 HTML：这里统一转成 0–100 的数字，
     * 防止 SVG 字符串拼接被注入。 */
    function num(v, dflt) {
      var n = Number(v);
      if (!Number.isFinite(n)) return dflt;
      return Math.max(0, Math.min(100, Math.round(n)));
    }
    var playerSrc = opts.player || {};
    var orthodoxSrc = opts.orthodox || {};
    var player = {}, orthodox = {};
    AXES.forEach(function (ax) {
      player[ax.key] = num(playerSrc[ax.key], 0);
      orthodox[ax.key] = num(orthodoxSrc[ax.key], 0);
    });
    var size = Number(opts.size);
    if (!Number.isFinite(size) || size <= 0) size = 560;
    size = Math.max(200, Math.min(1200, Math.round(size)));
    var pad = opts.pad || 96;
    var cx = size / 2;
    var cy = size / 2;
    var R = size / 2 - pad;
    var similarity = opts.similarity == null ? undefined : num(opts.similarity, 0);

    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" class="tsg-radar" width="100%" role="img" aria-label="人格雷达图：黄线为玩家，灰虚线为司马迁">');

    // 网格：5 圈（20/40/60/80/100）
    [20, 40, 60, 80, 100].forEach(function (lv) {
      var pts = AXES.map(function (ax) { return pt(cx, cy, R, ax.angle, lv); });
      parts.push(
        '<polygon points="' + polygon(pts) + '" fill="none" stroke="' + COLOR.grid +
        '" stroke-width="' + (lv === 100 ? 1.4 : 1) + '"' + (lv === 100 ? '' : ' stroke-dasharray="3 5"') + '/>'
      );
    });

    // 轴线
    AXES.forEach(function (ax) {
      var e = pt(cx, cy, R, ax.angle, 100);
      parts.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="' + COLOR.axis + '" stroke-width="1"/>');
    });

    // 刻度数字（沿"坚韧"轴内侧）
    [20, 40, 60, 80, 100].forEach(function (lv) {
      var p = pt(cx, cy, R, -90, lv);
      parts.push('<text x="' + (p[0] + 7) + '" y="' + (p[1] + 14) + '" font-size="' + FONT.tick + '" fill="' + COLOR.sub + '" font-family="Consolas,monospace">' + lv + '</text>');
    });

    // 司马迁：灰色虚线，不填充
    var oPts = AXES.map(function (ax) { return pt(cx, cy, R, ax.angle, orthodox[ax.key] || 0); });
    parts.push(
      '<polygon points="' + polygon(oPts) + '" fill="none" stroke="' + COLOR.orthodox +
      '" stroke-width="2" stroke-dasharray="8 6" stroke-linejoin="round"/>'
    );
    oPts.forEach(function (p) {
      parts.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="' + COLOR.orthodox + '"/>');
    });

    // 玩家：黄色实线 + 半透明填充
    var pPts = AXES.map(function (ax) { return pt(cx, cy, R, ax.angle, player[ax.key] || 0); });
    parts.push(
      '<polygon points="' + polygon(pPts) + '" fill="' + COLOR.playerFill +
      '" stroke="' + COLOR.player + '" stroke-width="2.6" stroke-linejoin="round"/>'
    );
    pPts.forEach(function (p) {
      parts.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="' + COLOR.player + '"/>');
    });

    // 轴外标注：名称 / 你 xx / 史 xx / 差 ±x
    AXES.forEach(function (ax) {
      var lp = pt(cx, cy, R + 38, ax.angle, 100);
      var anchor = 'middle';
      if (ax.angle === 0) anchor = 'start';
      if (ax.angle === 180) anchor = 'end';
      var pv = player[ax.key] || 0;
      var ov = orthodox[ax.key] || 0;
      var d = pv - ov;
      var y0 = lp[1] - (ax.angle === -90 ? 18 : ax.angle === 90 ? -26 : 0);
      var y1 = y0 + 21;
      parts.push(
        '<text x="' + lp[0] + '" y="' + y0 + '" text-anchor="' + anchor + '" font-size="' + FONT.axis +
        '" fill="' + COLOR.text + '" font-family="SimSun,serif" letter-spacing="2">' + ax.label + '</text>'
      );
      parts.push(
        '<text x="' + lp[0] + '" y="' + y1 + '" text-anchor="' + anchor + '" font-size="' + FONT.value + '" font-family="Consolas,monospace">' +
        '<tspan fill="' + COLOR.player + '">你 ' + pv + '</tspan>' +
        '<tspan fill="' + COLOR.sub + '" dx="8">史 ' + ov + '</tspan>' +
        '<tspan fill="' + deltaColor(d) + '" dx="8">' + deltaText(d) + '</tspan>' +
        '</text>'
      );
    });

    // 中心点
    parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.6" fill="' + COLOR.sub + '"/>');

    if (typeof similarity === 'number') {
      parts.push(
        '<text x="' + cx + '" y="' + (size - 10) + '" text-anchor="middle" font-size="' + FONT.sim +
        '" fill="' + COLOR.sub + '" font-family="SimSun,serif" letter-spacing="1">人格相似度 <tspan font-family="Consolas,monospace" fill="' + COLOR.player + '" font-size="' + FONT.simNum + '">' + similarity + '</tspan> / 100</text>'
      );
    }

    parts.push('</svg>');
    return parts.join('');
  }

  /** 图例（与图分开渲染，便于排版；字号 14px 起） */
  function legendHTML() {
    return (
      '<div class="tsg-radar-legend" style="font-size:14px">' +
      '<span><i style="display:inline-block;width:28px;height:0;border-top:2.6px solid ' + COLOR.player + ';vertical-align:middle;margin-right:8px"></i>你（本局结算）</span>' +
      '<span><i style="display:inline-block;width:28px;height:0;border-top:2px dashed ' + COLOR.orthodox + ';vertical-align:middle;margin-right:8px"></i>司马迁（史实基线）</span>' +
      '</div>'
    );
  }

  function mount(el, opts) {
    if (!el) return null;
    el.innerHTML = buildSVG(opts) + (opts.showLegend === false ? '' : legendHTML());
    return el;
  }

  var api = { buildSVG: buildSVG, mount: mount, legendHTML: legendHTML, AXES: AXES, MIN_RENDER_SIZE: 480 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.TSG_Radar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
