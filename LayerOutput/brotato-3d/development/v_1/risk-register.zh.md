# Risk Register: Brotato-3D (Engineering Layer)

**Document ID**: `risk-register.md`
**Project**: `brotato-3d`
**Version**: `v_1`
**Layer**: `engineering`
**Status**: **Draft for Review**
**Source Inputs**:
- `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1\architecture.en.md`
- `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1\architecture.zh.md`
- `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1\quantified-spec.en.md`
- `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1\quantified-spec.zh.md`
- `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1\layer-manifest.json`

---

## 0. 文档说明与范围

本文档旨在识别、量化并制定缓解策略，针对 `brotato-3d` 项目工程层（Layer 3）架构设计与量化规格中存在的潜在风险。

### 0.1 风险评级标准
- **概率 (Likelihood)**:
    - **高**: 在现有假设不变的情况下，几乎必然发生。
    - **中**: 有一定可能性发生，取决于具体实现细节或外部依赖。
    - **低**: 仅在极端边界条件下可能发生。
- **影响 (Impact)**:
    - **高**: 导致核心玩法不可玩、性能严重不达标（FPS < 30）、或关键功能缺失。
    - **中**: 导致性能指标轻微不达标（FPS 45-59）、部分非核心功能降级、或需要重做部分资产/代码。
    - **低**: 仅影响开发效率、文档规范或次要UI体验。
- **等级 (Severity)**:
    - **P0 (Critical)**: 阻断发布或核心体验。
    - **P1 (High)**: 严重影响体验或进度，需立即处理。
    - **P2 (Medium)**: 影响体验或质量，需在里程碑前解决。
    - **P3 (Low)**: 优化项，可在后续迭代处理。

---

## 1. 技术与架构风险

### 1.1 物理引擎与碰撞稳定性
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `TECH-001` |
| **描述** | 使用 Unity 默认 `Rigidbody` 进行高速 3D 子弹与多敌人碰撞检测时，可能产生碰撞抖动 (Jitter) 或穿透 (Tunneling)。 |
| **类型** | **假设 (Assumption)**: 基于 `architecture.zh.md` A1 假设使用内置物理引擎。 |
| **概率** | 中 |
| **影响** | 高 (战斗判定失效，视觉异常) |
| **等级** | **P1** |
| **来源** | `architecture.zh.md` §5, `quantified-spec.en.md` §2.1 (Projectile Speed 12m/s) |
| **缓解措施** | 1. 对子弹使用 **Raycast/Boxcast** 进行离散碰撞检测，而非依赖物理引擎自动碰撞。<br>2. 设置 `Time.fixedDeltaTime` 固定物理步长。<br>3. 启用 `Rigidbody.CollisionDetectionMode.Continuous` 用于高速物体。<br>4. **验收标准**: 在 100 个敌人密集场景中，子弹无视觉穿透，伤害判定帧误差 < 1 帧。 |
| **责任人** | Gameplay Dev / Physics Engineer |

### 1.2 大规模实体性能瓶颈
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `TECH-002` |
| **描述** | `quantified-spec.zh.md` 假设最大同屏敌人为 500，但 `architecture.zh.md` 未明确 LOD 策略细节。若不做 GPU 剔除与 LOD，CPU 更新 500 个 AI 实体将导致帧率低于 45 FPS。 |
| **类型** | **假设 (Assumption)**: 基于性能预算假设。 |
| **概率** | 高 (若未实现 LOD) |
| **影响** | 高 (不满足 60FPS 目标，最低 45FPS 门槛) |
| **等级** | **P0** |
| **来源** | `quantified-spec.en.md` §4.2, `quantified-spec.zh.md` §2.2 |
| **缓解措施** | 1. 实现 **LOD Group**: LOD0 (<15m), LOD1 (15-30m), LOD2 (>30m)。<br>2. 使用 **Job System** 进行 AI 寻路并行化。<br>3. 对远处敌人使用 **Instanced Rendering**。<br>4. **验收标准**: 在 GTX 1050 配置下，500 敌人场景保持 ≥ 45 FPS；Profiler 显示 AI 更新耗时 < 10ms/帧。 |
| **责任人** | Performance Engineer |

### 1.3 内存泄漏与 GC 峰值
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `TECH-003` |
| **描述** | 高频生成弹道、特效与敌人尸体，若对象池 (Object Pooling) 实现不当，会导致 C# GC 频繁触发，引起帧率尖刺 (Stutter)。 |
| **类型** | **事实 (Fact)**: 战斗系统特性决定高频生成。 |
| **概率** | 中 |
| **影响** | 中 (导致输入延迟，破坏 60FPS 体验) |
| **等级** | **P1** |
| **来源** | `architecture.zh.md` §4.1, `quantified-spec.zh.md` §2.3 |
| **缓解措施** | 1. 所有瞬态对象 (子弹、VFX、尸体) 必须使用对象池。<br>2. 热路径 (Update/FixedUpdate) 禁止 `new` 分配。<br>3. **验收标准**: Profiler 显示稳态下 GC Alloc < 1 MB/s；连续战斗 10 分钟无帧率骤降。 |
| **责任人** | Core Systems Dev |

