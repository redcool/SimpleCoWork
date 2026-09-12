# CoWork 分析报告

审核对象：H:\ai_works\CoWorkPrj
记录日期：2026-09-11

## 一、工程工作原理概述

CoWork 是一个以任务 DAG、版本化产物和质量门为核心的多 Agent 编排系统。总体流程如下：

```
项目配置 → 创建任务 DAG → 调度 ready 任务 → Agent 调用 Provider
→ 解析模型 JSON → 执行 write/exec 动作 → 生成 Artifact
→ Oracle 自动质量门 → Reviewer 审核 → approved / 重试 / 会议 / 人工审批
→ 下游 Agent 消费已批准产物 → Manager 生成报告
```

核心对象包括：

- Agent：角色、模型、Provider、提示词的配置。
- Provider：负责调用 mock 或 OpenAI 兼容模型。
- Task：任务、依赖、输入产物、输出产物和验收标准。
- Artifact：带版本、生产者、文件、校验和的交付物。
- Review：Oracle 自动检查和 Reviewer Agent 审核结果。
- Meeting：失败后的自动决策、夜班讨论或人工审批。

Agent 之间不是直接共享聊天上下文，而是通过 `inputs` 读取上游已批准 Artifact。引擎会把任务信息、验收标准、历史失败原因、会议决策和输入产物组装成 Prompt，再调用对应 Provider。

## 二、Agent 到底是预制代码，还是 LLM 推理？

结论：**当前工程是混合模式，不是完全 LLM 驱动。**

可以分为三层：

### 1. 工作流控制层：预制代码

以下行为由固定 JavaScript 引擎决定，而不是由 LLM 自由推理：

- DAG 依赖和并发调度：`src/engine.js`
- 任务状态迁移：`src/domain/tasks.js`
- Artifact 版本化：`src/domain/artifacts.js`
- Prompt 拼装：`src/runner.js`
- 模型 JSON 解析：`src/runner.js`
- write/exec 动作执行：`src/runner.js`、`src/exec.js`
- Oracle 规则校验：`src/oracle.js`
- 审核失败后的重试、会议和恢复：`src/engine.js`
- 报告渲染、状态持久化和 Web API：各对应基础设施模块

这些固定代码是编排框架，不是具体业务实现。它们保证任务顺序、证据链和质量门的一致性，但也意味着流程形状受引擎设计约束。

### 2. Agent 业务产出层：取决于 Provider

真正决定 Agent 产出什么的是 Provider：

- `src/providers/mock.js`：执行配置中的预制 JavaScript 函数。
- `src/providers/openai.js`：调用真实 OpenAI 兼容 API，由 LLM 根据 Prompt 生成结果。

Provider 注册表位于 `src/providers/index.js`，通过配置中的 `kind: 'mock'` 或 `kind: 'openai'` 选择实现。

### 3. 示例工程：大量使用预制脚本

`examples/demo/cowork.config.js` 和 `examples/game-studio-demo/cowork.config.js` 明确使用：

```js
providers: {
  mock: {
    kind: 'mock',
    script: {
      architect: async (...) => ({ ... }),
      developer: async (...) => ({ ... }),
      reviewer: async (...) => ({ ... })
    }
  }
}
```

这些示例中的架构、代码、美术、叙事、音频和审核结果主要是预先写好的脚本。它们可以稳定演示流程，但不代表 Agent 具备真实的开放式推理能力。

## 三、真实 Agnes 模式的实际情况

`examples/agnes-demo/cowork.config.js` 使用：

```js
agnes: {
  kind: 'openai',
  baseURL: 'https://apihub.agnes-ai.com/v1',
  defaultModel: 'agnes-2.5-flash'
}
```

因此，配置为 `provider: 'agnes'` 的 Agent 会真正调用 LLM。架构、开发、审核和协调的文本/代码结果由模型生成，而不是由 mock 函数直接返回。

但是，这个模式仍然不是“完全不受预制逻辑影响”的 LLM 系统，原因包括：

1. Prompt 强制规定输出 JSON 结构和动作类型。
2. Planner 的计划格式由固定模板规定。
3. Oracle 规则是固定程序执行的，不由 LLM 自主决定最终是否通过。
4. Task DAG、重试次数、会议触发条件由引擎配置决定。
5. Reviewer 的最终流程由引擎控制，模型不能绕过质量门。
6. Agent 只能通过引擎提供的输入产物工作，不能自由访问整个项目上下文。
7. 文件写入和命令执行动作由预制运行器执行。

所以更准确的描述是：

> **业务内容由 LLM 推理生成，执行边界、协作协议、状态机和质量门由预制代码控制。**

## 四、当前模式的比例判断

| 场景 | 当前实现 | LLM 参与程度 |
|---|---|---:|
| demo 离线运行 | mock 脚本直接返回结果 | 很低 |
| game-studio-demo | mock 脚本直接返回制作结果 | 很低 |
| agnes-demo 业务产出 | Agnes LLM 生成 | 高 |
| 任务调度 | 固定引擎 | 无 |
| JSON 解析与动作执行 | 固定引擎 | 无 |
| Oracle 质量门 | 固定规则程序 | 无/很低 |
| Reviewer 结论 | 可调用 LLM，但受 Oracle 和引擎流程约束 | 中到高 |
| Planner | 可调用 LLM，但输出格式和规范化固定 | 中到高 |
| 会议 | 可调用 LLM，但会议触发和状态迁移固定 | 中到高 |

