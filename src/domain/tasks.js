// 任务状态机：pending → ready → running → submitted → approved | needs_revision | waiting | failed | cancelled
// waiting：等待会议决策/人工决策；决策后回到 needs_revision（再由 advanceReady 变 ready）
export const TASK_ALLOWED = {
  pending: ['ready', 'cancelled'],
  ready: ['running', 'cancelled'],
  running: ['submitted', 'failed', 'cancelled'],
  submitted: ['approved', 'needs_revision', 'waiting', 'failed', 'cancelled'],
  needs_revision: ['ready', 'failed', 'cancelled'],
  waiting: ['ready', 'needs_revision', 'failed', 'cancelled'],
  failed: ['ready', 'cancelled'],
};

export class TaskStore {
  constructor(bus) {
    this.bus = bus;
    this.tasks = new Map();
    this.version = 0; // 每次合法迁移 +1，供引擎判定"是否有进展"
  }

  fromSnapshot(list) {
    this.tasks = new Map((list ?? []).map((t) => [t.id, { ...t }]));
    this.version = 0;
  }

  create(def, opts = {}) {
    if (this.tasks.has(def.id)) throw new Error(`任务 id 重复: ${def.id}`);
    const task = {
      id: def.id,
      name: def.name,
      agentId: def.agentId,
      requires: [...(def.requires ?? [])],
      inputs: [...(def.inputs ?? [])],
      outputs: [...(def.outputs ?? [])],
      verify: [...(def.verify ?? [])],
      acceptance: [...(def.acceptance ?? [])],
      risk: def.risk ?? 'low',
      gate: def.gate !== false,
      meta: { ...(def.meta ?? {}) },
      state: 'pending',
      attempts: 0,
      escalations: 0,
      result: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    this.bus.emit('task.created', { id: task.id });
    return task;
  }

  createAll(defs, opts) {
    for (const d of defs) this.create(d, opts);
  }

  get(id) {
    const t = this.tasks.get(id);
    if (!t) throw new Error(`未知任务: ${id}`);
    return t;
  }

  list(filter = {}) {
    const out = [...this.tasks.values()];
    if (filter.state) return out.filter((t) => t.state === filter.state);
    if (filter.states) return out.filter((t) => filter.states.includes(t.state));
    return out;
  }

  transition(id, to, meta = {}) {
    const t = this.get(id);
    const from = t.state;
    if (!TASK_ALLOWED[from]?.includes(to)) {
      throw new Error(`任务 ${id} 非法状态迁移: ${from} -> ${to}`);
    }
    t.state = to;
    Object.assign(t, meta);
    t.updatedAt = new Date().toISOString();
    this.version += 1;
    this.bus.emit('task.state', { id, from, to });
    return t;
  }

  /** 依赖是否全部 approved */
  depsDone(id) {
    const t = this.get(id);
    return t.requires.every((r) => this.get(r).state === 'approved');
  }

  snapshot() {
    return [...this.tasks.values()].map((t) => ({ ...t }));
  }
}