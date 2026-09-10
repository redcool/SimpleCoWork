import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createProject } from '../src/index.js';
import { buildReportSnapshot } from '../src/reporter.js';

const demoConfigPath = fileURLToPath(new URL('../examples/demo/cowork.config.js', import.meta.url));

test('集成：examples/demo 全流程（离线 mock）', async () => {
  const cfg = await loadConfig(demoConfigPath);
  const proj = createProject({ config: cfg, dir: null, persist: false });
  const tracker = { running: 0, max: 0 };
  proj.bus.on('task.started', (e) => {
    tracker.running += 1;
    tracker.max = Math.max(tracker.max, tracker.running);
  });
  proj.bus.on('task.submitted', (e) => { tracker.running -= 1; });
  proj.bus.on('task.failed', (e) => { tracker.running -= 1; });

  const summary = await proj.engine.runUntil({});

  // 1) 总体完成
  assert.equal(summary.state, 'completed');
  assert.equal(summary.approved, 4); // t-arch, t-dev-api, t-dev-db, t-report

  // 2) 并行：两个开发任务在同一个批次运行（maxConcurrent=2）
  assert.ok(tracker.max >= 2, `并发观测 ${tracker.max}`);

  // 3) t-dev-api 经历 1 次质量门失败 → 会议（自动决策）→ 补救重试
  const dev = proj.taskStore.get('t-dev-api');
  assert.equal(dev.attempts, 2);
  assert.equal(dev.escalations, 1);

  // 4) 会议被触发并有决策与分工 action
  const meetings = proj.meetingStore.list();
  assert.equal(meetings.length, 1);
  const m = meetings[0];
  assert.equal(m.status, 'decided');
  assert.equal(m.taskId, 't-dev-api');
  assert.ok(m.decision.actions.some((a) => a.taskId === 't-dev-api'));

  // 5) code-api 有 v1（rejected）与 v2（approved）
  const versions = proj.artifactStore.versionsOf('code-api');
  assert.deepEqual(versions.map((v) => v.state), ['rejected', 'approved']);

  // 6) 审核记录：t-dev-api 有一次 fail + 一次 pass
  const devReviews = proj.reviewStore.list().filter((r) => r.taskId === 't-dev-api');
  assert.ok(devReviews.some((r) => r.verdict === 'fail'));
  assert.ok(devReviews.some((r) => r.verdict === 'pass'));

  // 7) 架构产物含 rules.json，Oracle 规则被实际执行
  const arch = proj.artifactStore.latestApproved('architecture');
  const rulesFile = arch.files.find((f) => f.path === 'rules.json');
  assert.ok(rulesFile, '架构产物必须含 rules.json');
  const rules = JSON.parse(rulesFile.content).rules;
  assert.ok(rules.length >= 3);

  // 8) 汇报产物与报告
  const reportArt = proj.artifactStore.latestApproved('report');
  assert.ok(reportArt.text.includes('汇报'));
  const snap = buildReportSnapshot(proj, proj.engine);
  assert.equal(snap.summary.progressPct, 100);
  assert.deepEqual(snap.risks, []);
});

test('集成：事件日志与快照持久化可回放', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-persist-'));
  try {
    const cfg = await loadConfig(demoConfigPath);
    const proj = createProject({ config: cfg, dir, persist: true });
    const summary = await proj.engine.runUntil({});
    assert.equal(summary.state, 'completed');
    proj.saveState();

    // 事件日志已写入
    const events = proj.store.events;
    assert.ok(events.some((e) => e.type === 'meeting.triggered'));
    assert.ok(events.some((e) => e.type === 'task.approved'));

    // 新实例恢复状态
    const proj2 = createProject({ config: cfg, dir, persist: true });
    assert.equal(proj2.restoreState(), true);
    assert.equal(proj2.taskStore.get('t-dev-api').attempts, 2);
    assert.equal(proj2.taskStore.get('t-report').state, 'approved');
    assert.equal(proj2.meetingStore.list().length, 1);
    assert.equal(proj2.artifactStore.latestApproved('code-db').state, 'approved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});