---

## 2. 资产与管线风险

### 2.1 资产命名与规范执行
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `ASSET-001` |
| **描述** | `asset-spec` 要求严格的命名规范 (e.g., `VFX_[Type]_[Effect]`)。若美术资产未通过 Linter 校验直接入库，会导致代码引用错误、加载失败。 |
| **类型** | **事实 (Fact)**: `architecture.zh.md` §5 风险识别。 |
| **概率** | 中 |
| **影响** | 中 (开发调试成本高，集成风险) |
| **等级** | **P2** |
| **来源** | `architecture.zh.md` §5, `quantified-spec.zh.md` §6 |
| **缓解措施** | 1. 编写 Unity Editor 脚本 `AssetValidator`，在 Git Pre-commit 钩子中运行。<br>2. 集成 CI 流水线，构建前校验所有 `.prefab` 和 `.asset` 文件命名。<br>3. **验收标准**: CI 拦截所有不符合命名规范的资产提交；零运行时因资产缺失导致的 NullReferenceException。 |
| **责任人** | Tech Artist / CI/CD Lead |

### 2.2 模型面数与 Shader 复杂度超标
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `ASSET-002` |
| **描述** | 主角模型 > 5000 Tris 或敌人模型 > 2000 Tris 将违反规格。移动端或低端 PC 下可能导致 Draw Call 或顶点处理超时。 |
| **类型** | **假设 (Assumption)**: 基于 `quantified-spec` 设定的面数上限。 |
| **概率** | 中 |
| **影响** | 中 (性能不达标) |
| **等级** | **P2** |
| **来源** | `quantified-spec.en.md` §3.1, `quantified-spec.zh.md` §2.3 |
| **缓解措施** | 1. 建立资产审计脚本，自动解析 FBX/GLB 面数。<br>2. 强制使用 LOD0 为主力模型，LOD1/2 进行减面。<br>3. 限制 Shader 复杂度，禁止 RT (Ray Tracing) 探针。<br>4. **验收标准**: 资产审计脚本通过率 100%；所有主要角色/敌人 Draw Call ≤ 2。 |
| **责任人** | Lead 3D Artist / Tech Artist |

### 2.3 纹理压缩与内存溢出
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `ASSET-003` |
| **描述** | 环境贴图若全部使用 2048x2048 未压缩或 ASTC 配置错误，可能导致移动端内存超限 (< 512MB)。 |
| **类型** | **假设 (Assumption)**: 基于多平台目标假设。 |
| **概率** | 低 |
| **影响** | 高 (移动端崩溃) |
| **等级** | **P1** |
| **来源** | `quantified-spec.en.md` §3.2 |
| **缓解措施** | 1. 严格区分平台纹理变体：Desktop (BC7/DXT5), Mobile (ASTC 6x6)。<br>2. 限制场景内纹理总数，使用 Texture Atlas。<br>3. **验收标准**: 移动端构建内存占用 < 512MB；桌面端 < 2GB。 |
| **责任人** | Mobile Engineer / QA |

---

## 3. 功能与逻辑风险

### 3.1 回合制与实时制逻辑混淆
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `FUNC-001` |
| **描述** | `architecture.zh.md` 假设采用 **回合制 (Turn-Based)**，但 `quantified-spec.en.md` 描述了 **Auto-Shooter (自动射击)** 与实时冷却 (0.8s)。两者逻辑互斥，若未明确，将导致核心玩法实现错误。 |
| **类型** | **事实 (Fact)**: 文档间存在不一致。 |
| **概率** | 高 (若未及时澄清) |
| **影响** | 高 (核心玩法重构) |
| **等级** | **P0** |
| **来源** | `architecture.zh.md` §2.1 vs `quantified-spec.en.md` §2.1 |
| **缓解措施** | 1. **立即行动**: 策划组需确认 v_2 核心循环是“回合制战术”还是“实时自动射击”。<br>2. 若为混合制，需定义状态机切换边界。<br>3. 更新 `feature-list` 与 `requirements` 以消除歧义。<br>4. **验收标准**: 核心循环文档与代码实现一致；无混合逻辑冲突。 |
| **责任人** | **Planning Group Lead (Immediate Action Required)** |

