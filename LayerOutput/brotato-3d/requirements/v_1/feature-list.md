# Feature List: 3D Version of "Potato Brothers" (土豆兄弟)

## 1. Core Concept & Scope
**Definition:** A 3D local co-op survival shooter featuring two potato-themed characters. Players must survive escalating waves of enemies in a first-person or third-person perspective.
**Key Differentiator:** The "Potato" theme implies a specific art style (likely stylized/comedic) and specific enemy interactions (e.g., throwing potatoes), distinct from realistic shooters.

## 2. Feature Breakdown

### 2.1 Character Control & Physics
*   **Fact:** Game requires 2-player local co-op functionality.
*   **Assumption:** "3D" implies standard 6-DOF movement (Walk, Run, Jump, Crouch) and camera control (Mouse/Controller look).
*   **Feature Details:**
    *   Independent player movement for both characters.
    *   Physics-based interaction (e.g., can players knock each other or enemies away?).
    *   Character models: Two distinct potato avatars with basic idle/run/jump animations.
*   **Acceptance Criteria:**
    *   Two players can move simultaneously without desynchronization or input conflict.
    *   Movement speed is adjustable via config file.
    *   No clipping through basic geometry (walls/floors).

### 2.2 Combat System
*   **Fact:** Core loop involves shooting/throwing projectiles.
*   **Assumption:** "Potato Brothers" suggests throwing potatoes as primary or secondary weapon.
*   **Feature Details:**
    *   **Primary Attack:** Potato throw. Includes trajectory physics (arc), impact damage, and splatter effect.
    *   **Secondary/Alternate Attack:** [Assumption] Melee punch or different projectile type.
    *   **Enemy Interaction:** Enemies take damage, react to hits, and die upon health depletion.
*   **Acceptance Criteria:**
    *   Potato projectile follows parabolic path.
    *   Impact triggers particle effect and sound.
    *   Enemy health bar decreases upon hit.
    *   Frame-perfect hit registration (no tunneling at high speeds).

### 2.3 Wave & Progression System
*   **Fact:** Survival genre implies wave-based difficulty.
*   **Assumption:** Difficulty scales over time; new enemy types may appear.
*   **Feature Details:**
    *   Wave Spawner: Controls enemy spawn rate and count.
    *   Enemy Types:
        1.  Basic Chaser (Slow, High HP).
        2.  Fast Runner (Fast, Low HP).
        3.  [Assumption] Heavy Tank (Slow, Massive HP, Knockback resistance).
    *   Score/Health HUD: Displays current wave, remaining health, and combo multiplier.
*   **Acceptance Criteria:**
    *   Wave N takes longer to clear than Wave N-1.
    *   Enemy spawn points are randomized within the map boundaries.
    *   Game ends when all player characters reach 0 health.

### 2.4 Visual & Audio Presentation
*   **Fact:** 3D environment requires lighting and camera.
*   **Assumption:** Stylized low-poly art style to maintain performance and charm.
*   **Feature Details:**
    *   Camera: Third-person over-the-shoulder view (default) with option for top-down.
    *   Lighting: Baked global illumination + dynamic light for projectiles.
    *   Audio: Distinctive sounds for throws, impacts, enemy deaths, and background music.
*   **Acceptance Criteria:**
    *   Target FPS: 60+ on mid-range hardware.
    *   Audio cues are spatial (3D audio) relative to player position.
    *   UI elements (Crosshair, Health) are legible against various backgrounds.

### 2.5 Multiplayer (Local)
*   **Fact:** Local co-op is required.
*   **Assumption:** Shared controller or dual keyboard/mouse setup.
*   **Feature Details:**
    *   Input binding for Player 2.
    *   Shared screen, independent HP bars for each player.
    *   [Assumption] No networked online multiplayer for initial scope.
*   **Acceptance Criteria:**
    *   Player 1 and Player 2 inputs do not interfere with each other.
    *   P2 health is independent of P1 health.
    *   Both players contribute to score.

## 3. Non-Functional Requirements
*   **Platform:** PC (Windows) initially.
*   **Engine:** [Assumption] Unity or Unreal Engine 5.
*   **Performance:** 30+ FPS on integrated graphics; 60+ FPS on dedicated GPU.
*   **Load Times:** < 15 seconds from desktop to playable state.

## 4. Missing Information / Open Questions (Assumptions to Validate)
1.  **Monetization:** Is this a free-to-play, premium, or ad-supported game?
2.  **Content Depth:** How many unique enemies? Is there a "level up" system or just wave survival?
3.  **Story:** Is there a narrative component, or is it purely score-chasing?
4.  **Controls:** Does "3D" imply full 360-degree camera rotation or locked perspective?

## 5. Verification Plan
*   **Unit Testing:** Verify projectile physics calculations and collision detection.
*   **Integration Testing:** Run 10-minute stress test with 50 enemies on screen to check performance.
*   **UX Testing:** Have 5 users play the first 3 waves to evaluate "fun factor" and control responsiveness.

*Note: This document is a planning artifact. No code has been written or modified. All technical implementations remain to be defined by the engineering team based on these requirements.*
