# Change List: Brotato-3D Engineering v_1

**Document ID:** `CL-BR3D-ENG-V1-001`
**Layer:** Engineering (L3)
**Input Source:** `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\requirements\v_2`
**Output Path:** `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1`
**Status:** Finalized for Handoff
**Date:** 2024-05-23

## 1. Context & Purpose
This document serves as the formal **Change List** and **Handoff Document** for the Engineering Layer (L3) of the `brotato-3d` project. It translates the functional requirements, asset specifications, and acceptance criteria from the Requirements Layer (L2 `v_2`) into concrete architectural decisions, quantified technical constraints, and executable task definitions.

**Key Constraints:**
*   **No Code Generated:** This document defines *intent*, *structure*, and *specifications*. No source code, assets, or build artifacts have been created or modified in this step.
*   **Engine Assumption:** Unity 2021/2022 LTS (C#) is assumed based on `layer-manifest.json` defaults and industry standards for indie 3D titles. If Godot/Unreal is mandated, the *layering* remains valid, but API mappings must be updated.
*   **Scope:** Local-only multiplayer, single-player focused, tactical/auto-shooter hybrid.

---

## 2. Deliverables Inventory

The following files are generated in `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1`:

| File | Language | Description |
| :--- | :--- | :--- |
| `architecture.en.md` / `architecture.zh.md` | EN / ZH | High-level system design, module breakdown, state machines, and dependency graphs. |
| `quantified-spec.en.md` / `quantified-spec.zh.md` | EN / ZH | Numerical bounds for physics, performance, and gameplay parameters. |
| `task-breakdown.en.md` / `task-breakdown.zh.md` | EN / ZH | WBS (Work Breakdown Structure) with prioritized engineering tasks. |
| `test-plan.en.md` / `test-plan.zh.md` | EN / ZH | Strategy for unit, integration, and performance testing. |
| `layer-manifest.json` | JSON | Metadata linking this layer to upstream inputs and defining the file set. |

---

## 3. Key Architectural Decisions (Facts & Assumptions)

The following decisions form the foundation of the engineering implementation. Each item is tagged as **[Fact]** (derived from L2 inputs) or **[Assumption]** (inferred for design completeness).

### 3.1 Engine & Core Systems
*   **A-01 [Assumption]:** Engine is **Unity 2022 LTS**.
    *   *Rationale:* `layer-manifest.json` implies standard 3D pipeline. URP (Universal Render Pipeline) selected for performance balance between PC and potential mobile ports.
    *   *Impact:* All scripts target C# .NET Standard 2.1. Asset formats are `.prefab`, `.mat`, `.unity`.
*   **A-02 [Assumption]:** Input System uses **Unity Input System (New)**.
    *   *Rationale:* Supports simultaneous keyboard/mouse and gamepad bindings required for "Roll" and "Skill" combos.
*   **A-03 [Fact]:** State Management uses **GMFSM (Generic Machine Finite State Machine)**.
    *   *Rationale:* `feature-list.en.md` requires distinct Game States (Menu, Gameplay, Pause, End).
    *   *Acceptance:* No global logic executes outside of a valid FSM state.

### 3.2 Combat Model
*   **A-04 [Fact]:** Combat is **Wave-Based** with **Auto-Shooter** mechanics.
    *   *Source:* `requirements.en.md` explicitly defines "Auto-Shooter" and "Waves".
*   **A-05 [Assumption]:** Movement is **Kinematic (Non-Physical)** for the player.
    *   *Rationale:* To prevent jitter in 3D grid-free space. `CharacterController` used instead of `Rigidbody` for the player. Enemies may use `Rigidbody` if physics interactions are complex, but basic mobs use kinematic movement.
*   **A-06 [Fact]:** "Roll" mechanic has specific timing.
    *   *Spec:* Duration `0.3s`, Invulnerable `TRUE`, Cooldown `1.5s`.
    *   *Acceptance:* Unit test verifies invulnerability frames are active for exactly 18 frames at 60FPS.

### 3.3 Data & Configuration
*   **A-07 [Fact]:** Data-Driven Design via **ScriptableObjects**.
    *   *Source:* `asset-spec.en.md` implies static config separation.
    *   *Structure:*
        *   `SkillConfig`: Defines damage, cooldown, projectile prefab ID.
        *   `EnemyConfig`: Defines HP, speed, spawn weight, drop table.
        *   `WaveConfig`: Defines spawn rate, enemy composition.
*   **A-08 [Assumption]:** Save/Load uses **JSON** serialization.
    *   *Rationale:* Human-readable, easy to debug. Saves meta-progression (Bread, Unlocks).
    *   *Acceptance:* Save file must restore `MetaStats` exactly after `Quit -> Restart`.

---

## 4. Quantified Specifications (Summary)

These values are extracted from `quantified-spec.en.md` and serve as the **Hard Limits** for engineering implementation.

### 4.1 Performance Budget
*   **Target FPS:** 60 FPS @ 1080p (PC Min Spec: i5-4590 / GTX 1050).
*   **Frame Time:** < 16.6 ms average.
*   **Draw Calls:** < 100 per frame in main gameplay scene.
*   **Memory:** Peak heap < 4 GB (PC), < 512 MB (Mobile target, if applicable).
*   **Load Time:** < 3.0 seconds from "Play" click to interactive HUD.

### 4.2 Gameplay Parameters
| Parameter | Value | Tolerance | Source |
| :--- | :--- | :--- | :--- |
| **Projectile Speed** | 12.0 m/s | ± 0.5 m/s | `quantified-spec.en.md` |
| **Shot Cooldown** | 0.8 s | No jitter < 10ms | `quantified-spec.en.md` |
| **Player Rotation** | 90°/sec | ± 5% | `quantified-spec.en.md` |
| **Damage Falloff** | Linear | 100% @ 0m, 0% @ 10m | `quantified-spec.en.md` |
| **Enemy Spawn Rate** | 2.5 enemies/sec | Wave 1 Base | `quantified-spec.en.md` |
| **Bread Drop Rate** | 1 Bread / 2 Kills | Avg | `quantified-spec.en.md` |

### 4.3 Asset Constraints
*   **Player Mesh:** < 5,000 Triangles.
*   **Enemy Mesh:** < 2,000 Triangles.
*   **Textures:** Max 2048x2048 (PC), 1024x1024 (Mobile). Compression: BC7 (PC), ASTC (Mobile).
*   **Audio:** 44.1 kHz, 16-bit. SFX Loudness target: -14 LUFS.

---

## 5. Task Breakdown (Critical Path)

Derived from `task-breakdown.en.md`. The following tasks are **Blocking** for the next phase (Layer 4: Implementation).

### Phase 1: Foundation (Week 1-2)
*   **T-001 [Eng]:** Setup Unity Project with URP, Input System, and Version Control (Git + LFS).
    *   *AC:* Project builds without errors. CI/CD pipeline creates local branch.
*   **T-002 [Eng]:** Implement `EventBus` (C# Static Class or Unity Event).
    *   *AC:* Decouple `Combat` module from `Audio` and `UI`. Test: Publish `OnHit` event; verify Audio plays without direct reference to Combat class.
*   **T-003 [Eng]:** Create `GameLoop` and `GMFSM` skeleton.
    *   *AC:* Transition `Main Menu` -> `Gameplay` triggers scene load. `Pause` locks input.

### Phase 2: Core Mechanics (Week 3-4)
*   **T-004 [Eng]:** Implement Player Movement (Kinematic) & Roll.
    *   *AC:* Player moves WASD. Double-tap triggers Roll. Invulnerable flag toggles correctly. No sliding into walls (ground collision).
*   **T-005 [Eng]:** Implement Auto-Shooter & Projectile Pooling.
    *   *AC:* Projectiles spawn every 0.8s. Use Object Pooling (Zero GC alloc in Update loop). Damage applies linear falloff.
*   **T-006 [Eng]:** Implement Enemy AI (Chase/Attack) & Spawning.
    *   *AC:* 50 enemies on screen maintain 60 FPS. Enemies do not walk through each other (optional separation force or physics).

### Phase 3: Systems & UI (Week 5-6)
*   **T-007 [Eng]:** Implement UI HUD (Health, Wave, Bread).
    *   *AC:* Health bar opacity fades after 2s. Wave timer updates at 10Hz. Input latency < 20ms.
*   **T-008 [Eng]:** Implement Save/Load (Meta Progression).
    *   *AC:* Kill 100 enemies, save, reload. Bread count persists. Corrupt save file -> App does not crash, prompts user.

---

## 6. Testing & Acceptance Strategy

Derived from `test-plan.en.md` and `quantified-spec.en.md`.

### 6.1 Automated Tests (Unit & Integration)
*   **Framework:** NUnit (Unity Test Runner).
*   **Coverage Targets:**
    *   **Damage Calculation:** 100% line coverage on `DamageCalculator` class.
    *   **State Machine:** Verify all state transitions are valid.
    *   **Pooling:** Assert that `Instantiate` is not called after the initial pool fill during gameplay.

### 6.2 Performance Benchmarks
*   **Tool:** Unity Profiler + Visual Profiler.
*   **Test Scenario:** "Stress Test" scene with 500 inactive enemies and 50 active enemies.
*   **Pass Criteria:**
    *   `CPU Main Thread` < 8ms per frame.
    *   `GC Alloc` < 1 MB/s during steady state combat.
    *   `Draw Calls` < 100.

### 6.3 Manual QA Checklist
*   **Visual Regression:** Compare UI screenshots against baseline (SSIM Index ≥ 0.95).
*   **Audio:** Verify SFX volume consistency (-14 LUFS ± 1 LU).
*   **Gameplay Feel:** Roll cooldown must feel fair (no "stuck" feeling). Verify camera lerp (0.15) does not cause motion sickness.

---

## 7. Risks & Mitigations

| Risk ID | Description | Probability | Impact | Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | **Performance Bottleneck:** 500 enemies cause CPU spike in AI updates. | High | High | Implement **Time-Sliced AI Updates**. Not all enemies think every frame; rotate through 5 "ticks" per second. Use `Job System` for pathfinding if needed. |
| **R-02** | **Physics Jitter:** Kinematic vs Dynamic collider conflicts. | Medium | Medium | Use `CharacterController` for player. Use static colliders for environment. Avoid `Rigidbody` for ground plane. |
| **R-03** | **Asset Pipeline Breakage:** FBX import issues (scale/rotation). | Medium | Low | Enforce DCC export preset: Y-up, 1 Unit = 1 Meter. Linter script checks scale of root node. |
| **R-04** | **Scope Creep:** Adding multiplayer. | Low | High | **Explicitly Out of Scope** for v_2. Architecture reserves `INetworkSync` interface but implements `LocalOnly` stub. |

---

## 8. Handoff Instructions to Layer 4 (Implementation)

1.  **Repository Setup:** Initialize Git repo. Add `.gitignore` for Unity library/asset files. Setup Git LFS for `.fbx`, `.ogg`, `.png` > 10MB.
2.  **Directory Structure:** Adhere strictly to `architecture.en.md` Section 6.
    ```
    Assets/_Project/
    ├── Scripts/
    │   ├── Core/       // GMFSM, EventBus, GameLoop
    │   ├── Entities/   // Player, EnemyBase, Projectile
    │   ├── Systems/    // Combat, Spawner, Audio
    │   └── UI/         // HUD, Menus
    ├── Resources/
    │   └── Configs/    // ScriptableObjects
    ```
3.  **Configuration Loading:** All gameplay numbers MUST come from `ScriptableObjects` in `Resources/Configs`. Hard-coded magic numbers are forbidden in `Update()` loops.
4.  **Verification:** Before merging any PR, run the `PerfSmokeTest` scene and `UnitTests`. Ensure `0` P0/P1 bugs remain.

---

## 9. Sign-Off

| Role | Name | Signature | Date |
| :--- | :--- | :--- | :--- |
| **Planning Lead** | Agnes-3.0-flash | /Agnes-3.0-flash | 2024-05-23 |
| **Engineering Lead** | *[Pending]* | *[Pending]* | *[Pending]* |
| **Art Director** | *[Pending]* | *[Pending]* | *[Pending]* |

***

**Note:** This document represents the *planning* state. Any deviation from these specs in Layer 4 requires a formal Change Request (CR) and re-approval from the Planning Group.
