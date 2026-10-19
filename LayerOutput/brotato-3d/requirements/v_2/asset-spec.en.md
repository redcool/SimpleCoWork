# Asset Specification: 3D "Potato Bros" Project

## 1. Executive Summary
This document defines the technical and artistic asset requirements for "Potato Bros," a 3D adaptation of the 2D tower-defense-like survival game *Brotato*. The project aims to translate core mechanics (auto-firing, inventory management, enemy waves) into a 3D environment while maintaining the original's fast-paced, accessible feel. This spec covers model topology, material standards, animation rigs, and performance budgets.

## 2. Scope and Identity
*   **Core Concept:** A 3D twin-stick/shooter variant of *Brotato* where the player controls a potato character in a 3D arena, managing a limited inventory grid of weapons and items while surviving waves of 3D enemies.
*   **Genre:** 3D Action-ARPG / Wave Survival.
*   **Platform:** PC (High/Mid/Low presets), Mobile (Optimized).
*   **Engine:** Unreal Engine 5 (Assumed for lighting/performance parity; if Unity, specs will require adjustment for LOD and shader complexity).

## 3. Asset Categories and Specifications

### 3.1 Character Assets (Player)
**Fact:** The protagonist is a potato-like creature.
**Assumption:** The character will have a humanoid rig for 3D movement, unlike the 2D top-down static sprite.

*   **Mesh (Player_Potato):**
    *   **Topology:** Mid-poly, quad-based. 1,500–2,500 triangles per mesh.
    *   **Normals:** Smooth shaded with custom normal map to retain the "bumpy" potato texture without adding geometric cost.
    *   **UVs:** Single UV channel, 1024x1024 texture space per material layer. No overlapping UVs.
    *   **Materials:** PBR (Base Color, Normal, Roughness, Metallic). Roughness variation to mimic organic surface.
    *   **Acceptance Criteria:**
        *   Model renders without Z-fighting at all LODs.
        *   Animation weight painting is clean (no mesh tearing during max-effort runs/jumps).
        *   Texture pop-in is not visible at 10m distance (LOD0).

*   **Skeleton (Rig):**
    *   **Bones:** Humanoid standard + 4 finger bones per hand (for item swapping animations). Total < 40 bones.
    *   **Morph Targets:** None.
    *   **Acceptance Criteria:**
        *   Rig interpolates smoothly between `Run`, `Attack`, `Reload`, and `Death` states.
        *   Bone hierarchy allows for IK foot planting to prevent sliding.

### 3.2 Enemy Assets
**Fact:** Enemies in *Brotato* are simple geometric shapes or organic blobs.
**Assumption:** In 3D, enemies will retain organic/biomorphic shapes but require distinct silhouettes for readability in 3D space.

*   **Enemy Set (Initial 3 Types):**
    1.  **Blob (Grunt):** 500–800 tris. PBR material with high subsurface scattering (SSS) approximation.
    2.  **Spiky (Ranged):** 800–1,200 tris. Sharp geometry, normal map for spike detail.
    3.  **Heavy (Tank):** 1,500–2,000 tris. High mass visual weight.
*   **Materials:**
    *   Shared material instance library for performance.
    *   Emissive channel reserved for "health state" (low health = pulsing red emissive).
*   **Acceptance Criteria:**
    *   Distinct silhouette against all background environments (Tested with 3 contrast backgrounds).
    *   Draw call budget: < 50 draw calls for 100 enemies on screen (Achieved via Nanite or LOD merging if UE5).

### 3.3 Weapon & Item Assets (Inventory Grid)
**Fact:** *Brotato* features a 3x4 grid of items.
**Assumption:** Items are held in the player's hands or displayed on a 3D HUD overlay. The spec assumes **hand-held** models for 3D realism.

*   **Model Constraints:**
    *   **Triangle Count:** < 500 tris per item.
    *   **Texture Resolution:** 512x512 per item (share atlas if similar).
    *   **Scale:** Must fit within player's hand mesh bounds (approx. 10cm in game units).
