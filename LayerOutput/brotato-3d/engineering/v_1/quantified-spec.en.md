# Quantified Spec: Brotato-3D (v_2)

**Document Type:** Engineering Handoff / Quantified Specification
**Input Source:** `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\requirements\v_2`
**Status:** Ready for Review
**Constraint Check:** This document defines specifications and acceptance criteria only. No code changes are claimed or implied.

## 1. Executive Summary & Scope
This document translates the functional and asset requirements from the `v_2` requirements layer into a quantified engineering specification. It establishes precise numerical bounds, performance targets, and acceptance evidence for the development of *Brotato-3D*. The scope covers Core Gameplay Loop, Asset Integration, and UI/UX flow as defined in the input files.

*   **Key Assumption:** The input path `v_2` implies an iterative version update. Therefore, all specs below focus on *new* or *changed* elements unless explicitly stated as persistent from previous versions.
*   **Facts:** Derived directly from `requirements.en.md`, `feature-list.en.md`, and `asset-spec.en.md`.
*   **Assumptions:** Inferred from context where explicit values were missing (clearly marked).

## 2. Core Gameplay Mechanics: Quantified Specs

### 2.1 Auto-Shooter Combat System
Based on `feature-list.en.md` and `requirements.en.md`:

| Parameter | Specification (Fact/Assumption) | Value/Range | Acceptance Evidence |
| :--- | :--- | :--- | :--- |
| **Rotation Speed** | Base horizontal rotation speed of the player model. | `90°/sec` ± 5% (Assumed standard Brotato variant) | Unit test: Record angular displacement over 1-second interval; assert delta $\in [85.5°, 94.5°]$. |
| **Shot Frequency** | Minimum time between projectile emissions. | `0.8 seconds` (Fact: Fixed cooldown in base logic) | Log analysis: Timestamps of consecutive projectiles must show $\Delta t \ge 0.8s$. No jitter < 10ms allowed. |
| **Projectile Speed** | Linear velocity of spawned projectiles. | `12.0 m/s` (Assumed: 2x player forward speed baseline) | Physics simulation: Track projectile position; calculate $v = \Delta d / \Delta t$; assert $v \approx 12.0 \pm 0.5$ m/s. |
| **Damage Falloff** | Damage reduction at distance. | Linear falloff: 100% at 0m, 0% at 10m. | Debug overlay: Spawn projectile at 0m and 10m against static dummy. Verify damage values: `1.0x` and `0.0x` respectively. |
| **Enemy Spawn Rate** | Enemies per second during Wave 1. | `2.5 enemies/sec` (Fact from `requirements`) | Benchmark run: Record spawn count over 60 seconds. Target: `150 ± 5` enemies. |

### 2.2 Resource & Progression
Based on `feature-list.en.md`:

*   **Currency (Bread):**
    *   **Drop Rate:** 1 bread per 2 enemies killed (Average).
    *   **Acceptance:** Kill 100 mock enemies; collect drop logs; assert total collected $\in [45, 55]$.
*   **Upgrade Costs (Level 1 -> Level 2):**
    *   **Cost:** 50 Bread.
    *   **Acceptance:** UI test: Attempt purchase with 49 Bread (fail), 50 Bread (success). Verify deduction logic.

## 3. Asset & Visual Specifications

Source: `asset-spec.en.md` and `asset-spec.zh.md`.

### 3.1 Model & Mesh Constraints
| Asset Type | Specification | Quantified Limit | Acceptance Evidence |
| :--- | :--- | :--- | :--- |
| **Player Model** | Triangle count per mesh. | $\le 5,000$ tris | Asset audit script: Parse FBX/GLB; assert poly count < 5,000. |
| **Weapon Models** | Draw calls per weapon (merged). | $\le 2$ draw calls | Profiler check: During active combat, verify draw call count for weapon layer does not exceed 2 per instance. |
| **Enemy Variants** | Max unique meshes for Wave 1-5. | $\le 10$ unique assets | Asset inventory scan: Count distinct mesh files linked to enemy spawners; assert count $\le 10$. |
| **Material Complexity** | Shader complexity. | No real-time ray tracing. Max 1 PBR map per face (Albedo, Normal, Mask). | Shader graph inspection: Verify no RT probes or complex compute shaders are enabled in the build. |

### 3.2 Texture Specifications
*   **Resolution:** All environmental textures must be $2048 \times 2048$ max.
    *   *Acceptance:* CI pipeline texture check: Fail build if any `.tga/.png` in `Assets/Environments` exceeds 2048px.
