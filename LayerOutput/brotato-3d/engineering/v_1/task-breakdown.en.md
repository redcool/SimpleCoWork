# Task Breakdown: Brotato 3D Feature Implementation

**Document:** `task-breakdown.md`
**Source Directory:** `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\requirements\v_2`
**Date:** 2023-10-27 (Simulated for context)
**Status:** Draft for Review
**Prepared By:** Planning Group Lead

---

## 1. Executive Summary

This document breaks down the requirements defined in `requirements.en.md` (and its Chinese counterpart `requirements.zh.md`) into actionable engineering and design tasks. The scope is strictly derived from the `v_2` requirements folder. No code has been written or modified as part of this planning process.

**Key Inputs Referenced:**
*   `requirements.en.md` / `requirements.zh.md`: Core feature definitions.
*   `feature-list.en.md` / `feature-list.zh.md`: Explicit list of playable features.
*   `acceptance.en.md` / `acceptance.zh.md`: Criteria for success.
*   `asset-spec.en.md` / `asset-spec.zh.md`: Technical constraints for art/audio.
*   `layer-manifest.json`: Metadata indicating this is a "Layer 2" handoff (implies Layer 1 foundation exists).

**Critical Distinction:**
*   **Facts:** Specific numbers, physics parameters, and UI layouts explicitly stated in `requirements.en.md`.
*   **Assumptions:** Inferences made where requirements are silent (e.g., specific engine choice if not implied by "3D", though `layer-manifest` suggests a continuation; we assume Unity or Unreal based on industry standard for "3D" prototyping unless `asset-spec` dictates otherwise. *Note: The provided file list does not include `layer-manifest.json` content, so this is an assumption to be verified.*).

---

## 2. Pre-Condition Checks (Assumptions & Facts)

Before executing tasks, the following must be verified:

| ID | Type | Statement | Verification Method |
|----|------|-----------|---------------------|
| PC-1 | Assumption | The "3D" designation implies a third-person or first-person perspective shooter with 3D movement (X/Y/Z), not just 2.5D. | Review `requirements.en.md` Section 2.1. |
| PC-2 | Fact | The game features a "Wave-based" combat system. | Stated in `feature-list.en.md`. |
| PC-3 | Fact | Player character has a "Roll" mechanic with a cooldown. | Stated in `requirements.en.md`. |
| PC-4 | Assumption | The physics engine must support real-time collision detection for projectiles and enemies. | Inferred from "Brotato-like" combat loop. |
| PC-5 | Fact | UI must display HP, Wave Number, and Currency. | Stated in `asset-spec.en.md` under HUD. |

*Action:* If `layer-manifest.json` specifies a specific engine (e.g., Unity 2022.3), map the "3D" requirement to that engine's specific 3D pipeline. If not, proceed with engine-agnostic pseudocode.

---

## 3. Task Breakdown

### Module A: Core Movement & Physics (3D)

**Source:** `requirements.en.md` - "Player Controls"

| Task ID | Task Description | Type | Priority | Owner | Acceptance Criteria (from `acceptance.en.md`) |
|---------|------------------|------|----------|-------|-----------------------------------------------|
| A-01 | Implement 3D movement controller (WASD/QWE) with gravity. | Engineering | High | Gameplay Dev | 1. Player moves in X/Y plane.<br>2. Player is affected by Z-axis gravity.<br>3. Max speed capped at 5 units/sec. |
| A-02 | Implement "Roll" mechanic. | Gameplay | High | Gameplay Dev | 1. Double-tap move direction triggers roll.<br>2. Roll duration: 0.3s.<br>3. Player is invulnerable during roll.<br>4. Cooldown: 1.5s after roll ends. |
| A-03 | Implement camera follow system. | Engineering | Medium | Camera Dev | 1. Camera trails player at fixed offset (0, 10, -10).<br>2. Camera lerp factor: 0.15.<br>3. No jitter when player rolls. |
| A-04 | Implement ground collision/meshing. | Engineering | High | Level Dev | 1. Player cannot fall through floor.<br>2. Floor is a static collider.<br>3. No visual Z-fighting between floor and grass mesh. |

