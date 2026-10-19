# Studio CoWork 使用指南

本文面向使用者，讲实际操作。命令都在工程根目录执行。

## 1. 运行前准备

- Node.js >= 24。Studio 用内置 SQLite（node:sqlite）。
- 模型密钥：工程根 `.env` 写一行 `AGNES_API_KEY=...`。CLI 读取它，不会打进仓库。
- 配置有两份，分工不同：

| 配置 | 位置 | 谁读它 | 管什么 |
|---|---|---|---|
| `studio_config.json` | 工作根目录 | 框架，每次工作都读 | 框架级行为。当前字段：`version`、`languages` |
| agents 配置 | 任意路径，用 `STUDIO_CONFIG` 指向 | layer/run/supervise 命令 | providers（模型接入）和 agents（角色、模型、提示词） |

`studio_config.json` 示例：

```json
{ "version": 1, "languages": ["zh", "en"] }
```

- `languages` 决定每份文档产出几种语言。缺省 `["zh"]`。
- 语言代码格式：`zh`、`en`、`zh-TW`。拒绝空数组、重复项。
- planner 和监督者的 JSON 提案是机器契约，不受语言配置影响。

agents 配置示例见 `examples/brotato-3d-demo/studio-agents.json`。要点：

```json
{
  "providers": { "agnes": { "kind": "openai", "baseURL": "https://apihub.agnes-ai.com/v1", "apiKey": "${AGNES_API_KEY}", "defaultModel": "agnes-3.0-flash", "timeoutMs": 180000 } },
  "agents": [ { "id": "planner", "role": "planner", "model": "agnes-3.0-flash", "prompt": "你是资深游戏策划……" } ]
}
```

## 2. 层模式：一句话需求到分层文档

四个层，按顺序交接：`requirements → engineering → development → qa`。

命令格式：

```
node bin/studio.js layer <层名> <输入> <输出>
```

- requirements 层：输入是路径时按文件/目录处理；路径不存在时按"想法"处理，整句话进提示词。
- engineering / development / qa 层：输入必须是存在的文件或目录。推荐直接用上一层的输出目录。
- 每层产出固定模板文档，数量 × 语言数。各层模板：

| 层 | 模板文档 |
|---|---|
| requirements | requirements / feature-list / asset-spec / acceptance |
| engineering | quantified-spec / architecture / task-breakdown / test-plan |
| development | implementation-plan / change-list / risk-register |
| qa | qa-report / bug-list / performance-security |

层内没有记忆，交接只靠输入目录。目录输入会把**每个文件的内容**带进提示词（单文件上限 8000 字符、总量 30000 字符，超出部分在提示词里明确标注截断），下游层能看到上游文档的正文。每份产出的 `layer-manifest.json` 记录：输入路径、provider、语言、文件清单。

### 推荐目录约定（LayerOutput）

```
LayerOutput/<项目名>/
  requirements/  v_1  v_2 …      # v_N：第几次需求交付
  engineering/   v_1 …           # manifest.input 指向所用 requirements 的具体 v_N 目录
  development/   v_1 …           # manifest.input 指向所用 engineering 的 v_N 目录
  qa/            v_1 …           # manifest.input 指向所用 development 的 v_N 目录
```

- 项目名是用户需求的摘要，例如 `brotato-3d`。
- 需求改进时 requirements 出 `v_2`，旧的 `v_1` 永远保留，不覆盖、不删除。
- 每层用了哪个上游版本，看该层 `layer-manifest.json` 的 `input` 字段（路径里含 v_N）。
- 目前这个约定靠使用者遵守，CLI 还没有自动编号（见第 6 节边界）。

### 实际跑通的例子（本项目）

```
# 第一次需求（当时单语言，后归档为 v_1）
node bin/studio.js layer requirements "做一个3d的土豆兄弟" LayerOutput/brotato-3d/requirements/v_1

# 语言配置改为 ["zh","en"] 后重跑，归档为 v_2
node bin/studio.js layer requirements "做一个3d的土豆兄弟" LayerOutput/brotato-3d/requirements/v_2

# engineering 层吃 requirements v_2
STUDIO_CONFIG=examples/brotato-3d-demo/studio-agents.json node bin/studio.js layer engineering LayerOutput/brotato-3d/requirements/v_2 LayerOutput/brotato-3d/engineering/v_1
```

前提：`.env` 里有 `AGNES_API_KEY`。8 次模型调用约 6 分钟。

## 3. 工作流模式：版本化生产线

层模式只产文档。工作流模式是正式生产线：版本、阶段门、审查、审批、封版、恢复。

命令序列：

