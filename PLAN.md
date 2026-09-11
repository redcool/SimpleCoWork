# CoWork 工作计划表

> 本文件是项目的**总工作计划表**：列出目标、实现方式、分阶段任务、验收标准与进度记录。
> 进度同时镜像到 `session_memory.md`（会话记忆）与各阶段产物中。
> 状态图例：⬜ 未开始 / 🔄 进行中 / ✅ 已完成 / ⛔ 受阻

## 一、计划目标

在 `H:\ai_works\CoWorkPrj` 从零实现一个 **多 Agent 协作系统（CoWork）**：

- 用户可配置 **agent 数量与模型**（每个 agent 独立配置 provider + model + 角色人设）。
- Agent 之间 **异步工作、互不干扰**，以**版本化产物（Artifact）**交接，而非实时对话。
- 内置 **架构一致性检查**（Oracle：把架构预期形式化为可机检规则，对照代码产物）。
- 质量门（Gate）：产物必须通过**自动校验 + 审核者（Reviewer）审查**才算完成；失败自动重试，超限触发**会议（Meeting）**，会议**决策（Decision）**产生补救任务。
- **协调者（Manager）**负责整体进度跟进并生成项目汇报（Markdown + JSON）。
- 全流程离线可跑（内置 mock 模型），也支持任意 OpenAI 兼容协议的真实模型。

## 二、实现方式（技术决策）

| 决策项 | 选择 | 理由 |
|---|---|---|
| 语言/运行时 | Node.js ≥ 20，ESM，**零运行时依赖** | 环境已有 Node 24；免安装、免构建、可移植 |
| 测试 | 内置 `node --test` + `node:assert` | 无需测试框架依赖 |
| 持久化 | JSONL 事件日志 + JSON 快照（`.cowork/`） | 可审计、可回放、简单 |
| 模型接入 | Provider 抽象：`mock`（确定性脚本）+ `openai`（兼容协议，可接 Ollama/LM Studio/任意网关） | agent 与模型解耦，测试离线可复现 |
| 编排 | 依赖 DAG + 每轮批处理（`maxConcurrent` 上限）并发跑 agent | 天然异步、互不干扰 |
| 协作协议 | 产物协议：`artifact = {id, name, version, state, producer, summary, text, files[], baseArtifacts[]}` | 版本可回滚、可比较、可依赖 |
| 会议触发 | 规则驱动：审查失败超限 / 高风险任务 / 架构违规 | 避免无意义讨论与 token 浪费 |

## 三、分阶段任务与验收标准

### P0 文档与脚手架 ✅
- 交付：PLAN.md、README.md、session_memory.md、package.json、.gitignore
- 验收：四份文档真实反映设计与决策；`node --test "test/*.test.js"` 可运行 ✅

### P1 基础域模型 ✅
- 交付：`src/events.js`（事件总线）、`src/config.js`（配置规范+校验+DAG 环检测）、`src/store.js`（JSONL+快照持久化）、`src/domain/agents|tasks|artifacts|reviews.js`（四类状态机/存储）、`src/oracle.js`（架构规则引擎）
- 验收：单测 `config/tasks/artifacts/oracle` 全绿；非法状态迁移报错；规则各类型判对 ✅

