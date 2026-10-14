# Feature List: 3D Potato Brothers (Potato Bros 3D)

## 1. Executive Summary & Scope Definition
This document outlines the initial feature set for a new title conceptualized as **"3D Potato Brothers."** The core premise is to translate the 2D, top-down, arcade-style survival shooter mechanics of *Potato Brothers* into a 3D perspective.

### Distinguishing Facts vs. Assumptions
*   **Fact:** The source material *Potato Brothers* is a 2D top-down arcade survival shooter featuring wave-based enemies, room-based progression, weapon upgrades, and local co-op.
*   **Assumption:** The user intends to retain the "Potato" aesthetic and progression systems but shift the camera to 3D. This could be an Over-the-Shoulder (OTS) view, a 3rd Person Over-the-Shoulder (TPS), or a 3D Isometric view. This document assumes a **Third-Person Over-the-Shoulder (TPS)** camera for maximum depth and 3D utilization, while retaining the core "survival wave" loop.
*   **Assumption:** The target platform is PC (Steam) with cross-play potential, utilizing a modern engine (Unreal Engine 5 or Unity HDRP).
*   **Assumption:** "Potato" implies a stylized, low-poly or medium-poly art direction to maintain performance and visual identity.

---

## 2. Core Gameplay Loop (The "Survival 3D" Shift)
The transition from 2D top-down to 3D requires re-engineering how space, movement, and enemy pathing work.

### F.1.1 Camera & Perspective
*   **Description:** Fixed or dynamic third-person over-the-shoulder camera. The camera locks to the target reticle or aims freely.
*   **Acceptance Criteria:**
    *   Camera smoothly tracks player head position with a configurable FOV (default 60–90 degrees).
    *   No clipping through walls when aiming (camera collision resolution required).
    *   Slight camera shake on firing/recoil to enhance 3D impact feedback.
*   **Evidence:** QA test with 100 rapid-fire shots in a narrow corridor; no persistent clipping.

### F.1.2 Movement & Space
*   **Description:** Full 3D movement including jump, crouch, and slide (optional). Gravity applies.
*   **Acceptance Criteria:**
    *   Player can jump over low obstacles and enemies (if physics allow).
    *   Crouch reduces hitbox by 50%.
    *   Movement speed is consistent regardless of camera angle (analog stick mapping, not mouse-based movement).
*   **Evidence:** Timer test: Traversing a standard "Potato" room size should take no more than 30% longer than the 2D original equivalent.

### F.1.3 Combat Mechanics
*   **Description:** Hit-scan or projectile-based weapons with 3D ballistics (gravity drop on projectiles).
*   **Acceptance Criteria:**
    *   Bullets have visible tracers and obey gravity if projectile-type.
    *   Headshot multiplier x1.5 to x2.0 (new mechanic enabled by 3D).
    *   Melee attack (bashing) now has a 3D arc, not a 2D circle.
*   **Evidence:** Debug overlay shows correct headshot hit detection on 100% of valid shots.

---

## 3. Enemy & Wave System (3D Pathing)
In 2D, enemies move on a flat plane. In 3D, they must navigate around pillars, climb ramps, or use verticality.

### F.2.1 3D Navigation & AI
*   **Description:** Enemies use Navigation Meshes (NavMesh) instead of simple A* on a 2D grid.
*   **Acceptance Criteria:**
    *   Enemies can path around 3D obstacles (crates, pillars).
    *   Basic enemies (Zombies/Swordsmen) use ground-only pathing.
    *   Flying enemies (Bats/Bees) use volume-based pathing (fly in 3D space).
    *   No "stuck" states where an enemy oscillates between two objects for >3 seconds.
*   **Evidence:** Automated test spawning 500 enemies in a complex 3D room; 0% stuck rate after 1 minute.

### F.2.2 Wave Spawning in 3D
*   **Description:** Enemies spawn from portals, off-screen corners, or above (sky).
*   **Acceptance Criteria:**
    *   Spawn points are defined in 3D coordinates.
    *   Spawn effect (lightning/portal) is visible in 3D.
    *   No spawning inside the player’s hitbox (minimum spawn distance 5 meters).
*   **Evidence:** Stress test: Spawning 100 enemies simultaneously; no physics explosion or frame drop below 30 FPS on target hardware.

---

## 4. Upgrade & Progression (Adapting 2D to 3D)
The "random upgrade" screen must be adapted to fit a 3D UI/UX context.

### F.3.1 3D UI Presentation
*   **Description:** Upgrades are presented on a floating 3D card interface or a diegetic menu.
*   **Acceptance Criteria:**
    *   UI elements do not obstruct critical 3D gameplay view (HUD is peripheral).
    *   Upgrade cards have 3D models/icons that spin on hover.
    *   Audio cues for selection/confirmation are distinct.
*   **Evidence:** User testing: 90% of players can complete an upgrade selection without reading the text (icon clarity).

### F.3.2 New 3D-Specific Upgrades
*   **Description:** New upgrade types that leverage 3D depth.
*   **Examples:**
    *   *Vertical Reach:* Jump height +50%.
    *   *Wall Run:* Brief slide up walls.
    *   *Aerial Assault:* Can damage enemies from above.
*   **Acceptance Criteria:**
    *   New upgrades must have clear 3D visual effects (VFX) to demonstrate their use.
    *   Balance: 3D-specific upgrades are +15% more powerful than equivalent 2D upgrades to justify complexity.
*   **Evidence:** Playtest metric: Players using vertical upgrades survive 20% longer on average in wave 50+.

---

## 5. Art & Technical Direction
### F.4.1 Stylized 3D Aesthetic
*   **Description:** "Potato" aesthetic implies organic, rounded, low-to-medium poly shapes.
*   **Acceptance Criteria:**
    *   Player and enemy models are stylized (not photorealistic).
    *   Poly count budget: <50k tris for main characters.
    *   Lighting: Baked GI for static rooms, dynamic lights for weapons/explosions.
*   **Evidence:** Frame time check: 60 FPS at 1080p on mid-range PC with all VFX active.

### F.4.2 Audio Spatialization
*   **Description:** 3D positional audio.
*   **Acceptance Criteria:**
    *   Enemy gunfire and footsteps are binaural/positional.
    *   Player can identify enemy direction from audio alone (with eyes closed).
*   **Evidence:** Blindfolded playtest: Players can locate a hidden enemy within 15% accuracy of actual position.

---

## 6. Non-Functional Requirements (Performance)
*   **Target FPS:** 60 FPS stable.
*   **Max Draw Calls:** <1000 per frame.
*   **Memory:** <4GB RAM peak.
*   **Acceptance Criteria:**
    *   No memory leaks after 1 hour of continuous play.
    *   Load time for "Room Transition" < 2 seconds.

---

## 7. Open Questions & Risks (Assumptions to Validate)
1.  **Co-op in 3D:** Does local co-op split the 3D view or use a shared camera? *Assumption: Shared camera with dynamic framing, but split-screen is a fallback.*
2.  **Room Design:** 2D rooms are grid-based. 3D rooms require architectural design. *Risk: Increased asset production time.*
3.  **Physics:** Do potatoes have physics bodies? *Assumption: Yes, enemy knockback applies force vectors.*

---

## 8. Next Steps for Development
1.  **Vertical Slice:** Create one 3D room, 2 enemy types, and 3 weapons.
2.  **Prototype:** Test core movement (TPS vs. Isometric) with graybox assets.
3.  **UI/UX Design:** Mock up the 3D upgrade selection screen.

*Document Owner: Lead Game Designer*
*Version: 0.1 (Draft)*
*Date: 2023-10-27*
