# Requirements Document: 3D Potato Brothers

**Version:** 0.1 (Draft)  
**Status:** Requires Review  
**Author:** Studio CoWork Requirements Layer  

## 1. Executive Summary
This document outlines the initial requirements for developing "3D Potato Brothers," a 3D adaptation of the 2D wave-based roguelike survival game *Potato Brothers* (also known as *Brotato*). The core goal is to preserve the original game's gameplay loop—surviving increasingly difficult enemy waves by managing resources, upgrading weapons, and navigating a 3D arena—while leveraging 3D space for new movement, positional strategies, and visual depth.

## 2. Scope & Boundaries

### In Scope (Facts)
*   **Genre:** 3D Roguelike Wave Survivor / Bullet-Heaven.
*   **Core Mechanic:** Auto-shooting weapons, enemy wave spawning, player movement, shop-based upgrades.
*   **Visual Style:** 3D Low-Poly or Stylized 3D (assumed to maintain performance similar to the original).
*   **Platforms:** Initial target is PC (Steam). Mobile/Console support is out of scope for the MVP.

### Out of Scope (Assumptions)
*   **Multiplayer:** Co-op or competitive multiplayer is not included in the initial MVP.
*   **Procedural Generation:** Maps are fixed arenas (similar to original), not procedurally generated open worlds.
*   **Narrative:** The game is character-driven, not narrative-driven. No cutscenes or story modes.
*   **Physics-Based Combat:** Weapons are hitscan or projectile-based; no ragdoll physics or destructible environments in the MVP.

## 3. Gameplay Core Loop

### 3.1 Run Structure
1.  **Character Selection:** Player chooses one of several unique characters, each with distinct stats (movement speed, max health, shield, crit chance, etc.) and unique abilities.
2.  **Wave Phase:** Player survives waves of enemies in a 3D arena. Enemies spawn from designated points or edges.
3.  **Shop Phase:** After each wave, the shop opens. Players use gold to buy weapons, passives, and healing items.
4.  **Upgrade Phase:** Players can spend souls (earned on kill) to upgrade weapons or unlock character abilities.
5.  **Loop:** Repeat until the player dies or completes the final wave (typically wave 30).

### 3.2 3D-Specific Movement & Positioning
*   **Movement:** 6-axis movement (Forward/Backward, Left/Right, Up/Down relative to camera or WASD/DPad). Sprint mechanic with stamina or cooldown.
*   **Aiming:** 
    *   *Assumption:* Auto-aim is retained for fast-paced gameplay, but manual aim (mouse look) is available as an optional setting.
    *   *Evidence:* 3D space introduces depth. If manual aim is not supported, auto-aim logic must prioritize enemies based on proximity, threat level, and lane.
*   **Collision:** Players and enemies have 3D bounding boxes. Overlap results in damage.

## 4. Functional Requirements

### 4.1 Weapons & Items
*   **Weapons:** 
    *   Must be equipped in slots (max 5 slots, assuming original limit).
    *   Stats include: Damage, Fire Rate, Bullet Speed, Range, Multiplier, Spread, Pierce.
    *   *Acceptance Criteria:* A weapon with "Spread: 2" must fire 3 projectiles in a fan pattern. A weapon with "Pierce: 1" must damage two enemies in a straight line without consuming the projectile.
*   **Passive Items:**
    *   Modify character stats (e.g., +10% Move Speed, +5 Max Health).
    *   *Acceptance Criteria:* Equipping a "Speed" passive must result in a measurable increase in movement velocity in units/second.

### 4.2 Enemy Design
*   **Archetypes:**
    *   *Melee:* High speed, low HP, damage on contact.
    *   *Ranged:* Keep distance, fire projectiles.
    *   *Heavy:* Slow, high HP, high damage.
    *   *Special:* Behaviors that break the loop (e.g., shield that must be destroyed, teleportation).
*   **Scaling:** Enemy HP, damage, and count scale exponentially with wave number.
*   *Assumption:* 3D movement allows enemies to attack from above/below. Enemies will use vertical movement to close distance if the player is above/below their preferred range.

