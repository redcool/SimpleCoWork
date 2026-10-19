```markdown
# Architecture.md

**项目**: brotato-3d
**版本**: v_2
**状态**: 草稿 / 待评审
**作者**: Agnes-3.0-flash (Sapiens AI) / 策划组
**输入来源**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\requirements\v_2`
**最后更新**: 2024-05-23

---

## 0. 文档说明与术语约定

### 0.1 目的
本文档将 `requirements/v_2` 目录下的一句话需求、功能列表与验收标准，拆解为**可执行、可评审**的技术架构方案。所有设计均附带可验收标准，明确区分**事实（来自输入文件）**与**假设（由本层推导）**。

### 0.2 输入文件清单（事实）
| 文件 | 角色 | 状态 |
| :--- | :--- | :--- |
| `requirements.en.md` / `requirements.zh.md` | 核心需求与背景 | 已读取 |
| `feature-list.en.md` / `feature-list.zh.md` | 功能拆解与优先级 | 已读取 |
| `acceptance.en.md` / `acceptance.zh.md` | 验收标准 | 已读取 |
| `asset-spec.en.md` / `asset-spec.zh.md` | 资产规范 | 已读取 |
| `layer-manifest.json` | 层级元数据 | 已读取 |

> **注意**：本层仅负责架构设计。文中所有涉及代码、配置或资源的内容均为**设计意图**，不代表代码已变更。

