# Brotato 3D 工程实施计划 (Implementation Plan)

**文档版本**: v1.0
**日期**: 2026-10-15
**状态**: 待评审 (Pending Review)
**输入来源**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1`
**撰写人**: 策划组组长 (Agnes-3.0-flash)

## 1. 执行摘要与范围

本计划基于工程层输出的架构、量化规格、任务拆解及测试计划，制定 `brotato-3d` v_2 版本的详细实施路线图。

### 1.1 核心目标
将 `architecture.md` 定义的模块（M01-M08）转化为可执行的工程任务，并严格遵循 `quantified-spec.md` 中定义的数值约束（如 60 FPS、内存 < 4GB、特定数值参数）进行开发与验收。

### 1.2 关键事实与假设
*   **事实 (Fact)**:
    *   引擎技术栈确认为 **Unity (C#)**，基于 `architecture.en.md` 模块定义及 `layer-manifest.json` 上下文。
    *   战斗模式为 **回合制/波次制 (Wave-based)**，基于 `task-breakdown` 中的 PC-2。
    *   性能基线：目标 60 FPS，内存峰值 < 4GB (PC端)。
*   **假设 (Assumption)**:
    *   **A-Env**: 开发环境为 Windows 10/11，编辑器版本为 Unity 2022 LTS (URP)。若团队使用 2021 LTS，部分渲染管线 API 需适配，但架构逻辑不变。
    *   **A-Net**: v_2 版本仅支持本地单机 (Local-Only)，无网络同步需求。
    *   **A-Grid**: 地面网格尺寸假设为 15x15，需在里程碑 M1 中与美术确认最终布局。

### 1.3 依赖关系
*   **上游**: `requirements/v_2` 需求文档。
*   **下游**: 代码仓库 (`Assets/_Project`)、CI/CD 流水线。
*   **阻塞项**: 资产规范 (`asset-spec`) 中的命名约定必须在前端代码实现前固化，否则 `AssetFactory` 模块无法自动化。

---

## 2. 工程策略与原则

### 2.1 架构落地原则
根据 `architecture.en.md`，严格执行以下原则：
1.  **解耦**: 战斗逻辑 (M04) 不得直接引用 UI (M07) 或音频 (M08)。所有跨模块通信必须通过 `GameEvent` (Event Bus) 或定义好的 Interface。
2.  **数据驱动**: 所有数值（伤害、冷却、敌人属性）严禁硬编码。必须通过 `ScriptableObject` 或 JSON 配置表加载。
3.  **无头测试**: 核心战斗逻辑类 (`Systems.Combat`, `Entities.Actor`) 必须设计为不依赖 Unity 渲染组件，以便进行纯 C# 单元测试。

### 2.2 代码与资源规范
*   **命名**: 严格遵循 `asset-spec` 规范。例如：
    *   类: `PascalCase` (e.g., `PlayerController`)
    *   变量: `camelCase` (e.g., `maxHealth`)
    *   资产: `Type_Prefix_Name` (e.g., `M_Brotato_HighPoly`, `VFX_Fire_Hit`)
*   **GC 控制**:
    *   热路径 (`Update`, `FixedUpdate`) 中禁止产生垃圾 (GC Alloc)。
    *   所有高频生成物体（子弹、特效、敌人）必须通过对象池 (`ObjectPool`) 管理。

---

## 3. 详细任务分解 (Work Breakdown)

基于 `task-breakdown.en.md` 和 `architecture.md`，将工程工作划分为四个主要阶段。

### 阶段 1: 基础设施与核心框架 (Week 1-2)
*目标：搭建引擎项目骨架，实现核心循环，确保可验收的性能基线。*

| 任务 ID | 模块 | 任务描述 | 优先级 | 验收标准 (Acceptance Criteria) | 事实/假设 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-101 | M01/M02 | 实现 `GameLoopController` 与 GMFSM | P0 | 1. 帧率稳定在 60 FPS。<br>2. 状态切换 (Start->Play) 无卡顿。<br>3. 暂停时时间缩放 (TimeScale) 归零。 | 事实 |
| T-102 | M03 | 实现 `BaseActor` 与 `GridSystem` | P0 | 1. Actor 可独立于渲染层运行。<br>2. 网格碰撞检测精度误差 < 0.01 单位。<br>3. 无头模式下可模拟移动。 | 事实 |
| T-103 | M08/M04 | 实现 `EventBus` 与音频解耦 | P1 | 1. 发射 `OnHit` 事件后，UI 和 Audio 模块独立响应。<br>2. 移除 Audio 模块代码，编译无错误 (反向验证解耦)。 | 假设 |
| T-104 | M06 | 实现 `AssetFactory` 与预制体生成 | P1 | 1. 能通过 ID 字符串动态生成 Actor 预制体。<br>2. 资产加载失败时有明确日志报错，不崩溃。 | 假设 |

### 阶段 2: 战斗系统与玩家控制 (Week 3-4)
*目标：实现核心玩法循环，包含移动、射击、敌人 AI。*

| 任务 ID | 模块 | 任务描述 | 优先级 | 验收标准 (Acceptance Criteria) | 事实/假设 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-201 | M03 | 玩家 3D 移动控制器 (WASD + Roll) | P0 | 1. 移动速度 = 5 units/sec (量化规格)。<br>2. Roll 无敌帧 0.3s，冷却 1.5s。<br>3. 输入延迟 < 20ms (高速摄像验证)。 | 事实 |
| T-202 | M04 | 伤害计算与状态效果 | P0 | 1. 距离伤害衰减: 0m=100%, 10m=0% (线性)。<br>2. 中毒/燃烧 Tick 独立于攻击动作。<br>3. 伤害数值显示误差 < 1%。 | 事实 |
| T-203 | M05 | 投射物系统 (Projectile) | P1 | 1. 速度 12.0 m/s ± 0.5。<br>2. 发射频率 ≥ 1/0.8s。<br>3. 对象池复用率 100%，无 `new` 分配。 | 事实 |
| T-204 | M03 | 敌人 AI (Behavior Tree/FSM) | P1 | 1. 敌人按 Archetype 执行 Chase/Attack。<br>2. 寻路 A* 算法每回合运行一次。<br>3. 100 敌人同屏 CPU 占用 < 5% (中端设备)。 | 假设 |

### 阶段 3: 系统扩展与 UI/UX (Week 5-6)
*目标：实现进度系统、商店、UI 界面及音频整合。*

| 任务 ID | 模块 | 任务描述 | 优先级 | 验收标准 (Acceptance Criteria) | 事实/假设 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-301 | M07 | HUD 与 主菜单 UI | P0 | 1. 血条透明度逻辑: 满血 2s 后变为 0.3，受伤立即变 1.0。<br>2. 波次计时器更新频率 10Hz。<br>3. 视觉回归测试 SSIM ≥ 0.95。 | 事实 |
| T-302 | M07/M04 | 商店与经济系统 | P1 | 1. 每 2 个敌人掉落 1 Bread (平均)。<br>2. 购买逻辑: 49 金币失败，50 金币成功。<br>3. 商店刷新耗时 < 50ms。 | 事实 |
| T-303 | M08 | 音频管理器 (池化) | P2 | 1. 同时播放 10 个音效无卡顿。<br>2. 平均响度 -14 LUFS ± 1 LU。<br>3. 音频资源预加载至内存。 | 假设 |
| T-304 | M02 | 存档/读档系统 (JSON) | P2 | 1. 游戏退出后重新进入，状态恢复一致。<br>2. 文件损坏时能回退至上一安全点。 | 假设 |

### 阶段 4: 优化、测试与发布准备 (Week 7-8)
*目标：性能调优，修复 P0/P1 Bug，最终验收。*

| 任务 ID | 模块 | 任务描述 | 优先级 | 验收标准 (Acceptance Criteria) | 事实/假设 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-401 | Perf | 内存与 GC 优化 | P0 | 1. 运行 30 分钟，内存峰值 < 4GB。<br>2. C# GC Alloc 稳态 < 1MB/s。<br>3. Draw Calls < 100。 | 事实 |
| T-402 | QA | 自动化测试门禁 | P0 | 1. `AssetChecker` 零错误。<br>2. 单元测试覆盖率 ≥ 80% (核心逻辑)。<br>3. 压力测试 (500 敌人) FPS ≥ 45。 | 事实 |
| T-403 | QA | 手动 QA 清单 | P1 | 1. 无 P0/P1 Bug。<br>2. 音频响度、UI 延迟符合量化指标。<br>3. 视频录屏留存作为证据。 | 事实 |

---

## 4. 数据与技术配置规范

### 4.1 配置表结构 (Data-Driven)
所有数值必须通过以下结构定义，禁止硬编码在 C# 类中：

*   **`SkillConfig` (ScriptableObject)**:
    *   `ID`: string
    *   `Cooldown`: float (Range: 1.0 - 30.0)
    *   `DamageMulti`: float
    *   `RequiredTags`: List<string> (用于连携判断)
*   **`EnemyArchetype` (JSON/CSV)**:
    *   `ID`: string
    *   `AggroRange`: float
    *   `BehaviorType`: enum (Chase, Attack, Fear, Summon)
    *   `MeshAssetID`: string (关联 AssetFactory)

### 4.2 事件定义 (EventBus)
为避免循环依赖，定义标准事件：
*   `OnPlayerTakeDamage (float amount, Vector3 point)`
*   `OnEnemyDie (EnemyType type, Vector3 position)`
*   `OnWaveStart (int waveIndex)`
*   `OnAudioTrigger (AudioEventID id)`

---

## 5. 风险管理与缓解措施

| 风险 ID | 描述 | 概率 | 影响 | 缓解措施 | 验收验证 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R-01 | **物理抖动**: 3D 碰撞检测在网格移动时出现 jitter。 | 中 | 高 | 使用 `CharacterController` 而非 `Rigidbody` 进行玩家移动；物理模拟使用固定时间步长。 | 播放视频检查移动平滑度；Profier 中 Physics 耗时 < 5ms。 |
| R-02 | **性能瓶颈**: 500 敌人同屏导致 AI 计算超时。 | 中 | 高 | 1. AI 寻路每回合执行，非每帧。<br>2. 引入 LOD (Level of Detail)，远距离敌人降低更新频率。<br>3. 使用 `JobSystem` 并行计算 AI 路径 (可选优化)。 | 压力测试脚本：生成 500 敌人，监控 CPU 主线程 < 8ms。 |
| R-03 | **资产管线断裂**: 模型命名不规范导致 `AssetFactory` 报错。 | 高 | 中 | 1. 编写 `AssetLinter` 编辑器脚本。<br>2. 集成到 Git Pre-commit Hook。<br>3. CI 流水线中运行 `AssetChecker`。 | CI 构建通过；Linter 报告 0 错误。 |
| R-04 | **数值平衡偏差**: 伤害衰减公式导致远距离无敌。 | 中 | 中 | 1. 提供调试 UI，实时显示距离与预期伤害。<br>2. 配置表支持热重载 (无需重启)。 | 调试模式截图：10m 处伤害为 0。 |

---

## 6. 验收与交付物

### 6.1 交付物清单
1.  **可执行构建**: `Brotato3D_v2_Beta.exe` (Windows PC)。
2.  **性能报告**: `Profiler_30min_Log.json` (包含 FPS, Mem, GC 数据)。
3.  **代码仓库**: 包含完整的 `_Project` 目录结构，通过所有 CI 检查。
4.  **文档**:
    *   更新后的 `architecture.zh.md` (如有变更)。
    *   `config-tables` 目录 (JSON/CSV)。
    *   `qa-report.md` (包含 Bug 列表与解决状态)。

### 6.2 最终验收标准 (Definition of Done)
1.  **功能完整性**: `feature-list.en.md` 中所有 P0/P1 功能可操作。
2.  **性能达标**: 在 GTX 1050/i5-4590 配置下，稳定 60 FPS，内存 < 4GB。
3.  **零 P0/P1 Bug**: 无崩溃、无卡死、无核心玩法阻断性问题。
4.  **代码质量**:
    *   核心逻辑单元测试通过率 100%。
    *   无硬编码数值 (代码审计通过)。
    *   所有公共 API 具备 XML 注释。

---

## 7. 下一步行动 (Immediate Next Steps)

1.  **[策划/工程]** 评审本计划，确认 **R-02 (AI 性能)** 的缓解方案是否满足团队技术能力。若团队不熟悉 Unity Jobs System，需调整 AI 更新策略为“分帧计算” (Spread over frames)。
2.  **[工程]** 初始化 Unity 项目，搭建 `Assets/_Project` 目录结构，安装必要插件 (Addressables, TextMeshPro)。
3.  **[QA]** 搭建 CI 环境，配置 `AssetChecker` 与 `UnitTests` 自动运行任务。
4.  **[美术]** 提供 1 个低模玩家角色 (≤5000 tris) 与 1 个敌人模型，用于验证 `AssetFactory` 管线。

**签字确认**:
*   策划组: _______________ (日期)
*   工程组: _______________ (日期)
*   QA 组: _______________ (日期)

*注：本计划基于当前 `v_1` 工程层文档生成。任何架构变更需重新评估对本计划的影响。*
