# 变更清单 (change-list.md)

**项目**: brotato-3d
**层级**: Engineering Layer (v_1)
**生成时间**: 2024-05-23
**文档状态**: 待评审
**作者**: Agnes-3.0-flash (Sapiens AI) / 策划组

---

## 0. 变更概述

本变更清单基于 `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1` 目录下的架构与规格文档生成。旨在明确从需求层 (`requirements/v_2`) 到工程层 (`engineering/v_1`) 的设计决策、新增模块、量化指标及验证标准。

**核心声明**: 本文档仅描述**设计意图与规格变更**。截至目前，**未编写、修改或执行任何代码**。所有条目均为可执行的工程任务或架构定义。

---

## 1. 架构决策记录 (ADR)

本章节记录工程层对需求层假设的技术实现选择，并标记其为**事实（源自输入）**或**假设（本层推导）**。

| ID | 决策项 | 类型 | 决策内容 | 依据/影响 |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-01** | 引擎选择 | **假设** | 采用 **Unity 2021 LTS+** | `architecture.en.md` 默认 Unity；若团队偏好 Godot/UE5，需调整底层 API 映射，但分层架构不变。 |
| **ADR-02** | 战斗系统模式 | **事实** | **实时制 (Real-time)** | `architecture.en.md` 定义了 Projectile/Melee 系统，`quantified-spec` 定义了帧率与碰撞检测，非回合制。*注：`architecture.zh.md` 中提及回合制为草稿假设，与 `architecture.en.md` 冲突，以 `architecture.en.md` 及 `quantified-spec` 的实时战斗数据为准，需评审确认。* |
| **ADR-03** | 数据驱动方式 | **假设** | 静态配置使用 **ScriptableObject**，动态存档使用 **JSON** | `architecture.en.md` A3；避免运行时加载延迟。 |
| **ADR-04** | UI 框架 | **假设** | 使用 **UGUI** + **TextMeshPro** | `architecture.en.md` A2；若性能不足，预留 UI Toolkit 迁移路径。 |
| **ADR-05** | 物理引擎 | **假设** | 使用 Unity **Rigidbody**，玩家采用 **Kinematic/CharacterController** | `architecture.en.md` A1 & Risk Mitigation；防止 3D 战斗抖动。 |

---

## 2. 核心模块变更

### 2.1 新增模块定义
根据 `architecture.en.md` 第 2.2 节，定义以下 8 个核心模块的职责与依赖关系：

*   **M01 Core.GameLoop**: 负责 Delta Time 管理、暂停状态。**验收**: 帧率稳定在 60FPS，暂停时逻辑冻结。
*   **M02 Core.FSM**: 全局状态机 (Idle -> Loading -> MainMenu -> Gameplay -> Pause/End)。**验收**: 状态切换无内存泄漏，日志记录完整。
*   **M03 Entities.Actor**: 玩家/敌人/拾取物基类。包含 Transform, Physics, Health。**验收**: 接口 `TakeDamage` 正确扣血并触发事件。
*   **M04 Systems.Combat**: 命中检测、伤害计算、冷却管理。**验收**: 伤害数值与 `quantified-spec` 公式一致（误差 < 1%）。
*   **M05 Systems.Projectiles**: 投射物生成、移动、寿命、碰撞。**验收**: 投射物速度 12.0 m/s ± 0.5，生命周期结束后自动回收。
*   **M06 Assets.Factory**: 基于 `asset-spec` 实例化预制体。**验收**: 资源 ID 可追溯，加载失败有 Fallback 机制。
*   **M07 UI.Controller**: MVC/MVP 绑定，处理菜单/暂停输入。**验收**: UI 响应延迟 < 20ms (Input to Action)。
*   **M08 Audio.Manager**: 音频池化，事件驱动播放。**验收**: 无爆音，多音效重叠不崩溃。

### 2.2 事件总线 (Event Bus)
*   **变更**: 引入轻量级 C# 事件系统 (`GameEvent.cs`)。
*   **目的**: 解耦 M04 (Combat) 与 M08 (Audio) / M07 (UI)。
*   **验收**: 移除 Audio 管理器后，战斗逻辑仍可运行（无硬依赖）。

