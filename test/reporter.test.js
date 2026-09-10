import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseRaw, makeProject, standardTasks } from './helpers.js';
import { buildReportSnapshot, buildReport, renderMarkdown, defaultNarrative } from '../src/reporter.js';

test('报告快照：完成项目进度 100%、无风险、有下一步', async () => {
  const proj = makeProject({ ...baseRaw(), workflow: { tasks: standardTasks() } });
  await proj.engine.runUntil({});
  const snap = buildReportSnapshot(proj, proj.engine);
  assert.equal(snap.summary.state, 'completed');
  assert.equal(snap.summary.progressPct, 100);
  assert.equal(snap.summary.total, 3);
  assert.deepEqual(snap.risks, []);
  assert.deepEqual(snap.nextActions, []);
  assert.ok(snap.tasks.every((t) => t.state === 'approved'));
  assert.ok(snap.artifacts.some((a) => a.name === 'architecture' && a.state === 'approved'));
});

test('报告快照：失败项目带风险与下一步', async () => {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: { maxReviewAttempts: 1, maxEscalations: 1, meeting: { autoDecide: false } },
  });
  raw.providers.mock.script.developer = async () => ({
    summary: 'BAD',
    text: '',
    actions: [{ type: 'write', path: 'src/api.js', content: 'module.exports = "NOT_READY";' }],
    knownIssues: [],
    done: true,
  });
  const proj = makeProject(raw);
  await proj.engine.runUntil({});
  const snap = buildReportSnapshot(proj, proj.engine);
  assert.equal(snap.summary.state, 'blocked');
  assert.ok(snap.risks.some((r) => r.includes('t-dev')));
  assert.ok(snap.nextActions.some((n) => n.includes('处理会议')));
});

test('叙事默认文案与协调者叙事', async () => {
  const proj = makeProject({ ...baseRaw(), workflow: { tasks: standardTasks() } });
  await proj.engine.runUntil({});
  const { report, markdown } = await buildReport(proj, proj.engine, { withNarrative: true });
  assert.ok(report.narrative.length > 0);
  assert.ok(markdown.includes('# 项目汇报'));
  assert.ok(markdown.includes('| ID |'));
  assert.ok(markdown.includes('t-arch'));
  assert.match(defaultNarrative(report), /进度 100%/);
});

test('Markdown 渲染包含任务/产物/会议各节', async () => {
  const proj = makeProject({ ...baseRaw(), workflow: { tasks: standardTasks() } });
  await proj.engine.runUntil({});
  const { markdown } = await buildReport(proj, proj.engine, { withNarrative: false });
  for (const section of ['## 任务', '## 产物', '## 审核记录', '## 会议', '## 风险', '## 下一步']) {
    assert.ok(markdown.includes(section), `缺少 ${section}`);
  }
});