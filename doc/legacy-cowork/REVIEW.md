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
- 第四阶段（P14–P15 团队与增强）：**79/79 测试通过**；团队任务（同角色多 agent 讨论择优）落地；图片资产规则、运行统计、`cowork ship` git 交付、`doc/roles.md` 完成；demo 扩至 7 任务（策划 2 人团队 + writer/audio）。
- 第五阶段（P16 安全加固 + 接入手册）：**87 通过 + 2 跳过（symlink 环境）**；用户安全审查清单十项全部闭环（路径穿越/符号链接/命令白名单/面板鉴权与反 CSRF/day 穿越/body 限制/原子写/错误脱敏/actionLimits）；`doc/USAGE.md` 让其他项目 5 分钟接入。

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
| 11 | 同类角色可分工协作、互动讨论找最优解 | `task.team` 团队任务：并行产出→互评（打分/互选/改进）→择优→胜出者整合提交；产物 meta.team 留痕 | studio.test（team 校验/择优 2 例）、demo 策划 2 人团队 |
| 12 | 交付/成本/审计可观测 | `cowork ship`（已批准产物写盘+git 分支提交）、报告"运行统计"（次数/耗时/输出/token）、图片资产机检（file_magic/image_dimensions） | ship 冒烟、demo e2e 统计断言、oracle 图片规则用例 |
| 13 | 安全基线（专用审查轮） | 路径越界/符号链接/命令白名单/面板 token+反 CSRF/day 穿越/body 1MiB/原子写/错误脱敏/actionLimits 全部闭环 | security.test（10 例）+ CLI 冒烟（401/413/400/拒绝越界） |

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

共 **87 个测试全部通过 + 2 个跳过**（跳过项：本机无开发者模式无法创建符号链接的用例）；`node --check` 全部 JS 文件零语法错误。

第五阶段（P16）新增/改动：`src/security.js`（安全基元）、`src/deliver.js`（ship 写盘核心）、`src/runner.js`（safeJoin/assertNoSymlink/资源限制）、`src/exec.js`（命令白名单）、`src/config.js`（commands/actionLimits 默认）、`src/web/server.js`（token/Origin/body/day/脱敏/原子写）、`src/store.js`（原子写）、`bin/cowork.js`（serve token/--plan 校验/ship 走 deliver）、`test/security.test.js`（10 例）、`doc/USAGE.md`。

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

### 4.7 团队任务与增强（game-studio-demo v2，P14–P15）
- **策划团队 2 人**（资深+数值）：并行产出 → 互评（双方一致选资深）→ 资深整合数值曲线为最终 GDD；报告显示 `designer-senior+designer-numeric（胜出 designer-senior）`，产物 meta.team 完整 ✔
- 新增 writer/audio 角色与任务（7 任务）；质量门含图片规则（ART2 file_magic PNG、ART3 image_dimensions ≥32×32）✔
- 美术 v1 仍触犯 ART1 → 会议裁决 → v2 通过（7/7 completed）；评审按产物匹配：art→艺术总监、code→QA、其余通用兜底 ✔
- 报告附"运行统计"：19 次模型调用、按角色分列（game-designer 5 次=2 产出+2 互评+1 整合）✔
- `ship --branch=release/v1`：临时 git 仓库提交 9 文件/7 产物，含 art/hero.png（latin1 字节还原）✔

### 4.8 安全加固（P16，用户安全审查驱动）
- 路径穿越：write/exec/ship/--plan 全走 `safeJoin`（`../`、绝对路径、盘符逃逸均拒绝；CLI 实测 `--plan=../../.env` 被拒）✔
- 符号链接绕过：`assertNoSymlink` 逐级 lstat 拒绝（deliver 写盘统一入口；本机无开发者模式，symlink 用例标记跳过）✔
- `shell:true` 命令：`engine.commands` 白名单（basename 匹配；默认 node/npm/npx/git；demo/game-studio 的 exec 实测放行 node）✔
- Web 面板：会话 token（URL 携带；无/错 token 401、query/header 均可 200）+ 跨站 Origin 401 + body 1MiB→413 + `/api/night` day 非法→400 ✔（CLI `serve` 实测）
- 原子写 / 错误脱敏 / actionLimits：`state.json` tmp+rename；500 不回传堆栈；动作数与 write 内容上限 ✔
- 回归：`security.test.js` 10 例；全量 **87 通过 + 2 跳过** ✔

