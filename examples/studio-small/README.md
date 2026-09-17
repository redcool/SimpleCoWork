# 三人 Studio CoWork 使用说明

> 适用配置：`examples/studio-small/agents.json`
> 适用版本：Studio CoWork 0.1.4.0 Trial

## 1. 三人团队是什么

三人 Studio 用三个可配置 Agent 覆盖最小生产闭环：

```text
Manager   负责目标、计划、风险和审批协调
Developer 负责技术设计、实现说明和测试
Artist    负责视觉方向、资产规格和美术生产
```

它适合：

- 独立开发者；
- 小型游戏原型；
- 小型内容项目；
- 需要快速验证创意的团队；
- 暂时没有独立策划、QA 和音频岗位的项目。

## 2. 前置条件

- Node.js 24 或更高版本；
- PowerShell 或终端；
- 项目位于 CoWork 仓库内或使用正确的相对路径；
- 真实 Agnes 模式需要 Agnes API Key 和 OpenAI-compatible Base URL；
- 离线模式不需要 API Key。

检查版本：

```powershell
node --version
```

## 3. 配置文件

配置文件：

```text
examples/studio-small/agents.json
```

每个 Agent 都可以单独修改：

- `id`：唯一身份；
- `role`：职责；
- `provider`：Provider 名称；
- `model`：模型名称；
- `prompt`：工作提示词。

当前默认模型：

```text
manager   agnes-3.0-flash
developer agnes-3.0-flash
artist    agnes-2.5-flash
```

如需替换模型，只修改 JSON：

```json
"model": "agnes-3.0-flash"
```

不要把 API Key 写到 JSON 文件中。

## 4. 离线模式（推荐首次试用）

离线模式用于先验证工作流，不消耗模型额度。

当前 CLI 可先验证项目和任务骨架：

```powershell
cd H:\ai_works\CoWorkPrj
node bin/studio.js init examples/studio-small small-studio
node bin/studio.js version examples/studio-small 0.1.4.0
node bin/studio.js plan examples/studio-small 0.1.4.0
node bin/studio.js status examples/studio-small
```

然后使用版本 ID 查看任务：

```powershell
node bin/studio.js tasks examples/studio-small <version-id>
```

如果重复初始化，建议删除该示例目录下的 `.cowork/` 和 `workspaces/` 后重新开始。

## 5. 真实 Agnes 模式

设置环境变量：

```powershell
$env:AGNES_API_KEY = "你的 Agnes API Key"
$env:AGNES_BASE_URL = "你的 Agnes OpenAI-compatible 地址"
```

然后确认配置能加载：

```powershell
node -e "import('./src/studio/config.js').then(m=>{const c=m.loadStudioConfig('./examples/studio-small/agents.json'); console.log(c.agents.map(a=>({id:a.id,model:a.model,provider:a.provider})));})"
```

注意：当前 `agnes` Provider 通过 OpenAI-compatible Chat Completions 适配。若你的 Agnes 网关接口不同，需要调整 Provider 适配器，而不是修改 Agent 角色。

## 6. 三人工作流

建议按以下流程使用：

### planning

Manager 负责：

- 明确版本目标；
- 把需求拆成可验收目标；
- 指定设计、技术和美术任务；
- 列出风险；
- 产出版本计划。

### design

三个 Agent 协同：

- Manager：保持目标和范围；
- Developer：产出技术设计和实现约束；
- Artist：产出视觉方向和资产规格。

所有下游输出只能使用已批准 Artifact。

### production

- Developer：实现功能或生成实现文档；
- Artist：生产视觉资源或资产说明；
- Manager：处理冲突和范围变更。

### playable

- Manager：组织试玩和版本判断；
- Developer：修复技术问题；
- Artist：修复视觉问题；
- Manager/用户：决定是否进入封版。

## 7. 完整 CLI 操作顺序

```powershell
# 1. 初始化
node bin/studio.js init examples/studio-small small-studio

# 2. 创建版本
node bin/studio.js version examples/studio-small 0.1.4.0

# 3. 生成任务计划
node bin/studio.js plan examples/studio-small 0.1.4.0

# 4. 查看版本状态
node bin/studio.js status examples/studio-small

# 5. 查看任务
node bin/studio.js tasks examples/studio-small <version-id>

# 6. 阶段启动/迁移
node bin/studio.js stage examples/studio-small <version-id>:planning:start

# 7. 崩溃后恢复
node bin/studio.js recover examples/studio-small

# 8. 导出审计事件
node bin/studio.js events-export examples/studio-small
```

当前阶段任务执行 API 和 CLI 正在继续扩展；首次试用建议先跑完初始化、计划、状态、任务和事件导出。

## 8. 输出目录

```text
examples/studio-small/
├── agents.json
├── .cowork/project.db
├── .cowork/events.jsonl
├── workspaces/0.1.4.0/documents/
├── workspaces/0.1.4.0/source/
├── workspaces/0.1.4.0/assets/
└── workspaces/0.1.4.0/tests/
```

数据库保存关系和状态；文件系统保存文档和资源；JSONL 保存审计事件。

## 9. 常见问题

### 重复运行 init

删除：

```text
examples/studio-small/.cowork/
examples/studio-small/workspaces/
```

然后重新执行。

### 没有配置 Agnes Key

使用离线 Mock 测试和流程验证，不会影响项目数据库结构。

### 任务失败

查看任务状态：

```powershell
node bin/studio.js tasks examples/studio-small <version-id>
```

恢复运行中任务：

```powershell
node bin/studio.js recover examples/studio-small
```

达到重试上限时，停止自动重试，交给 Manager 或用户判断。

### 如何修改团队

直接编辑：

```text
examples/studio-small/agents.json
```

可以增加 Agent，但必须保证：

- `id` 唯一；
- role 明确；
- provider 已配置；
- model 可用；
- prompt 说明职责；

## 10. 试用验收清单

完成以下步骤即可认为三人 Studio 基础试用成功：

- [ ] 配置文件可加载；
- [ ] 项目初始化成功；
- [ ] 版本 `0.1.4.0` 创建成功；
- [ ] 五阶段计划生成成功；
- [ ] 任务依赖可查询；
- [ ] events.jsonl 能导出；
- [ ] 任务失败后可以 recover；
- [ ] 修改 Agent model 后配置仍可加载；
- [ ] Release 前所有阶段和审批状态可追踪；

三人 Studio 的目标不是让三个 Agent 同时聊天，而是让三个人通过版本化 Artifact 协作。
