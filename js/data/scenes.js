/* ===== src/data/scenes.js ===== */
/** 场景表索引：合并两批剧本数据 */
const START_NODE = 'P1';

/** 全部 22 个节点 */
const SCENES = { ...SCENES_P1, ...SCENES_P2 };

/** 结局文案将于 endings.js 提供 */
const END_OF_STORY = '__END__';