### 4.6 真实模型（agnes，P8）
- `agnes-2.5-flash` → `apihub.agnes-ai.com/v1` 键控连通（12.6s 一次生成）✔
- `examples/agnes-demo` 使用真实模型完整跑通：架构→双开发→质量门→审核→汇报，**4/4 approved，100%**（一键通过、无需会议）✔

## 五、已知限制（后续工作）

1. **美术资产的"审美质量"机检有限**：min_size/json_valid/file_magic/image_dimensions 只能防"空/坏文件、改名占位、格式"问题；画风、构图、可玩性最终仍依赖「评审 agent 判断 + Web 面板人工审批」。图片内容级校验（如配色直方图）可作为规则类型扩展。
2. **断点续跑粒度**：`--resume` 支持"人工审批后续跑"与中断清理（running→重入队、waiting→按会议分流），但任务一旦提交即视为该次运行的产物，不跨运行合并。
3. **真实模型完整流水线已验证**（agnes-demo 4/4），token/延迟统计已实现；面板鉴权已上线（127.0.0.1 + token），跨机使用仍建议加反向代理与 https。
4. **多项目并发 / agent 动态增删 / ESM 语法校验扩展**为路线图后续项。
5. **制作人/策划等自定义角色语义依赖 prompt 约定**（引擎只注册角色，不内置分阶段 check）；角色职责说明书已沉淀为 doc/roles.md。
6. **JS 语法校验**用 `vm.Script`（CommonJS 风格），ESM `import` 语法目标代码不支持（规则类型可扩展）。
7. **命令白名单默认不含 curl/python 等**——真实模型 agent 若需联网/脚本工具，需在 `engine.commands.allow` 显式加入（安全优先的取舍）。

## 六、人工验收清单（请用户核对）

- [ ] `node --test "test/*.test.js"` 输出 87 通过 + 2 跳过（symlink 环境跳过）
- [ ] `node bin/cowork.js run examples/demo` 最终状态 completed（100%，4/4）
- [ ] `node bin/cowork.js run examples/game-studio-demo`：策划团队讨论择优 + 美术/程序/叙事/音频 + QA/艺术总监分级审查 + 导演汇报；含会议 m-1 裁决（美术 v1 拦截→v2 通过）；报告末尾见"运行统计"
- [ ] `node bin/cowork.js run examples/demo --night` 后查看 `examples/demo/night-shift/*.md`（问题/分析过程/决定 三段格式）
- [ ] `node bin/cowork.js plan examples/demo "你的主题"` → `run --plan=plan/<主题>/plan.json` 一键开工并 completed
- [ ] `node bin/cowork.js serve examples/demo` → 使用启动时打印的 URL（含 `?token=`）打开面板；无 token 访问 API 应 401
- [ ] `node bin/cowork.js run examples/agnes-demo` 用真实 agnes-2.5-flash 跑通（4/4；消耗少量免费额度）
- [ ] `node bin/cowork.js ship examples/game-studio-demo --branch=release/v1` 把已批准产物提交到 git 分支
- [ ] 自定义角色试用：设计新角色（producer/game-designer/artist/writer/audio/…）或多 agent 团队（task.team）按 `doc/roles.md` 扩展

## 七、如何复现

```bash
cd H:\ai_works\CoWorkPrj
node --test "test/*.test.js"                  # 全量测试（87 通过 + 2 环境跳过）
node bin/cowork.js run examples/demo          # 白天闭环
node bin/cowork.js run examples/game-studio-demo  # 工作室 v2：团队讨论 + 分级审查 + 冲突会议
node bin/cowork.js ship examples/game-studio-demo --branch=release/v1  # 交付：approved 产物提交到 git 分支
node bin/cowork.js run examples/demo --night  # 夜班：自动开会 + night-shift/ 文档
node bin/cowork.js run examples/agnes-demo    # 真实模型（agnes-2.5-flash）端到端
node bin/cowork.js plan examples/demo "做一个天气查询"          # 主题规划
node bin/cowork.js run examples/demo --plan=plan/做一个天气查询/plan.json  # 按计划执行
node bin/cowork.js serve examples/demo        # Web 面板（http://127.0.0.1:8765）
node bin/cowork.js init my-proj && node bin/cowork.js run my-proj  # 新项目模板
```