### P2 Provider 与 Runner ✅
- 交付：`src/providers/{index,mock,openai}.js`、`src/runner.js`（提示词构建/模型输出解析/文件动作执行）、`src/exec.js`（命令执行，stdio inherit）
- 验收：mock 脚本按角色分发；模型输出 JSON 解析（含 ```json 围栏/首对象提取）；write/exec 动作落盘；`node --test` 该组全绿 ✅

### P3 工作流引擎 ✅
- 交付：`src/engine.js`（依赖调度、并发批处理、质量门、重试、会议升级、事件）
- 验收：依赖不满足不启动；并发不超过 `maxConcurrent`；审查失败按 `maxReviewAttempts` 重试；超限触发会议并按决策补救；任务最终 approved ✅（workflow.test A–G 全绿）

### P4 会议与汇报 ✅
- 交付：`src/meeting.js`（触发器/决策/升级）、`src/reporter.js`（快照、风险、下一步、Markdown/JSON 报告）
- 验收：触发器按规则工作；决策含 actions；报告含进度百分比、风险、下一步；格式合法 ✅

### P5 CLI 与示例项目 ✅
- 交付：`bin/cowork.js`（init/run/status/report/artifacts）、`examples/demo/cowork.config.js`
- 验收：`node bin/cowork.js run examples/demo` 一次跑通（completed 100% 4/4），status/report/artifacts 从快照正确输出 ✅；`init` 模板项目冒烟跑通（3/3）✅

### P6 集成测试 ✅
- 交付：`test/integration.test.js`（完整流水线）+ `test/reporter.test.js`
- 验收：mock 全流程从架构→双开发→质检→汇报全绿；会议发生且有决策；并发不超限；report 进度 100% ✅

### P7 整体测试与审核 ✅
- 交付：全量 `node --test "test/*.test.js"`（50/50 通过）、`node --check` 28 文件零错误、REVIEW.md 审核报告（覆盖矩阵、已知限制、人工验收清单）
- 验收：所有测试绿；REVIEW.md 确认四项用户需求均已实现；人工清单可勾选 ✅

## 四、进度记录

| 日期 | 阶段 | 说明 | 状态 |
|---|---|---|---|
| 本会话 | P0 | 创建计划、README、会话记忆、脚手架 | ✅ |
| 本会话 | P1 | 事件/配置/持久化/四大域状态机/Oracle + 单测 | ✅ |
| 本会话 | P2 | Provider（mock/openai）/Runner（提示词/解析/动作） | ✅ |
| 本会话 | P3 | 工作流引擎：调度/并发/质量门/重试/会议升级 | ✅ |
| 本会话 | P4 | 会议与汇报（触发器/决策/快照/Markdown） | ✅ |
| 本会话 | P5 | CLI + examples/demo 实跑（completed 4/4） | ✅ |
| 本会话 | P6 | 集成测试：全流程 + 持久化回放 | ✅ |
| 本会话 | P7 | 全量测试 50/50、语法检查 28 文件、REVIEW.md | ✅ |
| 本会话 | P8 | agnes 真实模型接入说明与 demo 示例（openai 协议） | ✅ |
| 本会话 | P9 | 夜班静默模式：时间判定 + 多角色会议 + night-shift 文档 + --night | ✅ |
| 本会话 | P10 | Web 面板（serve）+ 人工审批 + run --resume 恢复续跑 | ✅ |
| 本会话 | P11 | 规划器：cowork plan 主题→模块 DAG；run --plan 执行 | ✅ |
| 本会话 | P12 | 全量测试 71/71、语法检查全文件、REVIEW.md 增补 + 4 条 CLI 端到端实测 | ✅ |
| 本会话 | P13 | 工作室模式：自定义角色（producer/策划/美术/程序/QA/艺术总监/导演）+ accepts 按产物匹配评审 + min_size/json_valid 资产规则 + exec outFile 回读；game-studio-demo 冲突会议闭环；测试 76/76 | ✅ |
| 本会话 | P14 | 团队任务（task.team：同角色多 agent 并行产出→互评→择优→整合；策划 2 人团队产出融合 GDD） | ✅ |
| 本会话 | P15 | 图片规则（file_magic/image_dimensions + latin1 编码）、运行统计（次数/耗时/输出/token）、cowork ship git 分支交付、doc/roles.md、demo 增 writer/audio；测试 79/79 | ✅ |
| 本会话 | P16 | 安全加固：路径越界/符号链接绕过/命令白名单/面板鉴权+反 CSRF/day 穿越/body 限制/状态原子写/错误脱敏/动作资源限制全部闭环；doc/USAGE.md 接入手册；测试 87+2skip | ✅ |

## 五、最终验收标准（总）

1. 用户可配置 agent 数量与模型 ✅ 由 `config.agents[]`（provider+model+prompt）提供，P1/P5 验证
2. agent 异步、不互相干扰 ✅ 由依赖 DAG + 并发批处理 + 产物交接提供，P3/P6 验证
3. 架构一致性检查 ✅ 由 oracle + 架构规则产物提供，P1/P3/P6 验证
4. 冲突时开会、讨论、分工解决 ✅ 由 meeting 触发器 + 决策 actions 提供，P4/P6 验证
5. 全程离线可跑、可测试 ✅ 由 mock provider + node:test 提供，P7 验证（50/50 ✅）

## 六、二阶段计划（P8–P12：agnes 模型 / 夜班静默 / Web UI / 规划器）

> 目标升级：CoWork 从"流水线执行器"升级为**可被各类 agent coder（如 dsh）嵌入的规划型协作引擎**——
> 用户给一个主题 → agents 分析拆解成模块计划 → 开发/测试/验证 → 交付验收。
> 语言决策：**ESM JavaScript 零依赖运行**（理由见 README「技术决策」），文档型护 JSDoc + 可选 tsc --noEmit。

### P8 agnes 模型接入 ✅
- 交付：agnes 接入说明与示例（`providers.agnes = {kind:'openai', baseURL:'https://apihub.agnes-ai.com/v1', apiKey: env.AGNES_API_KEY, defaultModel:'agnes-2.5-flash'}`）、demo 切换注释示例（含 agnes-2.5-flash 免费 / agnes-3.0-flash / 2.5-pro 系列）、README/REVIEW 更新 ✅
- 验收：openai provider 已单测；demo 配置注释给出各模型用法与密钥约定 ✅

### P9 夜班静默模式 ✅
- 交付：`src/nightshift.js`（时间段判定[跨天/时区/时钟注入]、NightShiftLog 渲染落盘）、引擎夜班分派（架构/开发/审核/协调多角色发言→主持人归纳决策）、`night-shift/YYYY-MM-DD.md`（问题/分析过程/决定）、CLI `run --night`（强制）✅
- 验收：nightshift.test 10 例（边界/跨天/时区/集成：夜班自动开会不阻塞+文档生成；白天仍阻塞人工）全绿；demo --night 文档实测 ✅
- 防判停修复：runUntil 跟踪进行中会议决策（#inflight），避免微任务竞态提前判停 ✅

### P10 Web UI（零依赖）✅
- 交付：`cowork serve <dir> [--port=N]` → node:http 面板（总览/任务/产物/审核/会议/夜班记录）+ 人工审批 `POST /api/decisions`（写回决策、任务置 needs_revision）+ `run --resume` 恢复续跑（engine.resumeState）✅
- 验收：web.test 5 例（页面/状态/夜班列表/审批接口/续跑闭环）+ CLI 冒烟实测 ✅

### P11 规划器（主题→模块→计划→执行→交付）✅
- 交付：`cowork plan <dir> "主题"`：planner（回退 architect）拆解模块 DAG（依赖/角色/验收/规则）→ `plan/<主题>/plan.json` + `plan.md`；`run --plan=<file>` 执行；`workflow.rules` 注入 Oracle；planner 角色合法化 ✅
- 验收：planner.test 6 例（规范化/角色映射/环检测/执行）+ demo plan→run 实测（2 模块 completed）✅

### P12 整体测试与审核（二阶段）✅
- 交付：全量 `node --test "test/*.test.js"` **71/71 通过**、`node --check` 全文件零错误、REVIEW.md 增补（9 项需求覆盖矩阵、4 条 CLI 端到端实测）、CLI 实跑（run / --night / --plan / serve+resume）✅
- 验收：全部测试绿；人工验收清单已更新 ✅

## 七、三阶段计划（P13：工作室模式）

> 背景：用户要求评估角色划分是否合理（以游戏/作品工作室视角）。评估结论——现有"软件工厂"角色（架构/开发/审核/协调）对软件合理，但缺创意源头、专业职能与美术类验收。落地见 P13。

### P13 工作室模式（自定义角色 + 按产物匹配评审 + 资产规则）✅
- 交付：
  1. 角色白名单放开：任意小写标识符角色（producer/game-designer/artist/programmer/…），architect/planner/developer/reviewer/manager 保留特殊引擎语义（config.js 校验改为名目+accepts 数组校验）；
  2. 评审者按产物匹配：reviewer agent 支持 `accepts:['art','code']`，引擎先精确匹配（产物名/生产者角色），无匹配通用兜底；评审者不自审；架构/规划设计产物由内建门自审（engine #reviewerFor 语义化重构）；
  3. Oracle 资产规则：`min_size`（防空占位资产）+ `json_valid`（合法 JSON），内容类规则支持 ifPresent 跳过；
  4. exec `outFile` 成功时回读为产物文件（评测命令证据留档到产物版本）；
  5. `examples/game-studio-demo`：制作人→策划→美术/程序并行→QA/艺术总监分别审查→导演汇报；美术 v1 不符合策划规格 → 质量门拦截 → 会议裁决 → 重画 v2 通过（冲突解决闭环）。
- 验收：studio.test 5 例全绿（自定义角色校验/资产规则/accepts 匹配/兜底回退/demo 端到端）；**全量 76/76**；CLI 实跑 game-studio-demo completed（报道含会议决策与分级审查记录）✅

### P14 团队任务（同角色多 agent 讨论择优）✅
- 交付：`task.team:['id1','id2']` 团队任务——R1 并行产出各自方案 → R2 相互评审（scores/pick/notes）→ R3 胜出者整合为最终交付提交质量门（平局组长仲裁）；产物 meta.team 记录成员/评审/胜出者；TaskStore.create 显式保留 team 字段；报告任务表显示"成员+（胜出 X）"
- 验收：团队配置校验（长度/未知成员/与 agentId 互斥）、互评择优（winner=最高分者、meta.team 完整）、demo 策划 2 人团队（产出 GDD 含数值曲线）全绿 ✅

### P15 增强包（图片规则 / 运行统计 / git ship / doc）✅
- 交付：
  1. oracle 图片规则：`file_magic`（PNG/JPEG/JSON/hex 文件头魔数）+ `image_dimensions`（零依赖解析 PNG IHDR / JPEG SOF 真实宽高，min/max）；write 动作支持 `encoding:'latin1'`（二进制资产按字节落盘/提交/还原）；
  2. 运行统计：engine `#callProvider` 统一计时与 usage 采集，报告附"运行统计"（调用/耗时/输出/按角色/按模型，含 tokens 若有）；
  3. `cowork ship <dir> [--branch=名]`：已批准产物写回项目目录（防 `..` 逃逸）并 git 分支提交（交付即提交）；
  4. `doc/roles.md` 角色职责说明书；
  5. demo 增补 writer/audio 角色与任务（7 任务）。
