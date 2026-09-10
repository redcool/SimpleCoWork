import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toMinutes, rangeCovers, minutesInZone, dateKey, isInNightShift, NightShiftLog } from '../src/nightshift.js';
import { baseRaw, makeProject } from './helpers.js';

// ---------- 时间段判定 ----------

test('toMinutes 解析与非法输入', () => {
  assert.equal(toMinutes('22:00'), 1320);
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(toMinutes('23:59'), 1439);
  assert.throws(() => toMinutes('25:00'), /超出范围/);
  assert.throws(() => toMinutes('22-00'), /格式非法/);
});

test('rangeCovers：常规时段含边界，跨天时段正确', () => {
  const day = { start: '09:00', end: '17:00' };
  assert.equal(rangeCovers(day, toMinutes('09:00')), true);
  assert.equal(rangeCovers(day, toMinutes('17:00')), true);
  assert.equal(rangeCovers(day, toMinutes('12:00')), true);
  assert.equal(rangeCovers(day, toMinutes('08:59')), false);
  const night = { start: '22:00', end: '08:30' };
  assert.equal(rangeCovers(night, toMinutes('22:00')), true);
  assert.equal(rangeCovers(night, toMinutes('23:59')), true);
  assert.equal(rangeCovers(night, toMinutes('00:00')), true);
  assert.equal(rangeCovers(night, toMinutes('08:30')), true);
  assert.equal(rangeCovers(night, toMinutes('12:00')), false);
});

test('minutesInZone：时区换算（UTC 与上海差 8 小时）', () => {
  const d = new Date('2026-09-10T12:00:00Z');
  assert.equal(minutesInZone(d, 'UTC'), 12 * 60);
  assert.equal(minutesInZone(d, 'Asia/Shanghai'), 20 * 60);
});

test('isInNightShift：跨天时段 + 时区 + 空时段', () => {
  const ranges = [{ start: '22:00', end: '08:30' }];
  // 23:00 上海 = 15:00Z
  assert.equal(isInNightShift(ranges, new Date('2026-09-10T15:00:00Z'), 'Asia/Shanghai'), true);
  // 12:00 上海 = 04:00Z
  assert.equal(isInNightShift(ranges, new Date('2026-09-10T04:00:00Z'), 'Asia/Shanghai'), false);
  assert.equal(isInNightShift([], new Date(), 'UTC'), false);
});

test('dateKey：目标时区下的日期（跨天归属）', () => {
  const d = new Date('2026-09-10T23:30:00Z'); // 上海已是 9-11 07:30
  assert.equal(dateKey(d, 'UTC'), '2026-09-10');
  assert.equal(dateKey(d, 'Asia/Shanghai'), '2026-09-11');
});

// ---------- 夜班日志 ----------

