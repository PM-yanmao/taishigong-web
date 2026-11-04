/* 提示词组装：可行性判断与正文生成合并进同一次调用。
 * 判定由模型依据制度自行完成，不依赖前端关键词表——词表只在离线兜底时用。 */

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
    if (facts.institution) lines.push('【本场景制度依据】' + facts.institution);
  }
  lines.push('【总边界】' + A.boundary);
  return lines.join('\n');
}

const SCHEMA = `只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。
feasible 与 overreach 放在最前两个字段：
{
  "feasible": true,
  "overreach": null,
  "text": "150-260 字正文，段落之间用 \\n\\n 分隔，第二人称「你」，半文言白话",
  "nextOptionId": "原样返回给定值，禁止改动",
  "citation": [{"source":"出处","text":"所用史料原句"}],
  "examNote": "一句话说明本页哪些是史实、哪些是虚构留白",
  "selfCheck": {"pass": true, "checked": ["可行性","年代","人物","词表","语气","史料"]}
}
feasible：这一行在「当前场景 + 他的身份 + 汉制」下能否做到。
overreach：做到时填 null；做不到时用四到八个字概括缘由，如「狱中无路可逃」「家贫无以自赎」「死者不可复生」。`;

const FEASIBILITY = [
  '【第一步 · 这一行能不能做到（先判后写）】',
  '玩家自书的那行字只是「一个想做什么的念头」。先按当下情境判断它能否执行，再决定怎么写。综合考量，不要机械套词：',
  '- 他的身份：太史令秩六百石，后为中书令。掌天官、典史职、守石室金匮；不统兵、不预诏令、不掌刑狱。',
  '- 他的处境：家贫，货赂不足以自赎；交游莫救，左右亲近不为一言；下狱则系于狱中，狱吏环守。',
  '- 已定之事：李陵已降、判词已下、司马谈已卒、受刑已成——这些不因一念而改。',
  '- 他真正可做的：记、写、说、沉默、进退、取舍；以及史实留白处的动作、所见、所想。',
  '若这一行包含「做得到」与「做不到」两部分（例：假意受刑、趁机逃走）：',
  '先写做得到的那半——他确实应下了；再让做不到的那半落空——狱门有吏、无符传、无资费，路走不通。不写它成功。',
  '若整行都做不到：不拒绝、不解释、不说教，写成角色视角的否定。',
  '若做得到：写成第二人称动作句，不评价、不拔高。',
];

const NARRATIVE = [
  '【写「做不到」时的要求】',
  '- 只写念头如何被现实压回，不写成已执行的动作；不复述玩家的用词。',
  '- 用实物与制度说话：印、绶、简、刀、灯、城门、五十万钱、六百石、符传、亭障。',
  '- 不写结论、不写「你明白了」、不做心理分析、不说教。',
  '- 结尾落回手边仍可动的东西，为下面既有选项留出接口。',
  '- 不要照抄任何示例或模板，按当下情境自己组织。',
];

export function buildSystem(A, facts) {
  return [
    '你是《太史公》互动叙事的「史官笔」。任务：读玩家自书的一行，判断它能否做到，然后写出接下来一页正文。',
    '你只写叙事表皮，不裁决状态、不新增节点、不新增结局、不改变任何已发生的历史事件。',
    '',
    hardBlock(A, facts),
    '',
    ...FEASIBILITY,
    '',
    SCHEMA,
    '',
    '硬性要求：',
    '- feasible=true 时把玩家那一行写成第二人称动作句；feasible=false 时不得写成已执行。',
    '- 正文不得出现白名单之外的「」引文；不得出现感叹号、问号、现代器物或心理学术语。',
    '- 不得让已卒者出场、不得让已降者归朝、不得让武帝收回成命；不得凭空出现赎金或援手；不得写脱逃成功或无罪释放。',
    '- 数值、分支、下一节点一律不由你决定；nextOptionId 原样返回给定值（判为做不到时服务端会置空）。',
    '',
    ...NARRATIVE,
  ].join('\n');
}

export function buildUser(p, session) {
  const bands = p.stateBands || {};
  const parts = [
    `【当前场景】${p.nodeTitle || ''} · ${p.era || ''}`,
    `【当前页原文】\n${p.sceneText || ''}`,
    `【玩家自书】${p.text}`,
    `【语气倾向】${p.intentLabel || p.intent || ''}（仅作参考，不改变状态）`,
    `【下一节点已有选项 id】${p.nextOptionId}（原样返回）`,
    `【状态档位】坚韧 ${bands.jian || '中'}、名节 ${bands.ming || '中'}、财富 ${bands.cai || '中'}、权谋 ${bands.quan || '中'}（只可影响语气笃定程度，不得写出具体数值）`,
  ];
  if (p.hint && p.hint.label) {
    parts.push('【参考提示】关键词表认为这行可能属「' + p.hint.label + '」，仅供参考，以你自己的制度判断为准。');
  }
  if (p.recentTexts && p.recentTexts.length) {
    parts.push('【前情摘要 / 最近两页】\n' + p.recentTexts.slice(-2).join('\n---\n').slice(0, 600));
  }
  if (session && session.summary) parts.push('【本局滚动记忆】' + session.summary);
  if (p.usedImagery && p.usedImagery.length) {
    parts.push('【已用过的意象，本页请勿重复】' + p.usedImagery.join('、'));
  }
  parts.push('先判可行性，再写这一页正文。骨架锁死，血肉可生长。');
  return parts.join('\n\n');
}

export function buildRetryNote(violations) {
  return '上一稿未通过史官校验，违规项：' + violations.join('；') +
    '。请重写一版，逐条避开，仍只输出同一个 JSON 对象。';
}
