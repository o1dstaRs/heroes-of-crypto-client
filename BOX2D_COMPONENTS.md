# Box2D Components in Heroes of Crypto

## Core Physics Components

1. **World Simulation**
   - `b2World` - Main physics world
   - Gravity settings
   - Step simulation with velocity/position iterations

2. **Body Management**
   - `b2Body` - Physical bodies for units
   - `b2BodyDef` - Body definitions
   - `b2BodyType` - Static, dynamic, kinematic bodies

3. **Collision Shapes**
   - `b2PolygonShape` - Polygonal collision shapes
   - `b2CircleShape` - Circular collision shapes
   - `b2ChainShape` - Chain shapes for boundaries

4. **Fixtures**
   - `b2Fixture` - Attach shapes to bodies
   - `b2FixtureDef` - Fixture definitions with density, friction, restitution

5. **Math Utilities**
   - `b2Vec2` - 2D vector mathematics
   - `b2AABB` - Axis-aligned bounding boxes
   - Various mathematical operations

6. **Rendering Integration**
   - `b2Draw` - Debug drawing interface
   - Custom WebGL rendering on top of Box2D

7. **Joints and Constraints**
   - `b2MouseJoint` - Mouse interaction
   - Various joint types for connections

8. **Particle Systems**
   - `b2ParticleSystem` - Particle simulation
   - `b2ParticleGroup` - Groups of particles

## Key Files Using Box2D

1. **manager.ts** - Main game manager with physics world
2. **scene.ts** - Base scene class with world setup
3. **test_heroes.ts** - Main game scene with units and physics
4. **drawer.ts** - Rendering and animation system
5. **renderable_unit.ts** - Unit rendering with Box2D bodies
6. **button.ts** - UI elements with physics fixtures
7. **camera.ts** - Camera system using gl-matrix
8. **obstacle.ts** - Obstacles with physics properties

## Dependencies to Remove

```json
{
  "@box2d/controllers": "^0.10.0",
  "@box2d/core": "^0.10.0",
  "@box2d/debug-draw": "^0.10.0",
  "@box2d/lights": "^0.10.0",
  "@box2d/particles": "^0.10.0"
}
```