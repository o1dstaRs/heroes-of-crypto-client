import { Container, Geometry, GlProgram, Graphics, Mesh, MeshGeometry, Rectangle, Shader } from "pixi.js";
import type { HoCMath } from "@heroesofcrypto/common";
import type { BrutalityPose } from "./ZenaBrutalityVfx";
import { GORE_FRAGMENT, GORE_MIST_FRAGMENT, GORE_MIST_VERTEX, GORE_VERTEX } from "./CyclopsGoreShaders";

export const CYCLOPS_GORE_PARTICLES = 64 * 80;
export const CYCLOPS_GORE_LIFE = 2.15;
export const CYCLOPS_GORE_MAX_ACTIVE = 12;
type SharedGrid = { geometry: Geometry; users: number };
type Burst = {
    root: Container;
    particles: Mesh<Geometry, Shader>;
    mist: Mesh<MeshGeometry, Shader>;
    ground: Graphics;
    particleShader: Shader;
    mistShader: Shader;
    mistGeometry: MeshGeometry;
    grid: SharedGrid;
    age: number;
    disposed: boolean;
};
const noise = (value: number): number => {
    const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};
const smooth = (from: number, to: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
};

function createGrid(): SharedGrid {
    const positions = new Float32Array(CYCLOPS_GORE_PARTICLES * 8);
    const centers = new Float32Array(positions.length);
    const corners = new Float32Array(positions.length);
    const seeds = new Float32Array(CYCLOPS_GORE_PARTICLES * 4);
    const indices = new Uint16Array(CYCLOPS_GORE_PARTICLES * 6);
    const cornerX = [0, 1, 1, 0],
        cornerY = [0, 0, 1, 1];
    for (let i = 0; i < CYCLOPS_GORE_PARTICLES; i++) {
        const x = i % 64,
            y = Math.floor(i / 64);
        for (let k = 0; k < 4; k++) {
            const vertex = i * 4 + k;
            positions[vertex * 2] = (x + cornerX[k]) / 64;
            positions[vertex * 2 + 1] = (y + cornerY[k]) / 80;
            centers[vertex * 2] = (x + 0.5) / 64;
            centers[vertex * 2 + 1] = (y + 0.5) / 80;
            corners[vertex * 2] = cornerX[k] * 2 - 1;
            corners[vertex * 2 + 1] = cornerY[k] * 2 - 1;
            seeds[vertex] = i;
        }
        indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    return {
        users: 0,
        geometry: new Geometry({
            attributes: {
                aPosition: { buffer: positions, format: "float32x2" },
                aCenter: { buffer: centers, format: "float32x2" },
                aCorner: { buffer: corners, format: "float32x2" },
                aSeed: { buffer: seeds, format: "float32" },
            },
            indexBuffer: indices,
        }),
    };
}

/** Alpha-masked body fragmentation with GPU ballistics; each victim shares the same immutable grid. */
export class CyclopsGoreVfx {
    private readonly bursts: Burst[] = [];
    private grid?: SharedGrid;
    public constructor(private readonly attach: (root: Container) => number) {}
    public get active(): boolean {
        return this.bursts.length > 0;
    }
    public spawn(pose: BrutalityPose, cell: number, direction: HoCMath.XY, seed = 1): boolean {
        if (
            pose.texture.destroyed ||
            pose.texture.width <= 1 ||
            pose.texture.height <= 1 ||
            ![
                pose.x,
                pose.y,
                pose.anchorX,
                pose.anchorY,
                pose.scaleX,
                pose.scaleY,
                cell,
                direction.x,
                direction.y,
                seed,
            ].every(Number.isFinite) ||
            cell <= 0 ||
            pose.scaleX === 0 ||
            pose.scaleY === 0
        )
            return false;
        if (this.bursts.length >= CYCLOPS_GORE_MAX_ACTIVE) this.dispose(this.bursts.shift()!);
        const root = new Container({ eventMode: "none", label: "cyclops-gore" });
        root.position.set(pose.x, pose.y);
        const stretch = this.attach(root);
        if (!Number.isFinite(stretch) || stretch <= 0) {
            root.destroy({ children: true });
            return false;
        }
        root.scale.y = stretch;
        const width = pose.texture.width * pose.scaleX;
        const height = (pose.texture.height * pose.scaleY) / stretch;
        const planted = (0.97 - pose.anchorY) * height;
        const floor = planted === 0 ? 0 : planted;
        const dx = direction.x,
            dy = direction.y / stretch;
        const length = Math.hypot(dx, dy) || 1;
        const { uvs } = pose.texture;
        const grid = (this.grid ??= createGrid());
        grid.users++;
        const shader = new Shader({
            glProgram: GlProgram.from({ vertex: GORE_VERTEX, fragment: GORE_FRAGMENT }),
            resources: {
                uFigure: pose.texture.source,
                goreUniforms: {
                    uBody: { value: new Float32Array([width, height]), type: "vec2<f32>" },
                    uAnchor: { value: new Float32Array([pose.anchorX, pose.anchorY]), type: "vec2<f32>" },
                    uDirection: { value: new Float32Array([dx / length, dy / length]), type: "vec2<f32>" },
                    uUvOrigin: { value: new Float32Array([uvs.x0, uvs.y0]), type: "vec2<f32>" },
                    uUvX: { value: new Float32Array([uvs.x1 - uvs.x0, uvs.y1 - uvs.y0]), type: "vec2<f32>" },
                    uUvY: { value: new Float32Array([uvs.x3 - uvs.x0, uvs.y3 - uvs.y0]), type: "vec2<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uCell: { value: cell, type: "f32" },
                    uFloor: { value: floor, type: "f32" },
                    uSeed: { value: seed, type: "f32" },
                },
            },
        });
        const particles = new Mesh({ geometry: grid.geometry, shader, texture: pose.texture });
        particles.label = "meat-fragments";
        particles.boundsArea = new Rectangle(
            -Math.abs(width) - cell * 4,
            floor - cell,
            Math.abs(width) * 2 + cell * 8,
            Math.abs(height) + cell * 5,
        );
        const radius = Math.max(cell * 1.2, Math.abs(width) * 0.8);
        const center = floor + Math.abs(height) * 0.43;
        const mist = new Mesh({
            geometry: new MeshGeometry({
                positions: new Float32Array([
                    -radius,
                    center - radius,
                    radius,
                    center - radius,
                    radius,
                    center + radius,
                    -radius,
                    center + radius,
                ]),
                uvs: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            }),
            shader: new Shader({
                glProgram: GlProgram.from({ vertex: GORE_MIST_VERTEX, fragment: GORE_MIST_FRAGMENT }),
                resources: {
                    mistUniforms: {
                        uTime: { value: 0, type: "f32" },
                        uSeed: { value: seed % 100, type: "f32" },
                    },
                },
            }),
        });
        mist.label = "blood-mist";
        const ground = new Graphics({ label: "wet-splatter" });
        for (let i = 0; i < 30; i++) {
            const angle = noise(seed + i) * Math.PI * 2;
            const distance = cell * noise(seed + i + 31) * 0.85;
            const x = Math.cos(angle) * distance + (dx / length) * cell * 0.18;
            const y = floor + Math.sin(angle) * distance * 0.24;
            const r = cell * (0.025 + noise(seed + i + 62) * 0.085);
            ground.ellipse(x, y, r, r * 0.32).fill({ color: i % 3 ? 0x650b1d : 0x26030c, alpha: 0.65 });
            if (i % 4 === 0)
                ground.ellipse(x - r * 0.2, y + r * 0.08, r * 0.35, r * 0.08).fill({ color: 0xc53d4a, alpha: 0.3 });
        }
        root.addChild(ground, mist, particles);
        const burst: Burst = {
            root,
            particles,
            mist,
            ground,
            particleShader: shader,
            mistShader: mist.shader!,
            mistGeometry: mist.geometry,
            grid,
            age: 0,
            disposed: false,
        };
        this.bursts.push(burst);
        root.once("destroyed", () => this.dispose(burst));
        this.draw(burst);
        return true;
    }
    public update(dt: number): void {
        const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const burst = this.bursts[i];
            burst.age += elapsed;
            if (burst.disposed || burst.root.destroyed || burst.age >= CYCLOPS_GORE_LIFE) {
                this.dispose(burst);
                this.bursts.splice(i, 1);
            } else this.draw(burst);
        }
    }
    public clear(): void {
        for (const burst of this.bursts) this.dispose(burst);
        this.bursts.length = 0;
    }
    private draw(burst: Burst): void {
        burst.particleShader.resources.goreUniforms.uniforms.uTime = burst.age;
        burst.mistShader.resources.mistUniforms.uniforms.uTime = burst.age;
        burst.mist.visible = burst.age < 0.85;
        burst.particles.visible = burst.age < 1.85;
        burst.ground.alpha = smooth(0.06, 0.23, burst.age) * (1 - smooth(1.25, CYCLOPS_GORE_LIFE, burst.age));
    }
    private dispose(burst: Burst): void {
        if (burst.disposed) return;
        burst.disposed = true;
        burst.particleShader.destroy();
        burst.mistShader.destroy();
        burst.mistGeometry.destroy();
        if (--burst.grid.users === 0) {
            burst.grid.geometry.destroy();
            if (this.grid === burst.grid) this.grid = undefined;
        }
        if (!burst.root.destroyed) burst.root.destroy({ children: true });
    }
}
