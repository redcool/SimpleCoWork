# Asset Specification: 3D 版《土豆兄弟》(Brotato 3D)

**Document Type:** asset-spec.md  
**Project Phase:** Early Pre-Production / Concept  
**Input Kind:** Idea ("做一个3d的土豆兄弟")  
**Author:** Lead Game Designer (Agnes-3.0-flash)  
**Date:** 2023-10-27  

---

## 1. Executive Summary & Identity Check

**Clarification:**  
The input "做一个3d的土豆兄弟" (Make a 3D version of Brotato) is a *high-level vision*. This document translates that vision into **actionable asset requirements** for a 3D adaptation of the 2D top-down roguelite shooter *Brotato*.  

**Fact vs. Assumption:**  
- **Fact:** *Brotato* is a 2D, top-down, wave-based survival roguelite where a potato character attacks enemies from all directions using 20 dual-wielded weapons.  
- **Assumption:** A 3D version will retain the core gameplay loop (wave survival, loot, character building) but replace the 2D plane with a 3D space (likely top-down or isometric, *not* full 3D exploration).  
- **Assumption:** The "3D" requirement primarily impacts **asset dimensions** (models, textures, shaders, lighting) rather than mechanics (which remain 2D-logic-based).  

**Scope Note:**  
This document defines **only** the technical and artistic asset specifications needed to build the 3D foundation. It does **not** define level design, code architecture, or UI/UX layouts (those are separate handoff documents).  

---

## 2. Core Asset Categories

All assets must support a **top-down or isometric 3D view** where the player character and enemies occupy a flat 2D plane in 3D space (Z-axis used for height/visual effect, not free movement). This is a critical assumption to avoid over-engineering.

### 2.1 Character & Creature Models

#### A. Player Character ("The Potato")
- **Form:** Low-poly organic blob or stylized potato shape.  
- **Poly Budget:**  
  - Hero Model: ≤ 5,000 triangles (excluding weapons).  
  - Rig: Basic bone hierarchy (root, spine, head, left/right arm sockets for weapons). No facial rig needed.  
- **Materials:**  
  - Base Skin: 1 material, PBR (Albedo, Normal, Roughness).  
  - Stylized shading: Use a custom shader or vertex color tinting for health states (green → yellow → red).  
- **Animation Set:**  
  - Idle (breathing/bobbing)  
  - Walk/Run (3D but constrained to flat plane)  
  - Attack (generic "slash" or "throw" pose; weapon-specific animations are not required for MVP)  
  - Hurt (flinch)  
  - Death (squish/pop)  
- **LOD Strategy:**  
  - LOD0: 5,000 tris  
  - LOD1: 2,500 tris  
  - LOD2: Billboard or simplified mesh  

#### B. Enemy Models (Tier 1–3)
- **Count:** 6 unique enemy archetypes for MVP.  
- **Poly Budget:** ≤ 3,000 triangles per enemy.  
- **Materials:** 1 PBR material per enemy.  
- **Animation Set:**  
  - Idle, Walk, Attack, Hurt, Death.  
  - No complex AI-driven animations; use state-machine driven loops.  

#### C. Weapon Models
- **Count:** 20 weapon slots, but only 10 unique weapon models for MVP (dual-wield mirrors).  
- **Poly Budget:** ≤ 1,000 triangles per weapon.  
- **Attach Points:** Defined socket tags: `WeaponSocket_L`, `WeaponSocket_R`.  
- **Material:** PBR, with emissive property for glow effects (e.g., fiery sword).  

### 2.2 Environment & Level Assets

#### A. Level Plane
- **Structure:** Modular tile-based system (e.g., 2m x 2m tiles).  
- **Tile Types:**  
  - Ground (grass, dirt, stone)  
  - Walls (blockers, cover)  
  - Hazards (spikes, lava)  
- **Poly Budget:** ≤ 500 triangles per tile.  
- **Material:** One shared PBR material for ground, one for walls. Use texture atlasing for variation.  

#### B. Obstacles & Pickups
- **Chests:** 3 variants (common, rare, epic). Poly: ≤ 1,500 tris.  
- **Pickups (Health, Weapons, Coins):** Billboards or low-poly props (≤ 200 tris). Use particle effects for visual flair.  

### 2.3 VFX & Particles

