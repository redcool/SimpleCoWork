**QA 报告 (qa-report.md)**

**项目**: Brotato-3D
**层级**: Development Layer (L4)
**版本**: v_1
**输入源**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\development\v_1`
**状态**: 待评审
**日期**: 2024-05-24 (基于输入文档时间推断)
**审查对象**: `change-list`, `implementation-plan`, `risk-register`

---

### 1. 执行摘要 (Executive Summary)

本报告对 `brotato-3d` 项目工程层 (Engineering v_1) 到开发层 (Development v_1) 的手动文档进行独立质量审查。

**核心结论**:
文档整体结构完整，涵盖了变更清单、实施计划和风险登记。然而，存在**严重的事实冲突**和**术语不一致**，主要集中在“战斗模式”（实时 vs 回合/波次）的定义上。此外，中英文文档之间存在多处数值与逻辑偏差，需在执行前强制对齐，否则将导致实现层返工。

**主要问题类别**:
1.  **P0 - 架构冲突**: 战斗模式定义不一致（实时自动射击 vs 回合/网格制），直接阻塞核心代码架构。
2.  **P1 - 数据不一致**: 性能指标、具体数值在中英文文档及不同章节间存在偏差。
3.  **P2 - 文档完整性**: 部分风险登记文件未完全提供，无法评估全部风险缓解措施。

---

### 2. 详细审查发现 (Detailed Findings)

#### 2.1 P0 级问题：架构与模式冲突 (Critical Blocking Issues)

**ID: QA-F-001**
*   **问题描述**: **战斗模式定义冲突 (Real-time vs Turn/Grid-based)**。
    *   `change-list.en.md` (ADR-04/Fact A-04) 和 `implementation-plan.en.md` 明确指出采用 **Real-Time Auto-Shooter** (实时自动射击)，基于 `quantified-spec.en.md` 中的 0.8s 射击冷却和 12.0 m/s 投射物速度。
    *   `change-list.zh.md` (ADR-02) 标记为 **实时制**，但备注中提到 `architecture.zh.md` 提及“回合制”，并标记为冲突。
    *   `implementation-plan.zh.md` (Section 1.2) 声称战斗模式为 **“回合制/波次制 (Wave-based)”**，并假设地面网格为 15x15 (A-Grid)。
    *   **冲突点**: `implementation-plan.en.md` 明确弃用了网格系统 ("The Grid system is deprecated for v_1")，采用自由移动 (Free-Move)。而 `implementation-plan.zh.md` 保留了网格假设 (A-Grid) 且任务 T-102 包含 "GridSystem"。
*   **影响**: 若开发人员依据中文版实现网格移动和回合逻辑，将违背英文版定义的“Brotato 风格”实时 3D 射击核心玩法，导致代码架构错误，需完全重构。
*   **建议**: 立即召开评审会议，强制统一以 **英文版 (EN)** 为基准（因 `quantified-spec.en.md` 提供了具体的实时物理数值）。废弃“回合制”和“固定网格”假设，确认使用 `CharacterController` 进行实时 3D 移动。

**ID: QA-F-002**
*   **问题描述**: **物理引擎使用矛盾**。
    *   `change-list.en.md` (A-05) 指出玩家使用 **Kinematic (Non-Physical)** / `CharacterController`，敌人基础 mob 使用 kinematic。
    *   `implementation-plan.zh.md` (R-01 缓解措施) 提到使用 `CharacterController` 而非 `Rigidbody`，这与英文版一致。
    *   但 `change-list.zh.md` (ADR-05) 笼统地标记为“Unity Rigidbody”，虽注明玩家为 Kinematic，但表述易产生歧义，可能误导团队为所有实体启用物理模拟。
*   **影响**: 若在热路径中误用动态 `Rigidbody` 处理大量敌人，将导致严重的 CPU 性能开销，违反“60 FPS”的性能预算。
*   **建议**: 明确文档中：仅投射物或特定交互物体使用物理碰撞，玩家和绝大多数敌人移动逻辑应为 Kinematic 或自实现运动，避免不必要的物理模拟。

#### 2.2 P1 级问题：数据不一致与模糊性 (Data Inconsistencies)

**ID: QA-F-003**
*   **问题描述**: **敌人刷新率数值偏差**。
    *   `change-list.en.md` (4.2) 和 `implementation-plan.en.md` (AI-01) 规定 Wave 1 刷怪率为 **2.5 enemies/sec**。
    *   `change-list.zh.md` (3.1) 同样引用 2.5 enemies/sec。
    *   **潜在风险**: 这是一个非常高刷新率。在 3D 场景中维持 60 FPS 且 100+ 敌人同屏（由 2.5/s * 60s = 150 敌人）具有挑战性。`implementation-plan.zh.md` 的压力测试提到 “500 敌人同屏”，而 `change-list.en.md` 验收标准是 “50 enemies on screen maintain 60 FPS”。
    *   **冲突**: 目标同屏数量在 50 到 500 之间不一致。
*   **建议**: 统一性能测试基准。建议明确“常规游玩场景”目标为 100-150 敌人，压力测试上限为 300-500。需确认 `quantified-spec` 中关于 Draw Call (<100) 的限制是否兼容 500 个敌人（通常 500 个独立网格会远超 100 Draw Calls，除非使用 GPU Instancing 或合批，这在 3D 游戏中是高风险点）。

**ID: QA-F-004**
*   **问题描述**: **存档机制描述不一致**。
    *   `change-list.en.md` (A-08) 假设存档使用 **JSON** 序列化。
    *   `implementation-plan.zh.md` (T-304) 同样提及 JSON。
    *   **风险**: Unity 默认序列化并非标准 JSON。若意指 `JsonUtility`，需注意其不支持继承和复杂嵌套类的良好兼容性。若意指第三方库或标准 JSON 文件，需明确。
*   **建议**: 明确具体实现方式。建议使用 `BinaryFormatter` (不推荐，已废弃) 或 `Protobuf`/`MessagePack` 以获得更好的性能和稳定性，或者明确使用 `JsonUtility` 并接受其限制。当前文档未指定库，存在歧义。

**ID: QA-F-005**
*   **问题描述**: **缺失的风险登记文件内容**。
    *   输入中 `risk-register.en.md` 被截断，`risk-register.zh.md` 未读取。
    *   仅能从 `change-list` 和 `implementation-plan` 中推断风险 (R-01 至 R-04)。
    *   `change-list.zh.md` 中提到的 R-04 (实时与回合冲突) 已在 QA-F-001 中标记为 P0。
    *   **缺失**: 无法评估除 R-01~R-04 之外的其他风险（如资产管线、本地化、移动端适配风险）。
*   **建议**: 在开发启动前，补全 `risk-register` 的完整审查。特别关注“资产命名规范” (R-03) 的执行机制是否落实到 CI 流水线。

#### 2.3 P2 级问题：文档质量与建议 (Minor Issues)

**ID: QA-F-006**
*   **问题描述**: **日期逻辑错误**。
    *   `implementation-plan.en.md` 日期为 2023-10-27。
    *   `implementation-plan.zh.md` 日期为 2026-10-15。
    *   `change-list` 日期为 2024-05-23。
    *   **影响**: 时间线混乱，不利于追溯文档版本。
*   **建议**: 统一文档元数据日期，或使用 Git 提交时间戳作为唯一事实来源。

**ID: QA-F-007**
*   **问题描述**: **UI 框架假设未最终确认**。
    *   `change-list.zh.md` (ADR-04) 假设使用 UGUI + TextMeshPro。
    *   `implementation-plan.zh.md` 依赖此假设。
    *   **建议**: 鉴于性能目标（低 Draw Call），UGUI 可能成为瓶颈。建议在设计阶段增加 UGUI vs UI Toolkit 的技术预研任务，或在实施计划中预留 UI 迁移接口。

---

### 3. 事实与假设核查表 (Fact vs Assumption Verification)

| 条目 | 文档标注 | QA 核查结果 | 结论 |
| :--- | :--- | :--- | :--- |
| **引擎: Unity 2022 LTS** | 假设/事实 | 依据行业标准和 `layer-manifest` 默认值。 | **合理假设**，需团队最终确认。 |
| **战斗: 实时自动射击** | 事实 (EN) / 冲突 (ZH) | EN 版数据详实 (速度、冷却)，ZH 版存在“回合/网格”残留描述。 | **重大冲突**，以 EN 版实时模型为准。 |
| **玩家移动: Kinematic** | 假设 | 符合 3D 游戏最佳实践，避免物理抖动。 | **接受**，作为技术决策。 |
| **投射物速度: 12.0 m/s** | 假设 | 数值具体，可测试。 | **接受**，需通过单元测试验证。 |
| **Draw Calls < 100** | 事实 (预算) | 对于 3D 场景且可能有大量敌人，此预算极其激进。若敌人不合并批次，极易超标。 | **高风险**，需确认是否启用 GPU Instancing 或 LOD。 |
| **存档: JSON** | 假设 | 未指定具体序列化库。 | **需澄清**，建议明确为 `JsonUtility` 或第三方库。 |

---

### 4. 验收与证据标准 (Acceptance & Evidence)

为确保开发层 (L4) 交付物符合工程层 (L3) 规格，必须满足以下 QA 门禁：

#### 4.1 自动化测试门禁 (CI/CD Gates)
1.  **单元测试覆盖率**: 核心逻辑类 (`DamageCalculator`, `StateMachines`, `EventBus`) 行覆盖率 **≥ 80%**。
2.  **性能断言**:
    *   构建产物在指定硬件 (i5-4590/GTX 1050) 上运行基准场景。
    *   断言: `Avg FPS >= 58`。
    *   断言: `Peak Memory < 4000 MB`。
    *   断言: `Draw Calls < 100` (需在 Profiler 脚本中自动检查)。
3.  **资产检查**: 运行 `AssetLinter`，违规命名或超限资产 (Tris > 5000) 导致构建失败。

#### 4.2 手动 QA 验证清单
1.  **实时战斗验证 (针对 QA-F-001)**:
    *   手动操作验证：玩家 WASD 移动为连续移动，**非**格点跳跃。
    *   射击验证：按住射击键（或自动射击）时，子弹间隔严格控制在 0.8s ± 10ms。
    *   Roll 验证：双击触发 Roll，无敌帧持续 0.3s (18 frames @ 60FPS)，冷却 1.5s。
2.  **UI 延迟验证**:
    *   测量从输入 (KeyPress) 到 UI 状态变化 (如血条变色) 的延迟，必须 **< 20ms**。
3.  **存档鲁棒性**:
    *   故意损坏 JSON 存档文件，重启游戏。
    *   预期：应用不崩溃，提示用户并回退至默认或上一有效存档。

---

### 5. 行动建议 (Action Items)

1.  **[架构师/PM] 立即解决 QA-F-001**: 召开 15 分钟同步会，正式废除“回合制/网格”假设，确认“实时 3D 自由移动 + 自动射击”为唯一真理源 (Single Source of Truth)。更新 `architecture.zh.md` 和 `implementation-plan.zh.md` 以匹配英文规格。
2.  **[性能工程师] 评估 Draw Call 预算**: 针对 “50 敌人同屏” 或 “150 敌人同屏” 进行 Draw Call 估算。若使用独立 Mesh，<100 的预算不可行。建议：启用 GPU Instancing 或降低同屏敌人数量至 30-50，或放宽 Draw Call 预算至 200-300 (取决于 Shader 复杂度)。
3.  **[后端/架构] 明确存档技术栈**: 在 `implementation-plan` 中补充存档序列化库的具体选择（如 `Newtonsoft.Json` 在 Unity 中的兼容性问题，或 `JsonUtility` 的限制）。
4.  **[QA] 补全风险登记**: 获取完整的 `risk-register` 文件，重点审查资产管线 (R-03) 和 AI 性能 (R-02) 的缓解措施是否具备可执行性。

---

### 6. 结论

当前 `development/v_1` 文档集**不直接适用于**无修改的代码开发，主要因为中英版本在核心游戏机制（实时 vs 回合）上存在致命矛盾。

**放行条件**:
在解决 QA-F-001 (战斗模式统一) 和 QA-F-003 (同屏敌人数量/性能预算对齐) 之前，开发团队不得开始 Phase 1 (基础设施) 以外的核心逻辑代码编写。基础框架 (Project Setup, EventBus, FSM) 可先行开发，因其对战斗模式依赖较低。

**评级**: **有条件通过 (Conditional Pass)** - 需修复 P0 冲突。

*文档结束。*
