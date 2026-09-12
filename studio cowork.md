# Studio CoWork v2 开发需求文档

> 文档文件：studio cowork.md
> 产品：Studio CoWork
> 目标版本：0.1.0.0
> 基线：CoWork v1.0.1.0
> 状态：开发基线
> 日期：2026-09-12

## 1. 目标与定位

Studio CoWork 是面向游戏、软件和内容生产的文档驱动虚拟工作室。大量专业 Agent 通过批准的文档、代码、资源、测试报告和构建产物协作，不依赖实时聊天共享工作状态。

LLM 负责需求理解、策划、设计、创作、编码、资源生产、审查和决策建议。框架只负责版本、阶段、依赖、Artifact、审批、调度、安全、索引和事件审计，不替代业务判断。

核心链路：

~~~text
用户需求 → 版本计划 → 策划文档 → 资源需求文档
→ 代码/资产异步生产 → 集成可玩版本 → 测试/经理试玩 → 用户确认 → 封版
~~~

## 2. 核心原则

1. 文档优先：Agent 正式协作以版本化 Artifact 为媒介。
2. 批准输入优先：下游只消费 approved 或 user-approved Artifact。
3. LLM 负责业务推理，框架负责流程和安全边界。
4. 已封版 release 只读；新版本使用独立 workspace。
5. 生产和审核分离；产出 Agent 不得成为唯一批准者。
6. 单一事实源：每类事实有权威文档或结构化契约。
7. 新版本不从零生产，支持 reuse、fork、replace、reference、deprecated。
8. Bug 通过影响分析进入最小必要阶段，而不是无条件重跑全部流程。
9. 用户确认是独立状态和事件，不是普通评论。
10. 框架不硬编码具体项目业务内容。

## 3. 顶层工作流

### 3.1 新版本

~~~text
需求 → 经理组形成版本计划
 → Stage 1 策划文档
 → 测试审核 + 经理审核 + 用户确认
 → Stage 2 资源需求文档
 → 测试审核 + 经理审核 + 用户确认
 → Stage 3 代码、资产、测试异步开发
 → 专业审核 + 测试审核 + 经理审核
 → Stage 4 集成可玩版本
 → 测试试玩 + 经理试玩 + 用户最终审核
 → 生成 manifest → 封版 release
~~~

### 3.2 Bug

~~~text
Bug → 经理确认优先级/版本/工期 → Impact Analyst 分析
 → 策划变更：进入 Stage 1
 → 资源规格变更：进入 Stage 2
 → 代码/资源制作问题：进入 Stage 3
 → 集成/回归问题：进入 Stage 4
 → 修复 → 回归测试 → 关闭 Bug
~~~

### 3.3 阶段门

未满足上游阶段门时，下游任务不得正式启动。探索任务可以在审批等待期间运行，但不得生成正式交付物或绕过基线。

## 4. 角色与职责

### 4.1 经理组

接收需求和 Bug，确定版本范围、优先级、里程碑、人员、工期和风险；调度专业组；监控阻塞；组织跨组会议；参与最终版本验收。经理不代替专业审核者判断所有技术、策划和艺术细节。

### 4.2 策划组

- 主策划：需求分析、策划大纲、统一玩法基线、策划文档审核。
- 系统策划：玩法、系统规则、功能和交互细节。
- 艺术策划：2D、3D、UI、动作、特效资源需求。
- 音效策划：音效、音乐、语音需求。
- 数值策划：经济系统、数值模型、CSV/JSON 输出。

### 4.3 程序组

- 主程序/架构师：技术选型、工程准备、技术设计、API/事件/数据契约。
- 前端主程序：前端架构和代码审核。
- UI 程序：UI 控件、事件和交互代码。
- 后端主程序：后端架构和代码审核。
- 前端/后端程序：按批准设计和契约实现。

### 4.4 艺术、音频与测试组

主艺术负责艺术方向和最终艺术审核；2D、3D、UI、动作、特效、音频 Agent 按批准规格生产并提交元数据、导入证据和预览。测试组负责文档、代码、资源、集成、回归、试玩和发布测试。

### 4.5 用户与发布负责人

用户确认版本计划、策划文档、资源需求文档、重大变更和最终可玩版本。Release Manager 检查测试、审批、manifest、依赖和回滚信息后执行封版。

## 5. 阶段详细需求

### Stage 0：版本计划

输入：用户需求、Bug、基线版本 manifest。

输出：version-plan.md、version-plan.json、change-set.json、milestone.md、resource-plan.json、risk-register.json、test-scope.json。

审核：经理审核，用户确认范围、目标和优先级。

### Stage 1：策划文档

输入：版本计划。

输出：main-design.md/json、system-design.md/json、numeric-design.csv/json、feature-list.json、acceptance-spec.json、test-plan.md/json。

