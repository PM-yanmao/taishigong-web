/* ===== 服务端读取剧本数据（同一份 js/data/scenes.*.js，避免两份数据漂移）=====
 * 浏览器端是经典 <script>；这里用 node:vm 按 index.html 的顺序执行同一批文件，
 * 拿到 SCENES 后供接口校验与提示词使用。
 * 好处：nodeId / nextOptionId / 场景原文都由服务端权威提供，
 *       客户端传来的 sceneText 不再进提示词（减少提示词注入面）。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/data/scenes.p1.js', 'js/data/scenes.p2.js', 'js/data/scenes.js'];

const code = FILES
  .map((f) => `/* --- ${f} --- */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n;\n');

const context = vm.createContext({ console });
vm.runInContext(
  code + '\n;globalThis.__SCENES__ = SCENES; globalThis.__START__ = START_NODE; globalThis.__END__ = END_OF_STORY;',
  context,
  { filename: 'taishigong-scenes-bundle.js' }
);

export const SCENES = context.__SCENES__;
export const START_NODE = context.__START__;
export const END_OF_STORY = context.__END__;

/** 服务端权威场景元数据；未知节点返回 null */
export function sceneMeta(nodeId) {
  const n = SCENES[nodeId];
  if (!n) return null;
  return {
    id: n.id,
    title: n.title || '',
    era: n.era || '',
    text: n.text || '',
    autoEnd: !!n.autoEnd,
    options: (n.options || []).map((o) => ({ id: o.id, text: o.text || '', terminal: !!o.terminal })),
  };
}

/** 该节点可用的既有边（自书落点不能是 terminal/BAD END） */
export function optionIds(nodeId) {
  const n = SCENES[nodeId];
  if (!n) return [];
  return (n.options || []).filter((o) => !o.terminal).map((o) => o.id);
}
