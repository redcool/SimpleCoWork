import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPanelServer, buildStateView, applyDecision } from '../src/index.js';
import { normalizeConfig, assertConfig } from '../src/config.js';
import { createProject, NightShiftLog } from '../src/index.js';
import { baseRaw } from './helpers.js';

function persistProject(dir, rawConfig, opts = {}) {
  const cfg = assertConfig(normalizeConfig(rawConfig));
  // 与 CLI 约定一致：状态在 <项目根>/.cowork 下；项目根用于 night-shift/ 与面板
  return createProject({ config: cfg, dir: join(dir, '.cowork'), persist: true, clock: opts.clock, nightShiftLog: opts.nightShiftLog });
}

/** 会阻塞在会议上的配置：dev 恒失败（第一版），autoDecide=false 需人工 */
function blockingRaw(badPlan) {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: { maxReviewAttempts: 1, maxEscalations: 1, meeting: { autoDecide: false } },
  });
  raw.providers.mock.script.developer = async (ctx) => ({
    summary: `实现第 ${ctx.attempt} 次`,
    text: '',
    actions: [{ type: 'write', path: 'src/api.js', content: badPlan[ctx.attempt] ?? badPlan.always }],
    knownIssues: [],
    done: true,
  });
  return raw;
}

test('Web 面板 + 人工审批 + run --resume 闭环（blocked → 审批 → 续跑完成）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-web-'));
  try {
    const raw = blockingRaw({ 1: 'module.exports = "BAD";', 2: 'module.exports = "OK";' });
    // 阶段一：运行到 blocked（需要人工审批）
    const p1 = persistProject(dir, raw);
    const s1 = await p1.engine.runUntil({});
    assert.equal(s1.state, 'blocked');
    p1.saveState();

    // 面板数据视图：能看到 escalated 会议与失败任务
    const view = buildStateView(dir);
    const meeting = view.meetings.find((m) => m.status === 'escalated');
    assert.ok(meeting, '应有待审批会议');
    assert.ok(view.tasks.find((t) => t.id === 't-dev' && t.state === 'failed'));

    // 审批写回：会议 decided + 任务 needs_revision
    const applied = applyDecision(dir, {
      meetingId: meeting.id,
      decision: '修复 src/api.js 并重新提交',
      reason: '人工复核：补齐 module.exports',
      actions: [{ taskId: 't-dev', instruction: '确保 src/api.js 包含 module.exports' }],
    });
    assert.ok(applied.ok);
    const st = JSON.parse(readFileSync(join(dir, '.cowork', 'state.json'), 'utf8'));
    assert.equal(st.meetings.find((m) => m.id === meeting.id).status, 'decided');
    assert.equal(st.meetings.find((m) => m.id === meeting.id).decision.decidedBy, 'human');
    assert.equal(st.tasks.find((t) => t.id === 't-dev').state, 'needs_revision');

    // 阶段二：恢复续跑（对应 CLI run --resume）
    const p2 = persistProject(dir, raw);
    assert.equal(p2.restoreState(), true);
    p2.engine.resumeState();
    const s2 = await p2.engine.runUntil({});
    assert.equal(s2.state, 'completed');
    assert.equal(p2.taskStore.get('t-dev').state, 'approved');
    assert.equal(p2.taskStore.get('t-dev').attempts, 2);
    p2.saveState();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resume 清理：waiting 任务按会议是否已审批分流（未审批→阻塞；已审批→继续）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-resume-'));
  try {
    const raw = blockingRaw({ always: 'module.exports = "BAD";' });
    const p1 = persistProject(dir, raw);
    const s1 = await p1.engine.runUntil({});
    assert.equal(s1.state, 'blocked');
    p1.saveState();
    const stateFile = join(dir, '.cowork', 'state.json');
    // 场景 A：会议 escalated（未审批）→ resumeState 后任务保持阻塞
    {
      const st = JSON.parse(readFileSync(stateFile, 'utf8'));
      const meeting = st.meetings.find((m) => m.status === 'escalated');
      const task = st.tasks.find((t) => t.id === 't-dev');
      task.state = 'waiting';
      task.meta = { ...(task.meta ?? {}), humanBlocked: false, pendingMeetingId: meeting.id };
      writeFileSync(stateFile, JSON.stringify(st, null, 2), 'utf8');
      const p2 = persistProject(dir, raw);
      assert.ok(p2.restoreState());
      p2.engine.resumeState();
      const t = p2.taskStore.get('t-dev');
      assert.equal(t.state, 'failed');
      assert.equal(t.meta.humanBlocked, true);
    }
    // 场景 B：会议已审批（decided）→ resumeState 转 needs_revision，可续跑完成
    {
      const st = JSON.parse(readFileSync(stateFile, 'utf8'));
      const meeting = st.meetings.find((m) => m.status === 'escalated');
      meeting.status = 'decided';
      meeting.decision = {
        decision: '修复', reason: '人', decidedBy: 'human', at: new Date().toISOString(),
        actions: [{ taskId: 't-dev', instruction: '修复' }],
      };
      const task = st.tasks.find((t) => t.id === 't-dev');
      task.state = 'waiting';
      task.meta = { ...(task.meta ?? {}), humanBlocked: false, pendingMeetingId: meeting.id };
      writeFileSync(stateFile, JSON.stringify(st, null, 2), 'utf8');
      // 让 dev 第 2 次输出合格，从而续跑完成
      const raw2 = blockingRaw({ 1: 'module.exports = "BAD";', 2: 'module.exports = "OK";' });
      const p3 = persistProject(dir, raw2);
      p3.restoreState();
      p3.engine.resumeState();
      assert.equal(p3.taskStore.get('t-dev').state, 'needs_revision');
      const s3 = await p3.engine.runUntil({});
      assert.equal(s3.state, 'completed');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('面板 HTTP 服务：页面 / 状态 / 夜班列表-内容 / 审批接口', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-panel-'));
  try {
    // 准备状态与夜班文档
    mkdirSync(join(dir, '.cowork'), { recursive: true });
    mkdirSync(join(dir, 'night-shift'), { recursive: true });
    const log = new NightShiftLog({
      dir: join(dir, 'night-shift'), timeZone: 'Asia/Shanghai',
      clock: () => new Date('2026-09-11T00:00:00Z'),
    });
    log.add({
      kind: 'decision', title: '夜班问题', problem: ['问题A'], analysis: ['架构师：修'],
      decision: '修 A', decisionsBy: 'manager', actions: [{ taskId: 't', instruction: 'i' }],
    });
    const raw = blockingRaw({ always: 'module.exports = "BAD";' });
    const p = persistProject(dir, raw);
    const s = await p.engine.runUntil({});
    p.saveState();
    assert.equal(s.state, 'blocked');

    const { server, url, token } = await startPanelServer({ projectDir: dir, port: 0 });
    const base = url.split('?')[0].replace(/\/$/, ''); // URL 带 ?token= 前缀；API 请求用 base + 显式认证头
    const AUTH = { 'x-cowork-token': token };
    try {
      const home = await (await fetch(base + '/')).text();
      assert.ok(home.includes('CoWork 面板'));

      // 无 token → 401；错 token → 401；跨站 Origin → 401
      assert.equal((await fetch(base + '/api/state')).status, 401);
      assert.equal((await fetch(base + '/api/state', { headers: { 'x-cowork-token': 'wrong' } })).status, 401);
      assert.equal((await fetch(base + '/api/state', { headers: { ...AUTH, origin: 'https://evil.example' } })).status, 401);

      const st = await (await fetch(base + '/api/state', { headers: AUTH })).json();
      assert.equal(st.summary.state, 'blocked');
      assert.ok(st.meetings.some((m) => m.status === 'escalated'));

      const night = await (await fetch(base + '/api/night', { headers: AUTH })).json();
      assert.ok(night.days.includes('2026-09-11'));
      const doc = await (await fetch(base + '/api/night?day=' + encodeURIComponent('2026-09-11'), { headers: AUTH })).json();
      assert.ok(doc.markdown.includes('### 决定'));
      // day 路径穿越 → 400
      assert.equal((await fetch(base + '/api/night?day=' + encodeURIComponent('../../secret'), { headers: AUTH })).status, 400);

      const bad = await fetch(base + '/api/decisions', {
        method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ meetingId: 'm-x', decision: 'd' }),
      });
      assert.equal(bad.status, 409);

      const meetingId = st.meetings.find((m) => m.status === 'escalated').id;
      const ok = await fetch(base + '/api/decisions', {
        method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ meetingId, decision: '修复', reason: '人', actions: [{ taskId: 't-dev', instruction: '修' }] }),
      });
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).ok, true);
      const re = JSON.parse(readFileSync(join(dir, '.cowork', 'state.json'), 'utf8'));
      assert.equal(re.meetings.find((m) => m.id === meetingId).status, 'decided');
    } finally {
      server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI：serve 缺状态时报错提示先 run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-serve-empty-'));
  try {
    assert.equal(existsSync(join(dir, '.cowork', 'state.json')), false);
    // 直接调用 buildStateView 验证错误形态（CLI 侧在 servePanel 中先 check）
    assert.match(buildStateView(dir).error, /尚无运行状态/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NightShiftLog 与面板共用目录：writeDay 可重复（幂等）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-nlog-'));
  try {
    const log = new NightShiftLog({ dir, timeZone: 'UTC' });
    log.add({ kind: 'decision', title: 't1', problem: ['p'], analysis: ['a'], decision: 'd' });
    log.add({ kind: 'decision', title: 't2', problem: ['p2'], analysis: ['a2'], decision: 'd2' });
    assert.equal(log.eventCount(), 2);
    const md = readFileSync(join(dir, log.listDays()[0] + '.md'), 'utf8');
    assert.ok(md.includes('t1') && md.includes('t2'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});