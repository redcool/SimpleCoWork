## bug-list.md

**文档类型**: QA 缺陷与风险报告 (Bug & Risk List)
**项目**: Brotato-3D
**输入版本**: Development Layer v_1 (`H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\development\v_1`)
**上游依赖**: Engineering Layer v_1, Requirements Layer v_2
**状态**: **草案 (Draft) - 待工程实现**
**日期**: 2024-05-23 (基于工程层日期) / 2026-10-15 (基于开发层生成时间)

---

### 1. 评审结论与严重性分级说明

本文档基于对工程层（Engineering L3）交付的架构、量化规格、任务拆解及风险登记册的交叉比对与逻辑推导生成。
**核心结论**：
1.  **无代码级 Bug**：鉴于当前阶段仅为设计/规划阶段，未生成或修改任何源代码，因此不存在传统意义上的“代码缺陷”（如空指针、语法错误）。
2.  **存在设计级缺陷（Design Defects）**：在工程层文档内部及工程层与需求层之间发现了**逻辑冲突**、**规格歧义**及**高风险假设**，若进入实施阶段未加修正，将直接导致功能阻断或性能超标。
3.  **严重性定义**：
    *   **Critical (P0)**: 导致核心玩法阻断、数据丢失或架构崩溃的设计错误。
    *   **High (P1)**: 导致主要功能缺失、性能严重超标或无法通过验收标准的逻辑漏洞。
    *   **Medium (P2)**: 影响开发效率、增加维护成本或存在非关键路径异常的假设风险。
    *   **Low (P3)**: 文档一致性、命名规范或轻微的体验优化建议。

---

### 2. 设计缺陷列表 (Design Bug List)

#### 2.1 核心架构与逻辑冲突 (Critical/High)

| Bug ID | 模块/区域 | 严重性 | 问题描述 | 证据来源 | 建议修复/验收标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-D-001** | 战斗系统 (Combat) | **Critical** | **战斗模式定义冲突（回合制 vs 实时制）**。<br>`architecture.zh.md` 与 `quantified-spec.zh.md` 暗示“回合制 (Turn-Based)”或网格系统，而 `architecture.en.md` 与 `quantified-spec.en.md` 明确定义为“实时自动射击 (Real-time Auto-Shooter)”及“波次制 (Wave-Based)”。<br>若工程团队基于中文文档实施回合制逻辑，将与英文核心规格（如 0.8s 射击冷却、12m/s 投射物速度）彻底冲突，导致核心玩法重写。 | `change-list.zh.md` R-04<br>`implementation-plan.en.md` Section 1<br>`risk-register.en.md` | 1. **立即冻结**架构中的“回合制”描述。<br>2. 确认 `v_1` 采用**实时波次制**。<br>3. 验收：移除所有 Grid/Turn-Based 相关数据结构定义，统一使用 Time-Delta 驱动逻辑。 |
| **BUG-D-002** | 玩家控制 (Movement) | **High** | **网格系统 (Grid) 遗留风险**。<br>`architecture.zh.md` 提及 12x12 网格，但 `implementation-plan.en.md` 决定采用自由移动 (Free-Move)。若基础框架 (M03) 已按网格碰撞实现，后续改为自由移动需重构碰撞检测逻辑，增加 GC 开销。 | `implementation-plan.en.md` Section 1.2<br>`change-list.zh.md` T-P0-01 | 1. 确认 v_1 仅使用 Unity `CharacterController` (Kinematic)。<br>2. 验收：代码审计确认无 `GridIndex` 或 `TileMap` 引用作为移动逻辑依赖。 |
| **BUG-D-003** | 状态管理 (FSM) | **High** | **暂停状态下的时间缩放歧义**。<br>文档未明确定义暂停时 `Time.timeScale` 与逻辑更新 (`Update` vs `LateUpdate`) 的关系。若直接归零 `TimeScale` 而未跳过逻辑更新，可能导致物理穿透或 AI 逻辑异常。 | `implementation-plan.zh.md` T-101<br>`change-list.en.md` T-003 | 1. 定义 `Pause` 状态下的更新策略：停止逻辑 Tick，保留渲染 Tick。<br>2. 验收：暂停时 Profiler 显示 `Update` 方法被跳过或 Delta Time 为 0，但 UI 仍可交互。 |

