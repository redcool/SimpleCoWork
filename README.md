# CoWork — 多 Agent 协作系统

> 面向软件工程的**异步多智能体协作平台**：用户配置 agent（数量与模型），agent 之间以**版本化产物**交接、互不干扰；系统负责任务编排、质量门（自动校验 + 审核）、架构一致性检查、冲突会议与协调汇报。

## 核心设计理念

1. **以任务和产物为中心，而不是以聊天为中心** — agent 之间不靠实时对话，靠提交/消费版本化产物。
2. **以版本和证据为基础，而不是以 agent 的自我声明为基础** — 每个产物可追溯（生产者、基线产物、校验结果、审查结论、测试证据）。
3. **以工作流和状态机协调 agent，而不是让 agent 完全自由发挥** — 依赖 DAG 保证先后顺序，质量门保证"完成"由证据定义。

## 典型流程

```text
用户需求
  ↓
[架构师] 产出 architecture-v1（含可机检规则 rules.json）
  ↓
[开发者A] 实现 code-api  ┐（依赖架构，可并发）
[开发者B] 实现 code-db  ─┘
  ↓
质量门：Oracle 架构一致性检查（规则对照产物文件）→ 测试/语法校验
  ↓
[审核者] 审查 + 测试 → pass？approve ：needs_revision（自动重试）
  ↓（重试超限）
会议触发 → [协调者] 决策（补救任务）→ 分工解决
  ↓
[协调者] 生成汇报 report（Markdown + JSON）
```

## 安装与运行

```bash
# 无需安装任何依赖（Node.js ≥ 20）

# 全量测试
node --test test/

# 跑示例项目（内置 mock 模型，离线可跑）
node bin/cowork.js run examples/demo

# 查看状态 / 报告 / 产物
node bin/cowork.js status examples/demo
node bin/cowork.js report examples/demo
node bin/cowork.js artifacts examples/demo
```

## 快速上手（新建项目）

```bash
node bin/cowork.js init my-project   # 生成 cowork.config.js 模板
# 编辑配置：agents / providers / workflow.tasks
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

## 领域模型

| 对象 | 含义 |
|---|---|
| `Agent` | 谁来做：id/角色/provider/model/人设；生命周期 idle→running→idle\|failed |
| `Task` | 要做什么：依赖(`requires`)、输入产物(`inputs`)、输出产物(`outputs`)、验收标准；状态机 pending→ready→running→submitted→approved\|needs_revision\|failed |
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
会议策略：autoDecide=true → 协调者生成决策(actions) → 补救重试；否则升级人工（任务 failed + needsHuman）
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
├── engine.js           # 工作流引擎：调度/并发/质量门/重试/会议升级
├── meeting.js          # 会议与决策存储/触发器
├── reporter.js         # 汇报（快照/Markdown/JSON）
├── providers/          # mock / openai（可插拔）
└── domain/             # agents / tasks / artifacts / reviews 状态机
bin/cowork.js           # CLI
examples/demo/          # 全流程示例项目（mock）
test/                   # node:test 单测 + 集成测试
```

## 路线图

- [x] 异步编排、产物版本化、质量门、一致性检查、会议、汇报（MVP）
- [ ] 真实模型接入验证（OpenAI 兼容）、token/成本统计
- [ ] Web 进度面板、人工审批节点、Git 分支隔离与 PR 合并
- [ ] 多项目并发、agent 动态增删、失败自动转派

## 相关文档

- [PLAN.md](./PLAN.md) — 工作计划表（目标/方式/进度/验收）
- [session_memory.md](./session_memory.md) — 会话记忆（决策记录/进度/下一步）
- [REVIEW.md](./REVIEW.md) — 整体测试与审核报告