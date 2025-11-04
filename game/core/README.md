# Heroes of Crypto Core Game Logic

This package contains the core game logic for the Heroes of Crypto browser-based game client. It implements the game mechanics using WebGL for rendering and Box2D physics engine for physics simulation.

## Project Structure

```
src/
├── api/              # API clients for authentication, matchmaking, and game services
├── draw/             # Rendering and animation utilities
├── menu/             # UI components (buttons)
├── obstacles/        # Obstacle generation and management
├── scenes/           # Game scenes and scene management
├── spells/           # Spell rendering and management
├── state/            # UI state interfaces and types
├── stats/            # Game statistics tracking
├── units/            # Unit creation, management, and rendering
├── utils/            # Utility functions and classes
│   └── gl/           # WebGL-specific utilities
├── intex.ts          # Main entry point (note the intentional misspelling)
├── manager.ts        # Game manager and orchestration
├── settings.ts       # Game settings and configuration
└── statics.ts        # Static constants and values
```

## Source Files Documentation

### Core Files

#### `src/intex.ts`
Main entry point for the application. Imports the scenes module to initialize the game.

#### `src/manager.ts`
Game manager class that orchestrates the entire game lifecycle:
- Manages game scenes and scene transitions
- Handles input events (mouse, keyboard)
- Manages WebGL rendering context and textures
- Coordinates game state updates and UI events
- Implements the main game loop and simulation
- Provides interfaces for UI components to interact with game logic

#### `src/settings.ts`
Game settings and configuration:
- Physics simulation parameters (hertz, iterations)
- Rendering options (draw shapes, particles, joints, etc.)
- Debug drawing configuration
- Game-specific settings like unit amounts

#### `src/statics.ts`
Static constants used throughout the game:
- Physics constants (NO_VELOCITY)
- UI constants (FRAME_MAX_ELEMENTS_COUNT, EDGES_SIZE)
- Animation constants (MAX_FPS, DAMAGE_ANIMATION_TICKS)
- Sprite positioning constants
- Game spawn parameters

### API Layer

#### `src/api/axios.tsx`
API client configuration and HTTP interceptors:
- Configures axios instances for authentication, matchmaking, and game APIs
- Implements response interceptors for token management and error handling
- Defines API endpoints for all services
- Provides authentication fetcher utility

### Drawing and Rendering

#### `src/draw/animation_settings.ts`
Animation speed constants:
- MOVE_ANIMATION_SPEED: Unit movement animation speed
- FLY_ANIMATION_SPEED: Flying unit animation speed
- BULLET_ANIMATION_SPEED: Projectile animation speed

#### `src/draw/drawer.ts`
Main drawing and animation system:
- Implements grid rendering with support for large units
- Manages terrain obstacle rendering
- Handles unit animations (movement, flying, bullets)
- Renders attack paths, highlighted cells, and aura areas
- Manages hole layer rendering for narrowing mechanics
- Coordinates animation timing and frame rate

#### `src/draw/drawable_placement.ts`
Placement visualization:
- Drawable placement classes that extend base placement logic
- Visual representation of unit placement areas on the grid
- Team-specific coloring for placement zones

### Menu Components

#### `src/menu/button.ts`
Interactive button component:
- WebGL-based button rendering with sprites
- Positioning and hover detection
- Selection state management
- Support for different sprite states (active, light/dark mode)

### Obstacle System

#### `src/obstacles/obstacle.ts`
Obstacle base class:
- Represents different types of obstacles (mountains, water, lava, blocks)
- Handles obstacle rendering with light/dark mode sprites
- Manages obstacle properties and positioning
- Implements hit point visualization for destructible obstacles

#### `src/obstacles/obstacle_generator.ts`
Obstacle factory:
- Generates different types of obstacles (holes, lava, mountains, water)
- Creates physics bodies for obstacles in the Box2D world
- Manages obstacle textures and visual properties

### Scene Management

#### `src/scenes/scene.ts`
Base scene class:
- Abstract base class for all game scenes
- Implements Box2D contact listener for physics interactions
- Manages scene lifecycle (start, destroy, resize)
- Handles mouse interactions and unit selection
- Manages UI state and button groups
- Implements debug drawing and profiling
- Coordinates attack handling and unit management

#### `src/scenes/gl_scene.ts`
WebGL-specific scene base class:
- Extends base scene with WebGL rendering capabilities
- Manages RayHandler for lighting effects
- Handles blending modes and debug light rendering
- Implements WebGL canvas clearing and resizing

#### `src/scenes/scene_log.ts`
Scene event logging:
- Tracks and manages scene events and log messages
- Implements a circular buffer for log entries
- Provides interface for checking if log has been updated

