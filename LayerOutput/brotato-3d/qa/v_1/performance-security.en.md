# Performance & Security Review: Brotato-3D Engineering v_1

**Document ID:** `QA-BR3D-PERF-SEC-V1-001`
**Review Layer:** QA / Security
**Input Source:** `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\development\v_1`
**Subject Documents:** `change-list`, `implementation-plan`, `risk-register` (v_1)
**Status:** **FAIL** (Blocking Issues Identified)
**Date:** 2026-10-15

## 1. Executive Summary

The Engineering Layer v_1 documents define a solid structural foundation for a Unity-based Brotato 3D clone, emphasizing data-driven design, object pooling, and strict performance budgets. However, the review identified **critical conflicts** between the English and Chinese documentation regarding core gameplay mechanics (Real-Time vs. Turn-Based/Grid), which pose a high risk of rework. Additionally, while performance budgets are clearly defined, **security concerns** regarding save file integrity, asset loading paths, and lack of input validation are under-addressed. The project is **not ready for implementation** until these inconsistencies are resolved and security controls are integrated into the engineering tasks.

## 2. Performance Review

### 2.1 Consistency of Performance Budgets
The performance targets are consistent across `change-list.en.md`, `implementation-plan.en.md`, and `implementation-plan.zh.md`.
*   **Target:** 60 FPS average, < 16.6 ms frame time.
*   **Memory:** < 4 GB PC / < 512 MB Mobile.
*   **Draw Calls:** < 100 per frame.
*   **Verdict:** **PASS**. These are realistic constraints for a target spec of i5-4590 / GTX 1050, provided the engine settings (URP) and asset budgets (Poly/Texture limits) are strictly enforced.

### 2.2 Critical Inconsistency: Gameplay Model (Blocking)
A fundamental conflict exists between the English and Chinese documentation regarding the combat model, which directly impacts performance architecture and CPU usage.

| Feature | `*.en.md` Definition | `*.zh.md` Definition | Conflict Impact |
| :--- | :--- | :--- | :--- |
| **Combat Mode** | **Real-Time Auto-Shooter** (Wave-based) | **Turn-Based / Grid System** (12x12 or 15x15) | **HIGH**. Real-time requires continuous physics/kinematic updates. Turn-based allows for deterministic, low-CPU tick updates. Implementing the wrong model will invalidate 50% of the module architecture. |
| **Movement** | Kinematic WASD + Gravity (Free Move) | Grid Movement / A* Pathfinding | **MEDIUM**. `CharacterController` vs. TileMap navigation. |
| **AI Update** | Continuous/Per-Frame | Per-Turn/Coarse | **MEDIUM**. 100 enemies in real-time requires Job System or LOD. In turn-based, this is trivial. |

*   **Evidence:**
    *   `implementation-plan.en.md` (Section 1.2): Explicitly resolves the conflict by stating: *"We adopt the Real-Time Auto-Shooter model... The 'Turn-Based' reference in the Chinese spec is likely a mistranslation... The implementation will focus on real-time wave survival."*
    *   `change-list.zh.md` (Section 1, ADR-02): Explicitly flags the conflict: *"Real-time... conflicts with architecture.zh.md Turn-based... Requires review confirmation."*
*   **QA Conclusion:** The English plan assumes the Chinese documents were in error. This is an **unverified assumption**. Until Product/Design confirms the intended model, the engineering layer is inconsistent. **Risk: Total rework of M03/M04 modules if the grid model was intended.**

### 2.3 Performance Risks & Mitigation Gaps

#### R-01: Physics Jitter & CPU Spike
*   **Observation:** `change-list.en.md` (A-05) specifies Kinematic movement for the player to avoid jitter. `risk-register.en.md` (R-01) notes enemies may use `Rigidbody` if interactions are complex.
*   **Risk:** Using `Rigidbody` for 100+ enemies in a real-time wave game on low-end GPUs/CPU will cause significant physics overhead and jitter.
*   **Gap:** The `implementation-plan.en.md` (AI-02) suggests basic FSM but does not explicitly mandate **Kinematic** movement for all enemies or the use of **Ghost Colliders**/non-physical separation to meet the "50 enemies @ 60 FPS" target.
*   **Acceptance Criteria Needed:**
    *   All enemies must use Kinematic movement.
    *   Separation forces must be calculated via distance checks (math), not physics colliders.
    *   Profiler trace must show Physics time < 2ms in a 100-enemy scene.

