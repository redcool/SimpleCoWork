# QA Report: Brotato-3D Development Layer v_1

**Document ID:** `QA-BR3D-DEV-V1-001`
**Status:** **FAIL** – Major Discrepancies Detected
**Date:** 2026-10-15
**Reviewer:** Agnes-3.0-flash (QA Layer)
**Scope:** `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\development\v_1`

## 1. Executive Summary

The QA review of the Development Layer (`v_1`) documents reveals **critical inconsistencies** between the English and Chinese implementation plans and change lists. While the architectural intent is clear, the conflicting definitions of core gameplay mechanics (Real-time vs. Turn-based/Grid) create a blocking risk for engineering execution.

**Verdict:** The current document set is **not ready for handoff** to the Implementation Phase. The "Turn-Based" vs "Real-Time" conflict must be resolved before development begins, as it dictates the entire state machine and AI architecture.

## 2. Consistency & Conflict Analysis

### 2.1 Critical Conflict: Combat Model (High Severity)
The documents present contradictory mechanics for the core gameplay loop.

| Feature | `implementation-plan.en.md` | `implementation-plan.zh.md` | `change-list.zh.md` | QA Observation |
| :--- | :--- | :--- | :--- | :--- |
| **Combat Model** | **Real-Time** Auto-Shooter | **Turn-Based / Wave-based** (回合制/波次制) | **Real-Time** (Explicitly notes conflict with EN draft) | **CONFLICT.** EN plan explicitly deprecates "Turn-Based" as a mistranslation. ZH plan validates it as a fact. Engineers cannot build two different state machines. |
| **Movement** | Free-Move (WASD + Gravity) | Grid System (`15x15` assumed) | Grid System (`12x12` mentioned in arch draft) | **CONFLICT.** Free-move kinematic controller vs. Grid-based pathfinding. |
| **AI Update** | Every Frame / Continuous | Every Turn / Per 0.1s | Every Turn / Per 0.1s | **CONFLICT.** Determines CPU load budget and `Update` vs `FixedUpdate` logic. |

**Impact:** If the ZH document is followed, the `EnemySpawner` and `PlayerController` modules in the EN plan are invalid. If EN is followed, the `GridSystem` task (T-102 in ZH plan) is unnecessary and blocking.

### 2.2 Minor Inconsistencies (Low/Medium Severity)

*   **Asset Constraints:**
    *   `change-list.en.md`: Player Mesh < 5,000 Tris.
    *   `implementation-plan.zh.md`: Player Mesh < 5,000 Tris.
    *   `implementation-plan.en.md`: No explicit mesh limit mentioned in Phase 3 tasks, but references `quantified-spec`.
    *   **QA Note:** Consistent, but `implementation-plan.en.md` lacks the explicit "Asset Linter" gate mentioned in ZH.
*   **Audio Levels:**
    *   `change-list.en.md`: -14 LUFS.
    *   `implementation-plan.zh.md`: -14 LUFS ± 1 LU.
    *   **QA Note:** Consistent.
*   **Save/Load:**
    *   `change-list.en.md`: JSON Serialization.
    *   `implementation-plan.zh.md`: JSON/CSV.
    *   **QA Note:** Consistent for v1.

### 2.3 Missing Information
*   **Risk Register (EN/ZH):** The `risk-register.zh.md` was not fully provided in the input. The EN version was truncated. QA cannot verify if the "Combat Model Conflict" is logged as a formal risk in the register.
*   **Versioning:** `layer-manifest.json` lists `implementation-plan.zh.md` and `.en.md`, but the `change-list` documents reference `architecture.en.md` as the source of truth for "Real-Time". The ZH plan references `architecture.zh.md` which allegedly contained "Turn-Based" drafts. The current manifest does not list `architecture.md` in the output files, suggesting it is an upstream input, but the conflict persists in the *current* deliverables.

## 3. Fact vs. Assumption Audit

QA verifies the classification of decisions as "Fact" (derived from Requirements) vs. "Assumption" (derived by Engineering).

| Item | Classification in Docs | QA Verification | Status |
| :--- | :--- | :--- | :--- |
| **Engine: Unity 2022 LTS** | Assumption | **VALID ASSUMPTION.** No requirement mandates a specific engine. Unity is a standard choice. | ✅ Pass |
| **Physics: Kinematic Player** | Assumption | **VALID ASSUMPTION.** Justified to prevent jitter. | ✅ Pass |
| **Combat: Real-Time** | Fact (EN Plan) | **INVALID FACT.** The Requirements (upstream) likely did not specify "Real-Time" vs "Turn-Based" so strongly that two L3 docs disagree. This should be an **Assumption** pending clarification, or a **Fact** if `requirements/v_2` explicitly stated "Real-Time". | ⚠️ Dispute |
| **Grid: 15x15** | Assumption (ZH Plan) | **INVALID ASSUMPTION.** A grid size is an arbitrary detail not derivable from general "Wave-Based" requirements. This appears to be a hallucinated or over-specific constraint. | ❌ Fail |
| **Projectiles: 12.0 m/s** | Fact | **VALID FACT.** Derived from `quantified-spec`. | ✅ Pass |

