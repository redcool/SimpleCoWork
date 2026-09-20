# Studio CoWork 工作室用例路线

Studio CoWork 采用“固定内核 + 可组合 Agent 能力”的设计：

```text
Fixed Kernel：状态机、权限、依赖、Lease、Artifact、审批、Release
Agent：观察、判断、生产、提议动作
```

Agent 的职责不是写死为单一身份，而是由：

```text
role + capabilities + delegatesTo + control policy
```

## 1. 三人 Studio

配置：`examples/studio-small/agents.json`

角色：

```text
Manager = 项目经理 + 流程监督者 + 任务推进者
Developer = 技术设计 + 开发 + 测试
Artist = 视觉方向 + 资源规格 + 美术生产
```

Manager 的流程监督职责是可组合的。如果未来配置了独立流程监督者，Manager 可以把该职责委派给它，并消费其产出物；当前三人配置中由 Manager 兼任。

适合：

- 独立开发者；
- 小型原型；
- 三人协作；
- 需求到可玩版本的快速验证。

完成度：`可试用`

已具备：

- 配置化 Agent；
- 离线运行；
- planning/design 阶段演示；
- Task、Artifact、Reviewer、用户审批；
- Retry、Lease、Outbox、Release 基础。

仍需增强：

- 完整五阶段自动推进；
- Manager 结构化观察/提议/执行循环；
- 真实 Agnes 多 Agent 连续运行；
- 更完整的 QA 到 Bug 到 Fix Task 闭环。

## 2. 标准 Studio

配置：`examples/studio-standard/agents.json`

角色：

```text
Producer = 项目目标、范围、风险、用户沟通
Planner = 需求拆解、阶段计划、Task DAG
Designer/Narrative = 系统与叙事设计
Art Director/Artist = 视觉治理与美术生产
Technical Designer/Developer = 技术设计与实现
Audio Designer = 音频生产
QA = 测试、回归、Bug、性能安全
Reviewer = 独立审核
```

Producer 负责项目级推进；专业角色只负责自己的 capabilities。流程监督不是隐藏的第四个 Agent，而是由 Producer/配置职责决定。

适合：

- 中型项目；
- 需要完整专业分工；
- 需要独立 Reviewer 和 QA；
- 需要正式阶段交付。

完成度：`可试用配置 + 核心流程可运行`

已具备：

- 标准角色配置；
- 可修改模型；
- 阶段角色分配；
- Provider 配置；
- 完整 Studio 内核。

仍需增强：

- Producer 的控制循环；
- 多任务并行与阶段汇报；
- QA 报告自动转 Bug；
- 真实 Provider 运行编排。

## 3. 大型 Studio

配置：`examples/studio-large/agents.json`

角色层次：

```text
Control Agent = 跨领域监控、资源、Worker、Lease、Provider 容量
PM-Planning = 策划领域项目经理
PM-Technology = 技术领域项目经理
PM-Art = 艺术领域项目经理
专业 Agent = 各领域生产者
Reviewer = 独立审查
```

大型 Studio 中 Control Agent 才有明确价值，因为存在：

- 多个领域 PM；
- 跨领域依赖；
- 多 Worker；
- Provider 资源调度；
- Lease 和失败恢复；
- 全局优先级；
- 跨项目监控。

完成度：`架构配置阶段，尚未完成运行实现`

当前仅定义：

- 角色层次；
- capabilities；
- delegatesTo；
- Control Agent 的动作权限；
- 领域 PM 分工；
- 阶段归属。

后续需要实现：

- Control Agent 状态快照；
- 多 PM 汇报合并；
- 跨域任务调度；
- Worker/Provider 容量管理；
- 冲突升级；
- 多项目队列。

## 4. 角色委派规则

如果 Agent 发现配置了更专业的职责承担者：

```text
Manager 发现独立 Process Supervisor
→ 不再承担 process-monitoring
→ 向 Process Supervisor 请求状态/报告
→ 将报告作为输入 Artifact 或控制上下文
```

固定内核必须验证：

- 委派目标存在；
- 委派目标具有对应 capability；
- 输出 Artifact 属于当前 Version；
- 输出状态满足输入要求；
- 不允许 Agent 通过委派绕过审批；
- 不能把自然语言声称当成已完成事实。

## 5. 路线建议

```text
现在：三人 Studio 试用
→ 标准 Studio 真实/离线流程
→ QA/Bug/Fix 闭环
→ 多任务并行
→ 大型 Studio Control Agent
```

大型 Studio 的 Control Agent 暂不提前实现到小型/标准模式，避免过早增加双重控制者和复杂度。
