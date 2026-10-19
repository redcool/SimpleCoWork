```markdown
# Test Plan: Brotato 3D Requirements v2

## 1. Overview
This document outlines the test plan for verifying the implementation of the **Brotato 3D** requirements as specified in `v_2`. It covers functional, visual, and technical acceptance criteria derived from the provided requirement files (`requirements.en.md`, `requirements.zh.md`, `acceptance.en.md`, `acceptance.zh.md`, `asset-spec.en.md`, `asset-spec.zh.md`, `feature-list.en.md`, `feature-list.zh.md`).

**Scope**: This test plan addresses the *expected* behavior and assets defined in the v2 requirements. It does not assume any code has been implemented or modified.

## 2. Test Environments & Prerequisites
*   **Engine**: Unity (assumed based on common Brotato clones; verify against `layer-manifest.json` if available).
*   **Target Platforms**: PC (Windows/Mac/Linux). Mobile support is not explicitly detailed in v2 requirements; assume PC-first unless `feature-list` indicates otherwise.
*   **Input Data**: All 3D assets, models, and textures must conform to `asset-spec.en.md` and `asset-spec.zh.md`.
*   **Build Configuration**: Development build with logging enabled for technical verification.

## 3. Fact vs. Assumption Matrix
| Item | Type | Source |
| :--- | :--- | :--- |
| Game mechanics (Brotato-like auto-battler) | **Fact** | `requirements.en.md` |
| 3D rendering of 2D Brotato assets | **Fact** | `asset-spec.en.md` |
| Character movement is grid-based | **Assumption** | Not explicitly confirmed in v2 text; standard for Brotato. Needs verification. |
| UI layout matches 2D original | **Assumption** | `asset-spec` mentions "UI elements" but not exact layout. |
| Performance target (60 FPS) | **Assumption** | Not explicitly stated in provided snippets; standard for this genre. |
| Localization support (EN/ZH) | **Fact** | Both EN and ZH files exist in the directory. |

## 4. Test Cases

### 4.1 Functional Tests (Derived from `feature-list` & `requirements`)
| ID | Test Case | Steps | Expected Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **F-001** | **Game Loop Initiation** | 1. Launch game. 2. Verify main menu loads. 3. Start new game. | Game transitions to gameplay scene. Character spawns. No errors in log. | Log capture, video record. |
| **F-002** | **Auto-Movement** | 1. Wait for character to move. 2. Observe pathing. | Character moves automatically towards enemies or designated target. Movement is smooth (no teleportation). | Video record. |
| **F-003** | **Combat Resolution** | 1. Spawn enemy within range. 2. Observe attack. | Character attacks. Damage is applied to enemy. Enemy HP decreases. | Debug log showing damage values, video record. |
| **F-004** | **Wave Progression** | 1. Clear wave 1 enemies. 2. Wait for next wave. | Next wave spawns with correct count/types. Inter-wave timer/option triggers. | Log timestamp of wave changes. |
| **F-005** | **Item/Loot Acquisition** | 1. Pick up dropped item. 2. Check inventory/UI. | Item appears in UI. Stats update accordingly. | Screenshot of UI, log of stat changes. |
| **F-006** | **Localization Toggle** | 1. Switch language to EN. 2. Switch language to ZH. 3. Compare UI text. | All text changes correctly. No missing glyphs or raw string keys. | Screenshots of UI in both languages. |

### 4.2 Visual & Asset Tests (Derived from `asset-spec`)
| ID | Test Case | Steps | Expected Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **V-001** | **3D Model Accuracy** | 1. Compare 3D character model to 2D reference. | Model geometry matches intended silhouette. No missing polygons. | Side-by-side screenshot comparison. |
| **V-002** | **Texture Quality** | 1. Inspect character/enemy textures at close range. | Textures are not pixelated or stretched. UV mapping is correct. | Close-up video capture. |
| **V-003** | **Lighting & Shadows** | 1. Observe scene lighting. 2. Check shadow casting. | Shadows are soft/dynamic as specified. No clipping or excessive flicker. | Video record. |
| **V-004** | **UI Scaling** | 1. Run game on different screen resolutions (1080p, 4K). 2. Resize window. | UI elements remain legible and properly anchored. No clipping. | Screenshots at different resolutions. |
| **V-005** | **Animation Blend** | 1. Observe character transitioning from idle to move to attack. | Transitions are smooth (no popping). | Video record with frame-by-frame review. |

### 4.3 Technical & Performance Tests
| ID | Test Case | Steps | Expected Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **T-001** | **Frame Rate Stability** | 1. Run a full 20-wave game. 2. Monitor FPS. | FPS stays above 60 on target hardware (or specified target). No significant drops. | Profiler data/CSV log of FPS. |
| **T-002** | **Memory Leaks** | 1. Run multiple game sessions. 2. Monitor memory usage. | Memory usage does not grow indefinitely. | Memory profiler graph. |
| **T-003** | **Save/Load Integrity** | 1. Save game mid-run. 2. Quit. 3. Load save. | Game state (wave, items, stats) is restored correctly. No corruption. | Comparison of pre-save and post-load logs/screenshots. |
| **T-004** | **Asset Pipeline** | 1. Verify all assets load from `asset-spec` definitions. | No missing reference errors. All materials are correctly assigned. | Unity console log (zero "MissingReferenceException"). |

## 5. Acceptance Criteria Mapping
*   **Pass**: All **F**, **V**, and **T** tests yield "Expected Result." Zero critical bugs. No visual defects visible in standard recording.
*   **Fail**: Any critical functional break (crash, no movement), missing localization text, or performance below target threshold.

## 6. Risks & Mitigations
1.  **Missing Asset Details**: *Risk*: `asset-spec` may not define all LODs or shadow settings. *Mitigation*: Use default Unity practices and flag discrepancies in test report.
2.  **Grid-Based Movement Assumption**: *Risk*: If movement is not grid-based, pathing tests (F-002) may be invalid. *Mitigation*: Verify movement logic in `requirements` during test execution; adjust steps if needed.
3.  **Hardware Variance**: *Risk*: Performance tests (T-001) depend on the tester's machine. *Mitigation*: Define a specific baseline machine (e.g., GTX 1060, i5-9400) for performance benchmarking.

## 7. Deliverables
*   Test Execution Log (Excel/CSV).
*   Video recordings of key gameplay moments.
*   Bug report file (if any failures).
*   Final sign-off document confirming alignment with `acceptance.en.md`/`acceptance.zh.md`.

---
**Note**: This plan is based strictly on the provided input directory contents. No code changes have been made. All test cases are hypothetical until executed against a built version of the project.
