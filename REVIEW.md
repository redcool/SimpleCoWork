# CoWork 整体测试与审核报告（REVIEW）

> 审核日期：本开发会话完成时（含第二阶段 P8–P12）
> 审核对象：`H:\ai_works\CoWorkPrj` 全部源码、测试、示例与文档
> 审核方式：全量自动化测试 + 语法检查 + CLI 端到端实跑（run/--night/serve/plan/--resume）+ 需求覆盖对照 + 人工验收清单

## 一、总体结论

**通过。** 两个阶段全部完成：

- 第一阶段 MVP（P0–P7）：50/50 测试通过，28 个 JS 文件语法检查通过。
- 第二阶段（P8–P12）：nightshift / web / planner / resume 等新增模块测试全绿，最终 **71/71 测试通过**；
  `examples/demo` 实测跑通 4 条 CLI 链路：`run`（质量门→会议→补救→完成）、`run --night`（自动开会 + 夜班文档）、
  `plan + run --plan`（主题→模块 DAG→开发→验收→完成）、`serve`（面板 API）+ 人工审批 + `run --resume`（续跑闭环）。
- 第三阶段（P13 工作室模式）：**76/76 测试通过**；`examples/game-studio-demo` 实跑（制作人→策划→美术/程序并行→QA/艺术总监分级审查→导演汇报 + 冲突会议裁决闭环）。

## 二、需求覆盖矩阵（对照用户原始需求）

| 序号 | 用户需求 | 实现方式 | 验证 |
|---|---|---|---|
| 1 | 用户可对 agent 进行数量和模型配置 | `config.agents[]`：每个 agent 独立配置 `id/role/title/provider/model/prompt/enabled`；支持 mock 与 OpenAI 兼容协议（含 Agnes） | config.test / demo 五角色（含 planner）各自模型 |
| 2 | agents 之间异步、工作过程不干扰，以对方成果为参考 | 依赖 DAG + 每轮并发批处理（`maxConcurrent`）；agent 只读 `inputs` 指向的**已批准产物**（`latestApproved`）；版本化产物交接 | workflow.test A（并发=2 不超限）、demo 双开发并行、plan 执行 m-core→m-ui |
| 3 | agent1 可查看其他 agent 成果与预期（架构）是否一致 | Oracle 一致性检查：架构产物内 `rules.json` + `workflow.rules` 形式化约束（校验和/文件存在/包含/正则/JS 语法/ifPresent 裁剪），对每个提交的代码产物自动求值 | oracle.test、demo（R1 违规被当场拦截）、plan G1 规则 |
| 4 | 有问题 agents 一起开会、讨论、再分工解决 | 会议触发器：审查失败次数 ≥ `maxReviewAttempts` 触发；**白天** autoDecide=manager 决策+分工 actions 或升级人工；**夜班** 多角色（架构师/生产者/审核者/协调者）各自分析→主持人归纳决策→写 `night-shift/YYYY-MM-DD.md`（问题/分析过程/决定）→分工修复 | workflow.test C/D/F、nightshift.test、demo --night 文档实测 |
| 5 | 协调者跟进进度并生成汇报 | reporter：进度、任务、产物、审核、会议、风险（仅未解决审查失败）、下一步 + manager 叙事（Markdown+JSON 落盘 `.cowork/`） | reporter.test、demo 汇报 |
| 6 | 模型可用 dsh 的 agnes flash 2.5 与 agnes 3.0 | openai 兼容 provider 直达 `apihub.agnes-ai.com/v1`，demo 配置注释给出 `agnes-2.5-flash`（免费）/`agnes-2.5-pro*`/`agnes-3.0-flash` 与 `AGNES_API_KEY` 用法 | 文档+示例（联网实测留给用户环境） |
| 7 | 可加 Web UI | `cowork serve`（零依赖 node:http）：进度/任务/产物/审核/会议/夜班文档 + 人工审批接口（写回决策） | web.test（页面/API/审批/夜班列表）、CLI 冒烟 |
| 8 | 夜班静默工作 | `engine.nightShift{enabled,timezone,ranges}`：时段内问题不阻塞，自动开会并生成夜班文档；`--night` 强制；时钟可注入 | nightshift.test（边界/跨天/时区/集成 10 例）、demo --night 文档实测 |
| 9 | 可复用于各类 agent coder（如 dsh）：给主题即开工 | `cowork plan <dir> "主题"`：planner agent 拆解模块 DAG → `plan.json`/`plan.md` → `run --plan` 执行（模块/角色/依赖/验收/规则全自动） | planner.test（6 例）、demo plan→run 实测 |
| 10 | 角色划分以工作室视角合理（游戏/作品） | 自定角色白名单放开 + reviewer `accepts` 按产物匹配 + 资产规则（min_size/json_valid）+ exec outFile 证据回读 | studio.test（5 例）、game-studio-demo CLI 实跑 |

