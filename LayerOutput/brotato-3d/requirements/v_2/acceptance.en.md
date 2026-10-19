# acceptance.md

**Document Type:** Requirements Handoff / Acceptance Criteria
**Project Concept:** 3D "Brotato" Clone (Temporary Title: *Potato Brothers 3D*)
**Source Input:** "Make a 3D version of Potato Brother"
**Status:** Draft for Review
**Author:** Studio CoWork AI (Requirements Layer)

## 1. Executive Summary & Scope

This document defines the acceptance criteria for the prototype and core gameplay loop of a 3D twin-stick shooter inspired by *Brotato*. The project translates the 2D top-down perspective of the source material into a 3D third-person perspective.

**Critical Distinction: Fact vs. Assumption**
*   **Fact:** The user requested a 3D version of "Potato Brother" (interpreted as *Brotato*, a popular indie twin-stick shooter).
*   **Assumption:** "Potato Brother" refers to the game *Brotato*. The user did not specify art style, target platform, or specific fidelity requirements for "3D."
*   **Assumption:** "3D" implies a fully 3D world with height differences, rather than a "2.5D" (flat sprite with 3D camera) approach. This document assumes full 3D geometry and physics.
*   **Assumption:** The core loop remains "survive waves of enemies while collecting weapons to build a deck."

## 2. Functional Requirements

### 2.1 Core Gameplay Loop
The prototype must demonstrate one complete day of gameplay (10 waves) in a 3D environment.

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-01 | **Waves & Spawning** | Enemies spawn from outside the arena boundary per wave. | - Wave 1 starts with 5 enemies.<br>- Wave 10 starts with 50+ enemies.<br>- Enemies do not spawn inside the player's melee range.<br>- Spawning pauses when the arena is full (>80 active entities). |
| FR-02 | **Player Movement** | 3D third-person movement relative to camera. | - WASD/QE moves player in XZ plane.<br>- Mouse aims crosshair; right-click or secondary button fires.<br>- Movement speed is 5 units/sec.<br>- Player can move up/down small platforms (if any) or stay grounded if arena is flat. |
| FR-03 | **Combat Mechanics** | Twin-stick shooting system. | - Primary weapon fires in direction of aim cursor.<br>- Secondary weapon fires at 50% damage but double fire rate (simulating Brodato's dual-weapon system).<br>- Projectiles have collision detection against enemies. |
| FR-04 | **Enemy AI** | Basic chase and attack behavior. | - Enemies pathfind to the player position.<br>- Enemies within 2 units of player deal 5 damage per second.<br>- Enemy HP resets per wave.<br>- Enemy types scale in HP and Count per wave. |
| FR-05 | **Shop & Upgrade** | Between waves, player chooses 1 of 3 weapons/cards. | - After Wave 1 ends, game pauses.<br>- UI displays 3 weapon cards.<br>- Selecting a card adds it to the "loadout" (max 4 weapons total in prototype).<br>- UI displays "Next Wave" button. |

### 2.2 3D Technical Implementation
This section distinguishes the 3D implementation from the 2D source material.

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-10 | **Camera System** | Rotatable third-person camera. | - Camera follows player with smoothing (lerp factor 0.1).<br>- Mouse drag or right-click rotates camera Y-axis.<br>- Camera does not clip through geometry.<br>- View frustum culling is enabled for performance. |
| FR-11 | **Physics** | Collision and interaction. | - Player cannot pass through enemy meshes.<br>- Projectiles are destroyed on impact with enemy or boundary.<br>- Gravity is applied if platforms exist; otherwise, Y-axis is locked to 0. |
| FR-12 | **Lighting & Rendering** | Basic 3D visuals. | - Scene uses directional light + ambient light.<br>- Shadows are cast by player and enemies onto the ground plane.<br>- Draw calls < 50 for a full wave of enemies. |

## 3. Non-Functional Requirements (Performance)

| ID | Requirement | Target | Evidence |
|----|-------------|--------|----------|
| NFR-01 | **Frame Rate** | Stable 60 FPS on mid-range PC (GTX 1060 / RX 580). | - Profiled using Unity/Unreal Profiler.<br>- No frame spikes > 5ms during Wave 10 (max enemy count). |
| NFR-02 | **Memory** | Peak memory usage < 2 GB. | - Monitored during a full day cycle.<br>- No memory leaks observed after 5 consecutive days. |
| NFR-03 | **Input Latency** | < 2 frames of input delay. | - Visual test: Player fires projectile; projectile spawn frame is within 2 frames of input registration. |

## 4. Assumptions & Risks

### 4.1 Assumptions (To be validated during Review)
1.  **Interpretation of "Potato Brother":** We assume the user meant *Brotato*. If they meant a literal "Potato" character game, the art direction is wrong. *Action: Confirm IP reference.*
2.  **Arena Design:** We assume a flat, circular arena with a boundary wall. Height differences (3D platforms) are **excluded** from the prototype to reduce scope, unless specified otherwise.
3.  **Art Style:** We assume Low-Poly/Indie style. High-fidelity AAA graphics are not assumed.
4.  **Platform:** We assume PC (Windows/Linux/Mac) for development. Mobile is not in scope for the prototype.

### 4.2 Risks
1.  **Scale Difference:** 3D rendering significantly increases draw calls compared to 2D sprites.
    *   *Mitigation:* Use GPU Instancing for enemies. Target < 80 draw calls.
2.  **Camera Control Complexity:** Third-person camera in a crowded arena can be disorienting.
    *   *Mitigation:* Implement "camera snap" when aiming across obstacles. Ensure camera does not collide with enemy meshes.

## 5. Definition of Done (Prototype Milestone 1)

The prototype is considered **Acceptable** when the following checklist is met:

- [ ] **Build Launches:** The application launches without crash on target PC.
- [ ] **One Full Day:** The user can play from Wave 1 to Wave 10 without hard crashes.
- [ ] **Shop Functionality:** The user can purchase a weapon in the shop between waves, and that weapon appears in the loadout in the next wave.
- [ ] **3D Visuals:** The scene is rendered in 3D with visible shadows and distinct depth.
- [ ] **Controls:** WASD movement and Mouse aim/fire work without conflict.
- [ ] **Performance:** The game maintains 60 FPS with 50 enemies on screen on a reference mid-range PC.

## 6. Evidence & Verification Plan

To verify the above requirements, the following artifacts will be produced:

1.  **Benchmark Video:** A video recording of Wave 10 with FPS counter overlay (OBS or similar) demonstrating NFR-01.
2.  **Profiling Report:** A screenshot of the engine profiler (Unity Frame Debugger or Unreal Stats) showing draw calls and frame time distribution.
3.  **Gameplay Walkthrough:** A short (2-minute) video demonstrating the full loop: Move -> Shoot -> Die/Survive -> Shop -> Next Wave.
4.  **Unit Tests:**
    - `Test_SpawnWaves()`: Asserts wave 1 spawns 5 enemies, wave 10 spawns >50.
    - `Test_ShopSelection()`: Asserts that selecting a card increases the loadout array size by 1.
    - `Test_CameraCollision()`: Asserts camera position is not inside enemy collider bounds.

## 7. Excluded Features (Out of Scope for Prototype)

*   Multiple player characters (classes).
*   Reroll system in shop.
*   Day/Night cycle effects on enemy behavior.
*   Local/Multiplayer modes.
*   Save/Load functionality.
*   High-quality post-processing (bloom, depth of field).

---
**Next Step:** Review this document to confirm assumptions (especially the interpretation of "Potato Brother") and approve the scope for the 3D engine setup.