#### 2.2 性能与资源规格漏洞 (High/Medium)

| Bug ID | 模块/区域 | 严重性 | 问题描述 | 证据来源 | 建议修复/验收标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-D-004** | 性能 (Performance) | **High** | **Draw Call 预算过于激进**。<br>设定 < 100 Draw Calls/Frame，但在 1080p URP 下，若敌人数量达到 150-500 (见压力测试指标)，即使使用 Instancing，每帧 100 次 Draw Call 可能不足（每个敌人 1-2 DC，UI 若干 DC）。若无 Batch 优化策略，极易超标。 | `quantified-spec.en.md` 4.1<br>`implementation-plan.zh.md` T-402 | 1. 引入 SRP Batcher 或 GPU Instancing 明确规范。<br>2. 验收：在 500 敌人场景下，GPU Profiler 确认 Draw Calls 稳定在预算内，否则调整预算或优化 Shader。 |
| **BUG-D-005** | 内存 (Memory) | **Medium** | **GC Alloc 零容忍缺乏缓冲机制**。<br>要求 Update 循环 0 GC Alloc，但未定义当内存泄漏发生时（如意外 new 对象）的回退策略或报警阈值。长期运行可能导致 OOM 无预警。 | `change-list.en.md` T-005<br>`risk-register.en.md` R-02 | 1. 增加内存监控阈值（如每帧 > 512KB 报警）。<br>2. 验收：集成 Profiler 钩子，超阈值时输出 Debug Log。 |
| **BUG-D-006** | 资产管线 (Asset Pipeline) | **Medium** | **资产命名强制 Linter 缺失**。<br>风险登记册提及命名不规范导致加载失败，但任务列表中未包含“资产 Linter”的具体实现任务 (T-P2-03 仅为性能工具)。若无 Linter，`AssetFactory` 在加载错误 ID 时将静默失败或崩溃。 | `risk-register.en.md` R-03<br>`implementation-plan.zh.md` T-404 | 1. 将 `AssetLinter` 提升为 P1 优先级任务。<br>2. 验收：Git Pre-commit Hook 能拦截不符合 `Type_Prefix_Name` 规范的资产提交。 |

#### 2.3 数值与玩法平衡歧义 (Medium/Low)

| Bug ID | 模块/区域 | 严重性 | 问题描述 | 证据来源 | 建议修复/验收标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-D-007** | 伤害系统 (Damage) | **Medium** | **伤害衰减曲线在边界处的数学矛盾**。<br>定义 0m=100%, 10m=0% 线性衰减。但在碰撞检测距离 (< 1m) 内，若距离 < 0.5m，按公式计算 95%+ 伤害。若敌人贴身攻击，玩家可能因“近身无敌”效果（衰减为0的逆向？）或逻辑错误产生伤害溢出。 | `quantified-spec.en.md` 4.2<br>`change-list.en.md` A-06 | 1. 明确最小伤害倍率下限（如 10%）或定义近距离加成。<br>2. 验收：单元测试验证 0.5m 处的伤害值为预期值，无 NaN 或 Infinity。 |
| **BUG-D-008** | 经济系统 (Economy) | **Low** | **面包掉落率统计偏差**。<br>“1 Bread / 2 Kills”为平均值。未定义最小/最大掉落率或随机种子策略。若使用简单 50% 概率，长尾分布可能导致玩家后期资源匮乏。 | `quantified-spec.en.md` 4.2 | 1. 定义加权随机或保底机制（如每 10 杀必掉 1 面包）。<br>2. 验收：跑 1000 次模拟，掉落率波动在 ±5% 以内。 |
| **BUG-D-009** | UI 响应 (Latency) | **Low** | **UI 更新频率与视觉延迟权衡**。<br>Wave Timer 更新 10Hz，Health Bar 满血后 2s 变淡。若 Frame Drop 导致 Timer Tick 丢失，UI 状态可能滞后于实际游戏状态。 | `change-list.en.md` T-007 | 1. 确保 UI 更新基于固定时间戳而非 Tick 计数。<br>2. 验收：在模拟 30 FPS 环境下，UI 状态仍准确反映游戏时间。 |

#### 2.4 文档一致性与元数据错误 (Low)