## 三、模块清单与测试覆盖

| 模块 | 文件 | 职责 | 覆盖测试 |
|---|---|---|---|
| 事件总线 | src/events.js | on/off/onAny/emit | 各域测试间接覆盖 |
| 配置 | src/config.js | 规范、校验、DAG 环检测、nightShift 校验、workflow.rules、loadConfig | config.test（10 例） |
| 持久化 | src/store.js | JSONL 事件 + 快照 | integration 回放 |
| 域：Agent/Task/Artifact/Review | src/domain/* | 状态机（含 waiting） | tasks/artifacts 等 |
| Oracle | src/oracle.js | 规则引擎 + 结论分层 + JS 语法 | oracle.test（8 例） |
| Runner | src/runner.js | 提示词/解析（keepRaw）/动作落盘 | runner.test + planner 间接 |
| exec | src/exec.js | 子进程 stdio inherit | runner.test（含超时） |
| Providers | src/providers/* | mock 脚本 / openai 兼容（Agnes 可用） | runner.test |
| 引擎 | src/engine.js | 调度/质量门/重试/会议升级/夜班分派/resumeState | workflow.test（7 例）+ nightshift/web 集成 |
| 会议 | src/meeting.js | 触发器/决策/升级 | workflow.test C/D/F |
| 夜班 | src/nightshift.js | 跨天/时区判定、NightShiftLog 渲染落盘 | nightshift.test（10 例） |
| 规划器 | src/planner.js | 主题→模块 DAG、规范化（角色/依赖/验收）、计划文档 | planner.test（6 例） |
| Web 面板 | src/web/* | node:http 面板 + 状态视图 + 审批 API + 夜班 API | web.test（5 例） |
| 汇报 | src/reporter.js | 快照/叙事/Markdown | reporter.test（4 例） |
| CLI | bin/cowork.js | init/plan/run(--night/--resume/--plan)/serve/status/report/artifacts | 实跑 4 条链路 |
| 集成 | test/*.test.js | 全流程 + 持久化回放 + 闭环 | 71 例全部通过 |

共 **76 个测试，全部通过**；`node --check` 全部 JS 文件零语法错误。

工作室模式新增/改动：`src/config.js`（角色白名单放开 + accepts 校验）、`src/engine.js`（#reviewerFor 语义化：accepts 精确匹配→通用兜底、评审者不自审、架构/规划设计产物内建门自审）、`src/oracle.js`（min_size/json_valid 内容类规则）、`src/runner.js`（exec outFile 回读为产物证据）、`examples/game-studio-demo/`（P13 演示）、`test/studio.test.js`（5 例）。

## 四、端到端实测记录（examples/demo）

### 4.1 白天 run（MVP 闭环）
1. t-arch 架构设计 → `architecture.md` + `rules.json`（4 条规则），approved ✔
2. t-dev-api 与 t-dev-db 并行（maxConcurrent=2）✔
3. t-dev-api v1 违反 R1/R2 → 质量门拦截，产物 rejected，审查 fail ✔
4. 触发会议 m-1（autoDecide）→ manager 决策含补救 action ✔
5. v2 修复 → 通过 → approved；t-dev-db 一次通过 ✔
6. t-report 汇总 → report-v1（100%，4/4）✔

### 4.2 夜班 run --night
- 强制夜班下，t-dev-api 质量问题**不阻塞人工**：架构师/审核者/协调者/开发者 4 角色发言 → manager 归纳决策 + 分工 ✔
- 生成 `night-shift/2026-09-10.md`：**问题**（src/api.js 缺少 module.exports）/ **分析过程**（四角色意见）/ **决定**（决策+分工）✔

### 4.3 主题规划 plan + run --plan
- `cowork plan examples/demo "做一个天气查询"` → planner agent 输出模块 DAG（m-core/m-ui、验收 C1/C2/U1、规则 G1）→ `plan/做一个天气查询/{plan.json,plan.md}` ✔
- `run --plan=...` → 2 模块依赖调度 → 开发 → 质量门（G1+C1/C2、U1）→ 审核 → approved → completed ✔

### 4.4 Web 面板 + 人工审批 + resume
- `serve` 启动，`GET /`、`/api/state`（blocked 状态）、`/api/night`（夜班日列表与 markdown）✔
- escalated 会议 → 面板审批（决策/理由/分工写回 state.json，任务置 needs_revision）→ `run --resume` 续跑 → completed ✔

### 4.5 工作室模式（game-studio-demo，P13）
- 制作人定愿景（vision.md）→ 策划产出 GDD（定义资产规格）→ 美术 & 程序**并行** ✔
- 美术 v1 不符合策划规格（art/player.txt 缺 hero）→ 质量门拦截（ART1 fail）→ 会议 m-1 **由导演裁决**（分工重画指令）✔
- 美术 v2 重画通过 → **艺术总监**审查（accepts:['art']）；程序产物由 **QA** 审查（accepts:['code']）+ `node --check` 证据经 exec outFile 回读进产物 ✔
- 导演汇报 report-v1 → completed 5/5 ✔

### 4.6 真实模型（agnes，P8）
- `agnes-2.5-flash` → `apihub.agnes-ai.com/v1` 键控连通（12.6s 一次生成）✔
- `examples/agnes-demo` 使用真实模型完整跑通：架构→双开发→质量门→审核→汇报，**4/4 approved，100%**（一键通过、无需会议）✔

## 五、已知限制（后续工作）

1. **美术资产的"审美质量"机检有限**：min_size/json_valid 只能防"空/坏文件"与格式问题；画风、构图、可玩性最终仍依赖「评审 agent 判断 + Web 面板人工审批」。图片内容级校验（如尺寸/配色直方图）可作为规则类型扩展。
2. **断点续跑粒度**：`--resume` 支持"人工审批后续跑"与中断清理（running→重入队、waiting→按会议分流），但任务一旦提交即视为该次运行的产物，不跨运行合并。
3. **真实模型完整流水线已验证**（agnes-demo 4/4），但 token/延迟统计未收集；面板无鉴权（默认 127.0.0.1，面向本机）。
4. **Token/成本统计、Git 分支隔离、多项目并发、agent 动态增删、ESM 语法校验扩展**为路线图后续项。
5. **制作人/策划等自定义角色语义依赖 prompt 约定**（引擎只注册角色，不内置分阶段 check）；角色职责说明书建议沉淀为 doc/。
6. **JS 语法校验**用 `vm.Script`（CommonJS 风格），ESM `import` 语法目标代码不支持（规则类型可扩展）。

## 六、人工验收清单（请用户核对）

- [ ] `node --test "test/*.test.js"` 输出 76/76 通过
- [ ] `node bin/cowork.js run examples/demo` 最终状态 completed（100%，4/4）
- [ ] `node bin/cowork.js run examples/game-studio-demo`：制作人→策划→美术/程序→QA/艺术总监分级审查→导演汇报，含会议 m-1 裁决（美术 v1 拦截→v2 通过）
- [ ] `node bin/cowork.js run examples/demo --night` 后查看 `examples/demo/night-shift/*.md`（问题/分析过程/决定 三段格式）
- [ ] `node bin/cowork.js plan examples/demo "你的主题"` → `run --plan=plan/<主题>/plan.json` 一键开工并 completed
- [ ] `node bin/cowork.js serve examples/demo` → 浏览器 http://127.0.0.1:8765 查看面板与夜班记录
- [ ] `node bin/cowork.js run examples/agnes-demo` 用真实 agnes-2.5-flash 跑通（4/4；消耗少量免费额度）
- [ ] 自定义角色试用：在 config.agents 增加 `{ id:'writer', role:'writer', ... }`（prompt 里约定职责）与对应任务即可扩展工作室

## 七、如何复现

```bash
cd H:\ai_works\CoWorkPrj
node --test "test/*.test.js"                  # 全量测试（76 例）
node bin/cowork.js run examples/demo          # 白天闭环
node bin/cowork.js run examples/game-studio-demo  # 工作室模式（冲突会议裁决 + 分级审查）
node bin/cowork.js run examples/demo --night  # 夜班：自动开会 + night-shift/ 文档
node bin/cowork.js run examples/agnes-demo    # 真实模型（agnes-2.5-flash）端到端
node bin/cowork.js plan examples/demo "做一个天气查询"          # 主题规划
node bin/cowork.js run examples/demo --plan=plan/做一个天气查询/plan.json  # 按计划执行
node bin/cowork.js serve examples/demo        # Web 面板（http://127.0.0.1:8765）
node bin/cowork.js init my-proj && node bin/cowork.js run my-proj  # 新项目模板
```