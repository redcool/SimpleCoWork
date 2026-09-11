# CoWork 接入指南（在其他项目中使用）

> 目标：**5 分钟内把 CoWork 多 Agent 协作流水线接入你自己的项目/团队**——agents 分析、拆解、开发、审查、开会、验收，产出交付物；互不干扰、可夜班静默、可人工审批插话。

## 0. 前置条件

- Node.js ≥ 18（建议 20+；纯 ESM，零第三方依赖，无需 npm install）
- git（可选，`ship` 交付到分支时需要）
- 一个 OpenAI 兼容模型的 baseURL + API Key（可选；内置 mock 模型可离线跑通全流程）

```
H:\ai_works\CoWorkPrj      ← CoWork 本体（本仓库）
your-project/              ← 你的项目（接入 CoWork）
├── cowork.config.js       ← 接入配置（唯一需要写的文件）
├── .cowork/               ← 运行状态/产物/报告（自动生成，加入 .gitignore）
├── night-shift/           ← 夜班会议纪要（可选，自动生成）
└── plan/                  ← 主题规划（可选，自动生成）
```

## 1. 三步接入

```bash
# ① 初始化配置模板（在 your-project 里生成 cowork.config.js）
node H:\ai_works\CoWorkPrj\bin\cowork.js init your-project

# ② 编辑 your-project/cowork.config.js：定 agents、模型、任务 DAG（见下文）
# ③ 运行
node H:\ai_works\CoWorkPrj\bin\cowork.js run your-project
```

跑完检查 `.cowork/report.md`：任务状态、评审记录、会议决策、运行统计（模型调用数/耗时/输出/token）。

## 2. 最小可跑配置

```js
// cowork.config.js
export default {
  project: { name: 'my-app', description: '天气查询应用' },
  providers: {
    // —— 真实模型：OpenAI 兼容协议（可对接 Agnes / Ollama / 任意网关）——
    agnes: {
      kind: 'openai',
      baseURL: 'https://apihub.agnes-ai.com/v1',
      apiKey: process.env.AGNES_API_KEY,   // 密钥放 <项目>/.env 或系统环境变量，勿写死在配置里
      defaultModel: 'agnes-2.5-flash',
    },
  },
  agents: [
    { id: 'architect', role: 'architect', provider: 'agnes', model: 'agnes-2.5-flash', prompt: '你是资深架构师：设计分层架构并把约束形式化为 rules.json。' },
    { id: 'dev',       role: 'developer', provider: 'agnes', model: 'agnes-2.5-flash', prompt: '你是开发者：严格按架构与任务实现。' },
    { id: 'reviewer',  role: 'reviewer',  provider: 'agnes', model: 'agnes-2.5-flash', prompt: '你是严格审核者：独立核实产物。' },
    { id: 'manager',   role: 'manager',   provider: 'agnes', model: 'agnes-2.5-flash', prompt: '你是协调者：跟进进度、开会裁决、写汇报。' },
  ],
  workflow: {
    tasks: [
      { id: 't-arch', name: '系统架构', agentId: 'architect', outputs: ['architecture'], risk: 'high' },
      { id: 't-dev',  name: '代码实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      { id: 't-code-review', name: '代码审查', agentId: 'reviewer', requires: ['t-dev'], inputs: ['code'], outputs: ['review'] },
      { id: 't-report', name: '项目汇报', agentId: 'manager', requires: ['t-code-review'], inputs: ['architecture', 'code', 'review'], outputs: ['report'], gate: false },
    ],
    rules: [
      { id: 'R1', severity: 'high', type: 'contains', file: 'src/api.js', text: 'module.exports', description: '入口必须可被引用' },
    ],
  },
  engine: {
    maxConcurrent: 2,          // 并行任务数
    maxReviewAttempts: 2,      // 质量门失败重试次数，超过开会
    maxEscalations: 1,         // 会议升级次数，超过等待人工审批
    meeting: { autoDecide: true },  // true=会议自动裁决（夜班友好）；false=等待人工
    commands: { allow: ['node', 'npm', 'npx', 'git'], allowAll: false }, // agent 可执行的命令白名单
    actionLimits: { maxActions: 100, maxWriteBytes: 512 * 1024, maxExec: 20 }, // 动作资源限制
  },
};
```

## 3. 常见玩法

