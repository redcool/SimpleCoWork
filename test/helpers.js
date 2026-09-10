// 测试公共工具
import { assertConfig, normalizeConfig } from '../src/config.js';
import { createProject } from '../src/index.js';

export function makeProject(rawConfig, opts = {}) {
  const cfg = assertConfig(normalizeConfig(rawConfig));
  return createProject({ config: cfg, dir: opts.dir ?? null, persist: opts.persist ?? false });
}

/** 默认规则集：要求 src/api.js 包含 "OK"（high） */
export function archRules(extra = []) {
  return JSON.stringify({
    rules: [
      { id: 'T1', severity: 'high', type: 'contains', file: 'src/api.js', text: 'OK', description: 'api.js 必须包含 OK' },
      ...extra,
    ],
  }, null, 2);
}

/** 基础 raw 配置：四角色 + architect/developer/reviewer/manager/decision 脚本 */
export function baseRaw(overrides = {}) {
  return {
    project: { name: 'test-proj' },
    providers: {
      mock: {
        kind: 'mock',
        script: {
          architect: async () => ({
            summary: '架构完成',
            text: '架构说明',
            actions: [{ type: 'write', path: 'rules.json', content: archRules() }],
            knownIssues: [],
            done: true,
          }),
          developer: defaultDeveloper,
          reviewer: gateReviewer,
          manager: async () => ({ summary: '汇报完成', text: '# 汇报\n完成。', actions: [], knownIssues: [], done: true }),
          decision: async (ctx) => ({
            summary: '决策：修复产物',
            text: '按架构约束修复。',
            actions: [{ taskId: ctx.task?.id, instruction: '修复产物并重新提交' }],
            knownIssues: [],
            done: true,
          }),
        },
      },
    },
    agents: [
      { id: 'architect', role: 'architect', title: '架构师', provider: 'mock', model: 'm1' },
      { id: 'dev', role: 'developer', title: '开发者', provider: 'mock', model: 'm2' },
      { id: 'reviewer', role: 'reviewer', title: '审核者', provider: 'mock', model: 'm3' },
      { id: 'manager', role: 'manager', title: '协调者', provider: 'mock', model: 'm4' },
    ],
    workflow: { tasks: [] },
    engine: {},
    ...overrides,
  };
}

/** 默认开发者：始终输出合格文件 src/api.js */
export function defaultDeveloper(ctx) {
  return {
    summary: '实现完成',
    text: '实现内容',
    actions: [{ type: 'write', path: 'src/api.js', content: 'module.exports = "OK";\n' }],
    knownIssues: [],
    done: true,
  };
}

/** 审核者：与质量门一致（high 失败即 FAIL），可被测试覆盖为自定义 */
export function gateReviewer(ctx) {
  const checks = ctx.gate?.checks ?? [];
  const highFail = checks.filter((c) => c.applicable !== false && c.severity === 'high' && !c.passed);
  if (highFail.length > 0) {
    return {
      summary: 'FAIL: 高严重性约束未满足',
      text: highFail.map((c) => `- [${c.ruleId}] ${c.detail}`).join('\n'),
      issues: highFail.map((c) => c.detail),
      actions: [],
      done: true,
    };
  }
  return { summary: 'PASS', text: '通过', issues: [], actions: [], done: true };
}

/** 标准三任务流水线：架构 → 实现 → 汇报(gate:false) */
export function standardTasks() {
  return [
    { id: 't-arch', name: '架构设计', agentId: 'architect', outputs: ['architecture'], risk: 'high' },
    { id: 't-dev', name: '代码实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'], risk: 'high' },
    { id: 't-report', name: '项目汇报', agentId: 'manager', requires: ['t-dev'], inputs: ['architecture', 'code'], outputs: ['report'], gate: false, risk: 'low' },
  ];
}

/** 并发运行观测：返回 { maxRunning, startedIds, firstStart }（订阅 busy 事件） */
export function trackConcurrency(project) {
  const running = new Set();
  let maxRunning = 0;
  const startedIds = [];
  project.bus.on('task.started', ({ id }) => {
    running.add(id);
    startedIds.push(id);
    maxRunning = Math.max(maxRunning, running.size);
  });
  for (const ev of ['task.submitted', 'task.failed', 'task.approved']) {
    project.bus.on(ev, ({ id }) => running.delete(id));
  }
  return {
    get maxRunning() {
      return maxRunning;
    },
    get startedIds() {
      return startedIds;
    },
    orderIndex(id) {
      return startedIds.indexOf(id);
    },
  };
}