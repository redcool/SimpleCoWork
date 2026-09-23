# Studio CoWork v2

目标驱动、可持久化、自循环的虚拟工作室运行时。当前仓库工作分支为 Studio CoWork；CoWork v1 仅作为冻结兼容基线。

> Studio CoWork v2 开发需求：[`studio cowork.md`](studio%20cowork.md)
> Godot Potato Crisis 原型：[`studio-acceptance-potato-2026-09-20-run2/godot/README.md`](studio-acceptance-potato-2026-09-20-run2/godot/README.md)
> 冻结 CoWork v1 基线：`cowork-v1.0.1.0` / `95b1035`

## 核心工作流

```text
Goal → WorkflowRun → Observe → Acceptance → Planner
→ ActionExecutor → Task/Artifact/Review/QA
→ Checkpoint → 下一轮 / completed / blocked / waiting_for_user
```

## Studio Runtime 能力

- Goal、WorkflowRun、Checkpoint 持久化；
- Acceptance：file_exists、command_passes、test_passes、no_open_bugs、artifact_state；
- ActionExecutor 幂等执行；
- Provider Planner retry/backoff 与 token budget；
- Confirmation waiting/resume 自动唤醒；
- Task lease、heartbeat、恢复和 Reviewer needs_revision 重试；
- 五阶段 WorkflowDriver：planning → design → asset-spec → production → playable；
- Bug fix Task → regression Artifact → Bug closed；
- CLI：goal-create、run-start、run、run-status、run-pause、run-resume、run-cancel。

## 运行测试

```powershell
node --test test/*.test.js
```

## Godot Potato Crisis 原型

工程位于：

```text
studio-acceptance-potato-2026-09-20-run2/godot
```

当前玩法包括：

- WASD / 方向键移动；
- Space 近战攻击；
- 近战与远程敌人追踪和攻击；
- HP、护甲、无敌窗口、Game Over 与 Space 重启；
- 击杀得分、XP 拾取、升级；
- 1/2/3 选择伤害、移动速度、护甲升级；
- 波次清空后生成更大波次；
- SimpleMcpServer Godot Bridge 可观察运行时场景和实体。

运行 Godot 4.7：

```powershell
$godot="H:\Program Files\Godot_v4.7-stable_mono_win64\Godot_v4.7-stable_mono_win64.exe"
& $godot --path "H:\ai_works\CoWorkPrj\studio-acceptance-potato-2026-09-20-run2\godot"
```

## SimpleMcpServer Bridge

Server 路径：`H:\ai_works\SimpleMcpServer`。默认端口：`45678`。

```powershell
cd H:\ai_works\SimpleMcpServer
npm start
```

Godot 工程中的 Bridge 位于：

```text
studio-acceptance-potato-2026-09-20-run2/godot/addons/simple_mcp_bridge
```

成功连接后健康检查应包含：

```text
bridgeConnected: true
totalTools: 29
```

## 目录约定

- 临时脚本、日志、诊断和中间产物统一放 `tmp/`；
- 不把 API key 写入代码、文档、日志或提交；
- 不修改冻结 CoWork v1；
- 版本提交必须包含版本号，例如 `v(0.0.1.35) update : playable potato crisis prototype`。

## 当前验证

Godot 4.7 headless 验证已通过，退出码为 0；SimpleMcpServer/Godot Bridge 已实测注册 29 个工具并可查询场景树与敌人状态。

当前仍在完善中的内容和每轮记录位于 `tmp/playable-prototype-round*.md`。
