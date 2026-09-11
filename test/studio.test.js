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
    assert.equal(summary.total, 7);
    assert.equal(summary.approved, 7);
    // 冲突会议发生过并决策（美术不符合策划规格 → 导演裁决）
    assert.equal(proj.meetingStore.list().length, 1);
    const m = proj.meetingStore.list()[0];
    assert.equal(m.status, 'decided');
    assert.ok(m.decision.actions.some((a) => a.taskId === 't-art'));
    // 策划团队任务：2 人参与、胜出 senior、产出为讨论整合版（含数值曲线）
    const gddArt = proj.artifactStore.latestApproved('gdd');
    assert.ok(gddArt.meta.team, 'GDD 产物应带团队 meta');
    assert.deepEqual(gddArt.meta.team.members, ['designer-senior', 'designer-numeric']);
    assert.equal(gddArt.meta.team.winner, 'designer-senior');
    assert.equal(gddArt.meta.team.judges.length, 2);
    assert.equal(gddArt.producer, 'designer-senior');
    const gddText = gddArt.files.find((f) => f.path === 'gdd.md').content;
    assert.ok(gddText.includes('hero'), 'GDD 定义核心角色（GD1）');
    assert.ok(gddText.includes('3m'), 'GDD 融合数值策划的跳跃高度曲线');
    // 美术重画后通过；评审者映射正确（取 pass 审查记录——首条 fail 由质量门记录、无评审者）
    const artArt = proj.artifactStore.latestApproved('art');
    assert.ok(artArt.files.some((f) => f.path === 'art/player.txt' && f.content.includes('hero')));
    const artReview = proj.reviewStore.list().filter((r) => r.taskId === 't-art' && r.verdict === 'pass').pop();
    assert.equal(artReview.reviewerId, 'artdirector');
    // 程序产物带测试证据（exec outFile 回读留档）
    const codeArt = proj.artifactStore.latestApproved('code');
    assert.ok(codeArt.files.some((f) => f.path === 'check.txt'), 'check.txt 应在产物 files 中');
    assert.ok(codeArt.files.some((f) => f.path === 'src/game.js'));
    // 叙事与音频产物到位
    assert.ok(proj.artifactStore.latestApproved('story').files.some((f) => f.path === 'story.md'));
    assert.ok(proj.artifactStore.latestApproved('audio').files.some((f) => f.path === 'audio/sfx.txt'));
    // 汇报任务输出；运行统计已收集
    assert.equal(proj.taskStore.get('t-report').state, 'approved');
    assert.ok(proj.engine.stats().length >= 8, '团队+会议+审查+汇报应产生多次模型调用（>=8）');
    const stats = proj.engine.statsSummary();
    assert.ok(stats.calls >= 8);
    assert.ok(stats.byRole.some((r) => r.key === 'game-designer' && r.calls >= 5), '策划团队 产出2 + 互评2 + 整合1 = 5 次调用');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- 团队任务（同角色多 agent 讨论择优） ----------

test('团队任务：配置校验（长度/未知成员/与 agentId 互斥）', () => {
  const bad1 = baseRaw({ workflow: { tasks: [{ id: 't', team: ['a'], outputs: ['x'] }] } });
  assert.throws(() => assertConfig(normalizeConfig(bad1)), /team 至少需要 2 名成员/);
  const bad2 = baseRaw({ workflow: { tasks: [{ id: 't', team: ['a', 'ghost'], outputs: ['x'] }] } });
  assert.throws(() => assertConfig(normalizeConfig(bad2)), /team 引用了未知 agent/);
  const bad3 = baseRaw({ workflow: { tasks: [{ id: 't', team: ['dev', 'reviewer'], agentId: 'dev', outputs: ['x'] }] } });
  assert.throws(() => assertConfig(normalizeConfig(bad3)), /不能同时指定 agentId 与 team/);
  const ok = baseRaw({ workflow: { tasks: [{ id: 't', team: ['dev', 'reviewer'], outputs: ['x'] }] } });
  assert.doesNotThrow(() => assertConfig(normalizeConfig(ok)));
});

