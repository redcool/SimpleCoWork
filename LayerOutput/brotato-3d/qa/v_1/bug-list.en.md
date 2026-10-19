# Bug List: Brotato-3D Engineering Layer v_1

**Document ID**: `BL-BR3D-ENG-V1-001`
**Layer**: QA/Development Review
**Input Source**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\engineering\v_1`
**Status**: Pending Resolution
**Date**: 2026-10-15

## 1. Context & Scope

This document catalogs defects, inconsistencies, and ambiguities identified within the Engineering Layer (v_1) documentation for the `brotato-3d` project. The review focuses on the consistency between `change-list`, `implementation-plan`, and `risk-register` files across both English (`en`) and Chinese (`zh`) versions.

**Key Findings Summary:**
*   **Critical Inconsistency:** Conflict between "Real-Time" vs. "Turn-Based" (Wave-based) combat models between EN and ZH documents.
*   **Version Discrepancies:** Mismatched Unity LTS versions and document dates across files.
*   **Ambiguity:** Conflicting spatial definitions (Grid-based vs. Free-Move 3D plane).
*   **Missing Data:** Truncated risk register prevents full verification of risk mitigations.

---

## 2. Bug Log

### Category 1: Architectural & Logic Conflicts

#### BUG-001: Combat Model Inconsistency (Real-Time vs. Turn-Based)
*   **Severity:** High
*   **Type:** Logical Inconsistency / Cross-Document Conflict
*   **Location:**
    *   `implementation-plan.en.md` §1 (Key Inputs & Critical Clarifications)
    *   `implementation-plan.zh.md` §1.2 (Key Facts & Assumptions)
    *   `change-list.zh.md` §1 (ADR-02)
*   **Description:**
    *   **EN View:** `implementation-plan.en.md` explicitly resolves a conflict by adopting a **Real-Time Auto-Shooter** model. It notes that "Turn-Based" references in the Chinese spec are likely mistranslations or misinterpretations of "Wave-Based".
    *   **ZH View:** `implementation-plan.zh.md` lists "Combat Mode is **Turn-Based/Wave-based (Wave-based)**" as a **Fact** derived from `task-breakdown`. `change-list.zh.md` (ADR-02) flags this as a conflict, noting `architecture.en.md` defines real-time projectile systems, but claims the "Turn-Based" reference in ZH drafts is a conflicting assumption.
    *   **Impact:** Developers may implement conflicting state machines and update loops. Real-time requires delta-time movement; Turn-based requires discrete steps. This is a blocking architectural decision.
*   **Evidence:**
    *   `implementation-plan.en.md`: *"Decision: We adopt the Real-Time Auto-Shooter model... The 'Turn-Based' reference in the Chinese spec is likely a mistranslation..."*
    *   `implementation-plan.zh.md`: *"战斗模式为 回合制/波次制 (Wave-based)，基于 task-breakdown 中的 PC-2。"* (Listed as Fact)
*   **Expected Behavior:** A single, unified combat model definition in the canonical English specification, with the Chinese translation aligned.
*   **Action Required:** Confirm with Game Design whether the core loop is strictly real-time (Brotato-like) or includes a tactical turn-based mode. Update `implementation-plan.zh.md` to reflect the confirmed model.

#### BUG-002: Spatial Movement Model Conflict (Grid vs. Free-Move)
*   **Severity:** High
*   **Type:** Architectural Ambiguity
*   **Location:**
    *   `implementation-plan.en.md` §1 (Critical Clarifications)
    *   `implementation-plan.zh.md` §1.2 (Assumptions)
*   **Description:**
    *   `implementation-plan.en.md` states: *"Grid vs. Free-Move... Decision: We adopt Free-Move Real-Time combat on a flat 2D plane... The Grid system is deprecated for v_1."*
    *   `implementation-plan.zh.md` lists assumption **A-Grid**: *"Ground grid size assumed to be 15x15, needs confirmation with Art at M1."*
    *   `change-list.zh.md` (Module M03) mentions *"Grid collision detection accuracy < 0.01 units"* in task T-102 acceptance criteria.
    *   **Impact:** Implementing a grid system (`GridSystem`) contradicts the kinematic free-movement controller described in the EN plan. If `GridSystem` is implemented, it becomes unnecessary overhead or causes collision logic errors in free-movement.
*   **Evidence:**
    *   `implementation-plan.en.md`: *"The Grid system is deprecated for v_1..."*
    *   `implementation-plan.zh.md` Task T-102: *"Implement BaseActor and GridSystem... Grid collision detection accuracy..."*
*   **Expected Behavior:** Removal of `GridSystem` tasks and dependencies from the implementation plan if free-movement is confirmed.
*   **Action Required:** Strike `GridSystem` from `implementation-plan.zh.md` tasks and risk registers. Align with the "Free-Move" decision in `implementation-plan.en.md`.

---

### Category 2: Data & Configuration Inconsistencies

#### BUG-003: Unity Engine Version Mismatch
*   **Severity:** Medium
*   **Type:** Technical Inconsistency
*   **Location:**
    *   `change-list.en.md` §3.1 (ADR-01)
    *   `implementation-plan.en.md` §1 (Key Inputs)
    *   `implementation-plan.zh.md` §1.2 (Assumptions)
*   **Description:**
    *   `change-list.en.md` assumes **Unity 2022 LTS**.
    *   `implementation-plan.en.md` accepts **Unity 2021/2022 LTS** as fact.
    *   `implementation-plan.zh.md` assumes **Unity 2022 LTS** but notes if 2021 is used, API adaptation is needed.
    *   **Impact:** Minor. 2021 and 2022 have different C# backend defaults (.NET Framework vs. .NET Standard 2.1). Mixing versions in the pipeline could cause compilation errors.
*   **Evidence:**
    *   `change-list.en.md`: *"All scripts target C# .NET Standard 2.1."* (Specific to 2022+)
    *   `implementation-plan.en.md`: *"Fact derived from architecture.en.md (Unity 2021/2022 LTS, C#)."*
*   **Expected Behavior:** A single pinned engine version (e.g., Unity 2022.3 LTS) for the entire project to ensure .NET Standard 2.1 compatibility and URP stability.
*   **Action Required:** Define the exact engine version number in `layer-manifest.json` or a dedicated `tech-spec` file.

#### BUG-004: Document Date Inconsistencies
*   **Severity:** Low
*   **Type:** Metadata Error
*   **Location:**
    *   `change-list.en.md`: Date `2024-05-23`
    *   `implementation-plan.en.md`: Date `2023-10-27`
    *   `implementation-plan.zh.md`: Date `2026-10-15`
    *   `layer-manifest.json`: `createdAt` `2026-10-15`
*   **Description:**
    *   The `implementation-plan.en.md` is dated earlier (2023) than the `change-list.en.md` (2024) and significantly earlier than the current layer manifest (2026).
    *   **Impact:** Indicates the EN implementation plan is outdated or was generated from a stale source. The ZH implementation plan aligns with the current manifest date.
*   **Evidence:**
    *   `implementation-plan.en.md`: *"Date: 2023-10-27"*
    *   `layer-manifest.json`: *"createdAt: 2026-10-15"*
*   **Expected Behavior:** All documents in a single layer version (v_1) should have contemporary dates reflecting the last modification of that layer's output.
*   **Action Required:** Regenerate or update the header date in `implementation-plan.en.md` to match the current layer timestamp.

#### BUG-005: Asset Constraint Tolerance Mismatch
*   **Severity:** Low
*   **Type:** Specification Drift
*   **Location:**
    *   `change-list.en.md` §4.3
    *   `implementation-plan.zh.md` §4.1
*   **Description:**
    *   `change-list.en.md` states Enemy Mesh < 2,000 Triangles.
    *   `implementation-plan.zh.md` (Task T-403/Art) implicitly references 5,000 tris for Player, but the Enemy constraint is not explicitly re-stated with tolerance.
    *   More critically, `change-list.en.md` says *Player Mesh < 5,000 Tris*, while `implementation-plan.zh.md` Action Item 4 says *"Provide 1 low-poly player character (<=5000 tris)"*. This is consistent.
    *   However, `change-list.en.md` §4.2 lists **Projectile Speed 12.0 m/s ± 0.5**.
    *   `implementation-plan.zh.md` Task T-203 states *"Speed 12.0 m/s ± 0.5"*.
    *   **Check:** Are there conflicting tolerances? No direct conflict found in values, but the `change-list` cites `quantified-spec.en.md` as the source, while `implementation-plan.zh.md` cites `quantified-spec.md`. The ZH implementation plan does not explicitly link back to the EN quantified spec for validation, relying on "Quantified Spec" generically.
    *   **Correction:** No direct bug in values, but a **traceability gap**.
*   **Revised Finding:** **Traceability Gap**
    *   `implementation-plan.zh.md` does not cite specific section numbers from `quantified-spec.zh.md` or `quantified-spec.en.md` for its acceptance criteria (e.g., "Per `quantified-spec` §2.1"). It vaguely refers to "Quantified Spec".
*   **Action Required:** Add specific source references (e.g., `Ref: quantified-spec.en.md §2.1`) to acceptance criteria in `implementation-plan.zh.md`.

---

### Category 3: Missing & Truncated Content

#### BUG-006: Risk Register Truncation
*   **Severity:** Medium
*   **Type:** Incomplete Input
*   **Location:**
    *   `risk-register.en.md`
    *   `risk-register.zh.md`
*   **Description:**
    *   The input content for `risk-register.en.md` is truncated after the header. `risk-register.zh.md` was not read.
    *   The `implementation-plan` files reference risks (e.g., R-01 Physics Jitter, R-02 AI Performance). However, without the full risk register, we cannot verify if all identified risks in the implementation plan have corresponding mitigations in the risk register, or vice versa.
    *   **Impact:** QA cannot validate that all high-priority risks identified in the `implementation-plan` (e.g., R-04 Numerical Balance) are formally tracked in the `risk-register`.
*   **Evidence:**
    *   `implementation-plan.zh.md` lists Risks R-01 to R-04.
    *   `risk-register.en.md` content is unavailable beyond header.
*   **Action Required:** Complete the review once full `risk-register` files are provided. Verify 1:1 mapping between `implementation-plan` risk IDs and `risk-register` IDs.

#### BUG-007: Missing `test-plan` in Implementation Plan References
*   **Severity:** Low
*   **Type:** Reference Error
*   **Location:**
    *   `change-list.zh.md` §5
    *   `implementation-plan.en.md` §6
*   **Description:**
    *   `change-list.zh.md` states: *"Based on `test-plan` input (though not fully read, but inferred from `quantified-spec` and `architecture`)..."*
    *   `implementation-plan.en.md` references `test-plan.en.md` in Section 6 (Testing & Acceptance).
    *   However, the `layer-manifest.json` file list **does not include** `test-plan.en.md` or `test-plan.zh.md`.
    *   **Impact:** The implementation plan relies on a testing strategy document that is not part of the official layer deliverables list in the manifest. This suggests either the manifest is incomplete, or the implementation plan is hallucinating a source file.
*   **Evidence:**
    *   `layer-manifest.json` files: `["implementation-plan.zh.md", "implementation-plan.en.md", "change-list.zh.md", "change-list.en.md", "risk-register.zh.md", "risk-register.en.md"]`
    *   `implementation-plan.en.md` §6: *"Derived from `test-plan.en.md`..."*
*   **Action Required:** Add `test-plan.en.md` and `test-plan.zh.md` to the layer manifest, or remove references to them from the implementation plan if the testing strategy is embedded directly in the plan.

---

### Category 4: Implementation Specifics

#### BUG-008: Contradictory AI Update Frequency
*   **Severity:** Medium
*   **Type:** Technical Contradiction
*   **Location:**
    *   `implementation-plan.en.md` §4.2 (Task AI-02)
    *   `implementation-plan.zh.md` §3 (Task T-204)
*   **Description:**
    *   **EN Plan (AI-02):** Implicitly real-time. Enemy FSM updates per frame/step.
    *   **ZH Plan (T-204):** *"Pathfinding A* algorithm runs once per turn."* AND *"Risk R-02 Mitigation: 1. AI Pathfinding runs every turn, not every frame."*
    *   This directly correlates to BUG-001. If the game is Real-Time (EN), "every turn" is undefined. If the game is Turn-Based (ZH), the EN plan's "Chase at 3.0 m/s" is incompatible with discrete turn-based movement.
    *   **Impact:** AI code structure will be fundamentally different. `Update()` vs `OnTurnEnd()`.
*   **Action Required:** Resolve BUG-001 first. Then align AI implementation details (update frequency) between EN and ZH plans.

#### BUG-009: Input Latency Standard Discrepancy
*   **Severity:** Low
*   **Type:** Specification Conflict
*   **Location:**
    *   `change-list.en.md` §5 (T-007)
    *   `implementation-plan.zh.md` §3 (T-201, T-301)
*   **Description:**
    *   `change-list.en.md` T-007 AC: *"Input latency < 20ms."*
    *   `implementation-plan.zh.md` T-201 AC: *"Input latency < 20ms."*
    *   `implementation-plan.zh.md` T-301 AC: *"Visual regression test SSIM ≥ 0.95."* (No latency mentioned for UI in T-301, but T-P1-01 in `change-list.zh.md` says "Response delay < 20ms").
    *   **Consistency Check:** Values are consistent (20ms). However, `change-list.en.md` T-007 also mentions *"Wave timer updates at 10Hz"*. `implementation-plan.zh.md` T-301 mentions *"Wave timer update frequency 10Hz"*.
    *   **No Bug Found in Values.** However, the `change-list.en.md` T-004 mentions *"No sliding into walls"*, while `implementation-plan.en.md` MOV-01 states *"No Rigidbody used... to prevent physics jitter"*.
    *   **Potential Bug:** `change-list.en.md` §3.2 A-05 says *"Enemies may use Rigidbody... basic mobs use kinematic"*. `implementation-plan.en.md` AI-02 says *"Enemies chase and attack"*. It does not specify if enemies use Kinematic or Dynamic bodies. If enemies are Dynamic (Rigidbody) and Player is Kinematic (CharacterController), collision responses may be asymmetric or cause jitter if not configured correctly with `CharacterController` collision detection.
*   **Revised Finding:** **Missing Physics Configuration Detail**
    *   The plans specify the *type* of movement (Kinematic vs Rigidbody) but not the *collider settings* (e.g., `CharacterController` step offset, slope limit, or Rigidbody interpolation).
*   **Action Required:** Add specific physics configuration requirements (collider types, layer interactions) to the implementation plan tasks to prevent jitter bugs.

---

## 3. Acceptance Criteria for Bug Resolution

To close these bugs, the following must be verified in the next iteration (v_1.1 or fixed v_1):

1.  **BUG-001/002/008:** `implementation-plan.zh.md` must be updated to reflect the **Real-Time** decision if confirmed by Game Design. All "Turn-Based" and "Grid" references must be removed or explicitly marked as "Deprecated".
2.  **BUG-003:** A single engine version (Unity 2022.x) must be pinned in the `layer-manifest.json` or a new `technical-constraints.md` file.
3.  **BUG-004:** All document headers must use the same date (current layer date: 2026-10-15).
4.  **BUG-006/007:** The `layer-manifest.json` must include `test-plan.en/zh.md`. The `risk-register` files must be complete and non-truncated.
5.  **BUG-009:** Implementation tasks for Player/Enemy movement must include specific physics collider setup instructions (e.g., "Use CharacterController with step offset 0.5m").

## 4. Note on Code Changes

*  
