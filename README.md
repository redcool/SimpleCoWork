# CoWork — 多 Agent 协作系统

> 面向软件工程的**异步多智能体协作平台**：用户配置 agent（数量与模型），agent 之间以**版本化产物**交接、互不干扰；系统负责任务编排、质量门（自动校验 + 审核）、架构一致性检查、冲突会议与协调汇报。支持**夜班静默模式**（问题自动开会并写夜间文档）、**Web 面板**（人工审批 + 状态查看）与**主题规划器**（给定主题一键拆分模块并执行）。

## 核心设计理念

1. **以任务和产物为中心，而不是以聊天为中心** — agent 之间不靠实时对话，靠提交/消费版本化产物。
2. **以版本和证据为基础，而不是以 agent 的自我声明为基础** — 每个产物可追溯（生产者、基线产物、校验结果、审查结论、测试证据）。
3. **以工作流和状态机协调 agent，而不是让 agent 完全自由发挥** — 依赖 DAG 保证先后顺序，质量门保证"完成"由证据定义。

## 典型流程

```text
用户需求 / 主题
  ↓（可选）planner：把主题拆解为模块任务 DAG → plan.json
[架构师] 产出 architecture-v1（含可机检规则 rules.json）
  ↓
[开发者A] 实现 code-api  ┐（依赖架构，可并发）
[开发者B] 实现 code-db  ─┘
  ↓
质量门：Oracle 架构一致性检查（规则对照产物文件）→ 测试/语法校验
  ↓
[审核者] 审查 + 测试 → pass？approve ：needs_revision（自动重试）
  ↓（重试超限）
会议触发 → 白天：协调者决策 ；夜班：多角色讨论并写 night-shift/YYYY-MM-DD.md（问题/分析过程/决定）
  ↓（未开自动决策）
人工审批：Web 面板（cowork serve）审批 → run --resume 续跑
  ↓
[协调者] 生成汇报 report（Markdown + JSON）
```

## 安装与运行

```bash
# 无需安装任何依赖（Node.js ≥ 20，纯 ESM JavaScript，零运行时依赖）

# 全量测试（71 例）
node --test "test/*.test.js"

# 跑示例项目（内置 mock 模型，离线可跑）
node bin/cowork.js run examples/demo

# 夜班静默模式（问题自动开会讨论并写 night-shift/ 文档）
node bin/cowork.js run examples/demo --night

# 主题规划 → 执行（体验"给主题即开工"）
node bin/cowork.js plan examples/demo "做一个天气查询网站"
node bin/cowork.js run examples/demo --plan=plan/做一个天气查询网站/plan.json

# Web 面板（任务/产物/会议审批/夜班文档）→ 浏览器打开 http://127.0.0.1:8765
node bin/cowork.js serve examples/demo

# 查看状态 / 报告 / 产物
node bin/cowork.js status examples/demo
node bin/cowork.js report examples/demo
node bin/cowork.js artifacts examples/demo
```

## 快速上手（新建项目）

```bash
node bin/cowork.js init my-project   # 生成 cowork.config.js 模板
# 编辑配置：agents / providers / workflow.tasks（或用 plan 命令自动生成任务）
node bin/cowork.js run my-project
```

## 配置示例

```js
// cowork.config.js
export default {
  project: { name: 'demo-app', description: '示例' },
  providers: {
    // 内置 mock：确定性脚本，离线可跑（开发/测试用）
    mock: { kind: 'mock', script: { /* 按角色分发的脚本 */ } },
    // 任意 OpenAI 兼容协议（Ollama / LM Studio / 网关）
    local: { kind: 'openai', baseURL: 'http://127.0.0.1:11434/v1', apiKey: '', defaultModel: 'qwen2.5-coder' },
  },
  agents: [
    { id: 'architect', role: 'architect', title: '架构师', provider: 'local', model: 'qwen2.5-coder', prompt: '你是资深架构师……' },
    { id: 'dev',       role: 'developer', title: '开发者', provider: 'local', model: 'qwen2.5-coder', prompt: '你是资深开发者……' },
    { id: 'reviewer',  role: 'reviewer',  title: '审核者', provider: 'local', model: 'qwen2.5-coder', prompt: '你是严格审核者……' },
    { id: 'manager',   role: 'manager',   title: '协调者', provider: 'local', model: 'qwen2.5-coder', prompt: '你是项目协调者……' },
  ],
  workflow: {
    tasks: [
      { id: 't-arch', name: '系统架构设计', agentId: 'architect', outputs: ['architecture'], risk: 'high' },
      { id: 't-dev',  name: '实现模块', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      { id: 't-report', name: '项目汇报', agentId: 'manager', requires: ['t-dev'], inputs: ['architecture', 'code'], outputs: ['report'], gate: false },
    ],
  },
  engine: { maxConcurrent: 2, maxReviewAttempts: 2, maxEscalations: 1, meeting: { autoDecide: true } },
};
```