```
node bin/studio.js init <dir>                              # 1 建项目
node bin/studio.js version <dir> 0.1.0.0                   # 2 建版本（版本化工作区 + 5 个阶段）
node bin/studio.js plan <dir> <versionId>                  # 3 生成标准任务并建依赖
node bin/studio.js goal-create <dir> <version> "目标描述"   # 4 定目标与验收
node bin/studio.js run-start <dir> <goalId>                # 5 开运行
set STUDIO_CONFIG=agents.json && node bin/studio.js supervise <dir> <goalId>   # 6 定时监督推进
```

第 3 步默认任务（角色由计划固定）：

| 阶段 | 任务 | 角色 |
|---|---|---|
| planning | version-plan | manager |
| design | system-design | designer |
| asset-spec | asset-spec（JSON） | art-director |
| production | implementation | developer |
| playable | test-plan | qa |

相邻阶段任务自动建依赖：上游不批准，下游不开工。

第 6 步有两种驱动方式：

- `studio run <dir> <goalId>`：一次性推进到目标达成或无法推进。
- `studio supervise <dir> <goalId> [intervalMs]`：定时监督循环，默认每 10 秒一轮，持续盯着直到完成。可用环境变量 `STUDIO_SUPERVISE_INTERVAL_MS` 覆盖间隔。

运行中每一轮（tick）做：预算检查 → 快照 → 验收 → 停滞检测 → 规划 → 执行 → checkpoint。

关键机制：

- **文档任务**：模型产出 JSON → 提交为不可变 Artifact（文件 + checksum + 依赖）→ 独立 reviewer 审查；不通过打回 needs_revision。
- **阶段门**：阶段内任务全部批准后，阶段进入 reviewing；需要用户确认的进入 user_pending。
- **卡住兜底**：停滞（无状态变化 / 无动作可执行 / 超轮次）→ 召开经理组会议，会议决定经校验后自动执行并续跑；每轮运行最多 3 次会议；仍无解则进入 waiting_for_user，等你处理，确认后自动恢复。
- **收尾**：`approve-version` 批准版本 → `seal` 封版，生成 release 目录和 manifest；`fork` 从基线拉新版本。
- **审批身份**：approveStage 支持显式 actor（角色 + capability 核验），审批记录落 actor_id。

## 4. 日常运维命令

| 命令 | 用途 |
|---|---|
| `studio status <dir>` | 看版本列表 |
| `studio tasks <dir> <versionId>` | 看任务 |
| `studio run-status <dir> <runId>` | 看运行状态 |
| `studio task-retry <dir> <taskId>` | 重试失败任务 |
| `studio recover <dir>` | 恢复租约过期的运行中任务 |
| `studio events-export <dir>` | 导出事件 outbox 到 JSONL |
| `studio bug-fix <dir> <bugId:stage:agentRole>` | 为 Bug 建修复任务 |
| `studio stage <dir> <versionId:stageKey:start\|reviewing>` | 手动推阶段门 |
| `studio approve-version <dir> <versionId>` | 批准版本 |
| `studio seal <dir> <versionId>` | 封版 |
| `studio fork <dir> <baseVersionId:version>` | 拉版本分支 |

## 5. 常见问题

- **文档语言不对 / 要加语言**：改工作根 `studio_config.json` 的 `languages`，下次运行生效。
- **流程卡在 waiting_for_user**：这是等你确认。处理后运行会自动续跑（确认队列回调恢复运行）。
- **任务失败**：`task-retry`。任务有尝试次数上限（默认 3）。
- **进程中断**：重启后 `recover`，只恢复租约过期的任务，不会和旧执行者重复跑。
- **层输出没传输出目录**：默认落在 `tmp/studio-<层名>-<时间戳>/`（tmp 已被 gitignore，属临时产物）。
- **临时文件**：一律放 `tmp/`，保持工程根整洁。

## 6. 当前边界（如实说明）

- 层模式与工作流模式没有自动桥接：层产物不会自动变成工作流版本的 Artifact。
- 工作流模式全链路目前由离线 mock 测试覆盖组件，真实模型串跑尚未进行。
- `studio plan` 的任务路径尚未接入 `languages`（二期）。计划文档任务仍是单语言。
- LayerOutput 的 v_N 自动编号、上游版本自动选择，CLI 尚未实现，靠约定。

## 7. 相关文档

- `doc/studio-docs-index.md`：文档索引。
- `doc/审核-2026-09-16.md`：问题记录与整改（C17 监督、C18 语言统一）。
- `Agent工作纪律.md`（SimpleMCPServer/docs）：临时文件、版本号、夜班等工作纪律。
