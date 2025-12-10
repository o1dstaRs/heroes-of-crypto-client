// game/core/src/settings.ts

// Simple XY coordinate interface
interface XY {
    x: number;
    y: number;
}

// Simple AABB interface
interface AABB {
    lowerBound: XY;
    upperBound: XY;
}

// Simple Color interface
interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

// Accept several common 2D transform shapes without using `any`
type TransformLike =
    // Box2D-style: position p and rotation q (cos/sin)
    | { p: XY; q: { s: number; c: number } }
    // Angle-based: position + angle in radians
    | { position: XY; angle: number }
    // Affine 2D matrix (a b c d tx ty)
    | { a: number; b: number; c: number; d: number; tx: number; ty: number };

const noop = () => undefined;

export interface TestDebugDraw {
    Prepare(centerX: number, centerY: number, zoom: number, flipY?: boolean): void;

    Finish(): void;

    DrawStringWorld(x: number, y: number, message: string): void;

    DrawAABB?(aabb: AABB, color: Color): void;

    DrawPolygon?(vertices: XY[], vertexCount: number, color: Color): void;

    DrawSolidPolygon?(vertices: XY[], vertexCount: number, color: Color): void;

    DrawCircle?(center: XY, radius: number, color: Color): void;

    DrawSolidCircle?(center: XY, radius: number, axis: XY, color: Color): void;

    DrawSegment?(p1: XY, p2: XY, color: Color): void;

    DrawTransform?(xf: TransformLike, color: Color): void;

    DrawPoint?(p: XY, size: number, color: Color): void;

    DrawParticles?(centers: XY[], colors: Color[], count: number): void;
}

export class Settings {
    public m_testIndex = 0;
    public m_windowWidth = 3200;
    public m_windowHeight = 1800;
    public m_hertz = 60;
    // default: 9
    public m_velocityIterations = 0;
    public m_positionIterations = 3;
    // Particle iterations are needed for numerical stability in particle
    // simulations with small particles and relatively high gravity.
    // b2CalculateParticleIterations helps to determine the number.
    public m_particleIterations = 0; // Simplified
    public m_drawShapes = true;
    public m_drawParticles = true;
    public m_drawJoints = true;
    public m_drawAABBs = false;
    public m_drawContactPoints = false;
    public m_drawContactNormals = false;
    public m_drawContactImpulse = false;
    public m_drawFrictionImpulse = false;
    public m_drawCOMs = false;
    public m_drawControllers = true;
    public m_drawStats = false;
    public m_drawInputHelp = false;
    public m_drawFpsMeter = false;
    public m_drawProfile = false;
    public m_enableWarmStarting = false;
    public m_enableContinuous = true;
    public m_enableSubStepping = false;
    public m_enableSleep = true;
    public m_amountOfSelectedUnits = 1;
    public m_pause = false;
    public m_debugDraw: TestDebugDraw = {
        Prepare: noop,
        Finish: noop,
        DrawStringWorld: noop,
        DrawPolygon: noop,
        DrawSolidPolygon: noop,
        DrawCircle: noop,
        DrawSolidCircle: noop,
        DrawSegment: noop,
        DrawTransform: noop,
        DrawPoint: noop,
        DrawParticles: noop,
        DrawAABB: noop,
    };
}
