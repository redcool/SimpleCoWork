import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlanner, normalizePlanTasks, renderPlanMarkdown, slugOf } from '../src/planner.js';
import { baseRaw, makeProject } from './helpers.js';

/** planner mock 脚本：把主题拆成两个模块 + 跨模块规则 */
const PLANNER_SCRIPT = async () => ({
  summary: '拆分为核心与界面两个模块，核心先行、界面依赖核心。',
  text: '模块拆解说明。',
  modules: [
    {
      id: 'm-core', name: '核心模块', role: 'developer', requires: [], outputs: ['core'],
      acceptance: [{ id: 'C1', severity: 'high', type: 'contains', file: 'src/core.js', text: 'OK' }],
    },
    {
      id: 'm-ui', name: '界面模块', role: 'developer', requires: ['m-core'], outputs: ['ui'],
      acceptance: [{ id: 'U1', severity: 'high', type: 'contains', file: 'src/ui.js', text: 'OK' }],
    },
  ],
  rules: [{ id: 'R1', severity: 'high', type: 'contains', file: 'src/core.js', text: 'module.exports', ifPresent: true }],
  actions: [],
  knownIssues: [],
  done: true,
});

function plannerRaw() {
  const raw = baseRaw();
  raw.agents.push({ id: 'planner', role: 'planner', title: '规划师', provider: 'mock', model: 'm0', prompt: '你是规划师：分析主题并拆解模块。' });
  raw.providers.mock.script.planner = PLANNER_SCRIPT;
  return raw;
}

test('slugOf：主题转安全文件名', () => {
  assert.equal(slugOf('做一个 天气查询网站?'), '做一个-天气查询网站');
  assert.equal(slugOf('   '), 'plan');
});

test('runPlanner：生成计划 JSON/Markdown，模块规范化为任务（角色映射/依赖/验收）', async () => {
  const out = mkdtempSync(join(tmpdir(), 'cowork-plan-'));
  try {
    const proj = makeProject(plannerRaw());
    const { plan, tasks, markdown, files } = await runPlanner(proj, { theme: '做一个天气查询网站', outDir: join(out, 'plan') });
    // 规划产物
    assert.equal(plan.theme, '做一个天气查询网站');
    assert.equal(tasks.length, 2);
    // 规范化：角色→agentId、依赖→输入产物、验收→verify
    const core = tasks.find((t) => t.id === 'm-core');
    assert.equal(core.agentId, 'dev');
    assert.deepEqual(core.requires, []);
    assert.deepEqual(core.inputs, []);
    assert.ok(Array.isArray(core.verify) && core.verify[0].id === 'C1');
    const ui = tasks.find((t) => t.id === 'm-ui');
    assert.deepEqual(ui.requires, ['m-core']);
    assert.deepEqual(ui.inputs, ['core']);
    assert.ok(Array.isArray(ui.verify));
    // markdown 结构
    assert.ok(markdown.includes('# 协作计划：做一个天气查询网站'));
    assert.ok(markdown.includes('| m-core |'));
    assert.ok(markdown.includes('module.exports'));
    // 文件落盘
    assert.equal(files.length, 2);
    const json = JSON.parse(readFileSync(join(out, 'plan', slugOf('做一个天气查询网站'), 'plan.json'), 'utf8'));
    assert.equal(json.tasks.length, 2);
    assert.equal(json.rules[0].id, 'R1');
    assert.ok(existsSync(join(out, 'plan', slugOf('做一个天气查询网站'), 'plan.md')));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('normalizePlanTasks：非法依赖 / 环形依赖 / 空模块 均报错', () => {
  const cfg = { agents: [{ id: 'dev', role: 'developer' }] };
  assert.throws(() => normalizePlanTasks({ modules: [] }, cfg), /未产生任何模块/);
  assert.throws(
    () => normalizePlanTasks({ modules: [{ id: 'a', requires: ['ghost'] }] }, cfg),
    /没有该模块/,
  );
  assert.throws(
    () => normalizePlanTasks({ modules: [{ id: 'a', requires: ['b'] }, { id: 'b', requires: ['a'] }] }, cfg),
    /环/,
  );
});

test('normalizePlanTasks：角色回退到第一个 agent；缺 outputs 时自动命名', () => {
  const cfg = { agents: [{ id: 'dev1', role: 'developer' }, { id: 'dev2', role: 'developer' }] };
  const tasks = normalizePlanTasks({ modules: [{ id: 'm1', name: '甲' }] }, cfg);
  assert.equal(tasks[0].agentId, 'dev1');
  assert.deepEqual(tasks[0].outputs, ['m1-out']);
});

test('规划执行：按 plan 的模块任务 + 架构规则运行至完成（--plan 语义）', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 'm-core', name: '核心模块', agentId: 'dev', requires: [], inputs: [], outputs: ['core'],
          verify: [{ id: 'C1', severity: 'high', type: 'contains', file: 'src/core.js', text: 'OK' }] },
        { id: 'm-ui', name: '界面模块', agentId: 'dev', requires: ['m-core'], inputs: ['core'], outputs: ['ui'],
          verify: [{ id: 'U1', severity: 'high', type: 'contains', file: 'src/ui.js', text: 'OK' }] },
      ],
      rules: [{ id: 'R1', severity: 'high', type: 'contains', file: 'src/core.js', text: 'module.exports', ifPresent: true }],
    },
  });
  raw.providers.mock.script.developer = async (ctx) => {
    const file = ctx.task?.id === 'm-ui' ? 'src/ui.js' : 'src/core.js';
    const content = ctx.task?.id === 'm-ui' ? 'const ui = {ok:true};\nmodule.exports = "OK ui";\n' : 'module.exports = "OK core";\n';
    return { summary: `实现 ${ctx.task?.id}`, text: '', actions: [{ type: 'write', path: file, content }], knownIssues: [], done: true };
  };
  const proj = makeProject(raw);
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  assert.equal(proj.taskStore.get('m-core').state, 'approved');
  assert.equal(proj.taskStore.get('m-ui').state, 'approved');
  // 架构规则来自 workflow.rules（config 注入路径）
  const coreArt = proj.artifactStore.latestApproved('core');
  assert.ok(coreArt.files.some((f) => f.path === 'src/core.js'));
});

test('runPlanner：缺主题 / 无规划角色时报错提示', async () => {
  const proj = makeProject(baseRaw()); // 无 planner 角色 → 回退 architect（存在），仅验证主题缺失
  await assert.rejects(() => runPlanner(proj, { theme: '   ' }), /缺少主题/);
  const raw = baseRaw();
  raw.agents = raw.agents.filter((a) => a.role !== 'architect' && a.role !== 'planner'); // 只剩 developer/reviewer/manager
  const proj2 = makeProject(raw);
  await assert.rejects(() => runPlanner(proj2, { theme: '主题' }), /没有 planner 或 architect 角色/);
});