test('团队任务：互评择优后胜出者整合（winner=高分者，产物带团队 meta）', async () => {
  const raw = baseRaw({
    agents: [
      { id: 'architect', role: 'architect', provider: 'mock', model: 'm1' },
      { id: 'devA', role: 'developer', title: '开发A', provider: 'mock', model: 'm2' },
      { id: 'devB', role: 'developer', title: '开发B', provider: 'mock', model: 'm3' },
      { id: 'reviewer', role: 'reviewer', provider: 'mock', model: 'm4' },
    ],
    workflow: {
      tasks: [
        { id: 't-arch', name: '架构', agentId: 'architect', outputs: ['architecture'] },
        { id: 't-dev', name: '模块实现（团队）', team: ['devA', 'devB'], requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'], verify: [{ id: 'C1', severity: 'high', type: 'contains', file: 'src/core.js', text: 'module.exports' }] },
      ],
    },
  });
  const s = raw.providers.mock.script;
  s.architect = async () => ({
    summary: '架构', text: '',
    actions: [
      { type: 'write', path: 'architecture.md', content: '# a' },
      { type: 'write', path: 'rules.json', content: JSON.stringify({ rules: [] }) },
    ], knownIssues: [], done: true,
  });
  s.developer = async (ctx) => {
    if (ctx.mode === 'team-produce') {
      return ctx.member === 'devA'
        ? { summary: 'A 方案', text: '方案A：完整实现，含 module.exports。', actions: [], knownIssues: [], done: true }
        : { summary: 'B 方案', text: '方案B：有遗漏（未导出 module.exports）。', actions: [], knownIssues: ['B 不导出'], done: true };
    }
    if (ctx.mode === 'team-judge') {
      return { summary: '审', text: '', scores: { devA: 95, devB: 60 }, pick: 'devA', score: 95, notes: '选 A，其实现完整。', done: true };
    }
    if (ctx.mode === 'team-finalize') {
      return {
        summary: '最终实现', text: '整合 A 完整实现',
        actions: [{ type: 'write', path: 'src/core.js', content: 'module.exports = 1;\n' }],
        knownIssues: [], done: true,
      };
    }
    return { summary: 'x', text: '', actions: [], knownIssues: [], done: true };
  };
  const proj = makeProject(raw);
  const summary = await proj.engine.runUntil({});
  assert.equal(summary.state, 'completed');
  const art = proj.artifactStore.latestApproved('code');
  assert.equal(art.producer, 'devA'); // 胜出者
  assert.equal(art.meta.team.winner, 'devA');
  assert.equal(art.meta.team.members.length, 2);
  assert.equal(art.meta.team.judges.length, 2);
  // 质量门对整合版生效
  assert.ok(proj.reviewStore.list().filter((r) => r.taskId === 't-dev' && r.verdict === 'pass').length >= 1);
});

// ---------- 资产规则：图片魔数与尺寸 ----------

test('oracle：file_magic 与 image_dimensions（PNG 魔数/真实尺寸/边界/ifPresent 跳过）', () => {
  const mkPng = (w, h) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.concat([Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR', 'ascii'), ihdr]),
      Buffer.from('body'),
    ]).toString('binary');
  };
  const fake = 'not a real png, just text pretending';
  const checks = evaluateRules([
    { id: 'F1', severity: 'high', type: 'file_magic', file: 'a.png', mime: 'png' },
    { id: 'F2', severity: 'high', type: 'file_magic', file: 'b.png', magic: '89504e47' },
    { id: 'D1', severity: 'high', type: 'image_dimensions', file: 'a.png', format: 'png', minWidth: 800, minHeight: 600 },
    { id: 'D2', severity: 'high', type: 'image_dimensions', file: 'c.png', format: 'png', minWidth: 32, minHeight: 32, ifPresent: true },
  ], [
    { path: 'a.png', content: mkPng(1024, 768) },
    { path: 'b.png', content: mkPng(64, 64) },
  ]);
  assert.equal(checks.find((c) => c.ruleId === 'F1').passed, true);
  assert.equal(checks.find((c) => c.ruleId === 'F2').passed, true);
  assert.equal(checks.find((c) => c.ruleId === 'D1').passed, true);
  const skip = checks.find((c) => c.ruleId === 'D2');
  assert.equal(skip.applicable, false);
  // 假 PNG（文本占位）被魔数拦截
  const fakeCheck = evaluateRules([{ id: 'F3', severity: 'high', type: 'file_magic', file: 'x.png', mime: 'png' }], [{ path: 'x.png', content: fake }]);
  assert.equal(fakeCheck[0].passed, false);
  // 尺寸不达标被拦截
  const small = evaluateRules([{ id: 'D3', severity: 'high', type: 'image_dimensions', file: 's.png', format: 'png', minWidth: 1024, minHeight: 1024 }], [{ path: 's.png', content: mkPng(48, 48) }]);
  assert.equal(small[0].passed, false);
  assert.ok(small[0].detail.includes('48×48'));
  // 文本文件冒充 JSON 被 file_magic(json) 拦截 / 通过
  assert.equal(evaluateRules([{ id: 'J1', severity: 'high', type: 'file_magic', file: 'g.json', mime: 'json' }], [{ path: 'g.json', content: '{"a":1}' }])[0].passed, true);
  assert.equal(evaluateRules([{ id: 'J2', severity: 'high', type: 'file_magic', file: 'h.json', mime: 'json' }], [{ path: 'h.json', content: '<html>' }])[0].passed, false);
});