## 接入真实模型（Agnes / OpenAI 兼容）

任何 OpenAI 兼容端点都可用（Ollama / LM Studio / 网关 / Agnes）：

```js
// Agnes（本机已接入）：免费模型 agnes-2.5-flash；付费/更强推理 agnes-2.5-pro 系列、agnes-3.0-flash
agnes: {
  kind: 'openai',
  baseURL: 'https://apihub.agnes-ai.com/v1',
  apiKey: process.env.AGNES_API_KEY ?? '', // 建议设置环境变量 AGNES_API_KEY
  defaultModel: 'agnes-2.5-flash',
  timeoutMs: 120000,
},
```

把 agent 的 `provider` 指向 `agnes`、`model` 填模型 id 即可；不同角色可配不同模型。密钥从以下位置加载（优先级：进程环境变量 → `<项目目录>/.env`，后者由 CLI 自动读取且已被 `.gitignore` 忽略）：

```bash
# 推荐：在项目目录建 .env（不会进 git）
echo "AGNES_API_KEY=sk-..." > .env
```

> 本机已从 dsh 配置（`settings.yaml` 的 `apiKeyEnv: AGNES_API_KEY` → 系统级环境变量）找到密钥并写入 `H:\ai_works\CoWorkPrj\.env`，`agnes-2.5-flash` 实测连通。图片/视频类 Agnes 模型同样走该 provider（产物流协议不变）。

## 夜班静默模式

```js
engine: {
  ...
  nightShift: {
    enabled: true,             // 开启后仅在时段内生效（白天行为不变）
    timezone: 'Asia/Shanghai', // IANA 时区，决定"夜班日"归属
    ranges: [{ start: '22:00', end: '08:30' }], // 支持跨零点
  },
},
```

- 夜班时段内，质量问题**不会**阻塞等人工：自动召开多角色会议（架构师/生产者/审核者/协调者各自分析发言 → 主持人归纳决策 + 补救分工 → 任务继续）。
- 每次会议写入 `night-shift/YYYY-MM-DD.md`，格式严格为 **问题 / 分析过程 / 决定**（决定含决策者与分工）。
- 语法校验：`HH:MM`、跨天（`start > end`）、时区（`Intl` 零依赖）。
- `node bin/cowork.js run <dir> --night` 可强制启用夜班。
- 引擎时钟可注入（`createProject({ clock })`），测试完全可控。

## Web 面板与人工审批

```bash
node bin/cowork.js serve <dir> [--port=8765]
# 打开 http://127.0.0.1:8765
```

- 页面：进度总览、任务、产物、审核记录、会议列表、夜班记录（查看每日 markdown）。
- 未开自动决策的会议在面板上呈 `escalated`，点"审批"填写 决策结论/理由/分工 后写回；随后 `node bin/cowork.js run <dir> --resume` 从持久化状态续跑。
- 全部为只读 + 单审批接口（`POST /api/decisions`），零依赖 `node:http`。

## 主题规划器

```bash
node bin/cowork.js plan <dir> "主题"   # planner agent 拆解为模块任务 DAG → plan/<主题>/plan.json + plan.md
node bin/cowork.js run <dir> --plan=plan/<主题>/plan.json   # 按计划执行（模块/角色/依赖/验收/规则）
```

- 规划输出遵循 agent 输出协议：`modules`（id/name/role/requires/outputs/acceptance）+ 跨模块 `rules`。
- 角色→agent 自动映射（同角色第一个启用者）；依赖表转为输入产物；环形依赖报错。
- 计划顶层规则经 `config.workflow.rules` 注入 Oracle 质量门；内容类规则建议 `ifPresent: true`（产物缺该文件时自动跳过，避免跨模块误判）。
- 无 `planner` 角色时回退 `architect`。