### 3.2 配置表驱动与热重载
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `FUNC-002` |
| **描述** | 假设配置表 (CSV/JSON) 支持热重载 (Hot Reload)。若实现不当，可能在运行时修改数据导致状态不一致或崩溃。 |
| **类型** | **假设 (Assumption)**: `architecture.zh.md` §3.1。 |
| **概率** | 中 |
| **影响** | 中 (调试困难，生产环境数据异常) |
| **等级** | **P2** |
| **来源** | `architecture.zh.md` §3.1, §6 |
| **缓解措施** | 1. 实现 Schema 验证，加载时检查字段完整性。<br>2. 热重载仅在 Debug 构建中启用，Release 构建中配置只读。<br>3. **验收标准**: 修改 CSV 后重启游戏，数据正确生效；Schema 错误在启动时拦截并日志报警。 |
| **责任人** | Tools Dev |

### 3.3 UI 交互延迟
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `FUNC-003` |
| **描述** | `quantified-spec.en.md` 要求输入延迟 < 20ms。UI Toolkit 或 UGUI 在主线程忙时可能超出此预算。 |
| **类型** | **假设 (Assumption)**: 基于 60Hz 轮询率假设。 |
| **概率** | 低 |
| **影响** | 低 (感知延迟增加) |
| **等级** | **P3** |
| **来源** | `quantified-spec.en.md` §5.2 |
| **缓解措施** | 1. 优化 UI 更新逻辑，避免每帧重建 UI 元素。<br>2. 使用异步加载 UI 预制体。<br>3. **验收标准**: 使用 240fps 高速摄像机验证，按键到视觉反馈 < 20ms。 |
| **责任人** | UI Engineer |

---

## 4. 项目管理与外部依赖风险

### 4.1 引擎版本与插件兼容性
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `MGR-001` |
| **描述** | 假设使用 Unity 2021/2022 LTS。若后续引入新特性 (如 URP 升级)，可能与旧版 Asset Pipeline 不兼容。 |
| **类型** | **假设 (Assumption)**: `architecture.en.md` §3.1。 |
| **概率** | 低 |
| **影响** | 中 (工程重构) |
| **等级** | **P2** |
| **来源** | `architecture.en.md` §3.1 |
| **缓解措施** | 1. 锁定 Unity 版本，写入 `ProjectSettings`。<br>2. 建立引擎升级 Checklist，在里程碑前评估。<br>3. **验收标准**: 所有团队成员使用相同 Unity 版本；升级前通过回归测试。 |
| **责任人** | Tech Lead |

### 4.2 网络/联机功能缺失
| 字段 | 内容 |
| :--- | :--- |
| **Risk ID** | `MGR-002` |
| **描述** | 当前架构为 Local-Only。若 v_3 需求突然引入联机，现有单线程架构将导致大规模重构。 |
| **类型** | **假设 (Assumption)**: 基于 `architecture.zh.md` A3。 |
| **概率** | 低 |
| **影响** | 高 (架构颠覆) |
| **等级** | **P1** |
| **来源** | `architecture.zh.md` §0.3 |
| **缓解措施** | 1. 在 `layer-manifest` 中明确标注 v_2 不支持联机。<br>2. 设计模块时预留网络同步接口 (Interface)，但不实现。<br>3. **验收标准**: 代码架构评审通过，确认无硬编码本地逻辑阻断未来联机扩展。 |
| **责任人** | System Architect |

---

## 5. 未决问题 (Open Questions)

| ID | 问题描述 | 影响模块 | 决策截止日 | 负责人 |
| :--- | :--- | :--- | :--- | :--- |
| **OQ-01** | **核心玩法确认**: 是纯回合制、纯实时自动射击、还是混合？需统一 `architecture` 与 `quantified-spec` 矛盾。 | Core Logic, UI | **立即** | Planning Lead |
| **OQ-02** | **网格尺寸**: `architecture.zh.md` 假设 12x12 或 15x15 Grid，需确认是否与 `asset-spec` 场景模型尺寸匹配。 | Level Design, AI | Week 1 | Level Designer |
| **OQ-03** | **UI 框架**: 最终决定使用 UGUI 还是 UI Toolkit？影响性能预算与开发速度。 | UI/UX | Week 1 | UI Engineer |
| **OQ-04** | **存档格式**: JSON 是否满足 500 敌人关卡的存档体积与加载速度要求？ | Data Layer | Week 2 | Core Systems Dev |

---

## 6. 风险缓解行动计划 (Action Items)

1.  **[策划组]** **本周内** 解决 `OQ-01`，更新 `requirements` 与 `feature-list`，明确核心战斗循环。
2.  **[程序组]** 在 Week 1 实现 `Event Bus` 与 `Object Pooling` 原型，并通过性能基准测试。
3.  **[技术美术]** 编写 `AssetValidator` 脚本并集成至 CI 流水线，拦截不规范资产。
4.  **[工程组]** 配置 Profiler 自动采集工具，在每次构建后生成性能报告，对照 `quantified-spec` 指标。
5.  **[QA]** 根据 `risk-register` 中的 P0/P1 风险项，补充对应的自动化测试用例 (特别是 500 敌人压力测试)。

---

**签署**:
*   策划组: _______________ (日期)
*   工程组: _______________ (日期
