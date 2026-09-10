import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseRaw, makeProject, standardTasks, trackConcurrency } from './helpers.js';

/** 业务脚本助手：按任务+尝试次数决定输出内容（含 'OK' 通过 / 不含则失败） */
function devWithPlan(plan) {
  return async (ctx) => {
    const task = ctx.task.id;
    const attempt = ctx.attempt ?? 1;
    const content = plan[task]?.[attempt] ?? plan[task]?.always;
    if (content === undefined) {
      return { summary: `未知执行计划 ${task}#${attempt}`, text: '', actions: [], knownIssues: [], done: false };
    }
    return {
      summary: `实现 ${task} 第 ${attempt} 次`,
      text: '实现内容',
      actions: [{ type: 'write', path: 'src/api.js', content }],
      knownIssues: [],
      done: true,
    };
  };
}

const OK_CODE = 'module.exports = "OK";\n';
const BAD_CODE = 'module.exports = "NOT_READY";\n';

test('A: 依赖调度 + 并发上限', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'], risk: 'high' },
        { id: 't-a', name: '模块A', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code-a'] },
        { id: 't-b', name: '模块B', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code-b'] },
        { id: 't-report', name: '汇报', agentId: 'manager', requires: ['t-a', 't-b'], outputs: ['report'], gate: false },
      ],
    },
    engine: { maxConcurrent: 2 },
  });
  const proj = makeProject(raw);
  const tracker = trackConcurrency(proj);
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  // 汇报必须最后开始（依赖 a/b 都完成）
  assert.ok(tracker.orderIndex('t-arch') < tracker.orderIndex('t-a'));
  assert.ok(tracker.orderIndex('t-a') < tracker.orderIndex('t-report'));
  assert.ok(tracker.orderIndex('t-b') < tracker.orderIndex('t-report'));
  // 并发不超上限：t-a 与 t-b 可并行（同为2）
  assert.ok(tracker.maxRunning <= 2, `并发观测 ${tracker.maxRunning} 超过 2`);
});

test('B: 审查失败自动重试（未超上限不触发会议）', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: { maxReviewAttempts: 3 },
  });
  raw.providers.mock.script.developer = devWithPlan({
    't-dev': { 1: BAD_CODE, 2: BAD_CODE, 3: OK_CODE },
  });
  const proj = makeProject(raw);
  const needsRevision = [];
  proj.bus.on('task.needs_revision', (e) => needsRevision.push(e.id));
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  assert.equal(proj.taskStore.get('t-dev').attempts, 3);
  assert.deepEqual(needsRevision, ['t-dev', 't-dev']);
  assert.equal(proj.meetingStore.list().length, 0, '不应触发会议');
  assert.equal(proj.artifactStore.latestApproved('code').state, 'approved');
  // v1/v2 被拒，v3 通过
  const versions = proj.artifactStore.versionsOf('code');
  assert.deepEqual(versions.map((v) => v.state), ['rejected', 'rejected', 'approved']);
});

test('C: 超限触发会议（autoDecide）→ 决策补救 → 通过', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: { maxReviewAttempts: 1, maxEscalations: 1, meeting: { autoDecide: true } },
  });
  raw.providers.mock.script.developer = devWithPlan({ 't-dev': { 1: BAD_CODE, 2: OK_CODE } });
  const proj = makeProject(raw);
  const decided = [];
  proj.bus.on('meeting.decided', (e) => decided.push(e));
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  const t = proj.taskStore.get('t-dev');
  assert.equal(t.attempts, 2);
  assert.equal(t.escalations, 1);
  assert.equal(proj.meetingStore.list().length, 1);
  const m = proj.meetingStore.list()[0];
  assert.equal(m.status, 'decided');
  assert.ok(m.decision.actions.some((a) => a.taskId === 't-dev'));
  assert.equal(decided.length, 1);
});

test('D: 未开自动决策 → 会议升级 → 任务 blocked 待人工', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: { maxReviewAttempts: 1, maxEscalations: 1, meeting: { autoDecide: false } },
  });
  raw.providers.mock.script.developer = devWithPlan({ 't-dev': { always: BAD_CODE } });
  const proj = makeProject(raw);
  const blocked = [];
  proj.bus.on('task.blocked_human', (e) => blocked.push(e));
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'blocked');
  assert.equal(summary.needsHuman.length, 1);
  assert.equal(proj.taskStore.get('t-dev').state, 'failed');
  assert.equal(proj.taskStore.get('t-dev').meta.humanBlocked, true);
  assert.equal(proj.meetingStore.list()[0].status, 'escalated');
  assert.equal(blocked.length, 1);
});

test('E: 审核者判 FAIL 也走重试', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: { maxReviewAttempts: 3 }, // 最多容忍 2 次失败后仍失败才升级
  });
  raw.providers.mock.script.developer = devWithPlan({ 't-dev': { always: OK_CODE } });
  // 审核者：前两次对 t-dev 判 FAIL，第三次 PASS
  let reviewCalls = 0;
  raw.providers.mock.script.reviewer = async () => {
    reviewCalls += 1;
    if (reviewCalls <= 2) {
      return { summary: 'FAIL: 审查未通过', text: '理由', issues: ['审查拒绝（测试）'], actions: [], done: true };
    }
    return { summary: 'PASS', text: '通过', issues: [], actions: [], done: true };
  };
  const proj = makeProject(raw);
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  assert.equal(proj.taskStore.get('t-dev').attempts, 3);
  assert.equal(proj.reviewStore.list().filter((r) => r.verdict === 'fail').length, 2);
});

test('F: 永久失败（超过 maxEscalations）→ 任务 failed + blocked_human', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: { maxReviewAttempts: 1, maxEscalations: 1, meeting: { autoDecide: true } },
  });
  raw.providers.mock.script.developer = devWithPlan({ 't-dev': { always: BAD_CODE } });
  const proj = makeProject(raw);
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'blocked');
  assert.equal(summary.needsHuman.length, 1);
  assert.equal(proj.taskStore.get('t-dev').state, 'failed');
  assert.equal(proj.meetingStore.list().length, 1, '仅一次会议：决策后的补救仍失败即升级人工');
});

test('G: 不满足依赖的任务不提前运行；空 workflow 直接终态', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
  });
  raw.providers.mock.script.developer = async () => {
    throw new Error('不应运行：依赖未完成就在跑');
  };
  const proj = makeProject(raw);
  const started = [];
  proj.bus.on('task.started', (e) => started.push(e.id));
  // 只驱动一轮迭代，验证只启动 t-arch（t-dev 依赖未完成不提前运行）
  await proj.engine.runUntil({ maxIterations: 1 });
  assert.deepEqual(started, ['t-arch']);
  assert.equal(proj.taskStore.get('t-dev').state, 'pending');
});