- **Style:** Stylized, high-contrast, readable at top-down view.  
- **Key Effects:**  
  - Weapon Hit Spikes (impact points)  
  - Death Explosions (per enemy type)  
  - Player Damage Flash  
  - Environment Hazards (lava bubbles, spike glow)  
- **Budget:**  
  - Max active particles on screen: 500  
  - Particle size: 32x32 or 64x64 textures  
  - No volumetric lighting in MVP.  

### 2.4 Audio Assets

- **Formats:** OGG or WAV (44.1kHz).  
- **Channels:** Stereo for positional audio (enemies around player), Mono for UI/ambient.  
- **Key Files:**  
  - `player_attack.wav` (generic)  
  - `enemy_hit_<type>.wav` (6 types)  
  - `wave_start.wav`, `wave_end.wav`  
  - `ambient_loop.wav` (per level theme)  

---

## 3. Technical Specifications & Constraints

### 3.1 Rendering Pipeline
- **Projection:** Orthographic or Perspective (isometric) with vertical angle ~45–60 degrees.  
- **Lighting:** Baked GI for static environment. Dynamic light for weapons/hazards (max 8 dynamic lights on screen).  
- **Shadows:** Projected shadows only (no cascaded shadow maps in MVP).  

### 3.2 Texture Resolution
- **Character/Enemies:** 512x512 or 1024x1024 PBR sets.  
- **Environment:** 2048x2048 tiled textures.  
- **VFX:** 128x128 – 256x256 alpha-masked.  

### 3.3 File Naming Convention
- **Prefix:** `AST_`  
- **Structure:** `AST_[Category]_[SubType]_[Name]_[Version]`  
- **Example:** `AST_NPC_E01_Goblin_LOD0_v01.fbx`  
- **Suffixes:** `_tex`, `_nrm`, `_rough`, `_metal` for texture variants.  

---

## 4. Acceptance Criteria & Evidence

| Asset Category | Acceptance Criteria | Evidence / Verification Method |
|----------------|---------------------|-------------------------------|
| **Hero Model** | - ≤ 5,000 tris<br>- No T-pose clipping<br>- All sockets visible in Unity/Unreal | - Poly count report in engine<br>- Screenshot of socket debug view |
| **Enemy Models (6)** | - ≤ 3,000 tris each<br>- Animation loops seamless<br>- Distinct silhouettes | - Poly count report<br>- Animation timeline review |
| **Weapon Models (10)** | - ≤ 1,000 tris each<br>- Attach cleanly to hands<br>- Emissive works | - In-game test: equip all weapons, check for z-fighting |
| **Environment Tiles** | - Modular, no visible seams<br>- ≤ 500 tris per tile<br>- Texture tiling seamless | - 10x10 tile assembly test in engine |
| **VFX** | - < 2ms GPU overhead for max particles<br>- Readable at 1080p<br>- No overdraw > 3x | - Profiler report (Unity/Unreal)<br>- Visual QA at 1080p/720p |
| **Audio** | - No clipping at 0dB<br>- Positional audio works in 3D space<br>- Loops seamless | - Audio editor review<br>- In-game spatial audio test |

---

## 5. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Over-scoping 3D movement** | High | High | **Enforce 2D plane constraint in code. No Z-axis free movement.** |
| **Performance hit on mobile** | Medium | High | **Target 30 FPS on mid-range mobile. Use LOD2 aggressively.** |
| **Art style mismatch** | Medium | Medium | **Create 3 stylized references (low-poly, mid-poly, high-poly) and select one before full production.** |
| **Weapon visual clutter** | High | Medium | **Limit simultaneous weapon count to 2 (dual-wield). Use distinct color coding.** |

---

## 6. Excluded Assets (Out of Scope for MVP)

- Full 3D level exploration (no jumping, climbing, or vertical traversal).  
- Cinematic cutscene animations.  
- High-poly hero model.  
- Dynamic weather/lighting systems.  
- More than 10 weapon types (initial set only).  

---

## 7. Next Steps

1. **Art Team:** Create 3 hero model variants (low-poly, mid-poly, stylized) for style validation.  
2. **Engine Team:** Set up orthographic/isometric camera pipeline and 2D-plane movement constraints.  
3. **QA Team:** Define poly-count and performance budget test cases.  
4. **Lead Designer:** Confirm enemy archetype list (6 types) and weapon list (10 types) for MVP.  

---

**Note:** No code has been written or changed in this document. This is a specification for asset production and technical constraints only.