*   **Animation Requirements:**
    *   `Equip`, `Fire`, `Reload`, `Unequip` per item.
    *   **Acceptance Criteria:**
        *   Weapon does not intersect with the character mesh (root bone).
        *   Fire animation triggers muzzle flash particle attachment point correctly.

### 3.4 Environment & Arena
**Assumption:** The arena is a closed, 3D box or circular pit.

*   **Arena Mesh:**
    *   **Walls/Floor:** Tiled PBR material, 2048x2044 texture.
    *   **Lighting:** Baked GI (Global Illumination) for low-end; Real-time Lumen for high-end.
    *   **Obstacles:** 5–10 unique cover objects (rocks, crates). 1,000–2,000 tris each.
*   **Acceptance Criteria:**
    *   No texture bleeding.
    *   NavMesh generation is clean (no blocked paths except intended).
    *   Visual clarity: Player can identify enemy positions from any angle in the arena.

## 4. Technical Performance Budgets

| Asset Type | LOD0 | LOD1 | LOD2 | Max Distance |
| :--- | :--- | :--- | :--- | :--- |
| Player | 2,500 tris | 1,200 tris | 300 tris (Billboard) | 50m |
| Enemies | 1,500 tris | 700 tris | 100 tris (Billboard) | 30m |
| Items | 500 tris | N/A | N/A | 5m (First Person) |

*   **Draw Call Limit:** < 100 per frame for 100 enemies + player + environment.
*   **Texture Memory:** < 256MB for all game assets combined.
*   **Animation Blending:** Cross-fade time: 0.2s standard, 0.1s for combat attacks.

## 5. Animation & VFX Standards

*   **Player VFX:**
    *   Muzzle flash: Particle system, 50 particles max, 0.1s lifetime.
    *   Hit Feedback: Screen shake intensity 0.5, 0.05s duration.
    *   **Acceptance Criteria:** VFX does not obscure the crosshair or enemy target for > 0.2s.

*   **Enemy Death:**
    *   Particle burst (color-coded by enemy type).
    *   **Acceptance Criteria:** Death animation does not freeze frame; ragdoll or dissolve effect lasts < 0.5s.

## 6. Assumptions & Risks

| ID | Assumption | Risk | Mitigation |
| :--- | :--- | :--- | :--- |
| A1 | Player controls are twin-stick (Left: Move, Right: Aim/Shoot). | If original *Brotato* auto-aim is intended, 3D camera angle becomes critical. | Define camera offset: 45-degree top-down iso view. No free-fly. |
| A2 | 3D conversion retains 3x4 inventory. | UI scaling in 3D may clutter screen. | Implement 3D holographic UI panel anchored to bottom of screen. |
| A3 | Performance target is 60 FPS on mid-range PC. | 3D enemies x100 may stress CPU. | Use GPU instancing for static props; limit dynamic lights to 1–2 per enemy. |

## 7. Acceptance Testing (QA Checklist)

1.  **Visual Fidelity:**
    *   [ ] No texture stretching on player and enemies.
    *   [ ] Lighting changes dynamically based on time of day (if applicable) or environmental lights.
2.  **Performance:**
    *   [ ] Frame time stable at 16ms (60 FPS) with 50 enemies on screen (Mid preset).
    *   [ ] LOD transitions are seamless (no pop-in).
3.  **Functionality:**
    *   [ ] Weapon switching animates without clipping through the character's arm.
    *   [ ] Enemy hitboxes align with visual mesh (tested with debugger visuals).
4.  **Audio Sync:**
    *   [ ] Footsteps trigger at correct animation keyframes (Impact 1 & Impact 2).

## 8. Handoff to Development

*   **Art Team:** Deliver LOD0/1/2 meshes, textures (TBC, NRM, ORM, EMISSIVE), and FBX files with baked transforms.
*   **Animation Team:** Deliver `.uasset` animations with proper bone naming conventions (`bone_chest`, `bone_hand_r`, etc.).
*   **Programmer:** Implement LOD system and inventory grid UI.
*   **No code was changed in this document; this is a specification for future implementation.**
