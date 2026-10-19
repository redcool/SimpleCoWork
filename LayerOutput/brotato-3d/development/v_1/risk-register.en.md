# Risk Register: Brotato-3D (Engineering Layer v_1)

**Document:** `risk-register.md`
**Input Source:** `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1`
**Status:** Draft for Review
**Author:** Planning Group Lead
**Date:** 2026-10-15 (Based on manifest timestamp)

## 1. Scope & Methodology
This risk register consolidates potential threats to schedule, quality, and performance derived from the `architecture.en.md`, `quantified-spec.en.md`, and `task-breakdown.en.md` files. Risks are categorized by **Technical**, **Design**, and **Process**.

*   **Confidence Levels:**
    *   **High:** Explicitly stated in input files as a concern or assumption.
    *   **Medium:** Inferred from technical constraints vs. stated performance targets.
    *   **Low:** Peripheral or minor impact.
*   **Status:** All items are identified *before* development. No code has been written.

## 2. Risk Matrix

### 2.1 Technical Risks

| ID | Risk Description | Type | Likelihood | Impact | Current Mitigation (From Inputs) | Verification / Acceptance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TR-01** | **Physics Jitter in 3D Combat:** Relying on Unity's default `Rigidbody` for high-frequency collision detection (projectiles/enemies) may cause visual jitter or physics tunneling. <br>*(Source: architecture.en.md §8)* | Technical | High | High | **Assumption A1:** Implement custom kinematic movement for player. Use `CharacterController` if physics unstable. <br>**Action:** Profile physics step in Week 1. | **Acceptance:** No visible jitter in gameplay video at 60 FPS. Physics simulation time < 5ms (per quantified-spec.zh.md §3.1). |
| **TR-02** | **Performance Budget Exceeded (500 Enemies):** Target of 500 concurrent enemies may violate the 60 FPS target on mid-range hardware due to AI and Draw Call overhead. <br>*(Source: quantified-spec.en.md §7, R-01)* | Technical | High | High | **Assumption:** Implement LOD (Level of Detail). LOD0 (0-15m), LOD1 (15-30m), LOD2 (30m+). GPU culling. <br>**Action:** Stress test with 500 dummy entities in Week 2. | **Acceptance:** 500 enemies visible on screen. FPS $\ge$ 45 on GTX 1650/M1 (per quantified-spec.zh.md §2.2). Draw Calls < 100. |
| **TR-03** | **GC Allocation Spikes:** Frequent spawning of projectiles and enemies causes Garbage Collection pauses, breaking the "zero GC in main loop" rule. <br>*(Source: architecture.en.md §7)* | Technical | Medium | High | **Mandate:** Use Object Pooling for all high-frequency objects (projectiles, enemies, VFX). <br>**Action:** Code review checklist to ban `new` in `Update`/`FixedUpdate`. | **Acceptance:** Profiler trace shows steady-state GC Alloc < 1 MB/s (per quantified-spec.zh.md §3.1). Zero GC spikes in main update loop. |
| **TR-04** | **Asset Pipeline Inconsistency:** Naming conventions for VFX/Models not enforced, leading to broken references in Prefab Factory (M06). <br>*(Source: architecture.en.md §8)* | Technical | Medium | Medium | **Mandate:** Enforce naming via Linter/Editor Script. <br>**Action:** Create `AssetValidator` tool in Week 1. | **Acceptance:** CI/CD build fails if any asset name violates `asset-spec.en.md` conventions. Zero broken prefab references. |
| **TR-05** | **UI Framework Limitation:** UGUI may not perform well for high-frequency HUD updates (e.g., damage numbers) or handle 3D overlay complexity. <br>*(Source: architecture.en.md §8)* | Technical | Low | Medium | **Assumption A2:** Start with UGUI. Evaluate UI Toolkit if performance fails. <br>**Action:** Prototype HUD in UGUI; benchmark 100+ simultaneous damage numbers. | **Acceptance:** UI update latency < 10ms. No dropped frames when 50+ damage numbers active. |

### 2.2 Design & Balance Risks