#### `src/scenes/scene_settings.ts`
Scene configuration:
- Manages scene-specific settings like grid configuration
- Controls draggable state for scene objects
- Wraps grid settings for scene use

#### `src/scenes/test_heroes.ts`
Main game scene implementation:
- Implements the core Heroes of Crypto gameplay
- Manages unit spawning and placement
- Handles turn-based combat mechanics
- Implements AI decision making
- Manages spell casting and spellbook UI
- Coordinates grid narrowing mechanics
- Handles faction selection and synergy propagation
- Manages game state and win conditions

### Spell System

#### `src/spells/renderable_spell.ts`
Spell rendering implementation:
- Extends base spell with WebGL rendering capabilities
- Manages spell positioning in spellbook UI
- Handles spell hover detection and interaction
- Renders spell stack power requirements
- Manages spell availability based on caster power

### State Management

#### `src/state/visible_state.ts`
UI state interfaces and types:
- Defines interfaces for visible units, impacts, and overall game state
- Enumerates button states and visibility options
- Defines hover information structure
- Manages synergy level types

### Statistics

#### `src/stats/damage_stats.ts`
Damage statistics tracking:
- Tracks damage dealt by units throughout the game
- Manages damage statistics by unit and team
- Tracks which laps had damage dealt
- Provides sorted damage statistics for UI display

### Unit System

