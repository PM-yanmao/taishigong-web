/* ===== 史官硬校验 · 前端规则层，零 token =====
 * 输入侧：越界不再拒绝，只分类；交给生成链路写成「角色视角的否定」。
 * 输出侧：拦 OOC、伪造史料、语气跑偏；服务端另有一份同样的权威校验。 */
(function (g) {
  var A = g.TSG_ANCHORS || {};

  var FACT_PATTERNS = [
    /(让|使|令|叫|劝)[^，。；]{0,10}(李陵|武帝|皇上|司马谈|任安|廷尉)[^，。；]{0,10}(不|没|未|回|归|赦|放|改|变|免)/,
    /(李陵|司马谈)[^，。；]{0,8}(没|未|不)[^，。；]{0,5}(降|死|卒|败)/,
    /(武帝|上|皇帝)[^，。；]{0,8}(赦免|放过|认错|道歉|收回)/,
    /(改变|改写|推翻|重写)[^，。；]{0,6}(历史|史实|结局|命运|判决)/,
    /(凭空|突然|忽然)[^，。；]{0,6}(出现|来了一|有了)[^，。；]{0,6}(钱|人|救兵|援手)/,
  ];
  var EXTRA_ANACHRONISM = [/(穿越|重生|金手指|开挂)/, /[!?！？]/];

  var OUTPUT_FORBIDDEN = [
    { re: /司马谈[^。]{0,12}(说道|走来|站在|递给|看着你|开口)/, msg: '司马谈元封元年已卒，不得出场' },
    { re: /李陵[^。]{0,10}(归朝|归来|未降|没有降|翻案)/, msg: '李陵已降匈奴，不得翻案' },
    { re: /(武帝|上)[^。]{0,8}(道歉|认错|收回成命)/, msg: '武帝人设不符' },
    { re: /[!?！？]/, msg: '出现感叹号或问句，违反语气规范' },
    { re: /(我司马迁|鄙人|在下)/, msg: '叙述人称错误' },
    /* 史实硬约束：模型会把越界念头自我合理化写成成功，这几条必须当场拦 */
    { re: /(逃出|越狱|逃狱|潜逃)[^。]{0,10}(狱|牢|长安|城|门)/, msg: '死囚系狱，不得写成脱逃成功' },
    { re: /(赎金|援手|救兵)[^。]{0,6}(到了|来了|已至)/, msg: '家贫交绝，不得凭空出现援手' },
    { re: /(无罪|免死|赦免)[^。]{0,6}(出狱|还家|归乡)/, msg: '判词未改，不得写成无罪释放' },
  ];

  function denyWords(text) {
    var list = (A.lexicon && A.lexicon.deny) || [];
    var hit = [];
    list.forEach(function (w) { if (text.indexOf(w) >= 0) hit.push(w); });
    return hit;
  }

  /** 属性够不够，决定同一个动作是「选项」还是「做不到」 */
  function gateAllows(rule, ctx) {
    var w = rule.allowWhen;
    if (!w || ctx.nodeId !== w.nodeId) return false;
    var s = ctx.state || {};
    var v = s[w.stat] == null ? 0 : s[w.stat];
    return v >= w.min;
  }

  /** 返回 {id,label} 或 null。越界不是错误，是内容。 */
  function classifyOverreach(text, ctx) {
    var O = g.TSG_OVERREACH;
    if (!O) return null;
    var deny = (A.lexicon && A.lexicon.deny) || [];
    var modern = deny.some(function (w) { return text.indexOf(w) >= 0; }) ||
      EXTRA_ANACHRONISM.some(function (re) { return re.test(text); });
    var rules = O.rules || [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.id === 'GENERIC' || r.id === 'ANACHRONISM' || !r.patterns) continue;
      if (r.patterns.some(function (re) { return re.test(text); })) {
        if (gateAllows(r, ctx)) return null;
        return { id: r.id, label: r.label };
      }
    }
    if (FACT_PATTERNS.some(function (re) { return re.test(text); })) {
      return { id: 'FACT', label: '史官不更易已发生之事' };
    }
    if (modern) return { id: 'ANACHRONISM', label: '此念无着落' };
    return null;
  }

  /** 玩家输入：只查长度，不再拦。
   *  越界判定交给生成端——在线由模型读制度自行判断，词表只作 hint 参考；
   *  离线没有模型时，才退回词表 + 预制段落兜底。 */
  function checkInput(text, ctx) {
    /* 服务端不加载 config.js，故此处默认值必须与 config.js 一致 */
    var cfg = g.TSG_CONFIG || { minChars: 4, maxChars: 40 };
    var t = String(text || '').trim();
    if (t.length < cfg.minChars) return { ok: false, reason: '字数太短，请再书一行。' };
    if (t.length > cfg.maxChars) return { ok: false, reason: '一行足矣，请收束笔墨。' };
    return { ok: true, hint: classifyOverreach(t, ctx || {}) };
  }

  /** 生成正文；返回 {ok, violations[]} */
  function checkOutput(text, ctx) {
    var t = String(text || '').trim();
    var v = [];
    if (t.length < 120) v.push('正文不足 120 字');
    if (t.length > 340) v.push('正文超出 340 字');
    if (t.indexOf('你') < 0) v.push('未使用第二人称「你」');
    var dw = denyWords(t);
    if (dw.length) v.push('出现时代错置词：' + dw.slice(0, 4).join('、'));
    OUTPUT_FORBIDDEN.forEach(function (r) { if (r.re.test(t)) v.push(r.msg); });

    /* 伪造史料检测：出现的「」引文必须能在白名单里找到 */
    var quotes = t.match(/「[^」]{4,}」/g) || [];
    var white = (A.quotations || []).map(function (q) { return q.text; });
    quotes.forEach(function (q) {
      var body = q.slice(1, -1);
      var found = white.some(function (w) { return w.indexOf(body) >= 0 || body.indexOf(w) >= 0; });
      if (!found) v.push('疑似自造史料：' + q.slice(0, 14));
    });
    return { ok: v.length === 0, violations: v };
  }

  /** 服务端返回体的结构校验 */
  function validateEnvelope(o) {
    if (!o || typeof o !== 'object') return { ok: false, violations: ['返回体不是对象'] };
    var v = [];
    if (typeof o.text !== 'string' || !o.text.trim()) v.push('缺少 text');
    /* 判为做不到时模型可能给空串或 null，均视为合法 */
    if (o.nextOptionId !== undefined && o.nextOptionId !== null && typeof o.nextOptionId !== 'string') {
      v.push('nextOptionId 类型错误');
    }
    if (!Array.isArray(o.citation)) v.push('缺少 citation 数组');
    if (!o.selfCheck || typeof o.selfCheck !== 'object') v.push('缺少 selfCheck');
    return { ok: v.length === 0, violations: v };
  }

  g.TSG_Guard = {
    checkInput: checkInput,
    classifyOverreach: classifyOverreach,
    checkOutput: checkOutput,
    validateEnvelope: validateEnvelope,
    denyWords: denyWords,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
