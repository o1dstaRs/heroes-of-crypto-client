import { Container, Mesh, MeshGeometry, type Shader, type BufferImageSource } from "pixi.js";
import type { HoCMath } from "@heroesofcrypto/common";
import { createChargeNoise } from "./NomadChargeDustShader";
import { createSmokeCloudShader } from "./SmokeCloudShader";

/** Authoritative terrain: lifespan and ranged blocking remain entirely engine-owned. */
export interface ISmokeCloudCell {
    x: number;
    y: number;
    l: number;
}
export type ToWorld = (cell: HoCMath.XY) => (HoCMath.XY & { cellSize?: number }) | undefined;
type Cloud = {
    node: Mesh<MeshGeometry, Shader>;
    shader: Shader;
    projectionCellSize: number;
    presence: number;
    alive: boolean;
    lapsRemaining: number;
};

/** Bounded, normal-blended cell volumes. No full-screen filter, frame textures, or per-frame geometry. */
export class SmokeCloudLayer {
    private readonly container = new Container();
    private readonly clouds = new Map<number, Cloud>();
    private geometry?: MeshGeometry;
    private noise?: BufferImageSource;
    private time = 0;
    private disposed = false;
    public constructor() {
        // The scene destroys attached containers directly; release owned GPU resources on that path too.
        this.container.once("destroyed", () => this.dispose());
    }
    public getContainer(): Container {
        return this.container;
    }
    public update(dt: number, cells: readonly ISmokeCloudCell[], cellSize: number, toWorld: ToWorld): void {
        if (this.disposed || (!cells.length && !this.clouds.size)) return;
        if (!Number.isFinite(dt) || !Number.isFinite(cellSize) || cellSize <= 0) return;
        const seconds = Math.max(0, dt * 4);
        this.time += Math.min(seconds, 0.1);
        for (const cloud of this.clouds.values()) cloud.alive = false;
        for (const cell of cells) {
            if (![cell.x, cell.y, cell.l].every(Number.isFinite)) continue;
            const key = (cell.x << 8) | (cell.y & 0xff);
            let cloud = this.clouds.get(key);
            if (!cloud) {
                const world = toWorld(cell);
                if (!world) continue;
                this.geometry ??= new MeshGeometry({
                    positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
                    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
                });
                this.noise ??= createChargeNoise();
                const shader = createSmokeCloudShader(this.noise);
                shader.resources.smoke.uniforms.uSeed =
                    Math.abs(Math.sin(cell.x * 127.1 + cell.y * 311.7) * 43758.5453) % 31;
                const node = new Mesh({ geometry: this.geometry, shader });
                node.blendMode = "normal";
                this.container.addChild(node);
                cloud = { node, shader, projectionCellSize: cellSize, presence: 0, alive: true, lapsRemaining: cell.l };
                this.project(cloud, world, cellSize);
                this.clouds.set(key, cloud);
            } else if (cloud.projectionCellSize !== cellSize) {
                const world = toWorld(cell);
                if (world) this.project(cloud, world, cellSize);
            }
            cloud.alive = true;
            cloud.lapsRemaining = cell.l;
        }
        for (const [key, cloud] of this.clouds) {
            cloud.presence = Math.max(0, Math.min(1, cloud.presence + seconds * (cloud.alive ? 1 / 0.55 : -1 / 0.75)));
            if (!cloud.alive && cloud.presence <= 0) {
                cloud.node.destroy();
                cloud.shader.destroy();
                this.clouds.delete(key);
                continue;
            }
            const p = cloud.presence;
            cloud.shader.resources.smoke.uniforms.uTime = this.time;
            cloud.shader.resources.smoke.uniforms.uPresence =
                p * p * (3 - 2 * p) * (cloud.lapsRemaining <= 1 ? 0.62 : 1);
        }
    }
    private project(cloud: Cloud, world: HoCMath.XY & { cellSize?: number }, cellSize: number): void {
        const size = world.cellSize ?? cellSize;
        cloud.node.position.set(world.x, world.y + size * 0.12);
        cloud.node.scale.set(size * 1.02, size * 1.02);
        cloud.projectionCellSize = cellSize;
    }
    private dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const cloud of this.clouds.values()) cloud.shader.destroy();
        this.clouds.clear();
        this.geometry?.destroy();
        this.noise?.destroy();
    }
    public destroy(): void {
        if (!this.container.destroyed) this.container.destroy({ children: true });
    }
}