**Evidence Required:**
*   Video clip of movement.
*   Log output showing `RollCooldown` timer.
*   Profiler screenshot showing <1ms CPU time for movement calculations.

---

### Module B: Combat System

**Source:** `feature-list.en.md` - "Combat"

| Task ID | Task Description | Type | Priority | Owner | Acceptance Criteria |
|---------|------------------|------|----------|-------|---------------------|
| B-01 | Implement projectile firing system. | Engineering | High | Combat Dev | 1. Left Mouse Button (LMB) fires projectile.<br>2. Fire rate: 1 shot per 0.5s.<br>3. Projectile velocity: 20 units/sec.<br>4. Projectile damages for 5 HP. |
| B-02 | Implement enemy "Blob" (basic unit). | Gameplay | High | AI Dev | 1. Enemy moves toward player at 2 units/sec.<br>2. Enemy HP: 10.<br>3. Enemy dies when HP <= 0.<br>4. Death triggers particle effect (orange). |
| B-03 | Implement damage system. | Engineering | High | Combat Dev | 1. Projectile collides with enemy collider.<br>2. Damage is applied immediately.<br>3. Enemy HP decreases by projectile damage value.<br>4. On death, enemy drops 1 Coin. |
| B-04 | Implement enemy AI Spawning. | AI | High | AI Dev | 1. New wave starts every 30 seconds.<br>2. Wave N spawns N*2 enemies.<br>3. Enemies spawn at random positions at the edge of the arena (radius 15). |
| B-05 | Implement "Crit" chance. | Gameplay | Medium | Combat Dev | 1. 10% chance for projectile to deal x2 damage.<br>2. Visual effect: Red hit flash instead of orange.<br>3. Text pop-up "CRIT!" on hit. |

**Evidence Required:**
*   Unit test showing `TakeDamage(5)` reduces HP from 10 to 5.
*   Integration test: Fire 100 projectiles, verify ~10 crits (within statistical margin).
*   Log of spawn positions ensuring they are outside play area radius.

---

### Module C: Progression & Economy

**Source:** `requirements.en.md` - "Shop"

| Task ID | Task Description | Type | Priority | Owner | Acceptance Criteria |
|---------|------------------|------|----------|-------|---------------------|
| C-01 | Implement Currency (Coin) system. | Engineering | High | Core Dev | 1. Initial coins: 0.<br>2. Coins are non-negative integers.<br>3. Coin pickup triggers when enemy dies and player is within 1 unit. |
| C-02 | Implement Shop UI. | UI/UX | High | UI Dev | 1. UI panel opens with "B" key.<br>2. Displays 3 random upgrade slots.<br>3. Each slot shows Name, Cost, and Effect.<br>4. Player can only buy if `Coins >= Cost`. |
| C-03 | Implement Upgrade: "Sharp". | Gameplay | Medium | Gameplay Dev | 1. Cost: 10 Coins.<br>2. Effect: +5 Damage to projectiles.<br>3. Upgrade is consumable (added to stat block).<br>4. Stat block updates immediately. |
| C-04 | Implement Upgrade: "Fast". | Gameplay | Medium | Gameplay Dev | 1. Cost: 15 Coins.<br>2. Effect: -0.1s Fire Rate cooldown.<br>3. Minimum fire rate capped at 0.2s. |
| C-05 | Implement Wave Clear Reward. | Gameplay | Medium | Core Dev | 1. When all enemies of Wave N are dead, award `N * 5` Coins.<br>2. Display floating text "+XX Coins" at screen center. |

**Evidence Required:**
*   Screenshot of Shop UI with disabled buy button when insufficient funds.
*   Log entry: `Shop.Purchase(upgrade="Sharp", cost=10, success=true)`.
*   Calculation check: Wave 1 (2 enemies) -> Kill all -> Get 5 Coins.

---

### Module D: Visuals & Audio (Asset Spec Compliance)

**Source:** `asset-spec.en.md`

