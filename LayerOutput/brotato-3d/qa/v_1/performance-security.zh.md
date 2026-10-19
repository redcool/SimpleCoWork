```markdown
# 性能与安全评审报告 (performance-security.md)

**项目**: Brotato-3D
**层级**: Development Layer (L4) - QA 评审
**输入源**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\development\v_1`
**评审对象**: `change-list`, `implementation-plan`, `layer-manifest`
**状态**: Finalized for Handoff
**日期**: 2024-05-23 (基于输入文档时间戳推导，实际评审时间以当前为准)

## 1. 评审概述与结论

本次 QA 评审聚焦于 `brotato-3d` 项目从工程层（Engineering L3）到开发层（Development L4）的交接文档，重点审查**性能预算的执行可行性**、**运行时安全性（内存/GC）**以及**架构解耦对系统稳定性的影响**。

**核心结论**:
1.  **性能目标明确但存在风险**: 文档设定了严格的性能指标（60 FPS, <100 Draw Calls, 0 GC Alloc in Update），但在 `change-list.zh.md` 中识别出的“物理引擎抖动”风险（R-01）与“大量敌人 AI 计算”风险（R-02）缺乏具体的自动化验证手段。
2.  **安全性与稳定性依赖解耦**: 系统通过 `EventBus` 和 `ObjectPool` 实现逻辑与表现层解耦，这是内存安全的关键。验收标准中明确要求“移除 Audio 模块后战斗逻辑仍可运行”，这一负向测试用例对防止模块间硬依赖至关重要。
3.  **关键假设未闭环**: 战斗模式（实时 vs 回合制）在 EN/ZH 文档中存在冲突（ADR-02, R-04）。`implementation-plan.en.md` 判定为“实时自动射击”，但 `implementation-plan.zh.md` 仍保留“回合制/波次制”的表述。此未决项将直接影响性能 profiling 的基准选择。

**总体评价**: **有条件通过 (Conditional Pass)**。需解决 EN/ZH 文档关于战斗模式的冲突，并补充针对 GC Alloc 和 Draw Call 的自动化 CI 门禁细节后方可进入全量开发。

---

## 2. 性能预算评审 (Performance Budget Review)

本章节依据 `change-list.en.md` Section 4 和 `implementation-plan.en.md` Section 6，审查性能指标的具体性与可测量性。

### 2.1 核心性能指标映射表

| 指标 | 目标值 | 测量方法/工具 | 证据要求 | QA 评审意见 |
| :--- | :--- | :--- | :--- | :--- |
| **帧率 (FPS)** | 60 FPS (Avg), 45 FPS (Min) | Unity Profiler (Time Profiler) | 60s 持续运行日志，JSON 导出 | **通过**。需明确“Min”是指在 1080p 最低配置 (i5-4590/GTX 1050) 下的表现，而非开发机。 |
| **帧时间 (Frame Time)** | < 16.6 ms (Avg) | Profiler Script | CI 冒烟测试断言 | **通过**。建议在 `PerfBake.unity` 场景中自动断言 `avg_frame_time < 16.6ms`。 |
| **Draw Calls** | < 100 / Frame | GPU Profiler / Stats Panel | 截图或自动日志 | **风险**。若敌人数量达到 150-500（见 R-02），未使用实例化渲染或网格合并时极易超标。建议增加“500 敌人场景下 Draw Calls < 200”的软性上限预警。 |
| **内存 (Memory)** | Peak < 4 GB (PC) | Memory Profiler | 30 分钟长跑测试报告 | **通过**。需监控泄漏，而不仅是峰值。建议增加“1 小时运行后内存增长 < 10%”的稳定性指标。 |
| **加载时间 (Load Time)** | < 3.0 s (Splash -> Interactive) | 时间戳日志 (`T0` Click, `T1` HUD Active) | 日志文件 | **注意**。3.0s 对于 Unity 启动到首帧可交互可能偏乐观，尤其是涉及 AssetBundle 加载时。建议预留 0.5s 缓冲。 |
| **GC Alloc** | 热路径 (Update) 0 Alloc | Profiler (GC Alloc Graph) | 代码静态扫描 + 运行时 Profiler | **关键**。`change-list.en.md` T-005 明确要求 Projectile 使用池化。需确保 `Vector3`, `Quaternion` 计算不产生装箱类型 (Boxing)。 |

### 2.2 性能瓶颈预判与缓解

