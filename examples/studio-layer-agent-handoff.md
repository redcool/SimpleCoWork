# 给其他 Agent 的 Studio CoWork 试用包

请先阅读：

```text
examples/studio-layer-usage.md
examples/studio-small/README.md
```

## 最小验证

```powershell
cd H:\ai_works\CoWorkPrj
node --test test/studio-layers.test.js
node bin/studio.js layer requirements "做一个带资源清单的解谜游戏" ./out/requirements
```

## 四种入口

```powershell
node bin/studio.js layer requirements <idea> <output>
node bin/studio.js layer engineering <requirements-dir> <output>
node bin/studio.js layer development <existing-code-dir> <output>
node bin/studio.js layer qa <existing-code-dir> <output>
```

## Provider 模式

默认是 offline fallback。真实配置：

```powershell
$env:STUDIO_CONFIG="examples/studio-small/agents.json"
$env:AGNES_API_KEY="..."
$env:AGNES_BASE_URL="..."
node bin/studio.js layer requirements "一句话想法" ./out/requirements
```

如果不设置 `STUDIO_CONFIG`，不会访问网络。

## 交付规则

独立层输出是文档交付，不是自动改代码。其他 Agent 应先检查：

- `layer-manifest.json`；
- 文档中的事实、假设和待确认项；
- acceptance 和 evidence；
- 是否需要进入 Version/Task 流程。

## 当前限制

- Agnes 网关必须兼容 OpenAI Chat Completions；
- 真实 Provider 的角色映射仍可按配置扩展；
- development/qa 当前是只读分析层；
- 代码写入必须经过用户确认和正式 Task。
