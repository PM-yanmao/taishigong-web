/* ===== 意图归一 · 纯前端规则，零 token =====
 * 职责：把玩家自书的一行文字映射为「现有剧本里的一条边」，
 *       绝不新增节点、绝不新增结局、绝不写入 state。
 * 状态裁决权始终在 engine.resolve() 手里。 */
(function (g) {
  var INTENTS = [
    { id: 'DEFEND',  label: '直言辩护', kw: ['辩', '辩护', '直言', '据实', '陈情', '开口', '出言', '说情', '陈述', '为李陵'], lean: '名节、坚韧略升' },
    { id: 'SILENCE', label: '沉默称病', kw: ['沉默', '不语', '不言', '称病', '避开', '退下', '低头', '不答', '不开口'], lean: '权谋略升' },
    { id: 'FLATTER', label: '附和逢迎', kw: ['附和', '迎合', '称贺', '顺', '谢恩', '赞同', '附议', '随众'], lean: '权谋升、名节降' },
    { id: 'MERCY',   label: '求赎打点', kw: ['赎', '托人', '打点', '纳钱', '变卖', '求人', '疏通', '家产'], lean: '财富降' },
    { id: 'ENDURE',  label: '隐忍受刑', kw: ['受刑', '苟活', '隐忍', '活下去', '忍', '写史', '留下', '不死'], lean: '坚韧升' },
    { id: 'RESIST',  label: '引颈赴死', kw: ['引颈', '赴死', '自尽', '拒绝', '不受', '就戮', '宁死', '一死'], lean: '名节升' },
    { id: 'WRITE',   label: '执笔著书', kw: ['竹简', '执笔', '著书', '记下', '写', '书稿', '笔', '抄'], lean: '坚韧、名节略升' },
    { id: 'TRAVEL',  label: '辞官远行', kw: ['辞官', '归乡', '远行', '离开', '出游', '上路', '归隐'], lean: '坚韧略升' },
  ];

  /* 意图 → 该节点已有选项的亲和表；只引用既有边 */
  var AFFINITY = {
    L1: { DEFEND: 'A', SILENCE: 'B', FLATTER: 'C', MERCY: 'B', ENDURE: 'A', RESIST: 'B', WRITE: 'A', TRAVEL: 'B' },
    L3: { DEFEND: 'X2', SILENCE: 'X1', FLATTER: 'X1', MERCY: 'X3', ENDURE: 'X1', RESIST: 'X2', WRITE: 'X1', TRAVEL: 'X1' },
  };

  function classify(text) {
    var t = String(text || '');
    var best = { id: 'WRITE', label: '执笔著书', score: 0 };
    INTENTS.forEach(function (it) {
      var score = 0;
      it.kw.forEach(function (k) { if (t.indexOf(k) >= 0) score += k.length; });
      if (score > best.score) best = { id: it.id, label: it.label, score: score };
    });
    /* matched=false 表示这句话没有任何可识别的动作倾向：不要假装它属于「执笔」，
     * 否则中性输入会被默认送进 WRITE 亲和选项（L1→A 辩护、L3→X1 宫刑）。 */
    return { intent: best.id, label: best.label, confidence: Math.min(1, best.score / 6), matched: best.score > 0 };
  }

  /* 字面重合度：用户文本与既有选项文案的字符交集 */
  function overlap(a, b) {
    var seen = {}, n = 0;
    for (var i = 0; i < b.length; i++) {
      var c = b.charAt(i);
      if (c.trim() === '' || '的了着与之不而也'.indexOf(c) >= 0) continue;
      if (!seen[c] && a.indexOf(c) >= 0) { seen[c] = 1; n++; }
    }
    return n;
  }

  /** 此行可落到哪几条既有边上（按字面重合 + 意图亲和排序）。
   *  返回 [{id,text,score}]，最多 limit 条；空数组 = 此页没有可承接的走向。
   *  resolveOption 只取第一条；多候选时前端把落点选择权交给玩家。 */
  function candidates(node, state, text, intent, limit) {
    var opts = (typeof visibleOptions === 'function' ? visibleOptions(node, state) : (node.options || []))
      .filter(function (o) {
        if (o.terminal) return false;                       // 不让自书误触 BAD END
        if (o.gate && !passGate(state, o.gate) && !o.gate.selectableWhenFailing) return false;
        return true;
      });
    if (!opts.length) return [];
    var affinity = intent ? (AFFINITY[node.id] || {})[intent] : null;
    var list = [];
    opts.forEach(function (o, i) {
      var s = overlap(String(text || ''), String(o.text || ''));
      if (o.id === affinity) s += 12;                      // 意图亲和优先
      if (s > 0) list.push({ id: o.id, text: o.text, score: s, order: i });
    });
    list.sort(function (a, b) { return (b.score - a.score) || (a.order - b.order); });
    return list.slice(0, limit || 3).map(function (x) {
      return { id: x.id, text: x.text, score: x.score };
    });
  }

  function resolveOption(node, state, text, intent) {
    var c = candidates(node, state, text, intent, 1);
    return c.length ? c[0].id : null;
  }

  g.TSG_Intent = {
    INTENTS: INTENTS,
    AFFINITY: AFFINITY,
    classify: classify,
    candidates: candidates,
    resolveOption: resolveOption,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
