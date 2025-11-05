# Box2D Dependencies in Heroes of Crypto Core

This document provides a comprehensive list of all files that directly or indirectly depend on the Box2D physics engine. This will be useful when migrating to a new engine.

Run this command to see the remaining: `cd /Users/zolotukhin/Workplace/heroes-of-crypto-client/game/core && find src -name "*.ts" -o -name "*.tsx" | xargs grep -l "@box2d" | head -10`

## Files with Direct Box2D Imports

1. `src/draw/drawable_placement.ts`
   - Imports: `b2Color`, `b2Draw` from `@box2d/core`
   - Usage: Debug drawing of placement areas

2. `src/draw/drawer.ts`
   - Imports: Multiple Box2D modules from `@box2d/core`
   - Usage: Physics-based animations, bullet movement, unit movement paths

3. `src/menu/button.ts`
   - Imports: `b2Color`, `b2Draw`, `b2FixtureDef`, `b2PolygonShape`, `b2Vec2`, `XY` from `@box2d/core`
   - Usage: Creating physical fixtures for interactive UI buttons

4. `src/obstacles/obstacle.ts`
   - Imports: `b2Draw`, `b2Color` from `@box2d/core`
   - Usage: Debug drawing of obstacle boundaries and hit bars

5. `src/obstacles/obstacle_generator.ts`
   - Imports: `XY`, `b2World`, `b2BodyType`, `b2PolygonShape`, `b2Draw` from `@box2d/core`
   - Usage: Creating physical bodies for obstacles in the game world

6. `src/scenes/gl_scene.ts`
   - Imports: `BlendFunc`, `Light`, `lightSettings`, `RayHandler`, `RECOMMENDED_GAMMA_CORRECTION`, `XY` from `@box2d/lights`
   - Usage: Lighting effects integration with Box2D physics world

7. `src/scenes/scene.ts`
   - Imports: Multiple Box2D modules from `@box2d/core`, `@box2d/controllers`, and `@box2d/particles`
   - Usage: Base scene class implementing Box2D contact listener, body management, joint handling, and physics world management

8. `src/scenes/test_heroes.ts`
   - Imports: `b2Body`, `b2BodyType`, `b2EdgeShape`, `b2Fixture`, `b2Vec2`, `XY`, `b2Draw` from `@box2d/core`
   - Usage: Main game scene with physics world management, edge shapes for boundaries, and debug drawing

9. `src/settings.ts`
   - Imports: `b2AABB`, `b2Draw`, `RGBA` from `@box2d/core` and `b2CalculateParticleIterations` from `@box2d/particles`
   - Usage: Debug drawing configuration and particle iteration calculation

10. `src/units/heroes.ts`
    - Imports: `b2FixtureDef` from `@box2d/core`
    - Usage: Hero unit fixture definitions

11. `src/units/renderable_unit.ts`
    - Imports: `b2BodyDef`, `b2BodyType`, `b2ChainShape`, `b2Color`, `b2FixtureDef`, `b2PolygonShape` from `@box2d/core`
    - Usage: Creating physical bodies and fixtures for game units

12. `src/units/units_factory.ts`
    - Imports: `b2Body`, `b2Fixture`, `b2World` from `@box2d/core`
    - Usage: Spawning units with physical bodies in the Box2D world

13. `src/utils/camera.ts`
    - Imports: `b2Vec2`, `XY` from `@box2d/core`
    - Usage: Coordinate transformations between world and screen space

14. `src/utils/gl/Sprite.ts`
    - Imports: `VertexBufferObject` from `@box2d/lights`
    - Usage: Vertex buffer management for sprite rendering

15. `src/utils/gl/vertex.ts`
    - Imports: `DEG_TO_RAD` from `@box2d/lights`
    - Usage: Degree to radian conversion for lighting calculations

16. `src/utils/lights/lightUtils.ts`
    - Imports: `Light` from `@box2d/lights`
    - Usage: Random light color generation helper function

17. `src/utils/lights/RayHandlerImpl.ts`
    - Imports: `b2World`, `b2Body` from `@box2d/core` and `RayHandler`, `Light`, `XY` from `@box2d/lights`
    - Usage: Custom implementation of lighting ray casting integrated with Box2D physics

18. `src/manager.ts`
    - Imports: `b2Vec2` from `@box2d/core` and `DebugDraw` from `@box2d/debug-draw`
    - Usage: Camera management, debug drawing, coordinate transformations

## Summary by Box2D Module

### @box2d/core (Most dependencies)
- Used for core physics functionality: bodies, fixtures, shapes, world management, drawing, vectors

### @box2d/lights
- Used for lighting effects and related utilities

### @box2d/particles
- Used for particle system management

### @box2d/controllers
- Used for physics controllers (rendering)

### @box2d/debug-draw
- Used for debug drawing functionality

## Migration Priority

When migrating to a new engine, these files should be addressed in roughly this order:

1. Core physics world management:
   - `src/scenes/scene.ts`
   - `src/scenes/test_heroes.ts`
   - `src/units/units_factory.ts`
   - `src/obstacles/obstacle_generator.ts`

2. Unit physics:
   - `src/units/renderable_unit.ts`
   - `src/units/heroes.ts`

3. Visual effects and rendering:
   - `src/draw/drawer.ts`
   - `src/scenes/gl_scene.ts`
   - `src/utils/lights/RayHandlerImpl.ts`

4. UI and interaction:
   - `src/menu/button.ts`
   - `src/draw/drawable_placement.ts`
   - `src/obstacles/obstacle.ts`

5. Utilities and support:
   - `src/utils/camera.ts`
   - `src/manager.ts`
   - `src/settings.ts`
   - `src/utils/gl/Sprite.ts`
   - `src/utils/gl/vertex.ts`
   - `src/utils/lights/lightUtils.ts`
