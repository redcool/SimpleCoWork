// Agent 注册表与生命周期：idle → running → idle | failed（+ waiting/paused/offline 备用）
export const AGENT_STATES = ['idle', 'running', 'waiting', 'paused', 'failed', 'offline'];

export function createAgentRegistry(agentDefs, bus) {
  const byId = new Map();
  for (const def of agentDefs) {
    byId.set(def.id, {
      ...def,
      state: 'idle',
      runs: 0,
      currentTaskId: null,
      lastError: null,
      lastActiveAt: null,
    });
  }

  const registry = {
    get(id) {
      const a = byId.get(id);
      if (!a) throw new Error(`未知 agent: ${id}`);
      return a;
    },
    has(id) {
      return byId.has(id);
    },
    list() {
      return [...byId.values()];
    },
    /** 第一个启用且角色匹配的 agent；autoAssignReviewer 用 */
    byRole(role) {
      return registry.list().filter((a) => a.role === role && a.enabled !== false);
    },
    setState(id, state, meta = {}) {
      if (!AGENT_STATES.includes(state)) throw new Error(`agent ${id} 非法状态: ${state}`);
      const a = registry.get(id);
      a.state = state;
      Object.assign(a, meta);
      if (bus) bus.emit('agent.state', { id, state, ...meta });
      return a;
    },
    markRunStart(id, taskId) {
      const a = registry.get(id);
      a.runs += 1;
      a.currentTaskId = taskId;
      a.lastActiveAt = new Date().toISOString();
      a.lastError = null;
      return a;
    },
    fromSnapshot(list) {
      byId.clear();
      for (const item of list ?? []) {
        byId.set(item.id, { ...item });
      }
    },
    snapshot() {
      return registry.list().map((a) => ({ ...a }));
    },
  };
  return registry;
}