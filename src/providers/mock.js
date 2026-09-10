// 确定性 mock 提供者：按 agent role 分发脚本，用于测试与离线 demo
// 脚本签名：({ role, attempt, task, inputs, model }) => string | object(自动 JSON.stringify)

export function createMockProvider(config = {}) {
  const scripts = config.script ?? {};
  return {
    name: 'mock',
    async generate(ctx) {
      const fn = scripts[ctx.role] ?? scripts.default;
      if (typeof fn !== 'function') {
        return JSON.stringify({
          summary: `[mock:${ctx.role}] 未配置脚本`,
          text: '',
          actions: [],
          knownIssues: ['mock 未配置脚本，任务可能失败'],
          done: false,
        });
      }
      const out = await fn(ctx);
      return typeof out === 'string' ? out : JSON.stringify(out);
    },
  };
}