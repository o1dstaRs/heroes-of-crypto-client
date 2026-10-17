import { Container, Geometry, GlProgram, Graphics, Mesh, MeshGeometry, Shader } from "pixi.js";
import {
    createStoneFragments,
    CYCLOPS_FRACTURE_LIFE_MS,
    CYCLOPS_FRACTURE_PLAYBACK_RATE,
    rotateStone,
    stoneFragmentPose,
    stoneRandom,
    type StoneFragment,
    type Vec3,
} from "./CyclopsFracturePhysics";
import { STONE_VERTEX, STONE_FRAGMENT, DUST_VERTEX, DUST_FRAGMENT } from "./CyclopsFractureShaders";

const PHI = (1 + Math.sqrt(5)) / 2;
const VERTICES: Vec3[] = [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
];
const FACES = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
];
const MAX_VERTICES = 38 * FACES.length * 3;
const FADE_START = 1.05;
const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
type Triangle = { screen: Vec3[]; local: Vec3[]; normal: Vec3; depth: number; seed: number };
type Shard = { fragment: StoneFragment; local: Vec3[]; rotated: Vec3[]; world: Vec3[]; faces: Triangle[] };
type Cast = {
    root: Container;
    ground: Graphics;
    grains: Graphics;
    mesh: Mesh<Geometry, Shader>;
    dust: Mesh<MeshGeometry, Shader>[];
    shards: Shard[];
    triangles: Triangle[];
    positions: Float32Array;
    normals: Float32Array;
    stone: Float32Array;
    bary: Float32Array;
    age: number;
    seed: number;
    disposed: boolean;
    resources: { geometry: Geometry; shader: Shader }[];
};

