# 测试计划 (test-plan.md)

**项目**: Brotato 3D
**版本**: v_2
**来源层**: Engineering Layer / Studio CoWork
**输入依据**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\requirements\v_2\` (requirements, feature-list, acceptance, asset-spec)
**日期**: 2023-10-27
**状态**: Draft for Review

## 1. 概述与范围
本测试计划旨在验证 `v_2` 版本需求文档中定义的功能、资产规范及验收标准是否得到满足。本计划仅基于提供的文档进行推导，**不假设代码已修改或功能已实现**。所有测试用例均对应明确的验收标准（Acceptance Criteria），以便在代码交付后进行可复现的验证。

### 1.1 测试目标
*   验证所有 `feature-list` 中的功能点满足 `acceptance` 文档中的定义。
*   验证生成的资产符合 `asset-spec` 的尺寸、格式及命名规范。
*   识别 `requirements` 与 `feature-list` 之间的逻辑断层或假设风险。

### 1.2 范围排除
*   长期性能压测（除非 `requirements` 中明确指定帧率/内存限制）。
*   非核心UI的像素级美术审查（仅验证资产存在性及基本属性）。
*   非目标平台的兼容性测试（默认目标平台需在 `requirements` 中确认，若未确认，标记为假设）。

## 2. 测试策略与方法
*   **基于需求的测试 (Requirement-based)**: 直接映射 `feature-list` 条目至 `acceptance` 标准。
*   **资产完整性检查**: 扫描资产目录，校验 `asset-spec` 中的文件列表、格式、尺寸。
*   **负向测试**: 基于文档中隐含的边界条件（如数值溢出、资源加载失败）设计测试用例。
*   **事实 vs 假设标记**: 每个测试用例明确其依据是文档中的**事实（Fact）**还是推导出的**假设（Assumption）**。

## 3. 测试环境与前置条件
*   **环境**: [需确认：目标平台，如 Windows/Unity Version] *(假设：Unity 2021+)*
*   **构建版本**: `v_2` 候选构建版本。
*   **数据**: 干净的游戏存档（无残留数据）。
*   **工具**: Unity Editor / Test Runner, 资产清单生成脚本 (Asset Validator)。

## 4. 测试用例矩阵
*以下用例基于 `feature-list` 和 `acceptance` 文档的结构化拆解。由于具体功能内容未在输入中展开，此处提供**通用测试框架**及**基于Brotato 3D典型需求的示例用例**。实际执行时，需将 `feature-list` 中的每一条功能点替换进此框架。*

### 4.1 资产规范测试 (基于 asset-spec)
**目标**: 验证所有引用资产符合 `asset-spec.zh.md` / `asset-spec.en.md`。

| 用例ID | 模块 | 测试项 | 前置条件 | 步骤 | 预期结果 (验收标准) | 依据 (Fact/Assumption) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| T_ASSET_01 | 材质 | 贴图尺寸校验 | 构建包含资产 | 运行资产验证脚本 | 所有 Texture 尺寸符合 `asset-spec` 定义 (如 1024x1024) | Fact (若 spec 明确) / Assumption (若未明确) |
| T_ASSET_02 | 模型 | 网格面数限制 | 加载模型 | 检查 Mesh Renderer | 面数不超过 `asset-spec` 上限 (如 < 5000 tris) | Fact |
| T_ASSET_03 | 音效 | 音频格式与时长 | 播放音效 | 解码音频文件 | 格式为 WAV/OGG，时长与 `asset-spec` 一致 | Fact |
| T_ASSET_04 | 完整性 | 缺失资产引用 | 构建包 | 运行 Scene Validation | 无 "Missing Prefab/Texture" 警告 | Assumption (默认需要无警告) |

### 4.2 功能验收测试 (基于 feature-list & acceptance)
**目标**: 验证 `feature-list` 中的核心游戏循环与机制。

#### 4.2.1 核心玩法循环 (示例：假设 v_2 包含 "装备系统" 或 "技能冷却")
*请根据实际 `feature-list` 内容替换以下示例*

| 用例ID | 功能点 (Feature) | 测试场景 | 步骤 | 预期结果 (Acceptance) | 证据/验收方式 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T_FUNC_01 | [F-XXX] 物品拾取 | 玩家靠近掉落物 | 1. 生成掉落物<br>2. 玩家碰撞触发 | 1. 物品进入背包<br>2. UI更新数量 | 检查 Inventory.Count == 1; UI 刷新事件触发 | Fact (若 acceptance 定义明确) |
| T_FUNC_02 | [F-YYY] 技能冷却 | 释放技能后 | 1. 释放技能 A<br>2. 观察冷却条 | 1. 冷却条从 100% 降为 0%<br>2. 不可重复释放直至冷却结束 | 日志打印 "Cooldown Active"; UI 进度条线性变化 | Fact |
| T_FUNC_03 | [F-ZZZ] 敌人 AI 路径 | 敌人被阻挡 | 1. 放置障碍<br>2. 敌人巡逻 | 敌人重新寻路，不卡在障碍内 | 帧率无剧烈波动；敌人位置变化平滑 | Assumption (需定义"平滑"阈值) |

#### 4.2.2 数值与平衡 (若 requirements 包含数值规范)
| 用例ID | 测试项 | 步骤 | 预期结果 | 依据 |
| :--- | :--- | :--- | :--- | :--- |
| T_VAL_01 | 伤害公式 | 计算 A 攻击 B | 伤害值 = 基础值 * 系数，误差 < 1% | Fact (若公式在 req 中) |
| T_VAL_02 | 资源上限 | 金币达到 Max | 1. 持续获取金币<br>2. 观察溢出 | 金币不溢出为负数或 Infinity，保持在 Max 或显示警告 | Assumption (默认需处理溢出) |

### 4.3 边界条件与负向测试
*   **T_NEG_01**: 资源加载失败 (模拟缺失文件)。
    *   *步骤*: 替换模型文件为无效数据。
    *   *预期*: 游戏不崩溃，显示默认占位符或日志报错 (依据 `requirements` 中的容错标准)。
*   **T_NEG_02**: 多实例冲突。
    *   *步骤*: 快速重复拾取同一物品 (网络/本地延迟模拟)。
    *   *预期*: 物品仅增加一次 (原子性检查)。

## 5. 风险评估与假设清单
*在此部分列出测试过程中识别出的关键假设，以便在评审时确认。*

| ID | 假设/风险描述 | 影响 | 缓解措施/验证方法 |
| :--- | :--- | :--- | :--- |
| A_01 | **假设**: 目标平台为 PC (Windows)。 | 若为移动平台，资产规格与性能测试需完全重做。 | 查阅 `requirements.zh.md` 确认 "Platform" 字段。若未确认，标记为 Critical Assumption。 |
| A_02 | **假设**: `asset-spec` 中的尺寸是强制性的，而非建议值。 | 若为建议值，资产验证测试 T_ASSET_01 需调整为警告级别而非错误。 | 确认 spec 文档中是否使用 "Must" 或 "Should"。 |
| A_03 | **风险**: `feature-list` 中的某些功能可能依赖未在 `requirements` 中描述的底层系统。 | 测试无法独立执行。 | 在测试准备阶段进行依赖项分析 (Dependency Mapping)。 |
| A_04 | **假设**: 游戏状态在重启后可完美恢复 (Save/Load)。 | 若 v_2 不包含 Save 功能，则相关测试用例无效。 | 检查 `feature-list` 是否包含 "Save" 或 "Persistence" 关键词。 |

## 6. 通过/失败标准 (Definition of Done for Testing)
1.  **Critical Bugs = 0**: 任何导致游戏崩溃、卡死或核心功能完全失效的问题必须修复。
2.  **Major Bugs = 0**: 核心流程 (如战斗、UI导航) 中的阻断性问题必须修复。
3.  **Asset Integrity**: 100% 的资产通过 `asset-spec` 验证脚本，无缺失引用。
4.  **Acceptance Coverage**: `acceptance` 文档中列出的所有标准项均有对应的测试用例执行记录。
5.  **Log Cleanliness**: 在测试用例执行过程中，Console 无未预期的 Error 级别日志。

## 7. 交付物
*   `test-results.xlsx` / `test-report.md`: 包含每个用例的执行状态 (Pass/Fail/Blocked) 及截图/日志证据。
*   `bug-list.json`: 发现的所有问题，关联到对应的 `feature-list` ID。
*   `asset-validation-log.txt`: 资产验证脚本的原始输出。

## 8. 附录：数据驱动的测试生成说明
*   **输入映射**: 本计划的结构是基于 `layer-manifest.json` 中定义的 `feature-list` 和 `acceptance` 文件生成的。
*   **自动化建议**: 对于 `T_ASSET_0x` 系列用例，建议使用 CI/CD 流水线中的自动化脚本执行，而非手动测试。
*   **手动测试重点**: 重点放在 `T_FUNC_0x` 系列中的交互逻辑和异常处理。

---
**备注**:
*   本计划**不**代表代码已实现。它仅是验证实现的蓝图。
*   在执行前，请确认 `requirements.zh.md` 中是否对 "测试环境" 有特定要求（如特定硬件、分辨率）。若有，需更新第 3 节。
*   所有 "Assumption" 项必须在测试准备阶段 (Test Readiness Review) 中得到开发人员的书面确认或修正。
