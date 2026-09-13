# CoWork 角色职责说明书（doc/roles）

> 本文档说明 CoWork 的角色体系如何划分与扩展：内置角色的引擎语义、工作室模式的角色设计、
> 同角色多 agent 团队协作（task.team）、评审者选择规则与资产验收规则。

## 一、设计原则

1. **角色即配置**：`config.agents[]` 中每个 agent 有 `id/role/title/provider/model/prompt`；
   `role` 为小写字母开头的标识符，可自由命名（producer / game-designer / artist / writer / audio …）。
2. **内置角色承担引擎语义，自定义角色承担业务语义**：
   | 角色 | 引擎语义 |
   |---|---|
   | `architect` | 产出 architecture 产物；其 `rules.json` 被 Oracle 收集为全局规则；架构/规划设计产物由内建质量门自审 |
   | `planner` | 主题→模块 DAG（`cowork plan`）；缺失时回退 architect |
   | `developer` | 普通生产者语义 |
   | `reviewer` | 质量门审查者；支持 `accepts` 按产物匹配；评审者不自审自己的任务 |
   | `manager` | 会议决策（autoDecide）、汇报叙事、可执行任务 |
   | `meeting` | 备选决策者 |
   | 其它 | 普通生产者语义，可自由组合 |
3. **角色职责靠 prompt 约定**：引擎只注册与调度角色，不内置各职能的知识——把职责写进 `prompt`。
4. **评审者 ≠ 生产者**：质量门由"规则（Oracle）+ 独立评审 agent"构成，产物无法自我批准。

## 二、工作室模式角色范本（examples/game-studio-demo）

| 角色 | 职责（prompt 约定） | 任务示例 | 验收 |
|---|---|---|---|
| `producer` 制作人 | 定义产品愿景、目标受众、验收口径 | t-vision → vision.md | 通用质量门 |
| `game-designer` 策划（可 2 人团队） | 把愿景落成 GDD：玩法结构 + 资产规格 + 数值 | t-gdd → gdd.md | GD1 含 hero；团队讨论产出 |
| `artist` 美术 | 按资产规格制作资产（PNG/JSON/描述） | t-art → art/* | ART1-5（魔数/尺寸/JSON/非空） |
| `programmer` 程序 | 按 GDD 实现 + 用命令留下测试证据 | t-code → src/* | CODE1/2 + exec outFile 证据 |
| `writer` 叙事 | 剧情梗概、角色设定 | t-story → story.md | ST1 文件存在 |
| `audio` 音频 | 音效/音乐资产清单 | t-audio → audio/sfx.txt | AU1 文件存在 |
| `qat` QA（reviewer） | 代码与测试证据核验 | accepts: ['code'] | 质量门 data |
| `artdirector` 艺术总监（reviewer） | 美术资产规格/风格审查 | accepts: ['art'] | 质量门 data |
| `director` 导演（manager） | 冲突会议裁决 + 汇报 | t-report → report.md | gate:false |

> 分工协作：任务 DAG（`requires`）表达专业接力；同一角色的多个 agent 用 `task.team` 表达"讨论择优"。

## 三、同角色多 agent：团队任务（task.team）

同一角色可配置多个 agent（策划 = 资深 + 数值），任务声明 `team: ['id1','id2']` 即进入团队模式：

1. R1 **并行产出**：每名成员独立提出一版方案（标准产出协议，不落盘）；
2. R2 **相互评审**：成员审阅全组方案，输出 `{scores, pick, score, notes}`（给他人打分/互选/改进意见）；
3. R3 **择优整合**：多数互选胜出（平局由组长=team[0] 仲裁），胜出者把全组改进意见融合为最终交付并提交质量门。

- 产物记录团队元数据：`artifact.meta.team = { members, proposals, judges, winner, rationale }`，`producer = 胜出者`。
- 报告任务表显示 `designer-senior+designer-numeric（胜出 designer-senior）`。
- 成本提示：团队任务模型调用 = 成员数×(产出+评审)+1（整合）。按需选用。

## 四、评审者选择规则（engine #reviewerFor）

按优先级：

1. **accepts 精确匹配**：reviewer 配置 `accepts: ['art','code']`；任务 `outputs` 以该前缀或产出者角色命中则指派（如 art→艺术总监、code→QA）；
2. **自己不自审**：唯一候选即生产者本人时跳过；
3. **设计产物内建门**：生产者角色为 reviewer/architect/planner 时不安排外部评审（由规则门+会议升级兜底）；
4. **通用兜底**：无 accepts 的 reviewer，否则第一个 reviewer。

## 五、资产验收规则（Oracle 扩展）

| 规则 type | 用途 | 示例 |
|---|---|---|
| `file_exists` / `file_not_exists` | 文件存在性 | `{type:'file_exists', file:'src/db.js'}` |
| `contains` / `not_contains` / `regex` | 文本断言 | 代码含 `module.exports`、无 `TODO` |
| `js_syntax` | CommonJS 语法 | `{type:'js_syntax', file:'src/api.js'}` |
| `min_size` | 内容长度下限（防空占位） | `{type:'min_size', file:'art/bg.json', min:8}` |
| `json_valid` | 合法 JSON | `{type:'json_valid', file:'art/bg.json'}` |
| `file_magic` | 文件头魔数（PNG/JPEG/JSON/hex） | `{type:'file_magic', file:'art/hero.png', mime:'png'}` |
| `image_dimensions` | 零依赖解析 PNG/JPEG 真实尺寸 | `{type:'image_dimensions', file:'img.png', format:'png', minWidth:32, minHeight:32}` |

跨产物规则统一加 `ifPresent: true`：产物不含该文件时跳过（避免美术产物被代码规则误伤）。
二进制资产（图片）由 write 动作以 `encoding:'latin1'` 提交，落盘/`ship` 时按字节还原。

## 六、新增一个角色的步骤

1. `agents[]` 增加：`{ id:'writer', role:'writer', title:'叙事', provider/mock|agnes, model, prompt:'职责说明…' }`；
2. `workflow.tasks` 增加任务并指定 `agentId`（或 `team` 多 agent）；`requires/inputs/outputs` 串起依赖；
3. （可选）在 `workflow.rules` 增加该角色的验收约束（ifPresent）；
4. 质量门失败将触发会议（导演/manager 决策）→ 补救重试 → 通过。

## 七、交付（ship）

`node bin/cowork.js ship <dir> [--branch=名]`：把 `.cowork` 中**已批准产物**按版本写入项目目录并提交到 git 分支
（路径以 `.` 内为限、禁止 `..` 逃逸；二进制按 latin1 还原）。实现"交付即提交"与分支隔离。