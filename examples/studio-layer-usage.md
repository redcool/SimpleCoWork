# Studio CoWork 独立层使用说明

Studio CoWork 不要求每次都从完整项目流程开始。每一层都可以独立启动，用户可以在任意阶段暂停、交接或继续。

## 1. 需求产出层

输入可以是一句话想法、粗略需求或一份文本：

```powershell
node bin/studio.js layer requirements "想做一个三分钟内完成一局的合作解谜游戏" ./out/requirements
```

产出：

```text
requirements.md
feature-list.md
asset-spec.md
acceptance.md
layer-manifest.json
```

如果用户暂时不想工程化，可以停在这里。输出目录就是阶段交付物。

## 2. 文档量化/工程化层

把确认后的需求目录交给工程化层：

```powershell
node bin/studio.js layer engineering ./out/requirements ./out/engineering
```

产出：

```text
quantified-spec.md
architecture.md
task-breakdown.md
test-plan.md
layer-manifest.json
```

这一层把需求变成可度量目标、技术边界、数据和接口、任务拆分、测试证据和依赖关系。文档确认完毕后，再进入完整 Version/Stage/Task 工程流程。

## 3. 接入人类已有代码

已有代码可以直接交给开发层：

```powershell
node bin/studio.js layer development C:/work/my-project ./out/development
```

开发层产出：

```text
implementation-plan.md
change-list.md
risk-register.md
layer-manifest.json
```

默认离线模式只生成安全的分析文档，不会直接修改人类代码。

## 4. 独立 QA 层

```powershell
node bin/studio.js layer qa C:/work/my-project ./out/qa
```

产出：

```text
qa-report.md
bug-list.md
performance-security.md
layer-manifest.json
```

QA 层可以独立用于查 Bug、分析回归风险、性能、安全和功能完成度，并生成修复建议。

## 5. 安全边界

独立层默认只读输入并写入输出目录。输入代码不会被直接改写；每次运行生成 `layer-manifest.json`。后续进入开发执行阶段时，必须经过用户确认，并使用版本化 Workspace、Artifact 和审批流程。

## 6. 典型路线

```text
一句话想法 → requirements → 用户确认或暂停
一句话想法 → requirements → engineering → Version/Stage/Task
已有代码 → development → 用户选择变更 → 工程 Task → Reviewer → Release
已有代码 → qa → Bug/性能/安全报告 → 用户决定是否创建修复 Task
```

## 7. Provider 模式

离线模式是默认模式：不发送网络请求，只生成结构化 handoff 文档。

如果要调用真实 Provider，先设置：

```powershell
$env:STUDIO_CONFIG = "examples/studio-small/agents.json"
$env:AGNES_API_KEY = "你的 Key"
$env:AGNES_BASE_URL = "你的 OpenAI-compatible 地址"
```

然后使用相同命令：

```powershell
node bin/studio.js layer requirements "一句话想法" ./out/requirements
```

CLI 会根据层名称选择对应 Agent：

```text
requirements → role requirements（没有专用时使用配置默认）
engineering → role engineering
development → developer
qa → qa
```

当前默认仍建议先离线验证。真实 Provider 输出会写入独立输出目录，不会直接修改输入代码。

## 8. 参数格式

统一格式：

```text
studio layer <layer> <input> <output>
```

`requirements` 的 input 可以是不存在的路径，此时按一句话想法处理；其他层的 input 必须是存在的文件或目录。