test('NightShiftLog：聚合、渲染（问题/分析过程/决定）、落盘', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-night-'));
  try {
    const log = new NightShiftLog({ dir, timeZone: 'Asia/Shanghai', clock: () => new Date('2026-09-10T15:00:00Z') });
    log.add({
      kind: 'decision',
      title: '任务 t-dev（实现 API 模块）多次未通过质量门',
      problem: ['src/api.js 缺少 "module.exports"'],
      analysis: ['架构师（architect）：按规则 R1 修复', '开发者（dev）：补齐导出并清理 TODO'],
      decision: '修复 api.js 以符合架构约束',
      decisionsBy: 'manager',
      actions: [{ taskId: 't-dev', instruction: '确保 src/api.js 包含 module.exports' }],
    });
    assert.equal(log.eventCount(), 1);
    assert.deepEqual(log.listDays(), ['2026-09-10']);
    const md = log.renderDay('2026-09-10');
    assert.ok(md.includes('# 夜班记录 2026-09-10'));
    assert.ok(md.includes('### 问题'));
    assert.ok(md.includes('### 分析过程'));
    assert.ok(md.includes('### 决定'));
    assert.ok(md.includes('src/api.js 缺少 "module.exports"'));
    assert.ok(md.includes('架构师（architect）'));
    assert.ok(md.includes('分工：t-dev ← 确保 src/api.js 包含 module.exports'));
    assert.ok(md.includes('1 个已由 agents 会议解决'));
    // 落盘
    assert.equal(existsSync(join(dir, '2026-09-10.md')), true);
    assert.ok(readFileSync(join(dir, '2026-09-10.md'), 'utf8').includes('### 决定'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- 引擎集成：夜班 vs 白天 ----------

const NIGHT_CLOCK = () => new Date('2026-09-10T15:00:00Z'); // 上海 23:00 → 夜班
const DAY_CLOCK = () => new Date('2026-09-10T04:00:00Z'); // 上海 12:00 → 白天

function nightRaw(badPlan) {
  const raw = baseRaw({
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      ],
    },
    engine: {
      maxReviewAttempts: 1,
      maxEscalations: 2, // 夜班演示需要足够升级额度看到完整闭环
      meeting: { autoDecide: false }, // 白天会阻塞人工；夜班应自动开会
      nightShift: { enabled: true, timezone: 'Asia/Shanghai', ranges: [{ start: '22:00', end: '08:30' }] },
    },
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

test('夜班：质量问题不阻塞人工，多角色讨论形成决策并写夜班文档', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-nightrun-'));
  try {
    const log = new NightShiftLog({ dir, timeZone: 'Asia/Shanghai', clock: NIGHT_CLOCK });
    const raw = nightRaw({ 1: 'module.exports = "BAD";', 2: 'module.exports = "OK";' });
    const proj = makeProject(raw, { clock: NIGHT_CLOCK, nightShiftLog: log });
    const decided = [];
    proj.bus.on('meeting.decided', (e) => decided.push(e));
    const summary = await proj.engine.runUntil({});
    assert.equal(summary.state, 'completed');
    assert.equal(proj.taskStore.get('t-dev').state, 'approved');
    // 夜班自动开了多角色会议并决策
    const m = proj.meetingStore.list()[0];
    assert.equal(m.status, 'decided');
    assert.ok(m.decision.actions.some((a) => a.taskId === 't-dev'));
    assert.ok(Array.isArray(m.discussion) && m.discussion.length >= 3, '应有至少 3 个角色发言');
    // 夜班文档已写入（kind=decision）
    const events = log.dayEvents('2026-09-10');
    assert.ok(events.some((e) => e.kind === 'decision'));
    assert.ok(events[0].analysis.length >= 3);
    assert.ok(existsSync(join(dir, '2026-09-10.md')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('夜班：始终失败时仍保留人工升级出口（文档记录未解决）', async () => {
  const log = new NightShiftLog({ timeZone: 'Asia/Shanghai', clock: NIGHT_CLOCK });
  const raw = nightRaw({ always: 'module.exports = "BAD";' });
  // maxEscalations=1 让第二次补救失败即升级人工
  raw.engine.maxEscalations = 1;
  const proj = makeProject(raw, { clock: NIGHT_CLOCK, nightShiftLog: log });
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'blocked');
  assert.equal(summary.needsHuman.length, 1);
  // 夜班会议已决策过一次（记录为 decision），但补救仍失败 → 人工出口
  const m = proj.meetingStore.list()[0];
  assert.ok(m.status === 'decided' || m.status === 'escalated');
  assert.equal(log.eventCount() >= 1, true);
});

test('白天（不在夜班时段）：autoDecide=false 仍阻塞人工，不触发讨论也不写夜班文档', async () => {
  const log = new NightShiftLog({ timeZone: 'Asia/Shanghai', clock: DAY_CLOCK });
  const raw = nightRaw({ always: 'module.exports = "BAD";' });
  raw.engine.maxEscalations = 1;
  const proj = makeProject(raw, { clock: DAY_CLOCK, nightShiftLog: log });
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'blocked');
  const m = proj.meetingStore.list()[0];
  assert.equal(m.status, 'escalated');
  assert.equal(m.discussion, undefined, '白天不应有多角色讨论');
  assert.equal(log.eventCount(), 0, '白天不写夜班文档');
});

test('夜班关闭时 --night 语义由配置控制；isInNightShift 汇总字段可见', async () => {
  const raw = nightRaw({ 1: 'module.exports = "OK";' });
  const proj = makeProject(raw, { clock: NIGHT_CLOCK });
  const summary = await proj.engine.runUntil({});
  assert.equal(proj.engine.summary().nightShift, true);
  assert.equal(summary.state, 'completed');
});