*   **AI 计算开销 (R-02)**:
    *   **事实**: `implementation-plan.zh.md` T-204 提到 100 敌人同屏 CPU 占用 < 5%。
    *   **假设**: 使用 Unity Job System 进行并行 AI 更新是可选优化。
    *   **QA 建议**: 若团队未熟练掌握 Job System，强制采用“分帧计算 (Sliced AI Updates)”策略，将 AI 更新分散到多帧，避免单帧卡顿。验收时需测试“500 敌人同屏”场景下的帧率稳定性，而不仅仅是 CPU 占用。
*   **物理抖动 (R-01)**:
    *   **事实**: 玩家使用 `CharacterController` (Kinematic)，敌人使用 `Rigidbody` 或 Kinematic。
    *   **QA 建议**: 在 QA 测试中，需专门验证“高速移动时的地面碰撞”。Kinematic 物体在重力场中容易出现“抖动”或“穿透”。验收标准：玩家 Roll 动作结束后，应立即稳定在地面上，无上下浮动（Vertical Bounce）。

---

## 3. 运行时安全性与稳定性评审 (Runtime Security & Stability)

本章节审查代码层面的安全性、资源管理及错误处理机制。

### 3.1 内存安全与资源管理

*   **对象池 (Object Pooling)**:
    *   **规范**: `implementation-plan.en.md` INF-04 要求 `ObjectPool<T>` 预分配，`Get()/Return()` 无 `new` 分配。
    *   **验收证据**: Profiler 中 `GC Alloc` 在 Pool 使用期间为 0。
    *   **QA 检查**: 需验证池耗尽时的行为。当所有 Projectile 均在飞行中且池已满时，系统应回退到 `Instantiate`（可能产生 GC 峰值）或限制生成频率，而不是崩溃。
    *   **风险**: 若敌人死亡后投射物未正确回收至池，将导致内存泄漏。建议添加“池利用率监控”日志。

*   **GC 控制 (Zero-GC Hot Paths)**:
    *   **规范**: `change-list.zh.md` 3.2 节明确禁止在 `Update` 中 `new` 对象。
    *   **QA 检查**: 静态代码审查工具需标记 `Update`, `FixedUpdate`, `LateUpdate` 中的 `new`, `string concatenation`, `List.Add` (扩容时) 等危险操作。
    *   **证据**: 提供 Profiler 截图，显示 `Mono GC Alloc` 在 10 分钟 gameplay 后接近 0 或线性无增长。

### 3.2 错误处理与异常安全

*   **存档系统 (Save/Load)**:
    *   **规范**: `change-list.en.md` A-08 要求 JSON 序列化。验收标准：损坏存档 -> App 不崩溃，提示用户。
    *   **QA 测试用例**:
        1.  正常存档/读档。
        2.  手动删除 JSON 文件 -> 启动游戏应重置为默认状态，不闪退。
        3.  篡改 JSON 字段类型（如 `int` 变 `string`）-> 启动游戏应捕获 `JsonException` 并回退至上一安全点或默认值，记录 Error 日志。
    *   **风险**: 直接使用 `JsonUtility` 可能导致解析错误时静默失败。建议使用 `Newtonsoft.Json` 并配置 `Error` 事件处理器，或在 Load 后验证关键数据完整性（如 `MetaStats` 非负）。

*   **资产加载 (Asset Factory)**:
    *   **规范**: `change-list.zh.md` M06 要求加载失败有 Fallback 机制。
    *   **QA 测试用例**:
        1.  模拟 `M_Enemy_HighPoly.prefab` 缺失 -> 游戏应加载默认占位符（Grey Box）并输出 Warning 日志，而非抛出 `NullReferenceException` 崩溃。
        2.  验证资源 ID 命名规范（Linter）是否在 CI 阶段生效。

### 3.3 模块解耦与依赖安全

*   **EventBus 解耦验证**:
    *   **规范**: `change-list.en.md` T-002 要求 Combat 模块解耦 Audio/UI。
    *   **QA 测试**: 执行“负向依赖测试”。从 Assembly Definition 文件中移除 Combat 对 Audio 的引用，编译必须成功。若编译失败，证明存在硬依赖。
    *   **证据**: 编译日志 + 单元测试（Publish `OnHit` 事件，Audio 模块独立响应）。

---

## 4. 关键风险与未决项 (Risk & Open Issues)

基于对文档的交叉比对，以下问题必须在开发前解决：

### 4.1 战斗模式冲突 (High Priority)

*   **冲突描述**:
    *   `change-list.en.md` A-04 声明 Combat is **Wave-Based Auto-Shooter** (Fact from L2).
    *   `change-list.zh.md` ADR-02 标记为 **Real-time**，但注明 `architecture.zh.md` 提及“回合制”为冲突项，需评审确认。
    *   `implementation-plan.zh.md` 1.2 节仍称战斗模式为 **回合制/波次制 (Wave-based)**，并基于此定义了 `GridSystem`。
    *   `implementation-plan.en.md` 1.3 节明确 **Decision**: "We adopt the Real-Time Auto-Shooter model... The Grid system is deprecated for v_1".
