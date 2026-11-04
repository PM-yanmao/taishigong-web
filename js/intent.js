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
    return { intent: best.id, label: best.label, confidence: Math.min(1, best.score / 6) };
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

  /** 返回当前节点下应走的既有选项 id；自定义输入永远不产生新边 */
  function resolveOption(node, state, text, intent) {
    var opts = (typeof visibleOptions === 'function' ? visibleOptions(node, state) : (node.options || []))
      .filter(function (o) {
        if (o.terminal) return false;                       // 不让自书误触 BAD END
        if (o.gate && !passGate(state, o.gate) && !o.gate.selectableWhenFailing) return false;
        return true;
      });
    if (!opts.length) return null;
    var affinity = (AFFINITY[node.id] || {})[intent];
    var best = opts[0], bestScore = -1;
    opts.forEach(function (o) {
      var s = overlap(String(text || ''), String(o.text || ''));
      if (o.id === affinity) s += 12;                      // 意图亲和优先
      if (s > bestScore) { bestScore = s; best = o; }
    });
    return best.id;
  }

  g.TSG_Intent = {
    INTENTS: INTENTS,
    AFFINITY: AFFINITY,
    classify: classify,
    resolveOption: resolveOption,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
