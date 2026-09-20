// Provider 注册表：由配置实例化，按 key 取用
import { createMockProvider } from './mock.js';
import { createOpenAIProvider } from './openai.js';

export * from "./result.js";

const FACTORIES = {
  mock: createMockProvider,
  openai: createOpenAIProvider,
  agnes: createOpenAIProvider,
};

export function createProviderRegistry(providerConfigs = {}) {
  const instances = new Map();
  for (const [key, cfg] of Object.entries(providerConfigs)) {
    const factory = FACTORIES[cfg?.kind];
    if (!factory) throw new Error(`未知 provider kind: ${JSON.stringify(cfg?.kind)}（可选: ${Object.keys(FACTORIES).join('/')}）`);
    instances.set(key, factory({ ...cfg, id: key }));
  }
  return {
    get(key) {
      const p = instances.get(key);
      if (!p) throw new Error(`provider 未配置: ${key}`);
      return p;
    },
    has(key) {
      return instances.has(key);
    },
    list() {
      return [...instances.keys()];
    },
  };
}