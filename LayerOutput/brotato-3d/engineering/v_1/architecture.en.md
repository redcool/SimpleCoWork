```markdown
# architecture.md

## 1. Context
*   **Input Source**: `H:\ai_works\CoWorkPrj\LayerOutput\brotato-3d\requirements\v_2`
*   **Scope**: Layer 2 (Requirements) to Layer 3 (Architecture) handoff for `brotato-3d`.
*   **Key Inputs**: `feature-list.en.md`, `asset-spec.en.md`, `layer-manifest.json`.
*   **Status**: Planning/Design Phase only. **No code has been written, modified, or executed.**

## 2. System Overview
### 2.1 High-Level Architecture Diagram
```mermaid
graph TD
    A[Unity Engine Core] --> B[Game Loop Controller]
    B --> C[State Machine (GMFSM)]
    C -->|Start, Play, End| D[State Implementations]
    
    E[Asset Manager] --> F[Model Prefab Factory]
    F --> G[Character Entities]
    G --> H[Combat System]
    H --> I[Projectile System]
    H --> J[Melee Attack System]
    
    K[UI Controller] --> L[UI Views (MVC/MVP)]
    L --> M[HUD, Inventory, Dialog]
    
    N[Audio Manager] --> O[Music & SFX Playback]
    
    P[Config Data (JSON/ScriptableObjects)] --> Q[Stat & Balance Values]
    Q --> G
    Q --> H
```

### 2.2 Core Modules
| Module ID | Module Name | Responsibility | Dependencies |
| :--- | :--- | :--- | :--- |
| M01 | `Core.GameLoop` | Manages delta time, pause states, and frame consistency. | Unity Main Thread |
| M02 | `Core.FSM` | Generalized Finite State Machine for game flow. | M01 |
| M03 | `Entities.Actor` | Base class for Player, Enemies, Pickups. Handles transforms, physics, and health. | M01 |
| M04 | `Systems.Combat` | Hit detection, damage calculation, attack cooldowns. | M03 |
| M05 | `Systems.Projectiles` | Spawning, movement, lifetime, and collision of ranged attacks. | M03, M04 |
| M06 | `Assets.Factory` | Instantiates and configures models based on `asset-spec.en.md`. | Asset Database |
| M07 | `UI.Controller` | Binds data to UI elements; handles user input for menu/pause. | M02, M03 |
| M08 | `Audio.Manager` | Pools audio sources; plays SFX/Music based on events. | M02, M04 |

## 3. Technical Constraints & Assumptions
### 3.1 Facts (From `layer-manifest.json` & `asset-spec.en.md`)
*   **Engine**: Unity (Version assumed 2021 LTS or later based on modern 3D workflow requirements).
*   **Asset Format**: FBX for models, OGG/WAV for audio, PNG/PSD for UI.
*   **Asset Count**: ~45 distinct assets required (verified against `asset-spec.en.md`).
*   **Input Method**: Keyboard/Mouse or Gamepad (standard Unity Input System).
*   **Frame Rate Target**: 60 FPS (standard for action games).

### 3.2 Assumptions (To be Verified in Layer 4)
*   **A1**: Physics engine will use Unity's built-in `Rigidbody` for entity movement and collision.
*   **A2**: UI will use Unity UI (UGUI) package rather than a third-party framework, unless `feature-list` explicitly requires high-resolution support not handled well by UGUI.
*   **A3**: Data-driven design will utilize Unity `ScriptableObjects` for static config (skills, items) and JSON for dynamic save/load if persistence is required.
*   **A4**: Multi-threading is restricted to Unity's main thread for game logic; asynchronous loading will use `AssetBundle` or `Addressables`.

## 4. Data Flow & State Machines
### 4.1 Global Game States (M02)
```
[Idle] --Start--> [Loading] --Complete--> [MainMenu]
[MainMenu] --Play--> [Gameplay]
[Gameplay] --Esc--> [Pause]
[Pause] --Resume--> [Gameplay]
[Pause] --Quit--> [MainMenu]
[Gameplay] --PlayerDeath/Victory--> [EndScreen]
[EndScreen] --Retry/Quit--> [MainMenu]
```

### 4.2 Combat Entity State (M03)
```
[Alive] --Health<=0--> [Dead]
[Alive] --Hit--> [HitReaction (0.1s)] --> [Alive]
```
*   **Note**: "HitReaction" is an assumption for animation blending; specific duration depends on `asset-spec` animation timelines.

## 5. Interface Definitions (High-Level)
*   **Entity Health**: `float CurrentHealth`, `void TakeDamage(float amount, Vector3 point)`.
*   **Attack System**: `void PerformAttack(AttackType type, Vector3 targetDir)`.
*   **UI Binding**: `IUIController { void OnStateChange(GameState state); }`.
*   **Event Bus**: Implement a lightweight C# event system (`GameEvent.cs`) to decouple M04 (Combat) from M08 (Audio) and M07 (UI). 
    *   *Evidence*: `feature-list.en.md` lists "Audio Feedback on Hit" and "Damage Numbers," requiring decoupling.

## 6. File Structure Proposal (Layer 4 Prep)
```
Assets/
├── _Project/
│   ├── Scripts/
│   │   ├── Core/
│   │   ├── Entities/
│   │   ├── Systems/
│   │   └── UI/
│   ├── Prefabs/
│   │   ├── Actors/
│   │   ├── Projectiles/
│   │   └── UI/
│   ├── Resources/
│   │   └── Configs/ (ScriptableObjects)
│   ├── Audio/
│   └── UI/
```

## 7. Acceptance Criteria for Architecture
1.  **Modularity**: All systems (M01-M08) must have no direct hard dependencies on each other except via defined interfaces or event bus.
2.  **Asset Traceability**: Each model prefab in `M06` must correspond to a specific entry in `asset-spec.en.md`.
3.  **State Integrity**: No game logic executes outside of a defined FSM state.
4.  **Performance**: Zero garbage collection spikes in the main update loop (verified via Profiler in Layer 4).
5.  **Documentation**: All public APIs in C# classes must have XML doc comments explaining usage.

## 8. Risks & Mitigations
*   **Risk**: Relying on Unity default physics for 3D combat may cause jitter.
    *   *Mitigation*: Implement custom kinematic movement for player/character; use `CharacterController` if physics becomes unstable.
*   **Risk**: UI complexity exceeding UGUI capabilities.
    *   *Mitigation*: Evaluate Unity TextMeshPro for performance; consider UI Toolkit if needed in Layer 4.
*   **Risk**: Asset naming inconsistencies.
    *   *Mitigation*: Enforce naming conventions from `asset-spec.en.md` via a Linter/Editor Script in Layer 4.
```