| ID | Risk Description | Type | Likelihood | Impact | Current Mitigation (From Inputs) | Verification / Acceptance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DR-01** | **Damage Falloff Configuration:** The "10m linear falloff" (100% -> 0%) is an assumption. If gameplay feels too weak/strong, re-balancing is hard-coded. <br>*(Source: quantified-spec.en.md §7, A-02)* | Design | High | Medium | **Mandate:** Implement as `public float damageRange = 10.0f;` in ScriptableObject. Data-driven. <br>**Action:** Expose variables in Editor for quick tuning. | **Acceptance:** Changing `damageRange` in config file/Scene changes gameplay behavior without code compilation. |
| **DR-02** | **Turn-Based vs. Real-Time Mismatch:** `architecture.zh.md` assumes Turn-Based (Brotato core), while `architecture.en.md` describes Real-Time Auto-Shooter mechanics (Shot frequency, rotation speed). This is a critical conflict. <br>*(Source: Comparison of arch.zh §2.1 vs arch.en §2.1)* | Design | **Critical** | **Critical** | **Immediate Action:** **Clarify core loop.** Does Brotato-3D keep the turn-based tactic or switch to real-time auto-shooter? <br>**Assumption:** `quantified-spec.en.md` leans Real-Time (Shot Frequency). `quantified-spec.zh.md` leans Turn-Based (Round Duration). | **Acceptance:** Design Review must sign off on **single** combat model. Spec documents must be unified. No "hybrid" without explicit FSM definition. |
| **DR-03** | **Combo Logic Complexity:** "Tag-based" combo system may lead to combinatorial explosion in balancing. <br>*(Source: architecture.zh.md §5)* | Design | Medium | Medium | **Mandate:** Use Tag system, not hardcoded pairs. <br>**Action:** Limit initial Tag set to 5-7 categories. | **Acceptance:** Adding a new enemy Tag does not require code changes, only config updates. |

### 2.3 Process & Management Risks

| ID | Risk Description | Type | Likelihood | Impact | Current Mitigation (From Inputs) | Verification / Acceptance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PR-01** | **Assumption Gap (Engine Choice):** `layer-manifest.json` does not explicitly force Unity, though inputs assume it. If team switches to Unreal, architecture layers remain but API calls differ. <br>*(Source: architecture.zh.md §0.3 A1)* | Process | Low | High | **Assumption:** Unity 2021 LTS+. <br>**Action:** Confirm engine selection in Team Sync #1. | **Acceptance:** `layer-manifest.json` updated to specify Engine Version. All code snippets use Unity-specific syntax. |
| **PR-02** | **Scope Creep on "Meta Loop":** Progression system (save/load, upgrades) may expand scope beyond "Core Gameplay Loop." <br>*(Source: architecture.zh.md §2.4)* | Process | Medium | Medium | **Mandate:** v_1/v_2 focus on "In-Run" logic. "Meta" persistence is Phase 2. <br>**Action:** Isolate `SaveSystem` interface now, implement stub later. | **Acceptance:** In-Run loop works end-to-end without save/load functionality. Stub returns hardcoded data. |
| **PR-03** | **Test Coverage Gap:** No automated tests for "Visual Regression" in code. <br>*(Source: quantified-spec.en.md §6.2)* | Process | Medium | Low | **Mandate:** Manual QA checklist required for visual SSIM. <br>**Action:** Define baseline screenshots (`ui_baseline.png`) in Week 1. | **Acceptance:** QA report includes SSIM score $\ge$ 0.95 for critical UI states. |

## 3. Critical Path & Watchlist

### 3.1 Immediate Actions (Week 1)
1.  **Resolve DR-01 (Combat Model Conflict):**
    *   **Fact:** `architecture.en.md` describes a real-time auto-shooter (0.8s cooldown).
    *   **Fact:** `architecture.zh.md` describes a turn-based tactical grid.
    *   **Decision:** Must select one. If Real-Time is chosen, `architecture.zh.md` §2.1 is obsolete. If Turn-Based is chosen, `quantified-spec.en.md` §2.1 is obsolete.
    *   **Owner:** Lead Designer + Tech Lead.
2.  **Prototype Event Bus & Object Pool:**
    *   **Goal:** Validate that decoupling M04 (Combat) from M08 (Audio) and M07 (UI) works without logic bloat.
    *   **Evidence:** Code review of `GameEvent.cs` and `ObjectPoolManager.cs`.

### 3.2 Performance Gates (Week 2-3)
1.  **500 Enemy Stress Test:**
    *   Create a test scene spawning 500 basic enemy prefabs.
    *   Run for 30 minutes.
    *   **Pass Criteria:** Memory leak = 0. FPS drop < 10%. CPU usage < 40% single core.
2.  **Asset Audit:**
    *   Run `AssetChecker.exe` on initial 10 assets.
    *   **Pass Criteria:** 0 errors in naming/tri-count.

## 4. Assumption Register (Consolidated)

*   **A1:** Engine is **Unity 2021 LTS+**. (Status: **Unverified**)
*   **A2:** Combat is **Real-Time** based on `quantified-spec.en.md` priority, OR **Turn-Based** based on `architecture.zh.md`. (Status: **CONFLICTED - Needs Resolution**)
*   **A3:** Target Platform is **PC (Steam)**. Mobile support is secondary. (Status: **Assumed**)
*   **A4:** Max concurrent entities is **500**. (Status: **Assumed - High Risk**)
*   **A5:** Save Data uses **JSON**. (Status: **Assumed**)

## 5. Change Control

Any new risk identified during development must be added to this register with:
1.  **ID:** `TR-xx` or `DR-xx`.
2.  **Owner:** Person responsible for mitigation.
3.  **Status:** Open / Mitigating / Closed.

*Document generated by Agnes-3.0-flash. No code changes made. Ready for Engineering Lead review.*
