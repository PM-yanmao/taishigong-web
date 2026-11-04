/* ===== 离线剧本包拼装 =====
 * 把玩家自书的一行，嵌进预生成的史实留白框架里。
 * 输出仍然只是一页「正文文本」+ 既有选项 id，state 一律由引擎裁决。 */
(function (g) {
  function secondPerson(text) {
    var t = String(text || '').trim().replace(/[。.!！?？;；,，]+$/, '');
    t = t.replace(/^(我|咱|俺|自己|你)/, '');
    return '你' + t + '。';
  }

  function build(o) {
    var PACK = g.TSG_GENPACK;
    var frame = PACK.frames[o.intent] || PACK.frames.WRITE;
    var setting = PACK.settings[o.nodeId] || { line: '' };
    var used = o.usedImagery || [];
    var seed = (o.toneSeed || 0) % PACK.tones.length;
    var tone = null;
    for (var i = 0; i < PACK.tones.length; i++) {
      var c = PACK.tones[(seed + i) % PACK.tones.length];
      if (used.indexOf(c.word) < 0) { tone = c; break; }
    }
    tone = tone || PACK.tones[0];

    var lines = [
      setting.line,
      frame.opening,
      secondPerson(o.text),
      frame.middle[0],
      tone.line,
      frame.middle[1],
      frame.middle[2],
      frame.closing,
    ].filter(function (s) { return !!s; });

    var text = lines.join('\n\n');
    var padIdx = 0;
    while (text.length < 150 && padIdx < PACK.pads.length) {
      lines.splice(Math.min(4 + padIdx, lines.length - 1), 0, PACK.pads[padIdx]);
      text = lines.join('\n\n');
      padIdx++;
    }

    return {
      text: text,
      nextOptionId: o.nextOptionId,
      citation: frame.citation,
      examNote: frame.examNote,
      selfCheck: { pass: true, by: 'pack' },
      source: 'pack',
      imagery: tone.word,
    };
  }

  /* 越界专用补白：殿上、狱中都成立，不引入新器物 */
  var REFUSAL_PADS = [
    '更声从墙外过来，敲过一遍，又静了。',
    '案上那行字还在等你。',
    '你把手收进袖中，指节抵着竹简的边。',
    '灯芯短了一截，没有人来剪。',
    '窗缝里透进一线灰白的光。',
  ];

  /** 越界：只写「念头被现实压回」，不写执行，不复述玩家用词 */
  function buildRefusal(o) {
    var O = g.TSG_OVERREACH;
    var PACK = g.TSG_GENPACK;
    var rule = (O && O.byId(o.overreachId)) || (O && O.byId('GENERIC'));
    if (!rule) return null;
    var setting = PACK.settings[o.nodeId] || { line: '' };
    var lines = [setting.line, rule.thought].concat(rule.lines.slice()).filter(Boolean);
    var text = lines.join('\n\n'), i = 0;
    while (text.length < 150 && i < REFUSAL_PADS.length) {
      lines.splice(Math.max(1, lines.length - 1), 0, REFUSAL_PADS[i]);
      text = lines.join('\n\n');
      i++;
    }
    return {
      text: text,
      nextOptionId: '',
      citation: rule.citation || [],
      examNote: rule.examNote || '',
      selfCheck: { pass: true, by: 'refusal-pack' },
      source: 'pack',
      overreach: rule.id,
    };
  }

  g.TSG_Compose = {
    build: build,
    buildRefusal: buildRefusal,
    secondPerson: secondPerson,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