#### `src/units/heroes.ts`
Hero unit implementation:
- Specialized unit class for hero units
- Overrides health bar rendering (heroes don't have stack power bars)
- Inherits all base unit functionality

#### `src/units/renderable_unit.ts`
Renderable unit base class:
- Extends base unit with WebGL rendering capabilities
- Manages unit sprites and visual effects
- Implements damage animation system
- Handles spell rendering and spellbook interaction
- Manages unit selection visualization
- Implements resurrection animation
- Handles health bar rendering for unit stacks

#### `src/units/units_factory.ts`
Unit creation factory:
- Creates and spawns game units and heroes
- Manages unit textures and sprite creation
- Handles unit positioning on the game board
- Implements unit cloning and splitting mechanics
- Manages faction-specific unit creation
- Coordinates with the grid system for unit placement

## Box2D Physics Engine Usage

The game heavily relies on the Box2D physics engine for physics simulation, collision detection, and body management. When migrating to a new engine, these files will need to be modified:

### Core Box2D Dependencies

More data in [BOX2D_DEPENDENCIES](./BOX2D_DEPENDENCIES.md)

#### `src/manager.ts`
- **Imports**: `b2Vec2`, `DebugDraw` from `@box2d/core`
- **Usage**: Camera management, debug drawing, coordinate transformations

#### `src/scenes/scene.ts`
- **Imports**: Multiple Box2D modules including `b2AABB`, `b2Body`, `b2Draw`, `b2Contact`, etc.
- **Usage**: Base scene class implementing Box2D contact listener, body management, joint handling, and physics world management

#### `src/scenes/gl_scene.ts`
- **Imports**: `BlendFunc`, `Light`, `RayHandler` from `@box2d/lights`
- **Usage**: Lighting effects integration with Box2D physics world

#### `src/draw/drawer.ts`
- **Imports**: `b2Body`, `b2Fixture`, `b2Vec2`, `b2World`, `b2Draw` from `@box2d/core`
- **Usage**: Physics-based animations, bullet movement, unit movement paths

#### `src/obstacles/obstacle_generator.ts`
- **Imports**: `b2World`, `b2BodyType`, `b2PolygonShape` from `@box2d/core`
- **Usage**: Creating physical bodies for obstacles in the game world

#### `src/obstacles/obstacle.ts`
- **Imports**: `b2Draw`, `b2Color` from `@box2d/core`
- **Usage**: Debug drawing of obstacle boundaries and hit bars

#### `src/units/renderable_unit.ts`
- **Imports**: `b2BodyDef`, `b2BodyType`, `b2FixtureDef`, `b2PolygonShape` from `@box2d/core`
- **Usage**: Creating physical bodies and fixtures for game units

#### `src/units/units_factory.ts`
- **Imports**: `b2Body`, `b2Fixture`, `b2World` from `@box2d/core`
- **Usage**: Spawning units with physical bodies in the Box2D world

#### `src/menu/button.ts`
- **Imports**: `b2FixtureDef`, `b2PolygonShape`, `b2Vec2` from `@box2d/core`
- **Usage**: Creating physical fixtures for interactive UI buttons

#### `src/utils/camera.ts`
- **Imports**: `b2Vec2`, `XY` from `@box2d/core`; `vec3`, `mat4` from `gl-matrix`
- **Usage**: Coordinate transformations between world and screen space

#### `src/utils/lights/RayHandlerImpl.ts`
- **Imports**: `b2World`, `b2Body` from `@box2d/core`; `RayHandler`, `Light` from `@box2d/lights`
- **Usage**: Custom implementation of lighting ray casting integrated with Box2D physics

### Box2D Controllers

#### `src/scenes/scene.ts`
- **Imports**: `DrawControllers` from `@box2d/controllers`
- **Usage**: Rendering of physics controllers (if any are used)

### Box2D Particles

#### `src/scenes/scene.ts`
- **Imports**: `b2ParticleGroup`, `DrawParticleSystems` from `@box2d/particles`
- **Usage**: Particle system management and rendering

### Additional Box2D Dependencies

#### `src/draw/drawable_placement.ts`
- **Imports**: `b2Color`, `b2Draw` from `@box2d/core`
- **Usage**: Debug drawing of placement areas

#### `src/utils/gl/vertex.ts`
- **Imports**: `DEG_TO_RAD` from `@box2d/lights`
- **Usage**: Degree to radian conversion for lighting calculations

#### `src/utils/gl/Sprite.ts`
- **Imports**: `VertexBufferObject` from `@box2d/lights`
- **Usage**: Vertex buffer management for sprite rendering

#### `src/scenes/test_heroes.ts`
- **Imports**: `b2Body`, `b2BodyType`, `b2EdgeShape`, `b2Fixture`, `b2Vec2`, `XY`, `b2Draw` from `@box2d/core`
- **Usage**: Main game scene with physics world management, edge shapes for boundaries, and debug drawing

### Utilities

#### `src/utils/camera.ts`
Camera management:
- Implements 2D camera with zoom and pan capabilities
- Handles coordinate projection and unprojection
- Manages camera position and viewport calculations
- Provides singleton camera instance (g_camera)

#### `src/utils/FpsCalculator.ts`
Frame rate calculation:
- Calculates and smooths FPS display
- Manages frame timing cache
- Provides 90th percentile frame time calculation

#### `src/utils/hotkeys.ts`
Hotkey management:
- Defines hotkey interfaces and utility functions
- Implements hotkey registration and state management
- Provides helpers for key press/release events

#### `src/utils/reactUtils.ts`
React utility functions:
- CSS class name generation
- Scene link generation for routing

#### `src/utils/gl/defaultShader.ts`
WebGL shader management:
- Creates and manages default WebGL shader program
- Defines vertex and fragment shaders for sprite rendering
- Implements shader attribute and uniform binding

#### `src/utils/gl/glUtils.ts`
WebGL utility functions:
- Canvas initialization and resizing
- Canvas clearing functions
- WebGL context management

#### `src/utils/gl/preload.ts`
Texture loading and management:
- Asynchronous image loading and texture creation
- Texture caching and management
- Preloading utilities for game assets

#### `src/utils/gl/Sprite.ts`
WebGL sprite rendering:
- Implements sprite rendering with WebGL
- Manages vertex and UV buffers
- Handles sprite positioning, rotation, and scaling
- Implements opacity and texture offset controls

#### `src/utils/gl/vertex.ts`
Vertex manipulation utilities:
- Rectangle and rotated rectangle vertex generation
- Vertex buffer management functions
- Coordinate transformation utilities

#### `src/utils/lights/lightUtils.ts`
Lighting utilities:
- Random light color generation helper function

#### `src/utils/lights/RayHandlerImpl.ts`
Custom RayHandler implementation:
- WebGL-based ray casting for lighting effects
- Integration with Box2D physics world
- Custom ray cast callback implementation
- Body position and angle retrieval utilities

## Game Architecture

The core game logic is built around several key systems:

1. **Physics Engine**: Uses Box2D for realistic physics simulation of unit movement and interactions
2. **Rendering**: WebGL-based rendering system with custom shaders for efficient sprite rendering
3. **Scene Management**: Hierarchical scene system with base scene class providing common functionality
4. **Unit System**: Factory-based unit creation with specialized hero units
5. **Combat System**: Turn-based combat with melee, ranged, and magical attack types
6. **Spell System**: Spell casting mechanics with visual spellbook interface
7. **AI System**: Basic AI implementation for computer-controlled opponents
8. **Grid System**: Hexagonal grid management for unit positioning and movement
9. **Animation System**: Smooth animations for unit movement, attacks, and effects

## Key Features

- **Turn-based Combat**: Strategic combat with multiple attack types
- **Unit Stacking**: Units can be stacked for increased power
- **Faction System**: Different factions with unique units and synergies
- **Spell System**: Magic spells with visual spellbook interface
- **Grid Narrowing**: Dynamic battlefield that shrinks over time
- **AI Opponents**: Computer-controlled opponents with basic strategy
- **Visual Effects**: Particle effects, lighting, and smooth animations
- **Responsive UI**: Adapts to different screen sizes and orientations