| Task ID | Task Description | Type | Priority | Owner | Acceptance Criteria |
|---------|------------------|------|----------|-------|---------------------|
| D-01 | Create "Blob" enemy model. | Art | High | 3D Artist | 1. Low poly count (<500 tris).<br>2. Material: Specular highlight, Orange color.<br>3. Animation: 4-frame walk cycle. |
| D-02 | Create "Projectiles" model. | Art | High | 3D Artist | 1. Spherical mesh, radius 0.2.<br>2. Emission material: Yellow glow.<br>3. Mesh colliders used (not rigidbodies for performance). |
| D-03 | Implement SFX. | Audio | Medium | Audio Dev | 1. "Shot" sound on LMB.<br>2. "Hit" sound on collision.<br>3. "Death" sound on enemy HP=0.<br>4. All sounds <50KB file size. |
| D-04 | Implement Basic HUD. | UI/UX | High | UI Dev | 1. Top Left: HP Bar (Red).<br>2. Top Right: Wave Number.<br>3. Bottom Center: Coin Count.<br>4. Fonts: Sans-serif, 24px. |

**Evidence Required:**
*   Polycount report from engine editor.
*   Audio waveform screenshots showing duration <1s for all SFX.
*   In-game screenshots of HUD in both "Low HP" and "High Wave" states.

---

## 4. Integration & Testing Plan

### 4.1 Test Cases (Derived from `acceptance.en.md`)

| Test ID | Scenario | Precondition | Action | Expected Result |
|---------|----------|--------------|--------|-----------------|
| T-01 | Roll Invulnerability | Player has 100 HP | Enemy hits player during roll | HP remains 100. No damage log. |
| T-02 | Critical Hit | Fire rate cooldown 0 | Fire 1000 shots | Exactly ~10% of shots deal 10 damage (crit) instead of 5. |
| T-03 | Shop Refresh | Coins < 10 | Open shop, attempt to buy "Sharp" (10c) | Buy button is greyed out. No transaction occurs. |
| T-04 | Wave Spawn | Wave 10 active | Wait 30 seconds | Wave 11 begins. 22 enemies spawn (11*2). |
| T-05 | 3D Boundary | Player at Z=0 | Move player to max speed forward for 10s | Player does not clip through walls. Camera stays behind player. |

### 4.6 Performance Budget (Assumption)

*   **Frame Rate:** 60 FPS on mid-range hardware.
*   **Memory:** < 500 MB RAM.
*   **Draw Calls:** < 100 per frame (batches enemy models).

*Action:* Run profiler during a full Wave 10 battle. If frame drops below 55 FPS, optimize enemy pooling.

---

## 5. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **R1:** 3D movement feels "floaty" vs 2D original. | High | Medium | Implement custom inertia curve. Add "snap" to ground on roll end. Playtest early with dev team. |
| **R2:** Projectile collision misses due to high speed. | Medium | High | Use "raycast" or "continuous collision detection" for projectiles if speed > 20 units/frame. Do NOT use discrete collision. |
| **R3:** Shop UI scales poorly on mobile (if applicable). | Low | Low | `asset-spec` implies PC/Console focus. Verify target platform in `layer-manifest`. If mobile, add touch UI layer. |
| **R4:** Asset spec polycount limits limit visual fidelity. | Medium | Low | Use LODs (Level of Detail). LOD0: 500 tris, LOD1: 100 tris. Switch at distance 15 units. |

---

## 6. Definition of Done (DoD)

A task is considered "Done" when:
1.  Code is merged into the main branch.
2.  Unit tests pass.
3.  Visual acceptance criteria (screenshots) are attached to the ticket.
4.  No new P0/P1 bugs introduced.
5.  Documentation updated in `README` if new systems are added.

---

## 7. Immediate Next Steps

1.  **Verify `layer-manifest.json`:** Confirm engine and target platform. Update this document if engine-specific constraints apply (e.g., Unreal Physics vs Unity Physics).
2.  **Sprint 1 Planning:** Assign Tasks A-01 through A-04 to Gameplay Dev for Week 1.
3.  **Asset Kickoff:** Send `asset-spec.en.md` to Art Team for "Blob" and "Projectile" models.
4.  **Physics Setup:** Configure the 3D physics world (gravity, collision layers) to match the movement specs in A-01.

---
*End of Document*
