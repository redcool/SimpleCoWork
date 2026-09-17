# Studio CoWork 使用示例

## 1. 三人小型 Studio

目录：`examples/studio-small/agents.json`

角色：

- `manager`：经理、计划、风险、审批协调。
- `developer`：技术、实现说明、测试计划。
- `artist`：视觉方向、资产规格、美术生产。

模型配置：

- Manager：`agnes-3.0-flash`
- Developer：`agnes-3.0-flash`
- Artist：`agnes-2.5-flash`

初始化和创建版本：

```powershell
node bin/studio.js init examples/studio-small small-studio
node bin/studio.js version examples/studio-small 0.1.4.0
node bin/studio.js plan examples/studio-small 0.1.4.0
node bin/studio.js status examples/studio-small
```

Agent 配置只需修改：

```text
examples/studio-small/agents.json
```

## 2. 标准 Studio 模式

目录：`examples/studio-standard/agents.json`

角色：

```text
Producer
Planner
Lead Designer
Narrative Designer
Art Director
Technical Designer
Developer
Artist
Audio Designer
QA
Reviewer
```

模型建议：

- 经理、规划、技术、开发、QA、Reviewer：`agnes-3.0-flash`
- 设计、叙事、美术、音频：`agnes-2.5-flash`
- 对复杂版本计划和冲突决策可将 Producer/Reviewer 切换到更强模型。

启动示例：

```powershell
node bin/studio.js init examples/studio-standard standard-studio
node bin/studio.js version examples/studio-standard 0.1.4.0
node bin/studio.js plan examples/studio-standard 0.1.4.0
node bin/studio.js tasks examples/studio-standard <version-id>
```

## 3. 配置说明

`agents.json` 是可修改配置，不应把模型写死在业务代码中。实际调用前需要将配置映射到 Provider：

```js
const agent = config.agents.find(a => a.id === task.agentRole);
const model = agent.model;
const provider = agent.provider;
```

环境变量：

```text
AGNES_API_KEY=...
```

不要把 API Key 写入 `agents.json`、Git 或文档。

## 4. 小团队与标准团队选择

小型 Studio 适合：

- 原型项目；
- 独立开发者；
- 需求较小；
- 需要少量 Agent 快速迭代。

标准 Studio 适合：

- 多系统项目；
- 游戏或复杂内容生产；
- 需要独立策划、美术、音频、程序和 QA；
- 需要正式 Reviewer 和用户审批。

## 5. 当前 CLI

```text
studio init <dir> [name]
studio version <dir> <x.y.z.w>
studio plan <dir> <version>
studio tasks <dir> <version-id>
studio stage <dir> <versionId:stage:action>
studio task-retry <dir> <task-id>
studio recover <dir>
studio events-export <dir>
studio bug-fix <dir> <bugId:stage:agentRole>
studio approve-version <dir> <version-id>
studio seal <dir> <version-id>
studio fork <dir> <baseVersionId:version>
```