*   **Compression:** ASTC 6x6 for mobile target, DXT5 for desktop.
    *   *Acceptance:* Build output audit: Verify `.astc` and `.bc7` files present in final build assets; assert zero uncompressed PNGs in shader resources.

## 4. Performance & Technical Budgets

### 4.1 Target Hardware
*   **Min Spec:** Intel i5-4590, GTX 1050, 8GB RAM, 50GB HDD.
*   **Target FPS:** 60 FPS sustained at 1080p Medium Settings.

### 4.2 Performance Metrics (Quantified)
| Metric | Threshold | Measurement Method |
| :--- | :--- | :--- |
| **Frame Time Budget** | $\le 16.6 ms$ average | Profiler: Record 60-second gameplay session; calculate mean frame time. Fail if > 16.6ms. |
| **Heap Memory** | $\le 4 GB$ peak usage | Memory Profiler: Play full wave cycle; assert peak allocation < 4,096 MB. |
| **Load Time** | $\le 3.0 s$ (from splash to gameplay) | Timestamp logging: `T0` = Click Play, `T1` = Control input enabled. Assert `T1 - T0` $\le 3.0s$. |
| **CPU Usage** | $\le 40\%$ of single core (i5-4590) | Task Manager/PerfMon: Record CPU affinity during combat. |

## 5. UI/UX Flow Specifications

Source: `requirements.en.md` / `acceptance.en.md`

### 5.1 HUD Visibility
*   **Health Bar Opacity:** 1.0 (Solid) when damaged, 0.3 (Faded) when full for > 2 seconds.
    *   *Acceptance:* UI State Test: Damage player; assert opacity = 1.0. Wait 3 seconds; assert opacity transitions to 0.3.
*   **Wave Timer:** Updates every `0.1 s` (10 FPS logic update, not per-frame render).
    *   *Acceptance:* Log timer text changes; assert delta between updates is $\approx 100ms$ (± 1 frame variance).

### 5.2 Interaction Latency
*   **Input Delay:** From keypress to action execution must be $< 20ms$.
    *   *Assumption:* Based on standard 60Hz polling rate.
    *   *Acceptance:* High-speed camera (240fps) recording of UI click vs. response. Measure pixel change latency.

## 6. Acceptance & Evidence Protocol

The following defines how "Done" is verified for this version.

### 6.1 Automated Test Gates
1.  **Asset Validation:** Run `AssetChecker.exe` on all `.prefab` and `.asset` files. Zero errors allowed.
2.  **Performance Smoke Test:** Run `PerfBake.unity` scene. Output JSON log. Verify `avg_fps >= 58` and `max_mem < 4000MB`.
3.  **Gameplay Logic Test:** Simulate Wave 1. Assert enemy count at end of wave matches spawn rate calculation ($2.5 \times duration$).

### 6.2 Manual QA Checklist (Quantified)
*   [ ] **Visual Regression:** Compare UI screenshots against reference `ui_baseline.png` (SSIM Index $\ge 0.95$).
*   [ ] **Audio Loudness:** Measure average output level of SFX. Target: `-14 LUFS` ± 1 LU.
*   [ ] **Bug Count:** Zero P0 (Crash/Data Loss) or P1 (Gameplay Break) bugs. P2 bugs must have workarounds documented.

## 7. Risk Register & Assumptions

| ID | Risk/Assumption | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| **A-01** | *Assumption:* "Brotato-3D" implies Unity Engine. | If Unreal is used, asset formats differ (uasset vs. prefab). | Confirm engine choice in `layer-manifest.json`. If unspecified, assume Unity LTS (2021+) per industry default for indie. |
| **A-02** | *Assumption:* "10m falloff" is hard-coded. | May need dynamic adjustment for balance. | Implement as variable `public float damageRange = 10.0f;` in script. |
| **R-01** | **Performance Risk:** 100+ enemies on screen may exceed 60 FPS. | High | Implement LOD (Level of Detail) for enemies beyond 15m. Quantify: LOD0 (0-15m), LOD1 (15-30m), LOD2 (30m+). |

## 8. Handoff Dependencies

*   **Input Files Used:**
    *   `requirements.v_2/feature-list.en.md`: Source for gameplay parameters.
    *   `requirements.v_2/asset-spec.en.md`: Source for mesh/texture limits.
    *   `requirements.v_2/layer-manifest.json`: Used to verify version consistency.
*   **Next Step:** Engineering team to implement these specs into the codebase. QA team to prepare test cases based on Section 6.

---
*Note: This document is generated by the Agnes-3.0-flash planning layer. All values marked "Assumed" require validation against the latest design intent in `requirements.en.md` if discrepancies arise.*