---

## 3. 量化规格变更 (Quantified Specs)

本章节提取 `quantified-spec.en.md` 与 `quantified-spec.zh.md` 中的关键数值，作为工程实现的硬性约束。

### 3.1 战斗数值
| 参数 | 规格值 | 类型 | 验收证据 |
| :--- | :--- | :--- | :--- |
| **投射物冷却** | `0.8s` | 事实 | 日志分析：连续发射时间间隔 $\Delta t \ge 0.8s$。 |
| **投射物速度** | `12.0 m/s` | 假设 | 物理模拟测试：$v \approx 12.0 \pm 0.5$ m/s。 |
| **伤害衰减** | 0m-100%, 10m-0% (线性) | 假设 | Debug Overlay 验证：0m 处 1.0x 伤害，10m 处 0.0x 伤害。 |
| **敌人刷新率** | `2.5 enemies/sec` (Wave 1) | 事实 | 基准测试：60秒内生成 `150 ± 5` 个敌人。 |

### 3.2 性能预算
| 指标 | 目标值 | 测量方法 | 备注 |
| :--- | :--- | :--- | :--- |
| **帧率** | 60 FPS (Avg), 45 FPS (Min) | Profiler 60s 记录 | 最低配置 i5-4590/GTX 1050。 |
| **内存** | < 4 GB (Peak), < 500 MB (Mobile) | Memory Profiler | 防止 OOM 崩溃。 |
| **Draw Calls** | < 100 / Frame | GPU Profiler | 超过则需合并批次或优化 Shader。 |
| **GC Alloc** | 热路径 (Update) 为 0 | Profiler | 禁止在 `Update` 中 `new` 对象。 |
| **加载时间** | < 3.0s (Splash to Play) | 时间戳日志 | `T0` 点击, `T1` 可控。 |

### 3.3 资产约束
*   **模型面数**: 玩家 $\le 5,000$ Tris, 敌人 $\le 2,000$ Tris。
*   **贴图分辨率**: 环境 2048x2048, 角色 1024x1024, UI 1024x1024。
*   **验收**: CI 流水线自动扫描，超限资产阻断构建。

---

## 4. 任务拆解与优先级 (Task Breakdown)

基于 `task-breakdown.en.md`，将需求拆解为可执行的工程任务。

### 4.1 高优先级 (P0 - 核心循环)
| 任务 ID | 任务描述 | 依赖模块 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **T-P0-01** | 实现 3D 移动控制器 (WASD + 重力) | M03, M01 | 玩家 X/Y 平面移动，Z 轴受重力，最大速度 5 units/sec。 |
| **T-P0-02** | 实现 Roll 机制 | M03, M04 | 双击触发，时长 0.3s，无敌帧 0.3s，冷却 1.5s。 |
| **T-P0-03** | 实现基础敌人 AI (Chase/Attack) | M03 | 敌人向玩家移动并在射程内攻击，不穿过碰撞体。 |
| **T-P0-04** | 实现投射物生成与碰撞 | M05, M04 | 投射物生成、飞行、命中造成伤害，寿命结束回收。 |

### 4.2 中优先级 (P1 - 系统完善)
| 任务 ID | 任务描述 | 依赖模块 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **T-P1-01** | 实现 UI/HUD 系统 | M07 | 显示 HP, Wave, Currency。响应延迟 < 20ms。 |
| **T-P1-02** | 实现音频管理 | M08 | 命中音效、背景音乐无缝切换，无爆音。 |
| **T-P1-03** | 实现配置表导入工具 | M06 | JSON/SO 加载失败时报错并提示字段缺失。 |
| **T-P1-04** | 实现存档系统 | Data | 保存/加载 MetaStats，文件损坏时回退至上一安全点。 |

### 4.3 低优先级 (P2 - 优化与表现)
| 任务 ID | 任务描述 | 依赖模块 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **T-P2-01** | 敌人 LOD 系统 | M03 | 15m/30m 距离切换 LOD，降低 GPU 负载。 |
| **T-P2-02** | 特效 (VFX) 集成 | M06 | 技能/命中特效播放，不重叠消失。 |
| **T-P2-03** | 性能 Profiler 工具集成 | M01 | 运行时可导出 JSON 性能报告。 |

