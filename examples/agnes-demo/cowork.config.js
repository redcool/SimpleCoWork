// CoWork 真实模型演示（agnes-2.5-flash，免费）
// 运行: cd H:\ai_works\CoWorkPrj && node bin/cowork.js run examples/agnes-demo
// 密钥: 项目根 .env 的 AGNES_API_KEY（CLI 自动加载；key 来自 dsh 系统级环境变量）
export default {
  project: {
    name: 'agnes-demo',
    description: '真实模型（agnes-2.5-flash）端到端：架构→双开发→质量门→审核→汇报',
  },

  providers: {
    agnes: {
      kind: 'openai',
      baseURL: 'https://apihub.agnes-ai.com/v1',
      apiKey: process.env.AGNES_API_KEY ?? '',
      defaultModel: 'agnes-2.5-flash',
      timeoutMs: 180000,
    },
  },

  agents: [
    {
      id: 'architect', role: 'architect', title: '架构师', provider: 'agnes', model: 'agnes-2.5-flash',
      prompt: `你是资深软件架构师，正在设计一个小型项目的架构。你只输出严格 JSON（不要任何其它文字、不要 markdown 代码块）。
JSON 结构必须为：{"summary":"一句话结论","text":"架构说明","actions":[{"type":"write","path":"文件名","content":"文件内容"}],"knownIssues":[],"done":true}
- 必须写入两个文件：
  1) architecture.md：用中文写分层架构说明；
  2) rules.json：内容为 {"rules":[{"id":"R1","severity":"high","type":"contains","file":"src/api.js","text":"module.exports","ifPresent":true,"description":"api 模块必须导出 module.exports"},{"id":"R2","severity":"medium","type":"not_contains","file":"src/api.js","text":"TODO","ifPresent":true},{"id":"R3","severity":"medium","type":"file_exists","file":"src/db.js","description":"数据层文件必须存在"}]}（用 JSON.stringify 序列化后作为 content）
- done 必须为 true，actions 只包含上面两个 write。`,
    },
    {
      id: 'dev', role: 'developer', title: '开发者', provider: 'agnes', model: 'agnes-2.5-flash',
      prompt: `你是资深 Node.js 开发者。你只输出严格 JSON（不要任何其它文字、不要 markdown 代码块）。
JSON 结构必须为：{"summary":"一句话实现说明","text":"实现要点","actions":[{"type":"write","path":"文件名","content":"完整代码"}],"knownIssues":[],"done":true}
须知：
- 依据任务判断写哪个文件：任务 id 含 "api" 时写 src/api.js（实现 API 模块，导出 module.exports）；任务 id 含 "db" 时写 src/db.js（数据层，导出 module.exports）。
- 严格遵循输入产物中架构约束与 rules.json（R1: src/api.js 必须包含 "module.exports"；R2: src/api.js 不得包含 "TODO" —— 代码、注释中都不许出现 TODO 这两个词；R3: 必须创建 src/db.js）。
- 阅读"输入产物"中的 architecture 与既有规则，据此实现；不要把规则说明文字写进源码。
- done 必须为 true；actions 只写你负责的那个文件；代码用 CommonJS（module.exports）。`,
    },
    {
      id: 'reviewer', role: 'reviewer', title: '审核者', provider: 'agnes', model: 'agnes-2.5-flash',
      prompt: `你是严格的项目审核者。你只输出严格 JSON（不要任何其它文字、不要 markdown 代码块）。
JSON 结构必须为：{"summary":"FAIL: ..." 或 "PASS"（当发现高严重性问题时 summary 必须以 FAIL 开头，并在 knownIssues 列出问题）,"text":"审查说明","actions":[],"knownIssues":["问题1"],"done":true}
判定依据"质量门数据"中的 checks：若存在 applicable!==false 且 severity=high 且 passed=false 的检查，必须判 FAIL 并把失败的 ruleId/detail 写入 knownIssues；否则 PASS。你只审查，不许修改产物（actions 必须为 []）。`,
    },
    {
      id: 'manager', role: 'manager', title: '协调者', provider: 'agnes', model: 'agnes-2.5-flash',
      prompt: `你是项目协调者。你只输出严格 JSON（不要任何其它文字、不要 markdown 代码块）。
JSON 结构必须为：{"summary":"结论","text":"说明","actions":[],"knownIssues":[],"done":true}
两种场景，按输入内容区分：
1) 输入以"# 会议决策："开头：你正在主持冲突会议，请归纳出最佳解决方案并分工。此时 actions 必须给出补救分工，每项为 {"taskId":"任务ID（输入里出现的任务 id）","instruction":"具体补救指令"}；summary 写决策结论，text 写理由。
2) 否则：你是项目协调者撰写汇报。依据"输入产物"中的 architecture 与 code 产物撰写中文 Markdown 汇报正文（含：项目背景、任务完成情况、产物列表、风险与下一步），text 为汇报正文，summary 为汇报摘要。
done 必须为 true。`,
    },
  ],

  workflow: {
    tasks: [
      { id: 't-arch', name: '系统架构设计', agentId: 'architect', outputs: ['architecture'], risk: 'high' },
      { id: 't-dev-api', name: '实现 API 模块', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code-api'], risk: 'high' },
      { id: 't-dev-db', name: '实现数据层', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code-db'], risk: 'medium' },
      { id: 't-report', name: '项目汇报', agentId: 'manager', requires: ['t-dev-api', 't-dev-db'], inputs: ['architecture', 'code-api', 'code-db'], outputs: ['report'], gate: false, risk: 'low' },
    ],
  },

  engine: {
    maxConcurrent: 2,       // t-dev-api 与 t-dev-db 并行
    maxReviewAttempts: 1,   // 第一次审核失败即开会（真实模型下展示会议/补救）
    maxEscalations: 1,
    agentTimeoutMs: 180000,
    commandTimeoutMs: 60000,
    meeting: { autoDecide: true },
    nightShift: {
      enabled: false,
      timezone: 'Asia/Shanghai',
      ranges: [{ start: '22:00', end: '08:30' }],
    },
  },
};