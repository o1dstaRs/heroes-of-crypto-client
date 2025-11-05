# Migration Plan: Remove Box2D Dependencies

## Box2D Dependencies to Remove

1. `@box2d/controllers`: "^0.10.0"
2. `@box2d/core`: "^0.10.0"
3. `@box2d/debug-draw`: "^0.10.0"
4. `@box2d/lights`: "^0.10.0"
5. `@box2d/particles`: "^0.10.0"

## Files That Need to Be Updated

### Core Game Logic
- `src/manager.ts` - Main game manager with Box2D integration
- `src/scenes/scene.ts` - Base scene class with Box2D world
- `src/scenes/test_heroes.ts` - Main game scene with Box2D physics
- `src/scenes/gl_scene.ts` - WebGL scene with lighting effects

### Rendering Components
- `src/draw/drawer.ts` - Drawing and animation system using Box2D
- `src/draw/drawable_placement.ts` - Placement visualization with Box2D

### Game Objects
- `src/units/renderable_unit.ts` - Renderable unit with Box2D bodies
- `src/units/heroes.ts` - Hero units with Box2D fixtures
- `src/units/units_factory.ts` - Unit creation factory with Box2D world

### UI Components
- `src/menu/button.ts` - Interactive button with Box2D fixtures

### Obstacles
- `src/obstacles/obstacle.ts` - Obstacle base class with Box2D drawing
- `src/obstacles/obstacle_generator.ts` - Obstacle factory with Box2D bodies

### Utilities
- `src/settings.ts` - Game settings with Box2D debug drawing
- `src/utils/camera.ts` - Camera with Box2D vectors and gl-matrix
- `src/utils/gl/Sprite.ts` - WebGL sprite with Box2D vertex buffer
- `src/utils/gl/vertex.ts` - Vertex manipulation with Box2D constants
- `src/utils/lights/RayHandlerImpl.ts` - Custom lighting with Box2D integration
- `src/utils/lights/lightUtils.ts` - Lighting utilities with Box2D

## Migration Strategy

1. **Replace Physics Engine**
   - Remove all Box2D world, body, and fixture creation
   - Replace with PixiJS display objects and custom physics manager
   - Implement custom collision detection and response

2. **Replace Rendering System**
   - Remove Box2D debug drawing
   - Replace with PixiJS rendering
   - Update all draw calls to use PixiJS graphics

3. **Update Animation System**
   - Replace Box2D body transformations with PixiJS animations
   - Use PixiJS ticker for animation updates

4. **Update Camera System**
   - Replace gl-matrix transformations with PixiJS viewport
   - Update coordinate conversions

5. **Update UI Components**
   - Replace Box2D fixtures with PixiJS hit areas
   - Update interaction handling

6. **Update Game Logic**
   - Replace Box2D body queries with custom spatial queries
   - Update movement and positioning logic

## Implementation Order

1. Core game manager and scene system
2. Physics and collision detection
3. Rendering and animation
4. Camera system
5. UI components
6. Game objects (units, obstacles)
7. Utilities and helpers
8. Remove Box2D dependencies from package.json