---

## 5. 测试与验收策略

基于 `test-plan` 输入（虽未完全读取，但依据 `quantified-spec` 与 `architecture` 推导），定义以下测试门槛：

### 5.1 自动化测试 (CI Gates)
1.  **单元测试**: 伤害公式、冷却计算、随机种子验证。覆盖率 $\ge 80\%$。
2.  **资产验证**: `AssetChecker.exe` 扫描所有 `.prefab` 和 `.asset`，**0 错误**通过。
3.  **性能冒烟**: 运行 `PerfBake.unity` 场景，导出 JSON。断言 `avg_fps >= 58` 且 `max_mem < 4000MB`。

### 5.2 手动 QA 检查清单
*   **视觉回归**: UI 截图对比基准 `ui_baseline.png`，SSIM Index $\ge 0.95$。
*   **音频响度**: SFX 平均输出电平 `-14 LUFS` ± 1 LU。
*   **Bug 等级**: **0 P0** (崩溃/数据丢失), **0 P1** (核心玩法阻断)。P2 需有 Workaround。

### 5.3 关键场景验证
*   **场景 1 (战斗)**: 生成 100 个敌人，运行 60s。CPU 占用 < 5% (中端设备)，无卡顿。
*   **场景 2 (存档)**: 中途退出，重进。回合状态、金币、等级一致。
*   **场景 3 (死亡)**: 玩家死亡后 1.5s 内弹出结算界面，无卡顿。

---

## 6. 风险与缓解措施

| 风险 ID | 风险描述 | 概率 | 影响 | 缓解措施 (Mitigation) |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | 大量敌人导致物理引擎抖动 | 高 | 高 | 使用 Kinematic 移动玩家；敌人禁用互撞；AI 寻路频率降至每回合 1 次或每 0.1s 一次。 |
| **R-02** | UI 复杂度超出 UGUI 性能 | 中 | 中 | 预研 TextMeshPro；若仍不足，评估 UI Toolkit 迁移成本。 |
| **R-03** | 资产命名不规范导致加载失败 | 中 | 中 | 开发 Editor Script Linter，强制 `asset-spec` 命名规范。 |
| **R-04** | 实时战斗与回合制架构冲突 | **高** | **高** | **立即评审确认**。当前文档以实时制 (`architecture.en.md`) 为准，若确认为回合制，需重构 M04 与 M05 模块。 |

---

## 7. 下一步行动 (Action Items)

1.  **[策划/评审组]** **紧急**: 确认战斗模式是**实时**还是**回合制**（解决 R-04）。
2.  **[程序]** 搭建 Unity 工程骨架，实现 M01 (GameLoop) 和 M02 (FSM) 原型。
3.  **[程序]** 实现 Event Bus 和 Grid System（若确认为回合制）或 Pathfinding（若为实时）。
4.  **[美术]** 产出 1 个主角模型和 1 个敌人模型，验证 5,000 Tris 上限和 PBR 材质。
5.  **[测试]** 编写伤害计算和冷却逻辑的纯 C# 单元测试（无 Unity 依赖）。

---

## 8. 附录：事实与假设对照表

| 条目 | 分类 | 来源 | 说明 |
| :--- | :--- | :--- | :--- |
| 投射物速度 12.0 m/s | **假设** | `quantified-spec.en.md` | 基于基准值推导，需平衡性测试调整。 |
| 敌人刷新 2.5/s | **事实** | `requirements` | 明确指定的数值。 |
| 模型面数 < 5000 | **事实** | `asset-spec` | 硬性限制。 |
| Unity 引擎 | **假设** | 行业默认 | 需在评审中最终确认。 |
| 本地单机 | **假设** | `requirements` 未提联机 | v_2 阶段无网络模块。 |

*文档结束。所有变更需经策划组、工程组、美术组签署后方可进入开发实施阶段。*