*   **影响**:
    *   若为**实时制**：需实现 `CharacterController` 移动、物理碰撞、AI 追击逻辑。性能瓶颈在 AI 更新频率和物理模拟。
    *   若为**回合制**：需实现 `GridSystem`、寻路 (A*)、Turn 管理。性能瓶颈在寻路计算和状态切换。
    *   **当前文档矛盾**：`implementation-plan.zh.md` 中的任务 T-102 (`GridSystem`) 和 T-204 (`A* 每回合`) 与 `implementation-plan.en.md` 的 T-102 (`BaseActor`) 和 T-204 (`Chase/Attack FSM`) 不一致。
*   **QA 建议**: **立即锁定为“实时制 (Real-Time)”**。依据 `change-list.en.md` 的“Fact”标签和 `implementation-plan.en.md` 的最终决议。需修订 `implementation-plan.zh.md`，删除 Grid 相关任务，或将其标记为“未来特性 (Out of Scope v_1)”。

### 4.2 性能基准未定义硬件

*   **问题**: 文档多次提到 “i5-4590 / GTX 1050” 作为 Min Spec，但未明确 QA 测试环境是否使用此配置，或使用更高配置模拟。
*   **建议**: 在 `test-plan` 中明确性能测试的**标准硬件环境**。若使用高端开发机，需通过 Unity Profiler 模拟低性能环境或明确记录“此测试仅验证逻辑正确性，性能达标需在下周的低配真机/虚拟机上复测”。

### 4.3 资产管线安全

*   **问题**: `change-list.zh.md` R-03 提到资产命名不规范导致加载失败。
*   **建议**: 在 CI 流水线中增加 `AssetLinter` 步骤。若 Linter 发现违规（如路径大小写错误、前缀缺失），应 **阻断构建 (Block Build)**，而非仅警告。

---

## 5. 验收证据清单 (Evidence Checklist)

为确保工程交付物符合性能与安全标准，QA 团队需在 Code Review 和 Test Execution 中收集以下证据：

| 检查项 | 证据类型 | 位置/工具 | 判定标准 |
| :--- | :--- | :--- | :--- |
| **0 GC Alloc 验证** | Profiler Screenshot / Log | Unity Profiler (GC Alloc) | 在 5 分钟 Gameplay 中，`Mono GC Alloc` 曲线无上升尖峰，平均分配率 < 100 bytes/sec。 |
| **Draw Call 监控** | Stats Log / Screenshot | Unity Stats Panel / Custom Script | 主场景运行时，`Draw Calls` 稳定在 100 以下。若超过 100，需提交优化 PR。 |
| **对象池效率** | Code Review / Profiler | `ObjectPool.cs` Source | 无 `Instantiate`/`Destroy` 调用在热路径。`Get/Return` 操作在 Profiler 中耗时 < 0.1ms。 |
| **存档异常处理** | Test Case Result | QA Test Report | 测试用例 "Corrupted Save File" 通过：游戏未崩溃，控制台输出 Error 日志，并加载默认数据。 |
| **解耦验证** | Build Log | CI Pipeline (Compilation) | 移除 Audio Assembly 引用后，Combat Assembly 编译成功。 |
| **帧率稳定性** | JSON Report | `PerfBake.unity` 自动测试 | `avg_fps >= 58` (允许 2 FPS 波动), `min_fps >= 45` (在模拟低配模式下)。 |
| **碰撞稳定性** | Video Evidence | Manual QA Recording | 玩家 Roll 动作期间及结束后，摄像机无剧烈晃动，角色无下沉/上浮现象。 |

## 6. 下一步行动建议 (Next Steps)

1.  **[工程组]** 修订 `implementation-plan.zh.md`，统一战斗模式描述为“实时制”，移除 `GridSystem` 相关 P0 任务，确保与 EN 文档一致。
2.  **[工程组]** 在 `CI Pipeline` 中配置 `AssetLinter` 和 `GC Alloc Check` 自动化任务。
3.  **[QA 组]** 编写 `CorruptedSaveTestCase` 单元测试，覆盖 JSON 解析异常路径。
4.  **[技术负责人]** 确认低配环境 (i5-4590) 的硬件资源或虚拟化方案，用于最终性能验收。

---
*文档结束。本评审基于输入文档静态分析得出，代码实际执行后的性能表现需以 Profiler 数据为准。*
```
