import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateRules, verdictFor } from '../src/oracle.js';
import { normalizeConfig, assertConfig } from '../src/config.js';
import { createProject } from '../src/index.js';
import { baseRaw, makeProject } from './helpers.js';

// ---------- 自定义角色 ----------

test('自定义角色（制作人/策划/美术/程序等）通过配置校验', () => {
  const raw = baseRaw({
    agents: [
      { id: 'producer', role: 'producer', title: '制作人', provider: 'mock', model: 'm0' },
      { id: 'designer', role: 'game-designer', title: '策划', provider: 'mock', model: 'm1' },
      { id: 'artist', role: 'artist', title: '美术', provider: 'mock', model: 'm2' },
      { id: 'programmer', role: 'programmer', title: '程序', provider: 'mock', model: 'm3' },
      { id: 'dev', role: 'developer', title: '开发者', provider: 'mock', model: 'm4' },
      { id: 'reviewer', role: 'reviewer', title: '审核者', provider: 'mock', model: 'm5' },
    ],
  });
  assert.doesNotThrow(() => assertConfig(normalizeConfig(raw)));
  // 非法角色形（大写/空）仍被拒绝
  const bad = baseRaw({ agents: [{ id: 'x', role: 'Game-Designer', provider: 'mock', model: 'm' }] });
  assert.throws(() => assertConfig(normalizeConfig(bad)), /role 非法/);
  // accepts 必须为数组
  const badAccept = baseRaw({ agents: [{ id: 'rr', role: 'reviewer', provider: 'mock', model: 'm', accepts: 'art' }] });
  assert.throws(() => assertConfig(normalizeConfig(badAccept)), /accepts 必须是数组/);
});

// ---------- 资产规则 ----------

test('oracle：min_size 与 json_valid 资产规则（含 ifPresent 跳过）', () => {
  const rules = [
    { id: 'M1', severity: 'high', type: 'min_size', file: 'art/bg.json', min: 8, ifPresent: true, description: '背景配置非空' },
    { id: 'J1', severity: 'high', type: 'json_valid', file: 'art/bg.json', ifPresent: true, description: '背景配置必须为合法 JSON' },
    { id: 'M2', severity: 'medium', type: 'min_size', file: 'art/player.txt', min: 5, ifPresent: true },
  ];
  const checks = evaluateRules(rules, [
    { path: 'art/bg.json', content: '{"sky":1}' },
  ]);
  // bg.json 在场：M1(长 9≥8)✓ J1✓；player.txt 缺席 → M2 跳过(applicable:false)
  assert.equal(checks.find((c) => c.ruleId === 'M1').passed, true);
  assert.equal(checks.find((c) => c.ruleId === 'J1').passed, true);
  const m2 = checks.find((c) => c.ruleId === 'M2');
  assert.equal(m2.applicable, false);
  assert.equal(m2.passed, true);
  // 空文件 / 非法 JSON 被拦截
  const bad = evaluateRules([
    { id: 'M1', severity: 'high', type: 'min_size', file: 'a.txt', min: 10 },
    { id: 'J1', severity: 'high', type: 'json_valid', file: 'b.json' },
  ], [
    { path: 'a.txt', content: 'tiny' },
    { path: 'b.json', content: '{oops' },
  ]);
  assert.equal(verdictFor(bad).verdict, 'fail');
  assert.equal(verdictFor(bad).issues.length, 2);
  assert.equal(evaluateRules([{ id: 'J2', severity: 'high', type: 'json_valid', file: 'ok.json' }], [{ path: 'ok.json', content: '{"a":1}' }])[0].passed, true);
});

// ---------- 评审者按产物匹配（accepts） ----------

function studioRaw() {
  const raw = baseRaw({
    agents: [
      { id: 'architect', role: 'architect', provider: 'mock', model: 'm1' },
      { id: 'artist', role: 'artist', provider: 'mock', model: 'm2' },
      { id: 'programmer', role: 'programmer', provider: 'mock', model: 'm3' },
      { id: 'qat', role: 'reviewer', title: 'QA', provider: 'mock', model: 'm4', accepts: ['code'] },
      { id: 'artdirector', role: 'reviewer', title: '艺术总监', provider: 'mock', model: 'm5', accepts: ['art'] },
    ],
  });
  // 覆盖架构脚本：产出空规则，避免 baseRaw 默认 T1 规则（无 ifPresent）跨产物误伤美术/代码产物
  raw.providers.mock.script.architect = async () => ({
    summary: '架构（无全局规则，规则由各产物 verify 声明）',
    text: '',
    actions: [
      { type: 'write', path: 'architecture.md', content: '# 架构' },
      { type: 'write', path: 'rules.json', content: JSON.stringify({ rules: [] }) },
    ],
    knownIssues: [],
    done: true,
  });
  raw.providers.mock.script.artist = async () => ({
    summary: '美术资产', text: '', actions: [{ type: 'write', path: 'art/bg.json', content: '{"sky":1}' }], knownIssues: [], done: true,
  });
  raw.providers.mock.script.programmer = async () => ({
    summary: '代码', text: '', actions: [{ type: 'write', path: 'src/api.js', content: 'module.exports="OK";' }], knownIssues: [], done: true,
  });
  return raw;
}

