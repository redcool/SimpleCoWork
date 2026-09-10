import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, validateConfig, findCycle, loadConfig } from '../src/config.js';

function valid() {
  return normalizeConfig({
    project: { name: 'p1' },
    providers: { mock: { kind: 'mock' } },
    agents: [{ id: 'a', role: 'architect', provider: 'mock', model: 'm1' }],
    workflow: { tasks: [{ id: 't1', name: 'n', agentId: 'a', outputs: ['o1'] }] },
  });
}

test('合法配置通过校验', () => {
  const { ok, errors } = validateConfig(valid());
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('非法 provider kind 被拒绝', () => {
  const cfg = valid();
  cfg.providers.mock.kind = 'nope';
  const { ok, errors } = validateConfig(cfg);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('kind')));
});

test('引用未知 agent 被拒绝', () => {
  const cfg = valid();
  cfg.workflow.tasks[0].agentId = 'ghost';
  const { ok, errors } = validateConfig(cfg);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('未知 agent')));
});

test('重复任务 id 与引用未知依赖被拒绝', () => {
  const cfg = valid();
  cfg.workflow.tasks.push({ ...cfg.workflow.tasks[0] });
  let r = validateConfig(cfg);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('重复')));
  cfg.workflow.tasks[1].requires = ['not-exist'];
  r = validateConfig(cfg);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('requires 引用未知任务')));
});

test('环形依赖被检测', () => {
  const g = [
    { id: 'a', requires: ['b'] },
    { id: 'b', requires: ['c'] },
    { id: 'c', requires: ['a'] },
  ];
  const cycle = findCycle(g);
  assert.ok(cycle, '应发现环');
  assert.equal(cycle[0], cycle[cycle.length - 1]);
  assert.deepEqual(cycle.slice(0, 3).sort(), ['a', 'b', 'c']);
});

test('无环图不误报', () => {
  const g = [
    { id: 'a', requires: [] },
    { id: 'b', requires: ['a'] },
    { id: 'c', requires: ['a', 'b'] },
  ];
  assert.equal(findCycle(g), null);
});

test('engine 数值必须为正整数', () => {
  const cfg = valid();
  cfg.engine.maxConcurrent = 0;
  const { ok, errors } = validateConfig(cfg);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('maxConcurrent')));
});

test('loadConfig 从磁盘加载 ESM 配置', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'cowork-cfg-'));
  const file = join(dir, 'cowork.config.js');
  writeFileSync(file, `export default ${JSON.stringify({
    project: { name: 'loaded' },
    providers: { mock: { kind: 'mock' } },
    agents: [{ id: 'a', role: 'architect', provider: 'mock', model: 'm' }],
    workflow: { tasks: [{ id: 't', name: 'n', agentId: 'a', outputs: ['o'] }] },
  })};`, 'utf8');
  try {
    const cfg = await loadConfig(file);
    assert.equal(cfg.project.name, 'loaded');
    assert.equal(cfg.workflow.tasks[0].id, 't');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});