| Bug ID | 模块/区域 | 严重性 | 问题描述 | 证据来源 | 建议修复/验收标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-D-010** | 元数据 (Metadata) | **Low** | **日期与版本号不一致**。<br>`implementation-plan.en.md` 日期为 2023-10-27，`implementation-plan.zh.md` 为 2026-10-15，而 `layer-manifest.json` 创建于 2026-10-15。英文计划日期明显错误（过去时），可能导致版本管理混乱。 | 各文件 Header<br>`layer-manifest.json` | 1. 统一所有文档日期为 `2024-05-23` 或当前真实日期。<br>2. 验收：所有 MD 文件 Header 日期一致。 |
| **BUG-D-011** | 引擎版本 (Assumption) | **Low** | **Unity LTS 版本假设模糊**。<br>A-01 假设 Unity 2022，但 Risk Register 未提及 2021/2022 API 差异（如 C# 版本、URP 特性）。若团队使用 2021，部分新特性不可用。 | `change-list.en.md` A-01<br>`risk-register.en.md` | 1. 明确最低支持版本 (Min Version)。<br>2. 验收：项目文件 `.csproj` 锁定 C# 9.0+ 兼容性。 |

---

### 3. 假设风险登记 (Assumption Risks)

以下项目并非缺陷，但属于**高不确定性假设**，需在实施前通过 Spike (技术预研) 验证。若验证失败，需触发变更请求。

| Risk ID | 假设内容 | 潜在后果 | 验证策略 (Spike) | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **ASM-001** | **Kinematic 移动无抖动** | 玩家在地形边缘滑移或穿模 | 制作简单原型，测试斜坡与台阶处的 `CharacterController` 表现。 | 待验证 |
| **ASM-002** | **500 敌人 60 FPS** | 中端设备 CPU 溢出，帧率跌至 30 FPS 以下 | 使用占位球体 (Unlit) 生成 500 个移动实体，运行 5 分钟 Profiler。 | 待验证 |
| **ASM-003** | **JSON 存档无崩溃** | 大文件加载阻塞主线程 > 5s，导致卡顿 | 模拟 100MB JSON 存档，测试异步加载性能。 | 待验证 |
| **ASM-004** | **UGUI 性能充足** | 复杂 UI 面板导致 Draw Call 激增 | 创建包含 100+ 动态文本的 UI 场景，测量 CPU 耗时。 | 待验证 |

---

### 4. 下一步行动建议 (Action Items for Engineering)

1.  **立即执行 (Blocker)**:
    *   召开架构评审会，正式签署 **BUG-D-001** 的解决方案：**确认采用实时波次制，废弃回合制/网格概念**。
    *   更新 `architecture.zh.md` 和 `quantified-spec.zh.md`，消除所有 "Turn-Based" 相关描述。

2.  **本周内 (High Priority)**:
    *   在 `task-breakdown` 中插入 **T-105: Asset Linter 开发** (对应 BUG-D-006)。
    *   调整性能预算，为 500 敌人场景预留 GPU Instancing 优化任务 (对应 BUG-D-004)。

3.  **实施阶段 (Verification)**:
    *   完成 **ASM-002** 压力测试原型。若 500 敌人无法维持 45 FPS (Min Spec)，需将敌人上限降至 200 或引入更激进的 LOD/休眠机制。

4.  **文档修正 (Low Priority)**:
    *   统一所有文档日期与版本号 (BUG-D-010)。
    *   细化伤害衰减公式的边界条件 (BUG-D-007)。

---

### 5. 附录：事实与假设对照 (Facts vs Assumptions in QA View)

*   **事实 (Facts)**:
    *   投射物速度 12.0 m/s 是硬编码规格。
    *   玩家移动速度 5.0 units/sec 是硬编码规格。
    *   Unity 2022 LTS 是当前假设的工程环境。
*   **假设 (Assumptions)**:
    *   “本地单机”模式不引入网络同步代码。
    *   “Kinematic”移动在复杂 3D 地形上不会导致碰撞异常。
    *   “JSON”存档格式在 PC 端加载速度可接受。

*(文档结束。请工程组对 Critical/High 级别缺陷进行逐项确认并更新 `change-list.zh.md`。)*