test('accepts 匹配：art 产物由艺术总监审、code 产物由 QA 审、其它任务通用回退', async () => {
  const raw = studioRaw();
  raw.workflow.tasks = [
    { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
    { id: 't-art', name: '美术', agentId: 'artist', requires: ['t-arch'], inputs: ['architecture'], outputs: ['art'],
      verify: [{ id: 'A1', severity: 'high', type: 'json_valid', file: 'art/bg.json' }] },
    { id: 't-code', name: '代码', agentId: 'programmer', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'],
      verify: [{ id: 'C1', severity: 'high', type: 'contains', file: 'src/api.js', text: 'OK' }] },
  ];
  const proj = makeProject(raw);
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  const reviews = proj.reviewStore.list();
  const artReview = reviews.find((r) => r.taskId === 't-art');
  const codeReview = reviews.find((r) => r.taskId === 't-code');
  assert.equal(artReview.reviewerId, 'artdirector');
  assert.equal(codeReview.reviewerId, 'qat');
  assert.equal(artReview.verdict, 'pass');
  assert.equal(codeReview.verdict, 'pass');
});

test('accepts 无双匹配时回退：仅一个通用 reviewer 仍审查代码类任务', async () => {
  const raw = studioRaw();
  // 只保留 artdirector（accepts:['art']）→ t-code 无匹配 → 回退第一个 reviewer
  raw.agents = raw.agents.filter((a) => a.id !== 'qat');
  raw.workflow.tasks = [
    { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
    { id: 't-code', name: '代码', agentId: 'programmer', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'],
      verify: [{ id: 'C1', severity: 'high', type: 'contains', file: 'src/api.js', text: 'OK' }] },
  ];
  const proj = makeProject(raw);
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  const codeReview = proj.reviewStore.list().find((r) => r.taskId === 't-code');
  assert.equal(codeReview.reviewerId, 'artdirector'); // 兜底回退
});

// ---------- 工作室 demo 全流程（导入 examples/game-studio-demo） ----------

test('工作室 demo 端到端：创意冲突会议 → 美术重画 → 全量完成', async () => {
  const cfgMod = await import('../examples/game-studio-demo/cowork.config.js');
  const cfg = assertConfig(normalizeConfig(cfgMod.default));
  // 用临时目录持久化运行：exec 动作（node --check）在真实工作目录执行并把 outFile 回读为产物证据
  const dir = mkdtempSync(join(tmpdir(), 'cowork-studio-'));
  try {
    const proj = createProject({ config: cfg, dir: join(dir, '.cowork'), persist: true });
    const evs = [];
    proj.bus.on('meeting.triggered', (e) => evs.push(e));
    proj.bus.on('task.decided_retry', (e) => evs.push(e));
    const summary = await proj.engine.runUntil({});
    assert.equal(summary.state, 'completed');
    assert.equal(summary.total, 5);
    assert.equal(summary.approved, 5);
    // 冲突会议发生过并决策（美术不符合策划规格 → 导演裁决）
    assert.equal(proj.meetingStore.list().length, 1);
    const m = proj.meetingStore.list()[0];
    assert.equal(m.status, 'decided');
    assert.ok(m.decision.actions.some((a) => a.taskId === 't-art'));
    // 美术重画后通过；评审者映射正确（取 pass 审查记录——首条 fail 由质量门记录、无评审者）
    const artArt = proj.artifactStore.latestApproved('art');
    assert.ok(artArt.files.some((f) => f.path === 'art/player.txt' && f.content.includes('hero')));
    const artReview = proj.reviewStore.list().filter((r) => r.taskId === 't-art' && r.verdict === 'pass').pop();
    assert.equal(artReview.reviewerId, 'artdirector');
    // 程序产物带测试证据（exec outFile 回读留档）
    const codeArt = proj.artifactStore.latestApproved('code');
    assert.ok(codeArt.files.some((f) => f.path === 'check.txt'), 'check.txt 应在产物 files 中');
    assert.ok(codeArt.files.some((f) => f.path === 'src/game.js'));
    // 汇报任务输出
    assert.equal(proj.taskStore.get('t-report').state, 'approved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});