### 4.3 Shop & Progression
*   **Gold:** Earned from killing enemies. Drops in 3D pickups.
*   **Shop Display:** 2D UI overlay showing 5 random items (weapons or passives).
*   **Reroll Mechanic:** Players can spend gold to reroll shop items.
*   *Acceptance Criteria:* Rerolling must generate a new set of items based on the player's current level and rarity weights.

## 5. Technical Requirements

### 5.1 Engine & Performance
*   **Engine:** Unity (URP) or Unreal (Stylized). *Assumption: Unity chosen for easier 3D stylized asset pipeline and cross-platform potential.*
*   **Target FPS:** 60 FPS on mid-range PC (e.g., RTX 3060 / RX 6600) at 1080p.
*   **Object Count:** Support up to 500+ active enemies on screen without significant frame drops.
    *   *Evidence:* Original game supports high enemy counts. 3D requires instancing for enemy models.
*   **Memory:** Stay under 2GB RAM during peak wave (Wave 30).

### 5.2 3D Specific Systems
*   **Camera:**
    *   Isometric or Over-the-Shoulder Camera.
    *   *Assumption:* Isometric top-down view is preferred for wave survival to maintain situational awareness.
*   **Line of Sight:**
    *   Weapons must check 3D line of sight. Obstacles (if any) will block projectiles.
    *   *Fact:* MVP assumes no obstacles. If obstacles are added later, LOS calculation must be implemented.
*   **Shadows & Lighting:**
    *   Use baked lighting or cheap dynamic lights for performance.

## 6. User Interface (UI)

### 6.1 HUD
*   **Health/Shield:** 3D model attached to player + 2D UI bar for readability.
*   **Wave Timer:** Top center.
*   **Shop UI:** Full-screen 2D overlay during shop phase.
*   *Acceptance Criteria:* UI elements must be legible at all camera angles.

### 6.2 Inventory
*   **Weapon Wheel:** Show equipped weapons with icons, stats, and cooldowns (if any).
*   **Character Stats:** Panel showing all modified stats.

## 7. Art & Audio Direction

*   **Art Style:** Stylized Low-Poly 3D. Characters and enemies should be clearly distinguishable by silhouette.
    *   *Assumption:* Bright, saturated colors to contrast with dark backgrounds.
*   **Audio:** 
    *   8-bit or synth-wave soundtrack (matching original vibe).
    *   3D positional audio for enemy sounds (shooting, death) to aid spatial awareness.

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 3D Movement Confusion | High | Implement camera controls with sensitivity settings. Provide tutorial levels. |
| Performance Drop | High | Use GPU instancing for enemies. Limit particle effects per frame. |
| Auto-Aim Feel | Medium | Tune auto-aim priority (closest, highest threat). Allow manual aim fallback. |
| Scope Creep (Obstacles) | Medium | Explicitly defer obstacles to post-MVP. Focus on open arena first. |

## 9. Acceptance Criteria for MVP (Definition of Done)

1.  Player can select a character, move in 3D space, and shoot at enemies.
2.  Enemies spawn in waves, scale in difficulty, and can kill the player.
3.  Player can earn gold and buy weapons/passives from a shop.
4.  Weapons function correctly with their stats (spread, pierce, etc.).
5.  Game ends when player dies or completes wave 30.
6.  Game runs at 60 FPS with 300+ enemies on screen on target hardware.

## 10. Open Questions

1.  Will the arena be a simple cube or have boundaries that the player can go "over"?
2.  Do enemies spawn from "portals" or fall from the sky?
3.  Is there a day/night cycle affecting enemy spawn rates?
4.  Will character abilities have active cooldowns, or are they passive?

---
**Next Steps:**
1.  Prototype 3D movement and auto-aim feel.
2.  Define enemy archetypes and scaling math.
3.  Create vertical slice with 1 character, 5 weapons, and 10 waves.
