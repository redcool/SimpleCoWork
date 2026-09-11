// 确定性 mock 提供者：按 agent role 分发脚本，用于测试与离线 demo
// 脚本签名：({ role, attempt, task, inputs, model }) => string | object(自动 JSON.stringify)

export function createMockProvider(config = {}) {
  const scripts = config.script ?? {};
  return {
    name: 'mock',
    /** opts.detail=true 时返回 { text, usage }（usage 恒为 null），便于引擎做耗时/输出规模统计 */
    async generate(ctx, opts = {}) {
      const fn = scripts[ctx.role] ?? scripts.default;
      if (typeof fn !== 'function') {
        const text = JSON.stringify({
          summary: `[mock:${ctx.role}] 未配置脚本`,
          text: '',
          actions: [],
          knownIssues: ['mock 未配置脚本，任务可能失败'],
          done: false,
        });
        return opts.detail ? { text, usage: null } : text;
      }
      const out = await fn(ctx);
      const text = typeof out === 'string' ? out : JSON.stringify(out);
      return opts.detail ? { text, usage: null } : text;
    },
  };
}