## 4. Acceptance Criteria & Evidence Gaps

### 4.1 Testability of Acceptance Criteria
The `implementation-plan.en.md` provides quantified acceptance criteria (e.g., "0 GC Allocs", "150 ± 5 enemies"). These are **PASS** for QA testability.

The `implementation-plan.zh.md` provides some quantified criteria but includes vague ones:
*   **Task T-102 (ZH):** "Grid collision detection precision error < 0.01 units."
    *   **QA Comment:** Grid collisions are binary (in/out). "Precision error" is not a standard metric for grid systems. This criterion is **unmeasurable** as written.
*   **Task T-402 (ZH):** "Stress test (500 enemies) FPS ≥ 45."
    *   **QA Comment:** Conflicts with `change-list.en.md` which targets **60 FPS** on min-spec. 45 FPS is a fallback threshold, not the target. The plan must clarify if 45 FPS is a "minimum viable" or the "target."

### 4.2 Evidence of "No Code Change"
All documents correctly state that **no code has been written**.
*   `change-list.en.md`: "No Code Generated... No source code... have been created."
*   `implementation-plan.zh.md`: "Status: Pending Review."
*   **QA Status:** **PASS.** No violation of the "no code" constraint.

## 5. Risk Register Validation

Based on the visible portions of `risk-register.en.md` and `change-list.zh.md` (Section 6):

*   **Risk R-01 (Physics Jitter):** Mitigated by Kinematic movement. **Valid.**
*   **Risk R-04 (Combat Mode Conflict):**
    *   `change-list.zh.md` explicitly flags this: *"Immediate review confirmation required... Current document assumes Real-Time... If Turn-Based is confirmed, M04 & M05 must be refactored."*
    *   **QA Finding:** This risk is **ACTIVE** and **BLOCKING**. The `implementation-plan.en.md` dismisses the ZH "Turn-Based" view as a "mistranslation," while the ZH plan treats it as a "Fact." The QA layer cannot accept a plan where the two primary language documents disagree on the core loop without a decision record from the Product/Requirements layer.

## 6. Recommendations & Action Items

To move from "Pending Review" to "Ready for Implementation," the following actions are required:

1.  **Resolve Combat Model (BLOCKER):**
    *   The Product/Requirements owner must issue a **Decision Record** confirming whether the game is **Real-Time** or **Turn-Based**.
    *   *Likely Resolution:* Given "Auto-Shooter" and "Roll" mechanics, **Real-Time** is more probable. The ZH document likely contains a mistranslation of "Wave-Based" as "Turn-Based" (回合制).
    *   **Action:** Update `implementation-plan.zh.md` to remove "Turn-Based" and "Grid System" tasks (T-102, T-204 AI pathfinding changes).

2.  **Standardize Performance Targets:**
    *   Align `implementation-plan.zh.md` Task T-402 with `change-list.en.md`. The target is 60 FPS. 45 FPS should be listed as a "Performance Floor" for low-end devices, not the primary target.

3.  **Refine Grid Metrics:**
    *   If the decision is Real-Time, delete all references to `GridSystem` and `15x15` grids.
    *   If the decision is Turn-Based, rewrite `implementation-plan.en.md` to include Grid logic and deprecate "Free-Move WASD" tasks.

4.  **Update Risk Register:**
    *   Ensure `risk-register.zh.md` includes R-04 (Combat Model Ambiguity) with a **High** probability and **High** impact rating.

## 7. Final QA Conclusion

**Result:** **FAIL**

**Reason:** The Development Layer documents contain unresolved, high-severity conflicts between the English and Chinese implementation plans regarding core mechanics (Real-Time vs. Turn-Based/Grid). While individual documents are well-structured, they cannot serve as a unified instruction set for engineering teams without a formal resolution of the combat model ambiguity.

**Next Step:** Return to Product/Design for clarification on "Wave-Based" vs "Turn-Based" semantics. Upon receipt of a single source of truth, regenerate `implementation-plan.zh.md` to match `implementation-plan.en.md`.