## 五、与“完全走 LLM 推理”的差距

如果你的期望是“所有 Agent 行为都由 LLM 根据上下文自主决定”，当前工程还没有达到。

目前存在的预制限制主要是：

- 每个任务必须符合固定 Task/Artifact 协议。
- Agent 输出必须是指定 JSON。
- 文件操作只有 `write` 和 `exec` 两类。
- 质量门只支持内置规则类型。
- Reviewer 的判定依赖引擎传入的 checks。
- 会议只在特定失败条件下触发。
- 示例中的角色行为大量硬编码在配置文件里。
- Planner 只能输出预设结构的模块 DAG。

这些限制对可靠性和可审计性有帮助，但对开放式创作、复杂工程决策和跨领域任务有明显上限。

## 六、建议的目标架构：LLM 驱动、代码负责安全边界

不建议把所有控制逻辑都删除并让 LLM 直接执行任意操作。更合理的目标是：

```
LLM 负责：理解需求、规划、方案、实现、审查、会议推理、修复策略
框架负责：权限、安全校验、持久化、资源限制、证据记录、最终状态提交
```

建议改造成以下模式：

### 1. 删除示例中的业务 mock 作为默认路径

保留 mock 仅用于单元测试，不再作为真实示例的默认 Agent Provider。示例项目默认使用 Agnes/OpenAI Provider，并将 mock 示例独立放到测试目录。

### 2. 降低硬编码角色语义

当前引擎对 architect、developer、reviewer、manager 等角色有特殊语义。可以保留少量系统级安全角色，但具体工作方式应更多由 Agent Prompt 和 LLM 决定。

例如不要在引擎中直接假设某个角色必须输出某种固定内容，而是让 Agent 返回能力声明和下一步计划，再由协议校验结构完整性。

### 3. 从固定动作协议扩展为能力调用协议

当前只有：

- write
- exec

可以扩展为经过权限检查的工具调用：

- read_file
- list_files
- search_code
- write_file
- patch_file
- run_test
- inspect_artifact
- ask_agent
- propose_task
- request_review

LLM 决定调用哪个工具，但框架必须对工具进行权限、路径、资源和审计控制。

### 4. 让 Planner 真正由 LLM 规划

Planner 应该根据主题、项目现状和约束自行决定：

- 是否需要架构任务；
- 需要多少模块；
- 哪些任务可并行；
- 哪些任务需要复核；
- 如何拆分验收标准；
- 是否需要创建新的 Agent 角色。

框架只负责验证计划是否合法、是否有环、是否越权。

### 5. 让 Reviewer 具备真实审查能力

当前示例 Reviewer 主要依据固定 checks。建议让 Reviewer 同时：

- 阅读实际文件；
- 运行允许的测试工具；
- 分析架构和实现差异；
- 生成新的审查问题；
- 提出修复方案；
- 解释证据链。

Oracle 仍然保留，作为不可绕过的客观底线，而不是唯一审查来源。

### 6. 让会议由 LLM 判断是否需要召开

当前会议主要由失败次数和配置触发。可以改为：

- 引擎检测基础失败；
- LLM 判断问题类型、影响范围和是否需要跨角色讨论；
- LLM 选择参会 Agent；
- LLM 组织方案比较和决策；
- 引擎验证最终决策的权限和可执行性。

### 7. 允许动态任务和角色，但必须经过验证

LLM 可以提出新的任务、角色和工具调用，但不能直接修改系统权限。新增内容需要经过：

- 配置/协议校验；
- 路径和命令安全校验；
- 资源配额校验；
- 人工审批或策略审批。

## 七、重要安全前提

“完全 LLM 推理”不能等同于“LLM 可以直接执行任意代码”。当前审核已发现：

- `runner` 路径越界写入风险；
- `shell:true` 任意命令执行风险；
- Web 审批接口缺少认证；
- `--plan` 和夜班接口存在路径安全问题；
- 状态持久化缺少原子写入和并发保护。

如果扩大 LLM 自主权而不先修复这些问题，风险会显著增加。正确方向应该是：

> **让 LLM 自主决定“做什么、为什么做、如何做”，但不让 LLM 绕过安全沙箱直接决定“可以访问哪些路径、可以执行哪些系统能力”。**

## 八、最终结论

当前 CoWork 不是纯模板系统，也不是完全 LLM 系统：

- 使用 mock Provider 时，Agent 的具体行为基本是预制脚本；
- 使用 Agnes/OpenAI Provider 时，业务内容由真实 LLM 推理生成；
- 工作流、状态机、质量门、文件动作、权限边界仍由预制代码控制；
- 当前 examples 中，尤其是 demo 和 game-studio-demo，预制逻辑占比很高。

若目标是“完全走 LLM 推理”，建议下一阶段重点改造：

1. 默认示例切换到真实 LLM Provider；
2. mock 仅保留在测试中；
3. 减少业务角色行为硬编码；
4. 让 Planner、Reviewer、Meeting 更开放地由 LLM 决策；
5. 保留代码层的安全、权限、持久化和证据边界；
6. 先修复路径穿越、任意命令执行和 Web 审批安全问题。

审核结论：**当前框架适合“代码控制流程 + LLM 生成业务内容”的混合模式；若不进行上述改造，不应宣称为完全 LLM 驱动。**
