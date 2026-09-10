// 项目配置：规范、校验、DAG 环检测、加载（cowork.config.js 为 ESM 默认导出）
import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

export const ROLES = new Set(['architect', 'developer', 'reviewer', 'manager', 'meeting']);
export const RISKS = new Set(['low', 'medium', 'high']);

export const DEFAULT_PROMPTS = {
  architect: '你是资深软件架构师：负责设计清晰的分层架构，并把架构约束形式化为可机检规则。',
  developer: '你是资深开发者：严格依据输入产物实现代码，遵循架构约束，输出完整可用的文件。',
  reviewer: '你是严格的项目审核者：独立核实产物是否满足验收标准与架构约束，不轻信开发者的自述。',
  manager: '你是项目协调者：负责跟进整体进度、识别风险、产出决策与汇报。',
};

export function defaultEngine() {
  return {
    maxConcurrent: 2,
    maxReviewAttempts: 2,
    maxEscalations: 1,
    persistDir: '.cowork',
    agentTimeoutMs: 120000,
    commandTimeoutMs: 60000,
    meeting: { autoDecide: false },
    nightShift: {
      enabled: false,
      timezone: 'Asia/Shanghai',
      ranges: [{ start: '22:00', end: '08:30' }],
    },
  };
}

export function normalizeConfig(input = {}) {
  const cfg = input || {};
  return {
    project: {
      name: String(cfg.project?.name ?? 'cowork-project'),
      description: String(cfg.project?.description ?? ''),
      baseDir: String(cfg.project?.baseDir ?? '.'),
      ...(cfg.project ?? {}),
    },
    providers: cfg.providers ?? {},
    agents: (cfg.agents ?? []).map((a) => ({
      enabled: true,
      prompt: DEFAULT_PROMPTS[a.role] ?? `你是${a.role}。`,
      ...a,
    })),
    workflow: {
      tasks: (cfg.workflow?.tasks ?? []).map((t) => ({
        requires: [],
        inputs: [],
        outputs: [],
        verify: [],
        risk: 'low',
        gate: true,
        acceptance: [],
        ...t,
      })),
    },
    engine: {
      ...defaultEngine(),
      ...(cfg.engine ?? {}),
      meeting: { ...defaultEngine().meeting, ...(cfg.engine?.meeting ?? {}) },
      nightShift: {
        ...defaultEngine().nightShift,
        ...(cfg.engine?.nightShift ?? {}),
        ranges: (cfg.engine?.nightShift?.ranges ?? defaultEngine().nightShift.ranges).map((r) => ({ ...r })),
      },
    },
  };
}