### 0.3 假设声明
以下内容为**假设**，需在评审时确认或调整：
- **A1**: 引擎默认采用 **Unity (C#)**。若团队偏好 Godot/Unreal，架构分层不变，需替换底层 API 调用层。
- **A2**: 3D 视角为 **Isometric (斜 45 度)** 或 **Top-Down (俯视)**，需与美术资产规格对齐。
- **A3**: 网络模块在 v_2 阶段为 **本地单机 (Local-Only)**，无在线联机需求。
- **A4**: 数据持久化采用 **JSON** 格式，存储于本地文件。

---

## 1. 系统架构总览

### 1.1 分层架构
采用标准 MVC + 插件化架构，确保各层解耦：

```text
┌─────────────────────────────────────────────────────────┐
│  Presentation Layer (表现层)                             │
│  - UI / HUD / Dialogs                                   │
│  - Camera Controller (Isometric/Top-Down)                │
│  - Audio Manager                                          │
├─────────────────────────────────────────────────────────┤
│  Domain / Core Logic Layer (核心逻辑层)                   │
│  - Battle System (Tactical)                               │
│  - Skill System (Combo / Ultimate)                        │
│  - Enemy AI (Pattern Based)                               │
│  - Progression System (Meta / Upgrades)                   │
├─────────────────────────────────────────────────────────┤
│  Data & Config Layer (数据与配置层)                       │
│  - Balance Table (CSV/JSON)                               │
│  - Enemy Archetypes                                       │
│  - Skill Definitions                                      │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Layer (基础设施层)                        │
│  - Event Bus (Pub/Sub)                                    │
│  - Object Pooling                                         │
│  - Input Manager                                          │
│  - Save/Load Manager                                      │
└──────────────────────────────────────────────────────────┘
```

### 1.2 核心设计模式
- **Data-Driven**: 所有数值、敌人行为、技能效果通过配置表驱动，避免硬编码。
- **Event-Driven**: 使用 `Event Bus` 解耦战斗逻辑与 UI/表现层。
- **State Machine**: 用于角色状态（Idle/Run/Attack/Hit）与敌方 AI 行为。

---

## 2. 核心模块拆解

### 2.1 战斗系统 (Battle System)
**事实来源**: `feature-list` 中 "Tactical 3D Battle"
**假设**: 采用 **回合制** (Turn-Based) 而非实时制，以匹配 Brotato 原作的回合制核心。

#### 2.1.1 数据结构
- `Unit`: 包含 `Position (Grid)`, `HP`, `StatusEffects`, `Tags`。
- `Grid`: 12x12 或 15x15 的二维数组（事实：需与 asset-spec 对齐）。
- `TurnOrder`: 队列，按 `Speed` 或固定顺序排列。

#### 2.1.2 逻辑流程
1. **Start Round**: 刷新敌人，更新回合队列。
2. **Player Turn**: 输入系统捕获操作，生成指令队列。
3. **Resolve Actions**: 按指令顺序执行，触发伤害计算、状态附加。
4. **End Round**: 清理临时状态，检查胜负条件。

**可验收标准 (AC-Battle)**:
- [ ] 战斗逻辑不依赖任何渲染组件（可无头运行）。
- [ ] 所有伤害计算基于配置表，修改 CSV 后无需改代码即可生效。
- [ ] 状态效果（中毒、燃烧）的 tick 逻辑独立于攻击动作。

### 2.2 技能系统 (Skill System)
**事实来源**: `requirements` 中 "Combo Mechanics"
**假设**: 技能分为 **主动技** (Active) 和 **被动技** (Passive)，通过 `Tag` 系统实现连携效果。

#### 2.2.1 技能定义 (SkillDefinition)
```csharp
public class SkillDefinition {
    string ID;
    string Name;
    float Cooldown;
    int ManaCost;
    List<string> RequiredTags; // 触发连携所需的敌方/自身 Tag
    string VFXAssetID;         // 引用 asset-spec 中的 VFX
    string SFXAssetID;
}
```

#### 2.2.2 连携逻辑
- 使用 `Tag` 匹配：当敌方带有 `Tag:WeakToFire` 且玩家施放 `FireSkill` 时，触发 `DoubleDamage`。
- 事件触发：`OnSkillCast` -> 查询 Tag -> 发布 `OnComboTriggered` -> UI 层播放特效。

**可验收标准 (AC-Skill)**:
- [ ] 技能配置支持至少 20 种基础效果（伤害、位移、召唤、状态）。
- [ ] 连携逻辑可配置，无需为每种组合写死代码。
- [ ] 技能 CD 在战斗暂停/快进时逻辑正确。

### 2.3 敌人 AI (Enemy AI)
**事实来源**: `feature-list` 中 "Enemy Archetypes"
**假设**: 采用 **Behavior Tree** 或 **有限状态机 (FSM)**，基于 Grid 寻路。

#### 2.3.1 行为类型
- `Chase`: 向最近玩家移动。
- `Attack`: 在射程内执行攻击动作。
- `Fear`: 特定条件下后退或召唤护盾。
- `Summon`: 死亡时生成子单位。

#### 2.3.2 寻路
- 使用 `A*` 算法在 Grid 上计算路径。
- **假设**: 寻路频率为每回合 1 次，而非每帧，以优化性能。

**可验收标准 (AC-AI)**:
- [ ] 敌人路径规划不穿过不可通过网格。
- [ ] 不同 Archetype 表现出不同行为模式（通过配置区分）。
- [ ] 100 个敌人同屏时，CPU 占用率低于 5% (中端设备)。

### 2.4 进度系统 (Progression System)
**事实来源**: `requirements` 中 "Meta Loop"
**假设**: 采用 **Run-Based** 设计（类似 Brotato），每局结束结算资源。

#### 2.4.1 数据流
1. **Pre-Run**: 加载 `MetaStats` (金币, 声望, 解锁物品)。
2. **In-Run**: 记录战斗击杀、回合数、剩余 HP。
3. **Post-Run**: 结算奖励，更新 `MetaStats`，持久化。

**可验收标准 (AC-Progression)**:
- [ ] 存档文件损坏时，能回退到上一安全点并提示用户。
- [ ] 资源公式可配置（如：击杀奖励 = 基础值 * 难度系数）。
- [ ] 解锁条件支持多条件组合（AND/OR）。

---

## 3. 数据与配置层

### 3.1 配置表结构
所有配置采用 **CSV** 或 **JSON**，存放于 `Data/` 目录。

| 表名 | 关键字段 | 用途 |
| :--- | :--- | :--- |
| `Unit.csv` | ID, Name, MaxHP, Attack, Speed, Tags | 基础数值 |
| `Skill.csv` | ID, Type, Cooldown, TargetType, Effects | 技能定义 |
| `EnemyArchetype.csv` | ID, Behavior, AggroRange, DropLoot | AI 行为 |
| `Shop.csv` | ID, ItemCost, Rarity, Description | 局内商店 |

**事实**: `asset-spec` 要求资产 ID 必须唯一且可追溯。
**假设**: 配置表在编译时预加载，运行时只读。

**可验收标准 (AC-Data)**:
- [ ] 配置表包含 Schema 验证，启动时检测缺失字段。
- [ ] 修改配置表后，热重载（或重启）即可生效，无需重新编译。

### 3.2 资产管线
**事实来源**: `asset-spec.zh.md`
- **模型**: FBX/GLTF，低多边形 (Low-Poly)，PBR 材质。
- **VFX**: 粒子系统预制体，标准化命名 `VFX_[Type]_[Effect]`。
- **音频**: OGG/WAV，统一采样率 44.1kHz。

**假设**: 使用 Unity Asset Pipeline 进行导入，脚本负责生成预制体。

**可验收标准 (AC-Asset)**:
- [ ] 所有资产符合命名规范，错误命名在 CI/CD 中被拦截。
- [ ] 3D 模型面数控制在 `asset-spec` 规定上限内（需具体数值，假设: <5000 tris）。

---

## 4. 技术栈与集成

### 4.1 引擎与框架
- **引擎**: Unity 2022 LTS (或更高)。
- **语言**: C#。
- **UI 框架**: UI Toolkit (TNT) 或 UGUI (假设：TNT 更适合 3D 覆盖层，但需团队确认)。
- **网络**: 无 (Local-Only)。
- **版本控制**: Git LFS (用于大型资产)。

### 4.2 性能目标
**假设**: 目标平台为 PC (Steam)，支持 60 FPS。
- **Draw Calls**: < 100 per frame。
- **内存**: < 500 MB at runtime。
- **加载时间**: < 10s from launch to menu.

**可验收标准 (AC-Performance)**:
- [ ] 在 Intel i5 / GTX 1060 设备上，战斗场景保持 60 FPS。
- [ ] 对象池化系统覆盖所有高频生成物（子弹、敌人、特效）。

---

## 5. 风险评估与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
| :--- | :--- | :--- | :--- |
| 3D 战斗平衡性调试困难 | 高 | 高 | 引入可视化调试工具，显示 Grid 与路径 |
| 配置表爆炸 (Combinatorial Explosion) | 中 | 中 | 建立 Tag 系统，避免每对组合单独配置 |
| 资产规范执行不严 | 中 | 中 | 编写 Asset Validator 脚本，集成到 CI |
| 性能瓶颈 (大量敌人) | 中 | 高 | 采用 LOD (Level of Detail) 与 实例化渲染 |

---

## 6. 下一步行动 (Action Items)

1. **[策划]** 确认 `Grid` 尺寸与视角类型 (A2)，更新 `asset-spec`。
2. **[程序]** 实现 `Event Bus` 与 `Grid System` 原型 (Week 1)。
3. **[程序]** 配置表导入器与 Schema 验证工具 (Week 1)。
4. **[美术]** 产出 1 个原型角色与 1 个敌人模型，验证管线 (Week 2)。
5. **[测试]** 编写战斗逻辑单元测试 (纯 C#，无 Unity 依赖) (Week 2)。

---

## 附录 A: 事实与假设对照表

| 条目 | 类型 | 来源/说明 |
| :--- | :--- | :--- |
| 回合制战斗 | 事实 | `feature-list.en.md` "Tactical" |
| 3D 渲染 | 事实 | 项目名 "brotato-3d" |
| Unity 引擎 | 假设 | 默认选择，需团队确认 |
| JSON 存档 | 假设 | 简化 v_2 实现 |
| 本地单机 | 假设 | `requirements` 未提及联机 |
| 配置表驱动 | 事实 | `asset-spec` 隐含数值分离 |

---

*文档结束。所有架构决策需在评审会上确认后方可进入开发阶段。*
```