#### R-02: GC Allocations in Hot Paths
*   **Observation:** `implementation-plan.zh.md` (T-401) sets a target of "C# GC Alloc steady state < 1MB/s". `change-list.en.md` (T-005) requires "Zero GC alloc in Update loop".
*   **Risk:** Unity's default behavior often allocates memory for `GameObject.Find`, LINQ, or string concatenation in UI.
*   **Verdict:** **PASS**, provided the `ObjectPool` implementation (INF-04) is strictly enforced for Projectiles, Effects, and Enemy instances. The plan correctly identifies this as a P0 task.

#### R-03: Asset Loading & Memory Leaks
*   **Observation:** `change-list.en.md` (T-008) and `implementation-plan.zh.md` (T-402) mention asset checking.
*   **Risk:** Dynamic loading of prefabs via `AssetFactory` without a `Destroy` lifecycle could leak memory if scene transitions are not handled correctly (M02 FSM).
*   **Gap:** No explicit requirement for **UnloadAllAssets** on scene change or **Reference Counting** for dynamic assets.
*   **Recommendation:** Add task: "Implement Asset Lifecycle Manager to ensure `Resources.UnloadUnusedAssets()` or Addressables `Release()` is called on Scene Load/Unload."

## 3. Security Review

The project is described as "Local-only" (`change-list.en.md`, A-Net in `implementation-plan.zh.md`). This reduces attack surface significantly (no network exploits). However, **local integrity and data security** risks remain.

### 3.1 Save File Integrity & Tampering
*   **Observation:** `change-list.en.md` (A-08) and `implementation-plan.zh.md` (T-304) specify JSON serialization for Save/Load.
    *   *Plan:* "Corrupt save file -> App does not crash, prompts user."
    *   *Plan:* "Restore MetaStats exactly after Quit -> Restart."
*   **Risk:**
    1.  **Corruption:** A simple JSON parse error could crash the app if not caught at the root.
    2.  **Tampering/Exploit:** A player could manually edit the JSON to set `Bread = 999999`, bypassing gameplay progression. While this is "single-player," it violates the "Meta-Progression" balance intended by the design.
    3.  **Path Traversal:** If the save file name or path is derived from user input or OS variables without sanitization, it could potentially write to unintended locations (low risk in Unity, but best practice is to lock to `Application.persistentDataPath`).
*   **Missing Controls:**
    *   No mention of **Checksums** or **Hashing** to detect tampering.
    *   No mention of **Schema Validation** against the current game version (if game updates change JSON structure, old saves must be migrated or rejected safely).
*   **Action Item (Security):**
    *   **REQ-SEC-01:** Implement JSON Schema Validation on load. If validation fails, do not crash; load Default Save with a warning log.
    *   **REQ-SEC-02:** Implement a simple SHA256 checksum for the save file. On load, verify checksum. If mismatched, log a warning "Save Modified" (optional: reset to last known good state or just proceed, depending on design policy).
    *   **REQ-SEC-03:** Ensure `File.Write` operations only target `Application.persistentDataPath/brotato/save.json`. No dynamic file names from user input.

### 3.2 Asset Injection / Deserialization Risks
*   **Observation:** `change-list.en.md` (T-001) mentions "Git + LFS" for version control. `implementation-plan.zh.md` (T-104) mentions `AssetFactory` loading by ID.
*   **Risk:**
    *   If `AssetFactory` uses `JsonUtility.FromJson<T>` or `BinaryFormatter` (avoid this!) on data from untrusted sources, it is a vulnerability.
    *   In a local game, the "untrusted source" is the file system. If a user downloads a modded asset bundle, it could contain malicious scripts or exploit Unity's scripting API.
    *   *Assumption:* Since this is a standard Unity build, user cannot easily inject code unless they decompile the binary. However, **Data** is the vector.
*   **Verdict:** **LOW RISK** for standard release, but **MEDIUM** if the game supports user-generated content (UGC) in the future.
    *   *Constraint:* Ensure no `Deserialize` calls accept external file inputs without strict type checking. Use `ScriptableObject` for runtime config (safer than JSON runtime deserialization for logic).

### 3.3 Input Validation
*   **Observation:** `change-list.en.md` (A-02) uses Unity Input System.
*   **Risk:**
    *   **Event Injection:** In single-player, this is low risk.
    *   **Invalid State Transitions:** If the Input System allows button presses while the FSM is in `Loading` state, it could cause null reference exceptions.
*   **Gap:** `implementation-plan.en.md` (T-003) states "Pause locks input".
*   **Recommendation:**
    *   **REQ-SEC-04:** Implement a global `InputGate` that disables all gameplay inputs when FSM State != `Gameplay` or `Pause`. Verify this via automated test: Trigger "Roll" input while in `Menu` state -> No exception, no movement.