审核：测试组审查可验证性，经理审查范围和工期，用户确认后冻结策划基线。

### Stage 2：资源需求文档

输入：已批准策划 Artifact。

输出：art-direction、art-2d-spec、art-3d-spec、ui-spec、animation-spec、vfx-spec、audio-spec、asset-manifest。

审核：测试组审查完整性和可验收性，经理审查成本和排期，用户确认方向和规格。

### Stage 3：生产与开发

输入：策划基线、资源规格、技术设计和契约。

输出：源代码、图片、模型、UI、动作、特效、音频、单元/集成测试证据、构建候选。

无直接依赖的代码和资产任务异步执行。代码和资源必须引用稳定契约，例如 api-contract、ui-contract、asset-spec、event-schema。

审核：主程序/主艺术/专业 Reviewer、测试组、经理组。

### Stage 4：可玩版本

输入：代码、资源、测试证据和构建清单。

输出：playable build、playtest-report、regression-report、release-candidate manifest、release-notes。

审核：测试试玩、经理试玩、用户最终审核。通过后封版。

## 6. 版本与目录

版本格式为 major.minor.patch.build。Studio 首版为 0.1.0.0。

~~~text
project/
├── .cowork/
│   ├── project.db
│   ├── events.jsonl
│   └── runtime/
├── releases/YYYY-MM-DD-vX.Y.Z.W/
│   ├── manifest.json
│   ├── documents/
│   ├── ai/
│   ├── source/
│   ├── assets/
│   ├── tests/
│   ├── build/
│   └── release-notes.md
├── workspaces/YYYY-MM-DD-vX.Y.Z.W/
└── shared/
~~~

release 封版后只读。新版本从某个 release 创建 workspace，表面重新执行自顶向下流程，但可以继承旧产物：

- reuse：直接复用且校验 checksum；
- fork：基于旧产物修改并产生新 Artifact；
- replace：新产物替代旧产物；
- reference：只读参考；
- deprecated：明确废弃。

每个继承关系记录 sourceVersion、sourceArtifact、inheritMode、checksum 和变更说明。

## 7. Artifact 与文档协议

通用 Artifact 至少包含：id、type、name、version、projectVersion、state、producer、taskId、baseArtifacts、sourceVersion、inheritMode、files、summary、approvals、createdAt、updatedAt。

状态建议：

~~~text
draft → submitted → internal-approved → user-pending → user-approved
                                      ↘ rejected
approved → stale / superseded / deprecated
~~~

每类正式文档同时提供：

1. 人类可读 Markdown：背景、意图、方案、风险和决策；
2. AI/机器可读 JSON、CSV 或 Schema：对象、参数、依赖、规则和验收标准。

Markdown 不是唯一事实源。正式产物必须声明输入基线和依赖。

## 8. SQLite、文件系统和 JSONL

文件系统保存 Markdown、JSON、CSV、代码、图片、模型、动画、音频、测试报告、构建包和 manifest。

SQLite 保存索引和关系：project、version、stage、task、agent、artifact 元数据、artifact_dependencies、artifact_files、review、approval、bug、bug_impacts、test_runs、release、agent capabilities 和事实引用索引。大型二进制不直接作为数据库主体。

JSONL 保存不可变事件：project.created、version.created、stage.started、artifact.submitted、artifact.approved、approval.granted、artifact.stale、bug.created、task.started、task.completed、release.sealed。SQLite 损坏时可由事件和 manifest 重建。

## 9. 影响分析与过期

任何批准文档、契约或需求变更都必须查询下游依赖。例如 gdd-v2 变化可能使 system-design、numeric-design、ui-spec、frontend-code stale，但不一定影响 audio。影响分析必须记录受影响 Artifact、影响类型、是否重做、是否重新审核和是否重新用户确认。

stale Artifact 默认不能作为正式输入；影响分析确认无影响后，才可恢复 valid。

## 10. Bug 模型

Bug 至少包含 id、title、severity、priority、foundInVersion、status、expected、actual、steps、evidence、affectedArtifacts。状态：open、triaged、in-progress、fixed、verified、closed、wont-fix。

Bug 路由结果必须绑定修复任务、目标阶段、预计工期、影响 Artifact 和回归测试。严重 Bug 可以创建 patch 版本；需求或玩法变化必须提高到策划阶段。

## 11. Agent 能力与调度

Agent 注册 capabilities、tools、读写范围、格式能力、性能限制、当前负载、历史成功率、返工率、模型成本和时延。调度顺序：输入满足、能力匹配、权限满足、负载、风险、成本和预计时间。

每个组默认采用 1 个 Lead、若干 Worker、1 至 2 个独立 Reviewer。高价值决策可以采用并行提案、竞争评审和 Lead 综合。

Agent 可以提出新增任务、变更和会议建议，但不能越权修改 approved release、跳过审批或访问未授权路径。

## 12. 框架职责边界

