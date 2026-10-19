# Implementation Plan: Brotato-3D (Engineering Layer v_1)

**Document Type**: Implementation Plan
**Project**: Brotato-3D
**Version**: v_1
**Source Directory**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1`
**Status**: Ready for Engineering Execution
**Date**: 2023-10-27

## 1. Executive Summary & Scope

This document translates the architectural design and quantified specifications from the `engineering/v_1` layer into a concrete, time-boxed implementation schedule. It resolves conflicts between the high-level architecture document and the quantified specifications, prioritizing stability and data-driven design.

**Key Inputs:**
*   `architecture.en.md` / `architecture.zh.md`: System modules, state machines, and file structure.
*   `quantified-spec.en.md` / `quantified-spec.zh.md`: Performance budgets, numerical gameplay values, and asset constraints.
*   `task-breakdown.en.md`: High-level task categories (Movement, Combat, UI).
*   `layer-manifest.json`: Confirms project metadata and input sources.

**Critical Clarifications (Facts vs. Assumptions):**
1.  **Engine**: **Fact** derived from `architecture.en.md` (Unity 2021/2022 LTS, C#).
2.  **Game Loop**: **Assumption Conflict Resolution**: `architecture.en.md` suggests a real-time loop, while `quantified-spec.zh.md` mentions "Turn-Based" (回合制) in Section 2.1. However, `quantified-spec.en.md` Section 2.1 specifies "Auto-Shooter Combat" with `0.8s` shot frequency and `2.5 enemies/sec` spawn rate.
    *   **Decision**: We adopt the **Real-Time Auto-Shooter** model from `quantified-spec.en.md` and `task-breakdown.en.md` (which mentions "Roll mechanic" and "Wave-based" combat typical of Brotato). The "Turn-Based" reference in the Chinese spec is likely a mistranslation of "Wave-Based" (波次制) or a confusion with a tactical mode. The implementation will focus on real-time wave survival.
3.  **Grid vs. Free-Move**: `architecture.zh.md` mentions a `12x12` grid. `task-breakdown.en.md` mentions "WASD movement" and "3D movement (X/Y plane)".
    *   **Decision**: We adopt **Free-Move Real-Time** combat on a flat 2D plane (X/Z in Unity coordinates) with Y-axis gravity, consistent with the "Brotato" genre adaptation. The Grid system is deprecated for v_1 unless explicitly requested for a specific tactical mode, which is not present in the English feature list.

## 2. Phase 0: Environment & Infrastructure (Week 1)

**Goal**: Establish the technical foundation and data pipelines. No gameplay logic yet.

### 2.1 Project Setup
| Task ID | Task Description | Acceptance Criteria | Evidence |
| :--- | :--- | :--- | :--- |
| INF-01 | Initialize Unity 2022 LTS project. | Project opens with no errors. URP (Universal Render Pipeline) enabled. | Project file. |
| INF-02 | Configure folder structure per `architecture.en.md` Section 6. | Folders `Assets/_Project/Scripts/{Core,Entities,Systems,UI}` exist. | Directory tree screenshot. |
| INF-03 | Implement `GameEvent.cs` (Lightweight Pub/Sub). | 1. Event system supports `Subscribe<T>` and `Publish<T>`. <br> 2. Unit test: Publishing an event triggers subscribed handlers. | Unit test results. |
| INF-04 | Implement `ObjectPool<T>` generic class. | 1. Pool pre-allocates N items. <br> 2. `Get()` and `Return()` operations do not call `new` at runtime. | Profiler check: 0 GC Allocs during pool usage. |

### 2.2 Data-Driven Configuration
| Task ID | Task Description | Acceptance Criteria | Evidence |
| :--- | :--- | :--- | :--- |
| CFG-01 | Create `ScriptableObject` schemas for `UnitStats`, `SkillDef`, `EnemyDef`. | 1. `UnitStats` includes: MaxHP, MoveSpeed, AttackDamage, AttackCooldown. <br> 2. `EnemyDef` includes: AggroRange, ChaseSpeed, Damage. | Prefabs in Project View. |
| CFG-02 | Implement `ConfigManager` to load SOs. | 1. Static accessor `ConfigManager.Get<EnemyDef>(id)` works. <br> 2. Fallback logic for missing IDs returns `null` with warning log. | Log output test. |

## 3. Phase 1: Core Player & Movement (Week 2-3)

**Goal**: Functional player character with movement, rolling, and camera follow.

### 3.1 Player Controller
*Source: `task-breakdown.en.md` Module A, `quantified-spec.en.md` Section 2.1*

| Task ID | Task Description | Acceptance Criteria (Quantified) | Evidence |
| :--- | :--- | :--- | :--- |
| MOV-01 | Implement `PlayerController.cs` (Kinematic). | 1. Move speed: `5.0 units/sec` (Fact from task-breakdown). <br> 2. Input uses WASD. <br> 3. No `Rigidbody` used for movement (to prevent physics jitter, per `architecture.en.md` Risk Mitigation). | Video clip of movement. |
| MOV-02 | Implement "Roll" Mechanic. | 1. Trigger: Double-tap movement direction. <br> 2. Duration: `0.3s`. <br> 3. Cooldown: `1.5s` after roll ends. <br> 4. State: Invulnerable during roll (check `Health` system later). | Log timestamps of Roll Start/End. Verify Delta. |
| MOV-03 | Implement `CameraController.cs`. | 1. Offset: `(0, 10, -10)`. <br> 2. Lerp factor: `0.15`. <br> 3. No jitter during Roll (visual inspection). | Video clip. |

### 3.2 Ground & Collision
| Task ID | Task Description | Acceptance Criteria | Evidence |
| :--- | :--- | :--- | :--- |
| COL-01 | Create Static Ground Prefab. | 1. Mesh Renderer with Collider. <br> 2. Material uses Unlit or URP Lit (Simple). <br> 3. No Z-fighting when player stands on it. | Screenshot. |

## 4. Phase 2: Combat System & Projectiles (Week 3-4)

**Goal**: Implement the core damage loop: Projectiles, Hits, and Enemy Spawning.

### 4.1 Projectile System
*Source: `quantified-spec.en.md` Section 2.1*

| Task ID | Task Description | Acceptance Criteria (Quantified) | Evidence |
| :--- | :--- | :--- | :--- |
| COM-01 | Implement `Projectile.cs`. | 1. Speed: `12.0 m/s` ± 0.5. <br> 2. Lifetime: Destroy after `3.0s` or on hit. <br> 3. Uses `ObjectPool` for instantiation. | Profiler: No new allocations for projectiles. |
| COM-02 | Implement Damage Falloff. | 1. 100% damage at 0m. <br> 2. 0% damage at 10m. <br> 3. Linear interpolation: `Damage = Base * (1 - (distance / 10.0f))`. | Unit Test: Mock projectile hit at 5m results in 0.5x base damage. |
| COM-03 | Implement Auto-Shooter Logic. | 1. Shot Frequency: `0.8s` cooldown. <br> 2. Rotation Speed: `90°/sec` (when no target, sweep). <br> 3. Target acquisition: Nearest enemy within `15.0m` aggro range. | Log analysis: Interval between projectiles >= 0.8s. |

### 4.2 Enemy Spawning & AI
*Source: `quantified-spec.en.md` Section 2.1, `architecture.en.md` M03*

| Task ID | Task Description | Acceptance Criteria | Evidence |
| :--- | :--- | :--- | :--- |
| AI-01 | Implement `EnemySpawner.cs`. | 1. Spawn Rate: `2.5 enemies/sec` for Wave 1. <br> 2. Spawn Position: Random within `Radius=20m` around player, but outside `SafeZone=5m`. | Benchmark: 60s run = 150 ± 5 enemies. |
| AI-02 | Implement Basic Enemy FSM. | States: `Idle` -> `Chase` -> `Attack` -> `HitReaction`. <br> 1. `Chase`: Move to player at `3.0 m/s`. <br> 2. `Attack`: If distance < `1.5m`, deal damage. <br> 3. `HitReaction`: Stop movement for `0.1s` (per `quantified-spec.zh.md` 2.2). | Video: Enemies chase and attack. |

## 5. Phase 3: UI & HUD (Week 5)

**Goal**: Display critical game state.

### 5.1 HUD Implementation
*Source: `quantified-spec.en.md` Section 5.1*

| Task ID | Task Description | Acceptance Criteria | Evidence |
| :--- | :--- | :--- | :--- |
| UI-01 | Implement `HealthBarUI.cs`. | 1. Binds to `Player.CurrentHealth`. <br> 2. Opacity: `1.0` when damaged, `0.3` when full for > 2s. | Manual Test: Damage player, wait 3s, check opacity. |
| UI-02 | Implement `WaveTimerUI.cs`. | 1. Updates every `0.1s`. <br> 2. Displays current Wave Number and Time Remaining. | Log: UI updates not every frame, but on timer tick. |
| UI-03 | Implement `CurrencyCounterUI.cs`. | 1. Binds to `MetaCurrency`. <br> 2. Updates on `OnCurrencyChanged` event. | Log: Counter changes immediately upon kill reward. |

## 6. Phase 4: Performance & Optimization (Week 6)

**Goal**: Meet performance budgets defined in `quantified-spec.en.md` Section 4.

| Task ID | Task Description | Acceptance Criteria | Evidence |
| :--- | :--- | :--- | :--- |
| PERF-01 | LOD Implementation for Enemies. | 1. LOD0: 0-15m (High Poly). <br> 2. LOD1: 15-30m (Medium Poly). <br> 3. LOD2: 30m+ (Billboard/Cull). | Profiler: Draw calls for enemies drop significantly at 500+ entities. |
| PERF-02 | Memory Profiling. | 1. Peak Heap Memory < 4GB (PC). <br> 2. No memory leaks after 30 min of gameplay. | Memory Profiler Snapshot Diff. |
| PERF-03 | CPU Profiling. | 1. Main Thread Update < 8ms. <br> 2. Physics Sim < 5ms. | Profiler CSV export. |

## 7. Asset Pipeline & Validation (Continuous)

*Source: `quantified-spec.en.md` Section 3*

### 7.1 Asset Constraints
1.  **Meshes**: Player < 5,000 tris. Enemy < 2,000 tris.
    *   *Action*: Implement `AssetChecker` editor script that fails build if assets exceed limits.
2.  **Textures**: Max 2048x2048.
    *   *Action*: CI/CD script checks texture resolution.

### 7.2 Naming Conventions
1.  Models: `M_[Type]_[Name]` (e.g., `M_Enemy_Melee`).
2.  VFX: `VFX_[Type]_[Effect]` (e.g., `VFX_Hit_Fire`).
3.  Audio: `SFX_[Action]` (e.g., `SFX_Shot`).
    *   *Action*: Enforce via `AssetValidator` tool in Editor.

## 8. Testing Strategy (Pre-Implementation)

*Based on `test-plan` inputs (assumed standard Unity test structure)*

### 8.1 Unit Tests (Logic)
*   `Test_DamageFalloff`: Verify linear math at 0m, 5m, 10m.
*   `Test_RollCooldown`: Verify input buffering during cooldown.
*   `Test_EnemySpawn`: Verify spawn count over simulated 60s.

### 8.2 Integration Tests
*   `Test_WaveLoop`: Run Wave 1 -> 2 -> 3. Verify currency drops and enemy scaling.
*   `Test_PauseResume`: Pause game, wait 5s, resume. Verify time-based effects (shields, buffs) did not tick during pause.

### 8.3 Performance Tests
*   `Perf_StressTest`: Spawn 500 enemies simultaneously. Measure FPS on target hardware (GTX 1050/i5-4590). Target: 60 FPS.

## 9. Risks & Mitigation Plan

| Risk | Probability | Impact | Mitigation Action |
| :--- | :--- | :--- | :--- |
| **Physics Jitter** in 3D combat. | High | High | Use Kinematic Character Controller for Player/Enemies. Disable dynamic collision between enemies (use triggers for hit detection instead of colliders). |
| **Performance Drop** with 500 enemies. | Medium | High | Implement GPU Frustum Culling. Use Object Pooling. Batch enemy rendering (SRP Batcher). |
| **Asset Spec Violations**. | Medium | Medium | Implement `AssetChecker` tool in Week 1. Block imports of invalid assets. |
| **UI Lag** on low-end devices. | Low | Medium | Use UI Toolkit (TNT) instead of UGUI if performance issues arise, or use Canvas Renderers with low overdraw. |

## 10. Definition of Done (DoD)

A feature is considered "Done" when:
1.  All Acceptance Criteria in the corresponding Task Table are passed.
2.  Code is reviewed by at least one other engineer.
3.  Unit Tests pass (100%).
4.  No P0/P1 bugs open.
5.  Performance targets (FPS, Memory) are met in the Profiler.

## 11. Next Steps

1.  **Approve** this plan.
2.  **Kickoff** Phase 0 (INF-01 to INF-04) immediately.
3.  **Assign** Art team to produce placeholder assets (grey boxes) matching `quantified-spec` constraints.
4.  **Setup** CI/CD pipeline for `AssetChecker` and Unit Tests.

---
*Document End. All implementation tasks are planned, not executed. Code changes are pending start of development phase.*
