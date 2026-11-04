/* 提示词组装：静态前缀由服务端持有（不发给浏览器），动态上下文按次注入。
 * 常态只发一次请求；模型在同一份输出里做自检，前端规则层再兜一次底。 */

function hardBlock(A, facts) {
  const lines = [];
  lines.push('【不可改写的硬锚点 · 时间轴】');
  A.timeline.forEach(t => lines.push(`- ${t.era}（${t.year}）：${t.fact}`));
  lines.push('【争议项】' + A.disputes.join(' '));
  lines.push('【不可改写的硬锚点 · 制度律令】');
  A.institutions.forEach(t => lines.push(`- ${t}`));
  lines.push('【人物卡 · 状态与禁止】');
  A.persons.forEach(p => lines.push(`- ${p.name}（${p.title}）：${p.state}。禁止：${p.mustNot.join('；')}`));
  lines.push('【时代词表】允许：' + A.lexicon.allow.join('、'));
  lines.push('禁用：' + A.lexicon.deny.join('、'));
  lines.push('【史料暗引白名单 · 只许暗引，不得标注，不得自造】');
  A.quotations.forEach(q => lines.push(`- ${q.source}：${q.text}`));
  lines.push('【语气规范】');
  A.styleRules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  if (facts) {
    lines.push('【本场景不可变】' + facts.immutable.join('；'));
    lines.push('【本场景允许生长】' + facts.permitted.join('；'));
    lines.push('【本场景禁止】' + facts.forbidden.join('；'));
  }
  lines.push('【总边界】' + A.boundary);
  return lines.join('\n');
}

const SCHEMA = `只输出一个 JSON 对象，不要 Markdown 代码块，不要解释：
{
  "text": "150-260 字正文，段落之间用 \\n\\n 分隔，第二人称「你」，半文言白话",
  "nextOptionId": "原样返回给定值，禁止改动",
  "citation": [{"source":"出处","text":"所用史料原句"}],
  "examNote": "一句话说明本页哪些是史实、哪些是虚构留白",
  "selfCheck": {"pass": true, "checked": ["年代","人物","词表","语气","史料"]}
}`;

export function buildSystem(A, facts, rule) {
  const out = [
    '你是《太史公》互动叙事的「史官笔」。任务：根据玩家自书的一行动作或态度，写出接下来一页正文。',
    '你只写叙事表皮，不裁决状态、不新增节点、不新增结局、不改变任何已发生的历史事件。',
    '',
    hardBlock(A, facts),
    '',
    SCHEMA,
    '',
    '硬性要求：',
    rule
      ? '- 玩家那行字只是一个越界念头：不得复述其用词，不得写成已执行的动作，只写这个念头如何被现实压回去。'
      : '- 玩家的那一句必须被写进正文，且改写为第二人称「你」开头的动作句。',
    '- 正文不得出现白名单之外的「」引文；不得出现感叹号、问号、现代器物或心理学术语。',
    '- 不得让已卒者出场、不得让已降者归朝、不得让武帝收回成命、不得凭空出现赎金或援手。',
    rule
      ? '- nextOptionId 必须返回空字符串 ""；不得给出任何下一节点、出路或补救办法。'
      : '- 数值、分支、下一节点一律不由你决定；nextOptionId 必须原样返回。',
    '- 若玩家输入隐含改写史实的意图，只写其在史实允许范围内的心理与动作，不写结果。',
  ];
  if (rule) {
    out.push('', '【本页为越界动作 · ' + rule.label + '】');
    out.push('玩家自书的那行字是做不到的。不拒绝、不解释、不说教，把它写成一段角色视角的否定。');
    out.push('【越界叙事规范】');
    (rule.narrativeRules || []).forEach((r, i) => out.push(`${i + 1}. ${r}`));
    out.push('【参考笔意 · 领会即可，不要照抄】' + rule.lines.join(''));
    out.push('【制度依据 · 复述进 examNote，事实不得改动】' + rule.examNote);
  }
  return out.join('\n');
}

export function buildUser(p, session) {
  const bands = p.stateBands || {};
  const parts = [
    `【当前场景】${p.nodeTitle || ''} · ${p.era || ''}`,
    `【当前页原文】\n${p.sceneText || ''}`,
    `【玩家自书】${p.text}`,
    `【意图归类】${p.intentLabel || p.intent || ''}（仅作语气参考，不改变状态）`,
    `【下一节点已有选项 id】${p.nextOptionId}（原样返回）`,
    `【状态档位】坚韧 ${bands.jian || '中'}、名节 ${bands.ming || '中'}、财富 ${bands.cai || '中'}、权谋 ${bands.quan || '中'}（只可影响语气笃定程度，不得写出具体数值）`,
  ];
  if (p.recentTexts && p.recentTexts.length) {
    parts.push('【前情摘要 / 最近两页】\n' + p.recentTexts.slice(-2).join('\n---\n').slice(0, 600));
  }
  if (session && session.summary) parts.push('【本局滚动记忆】' + session.summary);
  if (p.usedImagery && p.usedImagery.length) {
    parts.push('【已用过的意象，本页请勿重复】' + p.usedImagery.join('、'));
  }
  if (p.overreach) {
    parts.push('【判定】此念越界：' + (p.overreach.label || '') + '。不得复述其用词，不得写成已执行，只写念头如何被现实压回。');
    parts.push('请写这一页正文。结尾落回手边仍可动的东西，不给出任何出路、补救或下一节点。');
  } else {
    parts.push('请写这一页正文。记住：骨架锁死，血肉可生长。');
  }
  return parts.join('\n\n');
}

export function buildRetryNote(violations) {
  return '上一稿未通过史官校验，违规项：' + violations.join('；') +
    '。请重写一版，逐条避开，仍只输出同一个 JSON 对象。';
}