/** 3D fracture rendered through Pixi: rotating lit stone, ballistic bounces, dust and contact shadows. */
export class CyclopsStoneFracture {
    private casts: Cast[] = [];
    private serial = 0;
    public constructor(private readonly attach: (container: Container, z: number) => void) {}
    public get activeCount(): number {
        return this.casts.length;
    }
    public spawn(position: { x: number; y: number }, cell: number, seed = ++this.serial * 7919): void {
        if (![position.x, position.y, cell].every(Number.isFinite) || cell <= 0) return;
        // Bound GPU work during repeated preview clicks; actual shots never wait for cosmetic settling.
        if (this.casts.length >= 4) this.dispose(this.casts.shift()!);
        const root = new Container();
        root.position.set(position.x, position.y);
        root.scale.set(cell);
        const positions = new Float32Array(MAX_VERTICES * 2),
            normals = new Float32Array(MAX_VERTICES * 3);
        const stone = new Float32Array(MAX_VERTICES * 3),
            bary = new Float32Array(MAX_VERTICES * 3);
        const geometry = new Geometry({
            attributes: {
                aPosition: { buffer: positions, format: "float32x2" },
                aNormal: { buffer: normals, format: "float32x3" },
                aStone: { buffer: stone, format: "float32x3" },
                aBary: { buffer: bary, format: "float32x3" },
            },
            indexBuffer: Uint16Array.from({ length: MAX_VERTICES }, (_, i) => i),
        });
        const shader = new Shader({
            glProgram: GlProgram.from({ vertex: STONE_VERTEX, fragment: STONE_FRAGMENT }),
            resources: { stoneUniforms: { uFade: { value: 1, type: "f32" } } },
        });
        const mesh = new Mesh({ geometry, shader });
        const dust = [0, 1].map((front) => {
            const geometry = new MeshGeometry({
                positions: new Float32Array([-1.6, -0.9, 1.6, -0.9, 1.6, 1.65, -1.6, 1.65]),
                uvs: new Float32Array([-1.6, -0.9, 1.6, -0.9, 1.6, 1.65, -1.6, 1.65]),
            });
            const shader = new Shader({
                glProgram: GlProgram.from({ vertex: DUST_VERTEX, fragment: DUST_FRAGMENT }),
                resources: {
                    dustUniforms: {
                        uTime: { value: 0, type: "f32" },
                        uSeed: { value: seed % 100, type: "f32" },
                        uFront: { value: front, type: "f32" },
                    },
                },
            });
            return new Mesh({ geometry, shader });
        });
        const ground = new Graphics(),
            grains = new Graphics();
        root.addChild(ground, dust[0], mesh, grains, dust[1]);
        this.attach(root, 1952);
        const cast = {
            root,
            ground,
            grains,
            mesh,
            dust,
            shards: createStoneFragments(seed).map((fragment) => {
                const local = VERTICES.map(
                    (v, i) =>
                        v.map(
                            (c, k) => c * fragment.shape[k] * (0.47 + 0.06 * Math.sin(i * 3.7 + fragment.seed)),
                        ) as Vec3,
                );
                const rotated = local.map(() => [0, 0, 0] as Vec3),
                    world = local.map(() => [0, 0, 0] as Vec3);
                const faces = FACES.map((face) => ({
                    screen: face.map(() => [0, 0, 0] as Vec3),
                    local: face.map((i) => local[i]),
                    normal: [0, 0, 0] as Vec3,
                    depth: 0,
                    seed: fragment.seed,
                }));
                return { fragment, local, rotated, world, faces };
            }),
            triangles: [],
            positions,
            normals,
            stone,
            bary,
            age: 0,
            seed,
            disposed: false,
            resources: [mesh, ...dust].map((m) => ({ geometry: m.geometry, shader: m.shader! })),
        };
        this.casts.push(cast);
        root.once("destroyed", () => this.dispose(cast));
        this.draw(cast);
    }
    public update(dt: number): void {
        const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0) * 4000 * CYCLOPS_FRACTURE_PLAYBACK_RATE;
        for (let i = this.casts.length - 1; i >= 0; i--) {
            const cast = this.casts[i];
            cast.age += elapsed;
            if (cast.age >= CYCLOPS_FRACTURE_LIFE_MS || cast.root.destroyed) {
                this.dispose(cast);
                this.casts.splice(i, 1);
            } else this.draw(cast);
        }
    }
    public clear(): void {
        for (const cast of this.casts) this.dispose(cast);
        this.casts.length = 0;
    }
    private dispose(cast: Cast): void {
        // Mesh shaders and buffers are effect-owned; shared GlProgram cache remains alive.
        if (cast.disposed) return;
        cast.disposed = true;
        for (const resource of cast.resources) {
            resource.geometry.destroy();
            resource.shader.destroy();
        }
        if (!cast.root.destroyed) cast.root.destroy({ children: true });
    }
    private draw(cast: Cast): void {
        const t = cast.age / 1000,
            fade = 1 - smooth(FADE_START, CYCLOPS_FRACTURE_LIFE_MS / 1000, t);
        const ground = cast.ground,
            grains = cast.grains;
        ground.clear();
        grains.clear();
        cast.triangles.length = 0;
        // Ground compression, irregular hairline cracks, and soft layered occlusion.
        for (let j = 5; j >= 1; j--)
            ground.ellipse(0, 0, 0.065 + j * 0.055, 0.025 + j * 0.025).fill({ color: 0x201a13, alpha: 0.055 * fade });
        const random = stoneRandom(cast.seed);
        for (let i = 0; i < 11; i++) {
            const a = random() * Math.PI * 2,
                r = 0.18 + random() * 0.35;
            const x = Math.cos(a) * r,
                y = Math.sin(a) * r * 0.55;
            ground
                .moveTo(Math.cos(a) * 0.12, Math.sin(a) * 0.06)
                .lineTo(x * 0.68, y * 0.6)
                .lineTo(x, y)
                .stroke({ width: 0.006, color: 0x211c16, alpha: fade * 0.35 * smooth(0, 0.08, t) });
        }
        for (const shard of cast.shards) {
            const { fragment, local, rotated, world } = shard;
            const pose = stoneFragmentPose(fragment, t);
            // Remove the shard and its contact shadow together immediately after it comes to rest.
            if (!pose.visible) continue;
            const height = Math.max(0, pose.z - fragment.size * 0.55);
            for (let j = 3; j >= 1; j--)
                ground
                    .ellipse(
                        pose.x,
                        pose.y * 0.55,
                        fragment.size * (0.75 + j * 0.2 + height * 0.3),
                        fragment.size * (0.3 + j * 0.07),
                    )
                    .fill({ color: 0x181611, alpha: (fade * 0.09) / (1 + height * 4) });
            let supportHeight = 0;
            for (let i = 0; i < local.length; i++) {
                rotateStone(local[i], pose.rotation, rotated[i]);
                supportHeight = Math.max(supportHeight, -rotated[i][2] * fragment.size);
            }
            // The lowest rotating vertex rests on the floor instead of sinking through it.
            const centerHeight = supportHeight + height;
            for (let i = 0; i < local.length; i++) {
                world[i][0] = pose.x + rotated[i][0] * fragment.size;
                world[i][1] = pose.y + rotated[i][1] * fragment.size;
                world[i][2] = centerHeight + rotated[i][2] * fragment.size;
            }
            for (let f = 0; f < FACES.length; f++) {
                const indices = FACES[f],
                    tri = shard.faces[f],
                    n = tri.normal;
                const a = rotated[indices[0]],
                    b = rotated[indices[1]],
                    c = rotated[indices[2]];
                const ux = b[0] - a[0],
                    uy = b[1] - a[1],
                    uz = b[2] - a[2];
                const vx = c[0] - a[0],
                    vy = c[1] - a[1],
                    vz = c[2] - a[2];
                n[0] = uy * vz - uz * vy;
                n[1] = uz * vx - ux * vz;
                n[2] = ux * vy - uy * vx;
                const len = Math.hypot(n[0], n[1], n[2]);
                for (let k = 0; k < 3; k++) n[k] /= len;
                if (-n[1] * 0.85 + n[2] * 0.55 <= 0) continue;
                tri.depth = 0;
                for (let k = 0; k < 3; k++) {
                    const p = world[indices[k]];
                    tri.screen[k][0] = p[0];
                    tri.screen[k][1] = p[1] * 0.55 + p[2] * 0.85;
                    tri.depth += (-p[1] * 0.85 + p[2] * 0.55) / 3;
                }
                cast.triangles.push(tri);
            }
        }
        cast.triangles.sort((a, b) => a.depth - b.depth);
        let vertex = 0;
        for (const tri of cast.triangles)
            for (let k = 0; k < 3; k++) {
                cast.positions[vertex * 2] = tri.screen[k][0];
                cast.positions[vertex * 2 + 1] = tri.screen[k][1];
                for (let j = 0; j < 3; j++) {
                    cast.normals[vertex * 3 + j] = tri.normal[j];
                    cast.stone[vertex * 3 + j] = tri.local[k][j] + tri.seed;
                    cast.bary[vertex * 3 + j] = k === j ? 1 : 0;
                }
                vertex++;
            }
        // Degenerate unused triangles avoid buffer reallocations as faces rotate into view.
        cast.positions.fill(0, vertex * 2);
        for (const attribute of Object.values(cast.mesh.geometry.attributes)) attribute.buffer.update();
        cast.mesh.shader!.resources.stoneUniforms.uniforms.uFade = fade;
        // Pinprick grit and short physical trails: no bloom or fireworks in a stone impact.
        const gritRandom = stoneRandom(cast.seed + 42);
        for (let i = 0; i < 86; i++) {
            const a = gritRandom() * 6.283,
                speed = 0.7 + gritRandom() * 2.8,
                life = 0.34 + gritRandom() * 0.7;
            const size = 0.004 + gritRandom() * 0.009,
                vz = 0.5 + gritRandom() * 2.4;
            if (t > life) continue;
            const travel = Math.min(1.42, ((1 - Math.exp(-t * 3)) * speed) / 3);
            const x = Math.cos(a) * travel,
                y = Math.sin(a) * travel * 0.55 + Math.max(0, vz * t - 5 * t * t) * 0.85;
            const alpha = (1 - smooth(life * 0.55, life, t)) * 0.85;
            if (t < 0.23)
                grains
                    .moveTo(x - Math.cos(a) * 0.045, y - 0.025)
                    .lineTo(x, y)
                    .stroke({ width: size * 0.65, color: 0xb09478, alpha: alpha * 0.25 });
            grains
                .poly([x - size, y, x, y + size * 0.55, x + size * 0.8, y - size * 0.25, x, y - size * 0.5])
                .fill({ color: i % 3 === 0 ? 0xd6bda3 : 0x876a50, alpha });
        }
        for (const mesh of cast.dust) mesh.shader!.resources.dustUniforms.uniforms.uTime = t;
    }
}
