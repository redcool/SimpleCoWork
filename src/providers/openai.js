// OpenAI 兼容协议提供者：可对接任意 /chat/completions 服务（Ollama、LM Studio、网关等）
// 使用 Node 原生 fetch + AbortSignal.timeout，无第三方依赖

export function createOpenAIProvider(config = {}) {
  const {
    baseURL = 'https://api.openai.com/v1',
    apiKey = '',
    defaultModel = 'gpt-4o-mini',
    timeoutMs = 120000,
    temperature = 0.3,
  } = config;

  return {
    name: 'openai',
    async generate(ctx) {
      const model = ctx.model || defaultModel;
      const messages = [
        { role: 'system', content: ctx.system },
        { role: 'user', content: ctx.user },
      ];
      const headers = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const res = await fetch(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: ctx.temperature ?? temperature,
          max_tokens: ctx.maxTokens ?? 4096,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`openai 请求失败 ${res.status}: ${body.slice(0, 500)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error(`openai 返回缺少 content: ${JSON.stringify(data).slice(0, 300)}`);
      }
      return content;
    },
  };
}