/** 返回 { ok, errors[] }，不抛异常 */
export function validateConfig(cfg) {
  const errors = [];
  if (!isValidName(cfg.project.name)) errors.push('project.name 必须是合法名称（字母数字-_，长度1-64）');

  // providers
  for (const [key, p] of Object.entries(cfg.providers ?? {})) {
    if (!isValidName(key)) errors.push(`providers.${key} 名称非法`);
    if (!['mock', 'openai'].includes(p?.kind)) errors.push(`providers.${key}.kind 必须为 mock 或 openai（当前: ${p?.kind}）`);
  }

  // agents
  const agentIds = new Set();
  for (const a of cfg.agents ?? []) {
    if (!isValidName(a.id)) errors.push(`agents.id 非法: ${JSON.stringify(a.id)}`);
    else if (agentIds.has(a.id)) errors.push(`agents.id 重复: ${a.id}`);
    agentIds.add(a.id);
    if (!ROLES.has(a.role)) errors.push(`agent ${a.id} 的 role 非法: ${a.role}（可选: ${[...ROLES].join('/')}）`);
    if (!cfg.providers || !cfg.providers[a.provider]) errors.push(`agent ${a.id} 引用了未配置的 provider: ${a.provider}`);
    if (typeof a.model !== 'string' || !a.model) errors.push(`agent ${a.id} 缺少 model`);
  }

  // workflow tasks
  const taskDefs = cfg.workflow?.tasks ?? [];
  const taskIds = new Set();
  for (const t of taskDefs) {
    if (!isValidName(t.id)) errors.push(`workflow.tasks 存在非法 id: ${JSON.stringify(t.id)}`);
    else if (taskIds.has(t.id)) errors.push(`workflow.tasks.id 重复: ${t.id}`);
    taskIds.add(t.id);
    if (!agentIds.has(t.agentId)) errors.push(`task ${t.id} 引用了未知 agent: ${t.agentId}`);
    if (!RISKS.has(t.risk)) errors.push(`task ${t.id} 的 risk 非法: ${t.risk}`);
    if (!Array.isArray(t.outputs) || t.outputs.length === 0) errors.push(`task ${t.id} 至少需要一个 outputs 产物名`);
    for (const r of t.requires ?? []) if (!taskIds.has(r) && ![...t.requires].includes(r)) {
      // requires 可能引用后续定义的任务，第一阶段先收集，第二阶段统一检查
    }
  }
  // 第二阶段：requires / inputs 引用检查
  for (const t of taskDefs) {
    for (const r of t.requires ?? []) {
      if (!taskIds.has(r)) errors.push(`task ${t.id} 的 requires 引用未知任务: ${r}`);
    }
  }
  for (const t of taskDefs) {
    for (const inp of t.inputs ?? []) {
      if (typeof inp !== 'string' || !inp) errors.push(`task ${t.id} 的 inputs 必须是产物名字符串`);
    }
  }
  // engine 数值
  const eng = cfg.engine ?? {};
  for (const k of ['maxConcurrent', 'maxReviewAttempts', 'maxEscalations']) {
    if (!Number.isInteger(eng[k]) || eng[k] < 1) errors.push(`engine.${k} 必须为正整数`);
  }
  if (typeof eng.meeting?.autoDecide !== 'boolean') errors.push('engine.meeting.autoDecide 必须为布尔');

  // nightShift
  const ns = eng.nightShift ?? {};
  if (typeof ns.enabled !== 'boolean') errors.push('engine.nightShift.enabled 必须为布尔');
  if (typeof ns.timezone !== 'string' || !ns.timezone) errors.push('engine.nightShift.timezone 必须为非空字符串（IANA 时区名）');
  if (!Array.isArray(ns.ranges) || ns.ranges.length === 0) errors.push('engine.nightShift.ranges 至少需要一个 {start,end} 时间段');
  for (const r of ns.ranges ?? []) {
    for (const k of ['start', 'end']) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(r?.[k] ?? ''));
      if (!m) errors.push(`engine.nightShift.ranges 的 ${k} 必须是 HH:MM（当前: ${String(r?.[k])}）`);
    }
  }

  // DAG 环检测
  const cycle = findCycle(taskDefs.map((t) => ({ id: t.id, requires: t.requires ?? [] })));
  if (cycle) errors.push(`workflow 存在环形依赖: ${cycle.join(' -> ')}`);

  return { ok: errors.length === 0, errors };
}

export function assertConfig(cfg) {
  const { ok, errors } = validateConfig(cfg);
  if (!ok) {
    throw new Error(`配置校验失败:\n- ${errors.join('\n- ')}`);
  }
  return cfg;
}

export async function loadConfig(configPath) {
  const abs = isAbsolute(configPath) ? configPath : resolvePath(process.cwd(), configPath);
  if (!existsSync(abs)) throw new Error(`配置文件不存在: ${abs}`);
  const mod = await import(pathToFileURL(abs).href);
  const raw = mod.default ?? mod;
  const cfg = normalizeConfig(typeof raw === 'function' ? await raw() : raw);
  assertConfig(cfg);
  return cfg;
}

export function findCycle(nodes) {
  // nodes: [{id, requires: string[]}]，返回首个环的路径或 null（三色 DFS）
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(nodes.map((n) => [n.id, WHITE]));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const stack = [];
  const visit = (id) => {
    color.set(id, GRAY);
    stack.push(id);
    const node = nodes[index.get(id)];
    for (const r of node.requires) {
      if (!color.has(r)) continue; // 外部引用已由校验处理
      const c = color.get(r);
      if (c === GRAY) {
        const cut = stack.indexOf(r);
        return stack.slice(cut).concat(r);
      }
      if (c === WHITE) {
        const found = visit(r);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  };
  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      const found = visit(n.id);
      if (found) return found;
    }
  }
  return null;
}

function isValidName(s) {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
}