### 3.4 Information Disclosure
*   **Observation:** `change-list.en.md` (T-008) mentions "Corrupt save file -> prompts user".
*   **Risk:** Error messages should not leak file system paths or stack traces to the user UI, which could aid in exploiting local file structure.
*   **Recommendation:**
    *   **REQ-SEC-05:** Log detailed errors to `Application.log` or a debug file. Display only a friendly, generic message ("Save Data Error") in the UI.

## 4. Detailed Findings & Action Items

### 4.1 Blocking Issues (Must Fix Before Implementation)

| ID | Category | Finding | Severity | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **P-001** | **Performance/Architecture** | **Contradictory Core Mechanics:** EN docs specify Real-Time/Kinematic. ZH docs specify Turn-Based/Grid. `implementation-plan.en.md` arbitrarily resolves this to Real-Time without confirmed design sign-off. | **Critical** | **Pause Engineering.** Design Team must confirm if the game is "Brotato-like" (Real-Time Wave) or "Tactical" (Grid). Update all docs to match the confirmed design. If Grid is intended, `CharacterController` and Real-Time Projectiles must be redesigned for Turn-Based ticks. |
| **S-001** | **Security/Integrity** | **Save File Vulnerability:** No mechanism to detect tampering or corruption. `File.Read` may crash app on malformed JSON. | **High** | Add **REQ-SEC-01** (Schema Validation) and **REQ-SEC-02** (Checksum) to `implementation-plan`. Update `T-304` to include "Integrity Check" as an acceptance criterion. |

### 4.2 High Priority Recommendations

| ID | Category | Finding | Severity | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **P-002** | **Performance** | **Enemy Physics:** Plan allows `Rigidbody` for enemies. This will likely cause jitter and CPU spikes at 100+ enemies on target hardware (GTX 1050). | **High** | Amend `T-006` and `AI-02`: **Mandate Kinematic Movement** for all enemies. Use math-based separation, not physics collisions. Verify with Profiler (< 2ms Physics time). |
| **P-003** | **Performance** | **Asset Loading:** No explicit unload strategy. Risk of memory leak across scene transitions. | **Medium** | Add task to `Phase 1` or `Phase 4`: Implement `AssetLifecycleManager` to call `Addressables.Release` or `Resources.UnloadUnusedAssets` on scene change. |
| **S-002** | **Security** | **Error Leakage:** "Prompt user" on save corruption may expose internal paths. | **Medium** | Implement **REQ-SEC-05**: UI displays generic error; detailed logs go to file. |
| **S-003** | **Security** | **Input Safety:** Potential for input events to fire in invalid states (e.g., Loading). | **Low** | Implement **REQ-SEC-04**: Global Input Gate tied to FSM State. |

### 4.3 Acceptance Criteria for Security & Performance Gates

To move to the next layer (Implementation), the following automated tests must pass:

1.  **Performance Smoke Test:**
    *   Spawn 100 enemies in a 30x30m area.
    *   Run for 60 seconds.
    *   **Pass Condition:**
        *   Avg FPS >= 58.
        *   Frame Time P99 < 25ms.
        *   GC Alloc in `Update` = 0 bytes.
        *   Physics Time (Profiler) < 5ms.

2.  **Security/Integrity Test:**
    *   **Test A (Corruption):** Manually modify `save.json` (remove closing bracket). Run game.
        *   **Pass Condition:** Game loads Default Save. UI shows "Save Data Error" toast. No Crash. Log contains detailed error.
    *   **Test B (Tampering):** Modify `save.json` to set `Bread = 999999`. Run game.
        *   **Pass Condition:** (If Checksum implemented) Game detects mismatch. Logs "Tampering Detected". (Design decision: Reset to last valid save or accept with warning?). *Recommendation: Accept but log warning for v_1, implement "Save Integrity" toggle in Options for v_2.*
    *   **Test C (Invalid Path):** Attempt to write save to `C:\Windows\System32\` (simulated via mock).
        *   **Pass Condition:** Exception caught. Log error. No file written outside `persistentDataPath`.

## 5. Conclusion

The `engineering/v_1` layer provides a technically sound *structure* (URP, UGUI, FSM, Object Pooling) but fails on **cohesion** due to the Real-Time vs. Grid conflict. The performance budget is aggressive but achievable *only if* the Real-Time model is confirmed and Kinematic movement is strictly enforced for enemies. Security controls are absent for save integrity.

**Recommendation:** **DO NOT PROCEED** to code implementation.
1.  Resolve P-001 (Design Confirmation of Combat Model).
2.  Update `implementation-plan` to include Security Requirements S-001 and S-002.
3.  Amend Performance Plan to mandate Kinematic Enemies (P-002).
4.  Re-submit for QA review.

---
*Reviewer: Agnes-3.0-flash (QA Layer)*
*Reference: Studio CoWork Handoff Protocol*