## 领域模型

| 对象 | 含义 |
|---|---|
| `Agent` | 谁来做：id/角色/provider/model/人设；角色含 architect/planner/developer/reviewer/manager/meeting；生命周期 idle→running→idle\|failed |
| `Task` | 要做什么：依赖(`requires`)、输入产物(`inputs`)、输出产物(`outputs`)、验收标准(`verify`)；状态机 pending→ready→running→submitted→approved\|needs_revision\|waiting\|failed |
| `Artifact` | 做出了什么：版本化（`name-vN`）、状态 submitted/approved/rejected/superseded、生产者、基线产物、文件（含校验和） |
| `Review` | 是否通过：内置校验（Oracle 规则 + verify 清单）+ 审核者结论 + 证据 |
| `Meeting/Decision` | 团队决定：触发器规则、参与者、决策与补救 actions |
| `Report` | 项目当前状态：进度、风险、下一步、叙事性总结 |

## 产物协议

```jsonc
{
  "id": "architecture-v1",
  "name": "architecture", "version": 1,
  "state": "approved",
  "producer": "architect", "taskId": "t-arch",
  "baseArtifacts": [],
  "summary": "分层架构 + 可机检规则",
  "text": "# 架构说明……",
  "files": [ { "path": "rules.json", "content": "{\"rules\":[...]}", "checksum": "sha256…", "size": 123 } ],
  "meta": { "attempt": 1 }
}
```

## 质量门（Gate）流程

```text
task.submitted
  → Oracle: 架构规则(rules.json) + task.verify 对照产物文件  → 高严重性失败 → needs_revision
  → 审核者(Reviewer agent) 阅读产物与校验结果 → fail → needs_revision
  → approve（任务 + 产物）
重试策略：审查失败次数 ≥ maxReviewAttempts → 触发会议
会议策略：夜班（nightShift.enabled 且在时段内）→ 多角色讨论自动决策 + 夜班文档
         白天 autoDecide=true → 协调者生成决策(actions) → 补救重试
         否则升级人工（任务 failed + needsHuman，Web 面板可审批）
```

## 目录结构

```text
src/
├── index.js            # 公共 API（createProject 等）
├── config.js           # 配置规范、校验、DAG 环检测
├── events.js           # 事件总线
├── store.js            # JSONL 事件日志 + JSON 快照
├── oracle.js           # 架构规则引擎（checksum / 规则求值 / 结论）
├── runner.js           # 提示词构建、模型输出解析、文件动作
├── exec.js             # 命令执行（stdio inherit）
├── engine.js           # 工作流引擎：调度/并发/质量门/重试/会议升级/夜班/恢复续跑
├── nightshift.js       # 夜班判定（跨天/时区）+ 夜班文档日志（问题/分析过程/决定）
├── planner.js          # 主题规划器（模块 DAG 规范化 / 计划渲染 / 规划执行）
├── meeting.js          # 会议与决策存储/触发器
├── reporter.js         # 汇报（快照/Markdown/JSON）
├── web/                # Web 面板（node:http）：页面/状态/审批/夜班文档 API
├── providers/          # mock / openai（可插拔；Agnes 走 openai 协议）
└── domain/             # agents / tasks / artifacts / reviews 状态机
bin/cowork.js           # CLI（init/plan/run/serve/status/report/artifacts）
examples/demo/          # 全流程示例项目（mock，含 plan/夜班演示）
test/                   # node:test 单测 + 集成测试
```

## 路线图

- [x] 异步编排、产物版本化、质量门、一致性检查、会议、汇报（MVP）
- [x] Agnes 等真实模型接入说明（OpenAI 兼容协议、demo 示例）
- [x] 夜班静默模式（多角色自动会议 + 夜间文档）
- [x] Web 面板与人工审批、断点续跑（--resume）
- [x] 主题规划器（plan → run --plan 一键开工）
- [ ] token/成本统计、Git 分支隔离与 PR 合并
- [ ] 多项目并发、agent 动态增删、失败自动转派

## 相关文档

- [PLAN.md](./PLAN.md) — 工作计划表（目标/方式/进度/验收）
- [session_memory.md](./session_memory.md) — 会话记忆（决策记录/进度/下一步）
- [REVIEW.md](./REVIEW.md) — 整体测试与审核报告