- 验收：studio.test 增补 3 例（team 校验/team 择优/图片规则）；demo e2e 7/7（团队+会议+统计断言）；**全量 79/79**；CLI 实跑：完整报告含团队标记与运行统计；ship 冒烟（临时 git 仓库 commit 9 文件/7 产物）✅

## 八、P16：安全加固（用户安全审查驱动）

> 用户给出安全优先级清单，逐项闭环；统一安全基元放 `src/security.js`，`security.test.js` 回归覆盖。

- **最高优先级**：
  1. runner 路径穿越与越界读写 → `safeJoin` 拒绝 `../`/绝对路径/盘符逃逸（write path、exec cwd、outFile 全覆盖）；
  2. `shell:true` 任意命令执行 → `engine.commands.allow` 白名单（basename 匹配、支持引号路径与 .exe），默认 node/npm/npx/git，`allowAll:true` 才放开；
  3. Web 审批接口无认证/CSRF → 会话 token（URL 携带，未认证 401）+ Origin 同源校验 + JSON POST 预检拦截；
  4. `/api/night` 路径穿越 → `DAY_RE` 仅 YYYY-MM-DD（含月/日语义范围）；
  5. ship 符号链接绕过 → `assertNoSymlink` 逐级 lstat，经 `src/deliver.js` 统一写盘；
  6. `--plan` 外部文件读取 → `safeJoin(dir, planFile)` 必须项目目录内。
- **其次**：
  7. 请求体限制 → POST body ≤ 1MiB 超限 413；
  8. 状态原子写入/并发 → `atomicWrite`（tmp+rename）用于 state.json 与审批写回；
  9. 错误脱敏 → Web 500 不回传堆栈/路径（细节只落本机 stderr）；
  10. 动作资源限制 → `engine.actionLimits`（maxActions/maxWriteBytes/maxExec）。
- 交付：`src/security.js` / `src/deliver.js`、runner/exec/server/bin/store 改造、`test/security.test.js`（10 例）、`doc/USAGE.md` 接入手册。
- 验收：**全量 87 通过 + 2 跳过**（symlink 用例因本机无开发者模式跳过）；CLI 冒烟：demo 4/4、game-studio 7/7（exec 白名单放行 node）、`--plan=../../.env` 被拒、serve URL 带 token（无 token 401 / query token 200 / header token 200）✅