框架提供通用原语：创建项目/版本/workspace，注册 Agent，创建任务，绑定输入输出，提交 Artifact，请求审核，等待审批，建立依赖，影响分析，标记 stale，创建 Bug，生成 release candidate，封版、回滚、恢复和报告查询。

框架不负责具体玩法、艺术内容、代码实现或音频创作。框架只监控文档产出和状态，但必须同时监控文档类型、版本、来源、审批、依赖、完整性和过期状态。

## 13. 安全与非功能要求

继承 CoWork v1 的安全加固：workspace 隔离、release 只读、路径边界、命令白名单、工具权限、超时、文件大小、动作数量和 Token 预算、SQLite 事务、原子写入、Web token/Origin/CSRF 检查、审批审计。

要求 Node.js >= 20、ESM、可测试、可恢复、关键操作幂等、文件与 checksum 一致、敏感错误脱敏。优先保持零运行时依赖；SQLite 通过受控适配层接入。

## 14. v0.1.0.0 开发范围

### P0：基础模型

- VersionStore、WorkspaceStore、ReleaseStore；
- Stage 和 StageGate 状态机；
- Document/Artifact 元数据；
- ApprovalStore；
- SQLite schema 和迁移；
- JSONL 事件写入；
- workspace/release 目录管理。

### P1：版本工作流

- 创建版本；
- 从基线 fork；
- 继承 Artifact；
- 阶段门；
- 用户确认；
- manifest 生成；
- release 封版。

### P2：依赖与 Bug

- Artifact 依赖图；
- stale 标记；
- impact analysis；
- Bug 创建、分级和路由；
- Change Set。

### P3：LLM 调度适配

复用 Provider 和安全 Runner；DocumentTask 只读取 approved 输入；LLM 产物写入 workspace；结果进入 Artifact 和审核链。

### P4：CLI/Web

建议命令：

~~~text
studio init <dir>
studio version create <dir> <version>
studio version fork <dir> <base> <version>
studio status <dir>
studio approve <dir> <artifact>
studio impact <dir> <artifact>
studio bug create <dir>
studio release seal <dir> <version>
studio report <dir>
~~~

### P5：验收示例

新增 examples/studio-demo：创建 0.1.0.0；经理生成版本计划；策划和资源需求经过内部/用户确认；代码与资源并行生产；测试发现 Bug；Bug 路由到开发阶段；创建 patch 或下一版本 workspace；复用一个旧 Artifact、fork 一个 Artifact；生成可玩版本并封版。

## 15. 验收标准

1. 版本创建、fork、继承和封版成功。
2. workspace 与 release 隔离，release 封版后不可写。
3. 未完成上游阶段不能启动下游。
4. 缺少用户确认不能越过用户阶段门。
5. Artifact 有唯一 ID、版本、来源、checksum 和审批记录。
6. stale Artifact 默认不能作为正式输入。
7. Bug 可登记、分级、关联版本并路由到阶段。
8. 修复后必须生成回归测试证据。
9. SQLite 可查询项目关系，JSONL 可记录关键事件。
10. manifest 包含版本、输入、输出、审批、测试、checksum 和工具版本。
11. 中断后可恢复，重复执行不会修改已封版版本。
12. Agent 不能越权访问路径、命令或 release。

## 16. 首批开发任务

- [ ] 定义 SQLite schema 和 migration；
- [ ] 定义 Version、Workspace、Release；
- [ ] 定义 Stage、StageGate、Approval；
- [ ] 定义 Document/Artifact 来源关系；
- [ ] 定义 JSONL 事件 schema；
- [ ] 定义 Bug/Impact/ChangeSet；
- [ ] 创建 Studio 公共 API；
- [ ] 创建 examples/studio-demo；
- [ ] 为 P0 模块增加 node:test；
- [ ] 保证旧版测试和 Studio 测试隔离。

## 17. 迁移策略

1. 冻结 CoWork v1.0.1.0。
2. 在 studio cowork 分支实现 v2。
3. 复用 Provider、Artifact、事件和安全能力，但不在旧 Engine 中堆叠 studio 条件分支。
4. 新增 Studio Version、Stage、Approval、Impact、Bug 领域层。
5. 使用 SQLite 管索引、文件管内容、JSONL 管事件。
6. 用 studio-demo 做端到端验证。
7. 保留 v1 测试和兼容层。
8. Studio API 稳定后，再评估拆分 cowork-core/cowork-studio。

## 18. 明确不采用

- 不把所有内容塞进 SQLite；
- 不修改封版 release；
- 不用聊天记录作为唯一上下文；
- 不让经理代替所有专业审核；
- 不让 Agent 自产自审；
- 不把 mock 脚本伪装成真实 LLM 推理；
- 不让框架硬编码具体业务；
- 不用无限增加 Agent 数量代替契约、依赖和审核设计。