| 场景 | 做法 |
|---|---|
| 同角色多人讨论择优 | `{ id: 't-gdd', name: '设计', team: ['designer-senior', 'designer-numeric'], outputs: ['gdd'] }` —— 并行方案→互评→胜出者整合 |
| 自定义工作室角色 | 任意 `role`（producer/game-designer/artist/writer/audio…）；reviewer 带 `accepts: ['art','code']` 按产物分流审查 |
| 主题一键开工 | `run --plan=plan/<主题>/plan.json`（先 `plan <dir> "你的主题"` 自动拆解 DAG） |
| 夜班静默 | `run --night`：无需值守，问题自动开会并写 `night-shift/YYYY-MM-DD.md`（问题/分析过程/决定） |
| 人工插话 | `serve <dir>` 打开面板审批（URL 自带 token），再 `run --resume` 续跑 |
| 交付 | `ship <dir> --branch=release/v1`：approved 产物写盘并提交 git 分支 |
| 资产机检 | 规则类型：`contains / not_contains / regex / js_syntax / min_size / json_valid / file_magic / image_dimensions / file_exists`；跨产物规则加 `ifPresent: true` |

## 4. 集成到"你自己的 agent coder"（如 dsh）

CoWork 是**普通 Node 库**，可被任何 agent 工具链调用，不要求你用它的人机界面：

```js
// 在你的脚本/agent 里：以库方式驱动一次协作
import { createProject, NightShiftLog } from 'H:/ai_works/CoWorkPrj/src/index.js';
import { loadConfig } from 'H:/ai_works/CoWorkPrj/src/config.js';

const cfg = await loadConfig('your-project/cowork.config.js');
const project = createProject({
  config: cfg,
  dir: 'your-project/.cowork',
  persist: true,
  nightShiftLog: cfg.engine.nightShift.enabled ? new NightShiftLog({ dir: 'your-project/night-shift' }) : null,
});
const summary = await project.engine.runUntil({});        // 推进到终态
project.saveState();
const approved = project.artifactStore.list().filter((a) => a.state === 'approved'); // 取产物做下一步
```

- 状态与产物持久化在**项目自己的 `.cowork/`**，引擎与信使互不耦合——不同项目并行跑不会互相干扰
- 产物协议：`{ id, name, version, state, producer, files:[{path,content}], summary, meta }`，可直接落盘复用
- 运行统计：`project.engine.stats()` / `statsSummary()` 返回每次模型调用的耗时、输出规模、token（可用于成本/配额控制）

## 5. 安全基线（请务必阅读）

| 面向 | 说明 |
|---|---|
| Agent 动作 | write/exec 路径一律校验（防 `../` 与绝对路径逃逸、符号链接绕过）；只读产物可执行 `ship` 到 git（目录内、禁路径外写） |
| Agent 命令 | `engine.commands.allow` 白名单（默认 node/npm/npx/git）；`allowAll: true` 会放开任意 shell 命令，**不要在不可信环境开启** |
| Agent 资源 | `actionLimits` 限制动作数量 / write 内容大小 / exec 次数，防单轮吐爆内存 |
| Web 面板 | 只建议绑 127.0.0.1；访问 URL 携带一次性 token（`?token=…`），API 未认证返回 401；跨站 Origin 直接拒绝（反 CSRF）；POST 体上限 1MiB；`/api/night` 只接受 YYYY-MM-DD |
| 计划注入 | `--plan=` 文件必须在项目目录内（拒绝外部路径） |
| 状态文件 | `state.json` 原子写（tmp+rename），崩溃/审批并发不会写出半截文件 |
| 密钥 | API Key 放 `<项目>/.env`（已 gitignore）或环境变量；CLI 自动加载，不会写进产物 |
| 建议 | 产物可能由外部模型生成——`ship` 前自行 review；不要在生产机器上对不可信项目开 `allowAll` |

## 6. 常见问题

- **exec 动作被拒**：报错含「未在 engine.commands 白名单」→ 在配置 `engine.commands.allow` 加入该命令再跑
- **质量门误伤跨产物**：内容类规则加 `ifPresent: true`（产物不含该文件即跳过）
- **任务一直 waiting**：`autoDecide: false` 时会议需人工：`serve` 审批 → `run --resume`
- **面板打不开 API**：用启动时打印的 URL（含 token）；自己拼 URL 时务必带上 `?token=` 或 `X-CoWork-Token` 头
- **想完全离线**：`providers.mock` 内置确定性模型，任何配置都能全流程跑通（示例见 `examples/demo`、`examples/game-studio-demo`）

## 7. 参考

- 完整 CLI：`node bin/cowork.js`（帮助）
- 角色职责与扩展：`doc/roles.md`
- 设计/验收/测试矩阵：`REVIEW.md`
- 全套示例：`examples/`（demo 基础闭环 / game-studio-demo 工作室+团队 / agnes-demo 真实模型）