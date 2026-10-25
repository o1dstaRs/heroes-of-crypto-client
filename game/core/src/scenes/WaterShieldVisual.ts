import { GlProgram, Mesh, MeshGeometry, Shader, Sprite } from "pixi.js";
import { waterShieldFragment, waterShieldVertex } from "./WaterShieldShader";
import { WaterShieldRefractionFilter } from "./WaterShieldRefractionFilter";

const MARGIN = 0.055;
export const WATER_SHIELD_BREAK_MS = 2200;

/** Two owned local quads and one local scene-refraction filter; shared creature art remains untouched. */
export class WaterShieldVisual {
    public readonly back: Mesh<MeshGeometry, Shader>;
    public readonly front: Mesh<MeshGeometry, Shader>;
    private readonly meshes: readonly Mesh<MeshGeometry, Shader>[];
    private readonly refraction: WaterShieldRefractionFilter;
    private readonly refractionFilters: WaterShieldRefractionFilter[];
    private burstSprite?: Sprite;
    private burstStarted?: number;
    private groundY = 0.94;
    private width = 0;
    private height = 0;
    private anchorX = NaN;
    private anchorY = NaN;
    private margin = NaN;
    public constructor(sprite: Sprite) {
        this.back = this.create(false);
        this.front = this.create(true);
        this.refraction = new WaterShieldRefractionFilter(sprite);
        this.refractionFilters = [this.refraction];
        this.front.filters = this.refractionFilters;
        this.front.once("destroyed", () => this.refraction.destroy());
        this.meshes = [this.back, this.front];
    }
    private create(front: boolean): Mesh<MeshGeometry, Shader> {
        const geometry = new MeshGeometry({
            positions: new Float32Array(8),
            uvs: new Float32Array([-MARGIN, -MARGIN, 1 + MARGIN, -MARGIN, 1 + MARGIN, 1 + MARGIN, -MARGIN, 1 + MARGIN]),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        });
        const shader = new Shader({
            glProgram: GlProgram.from({
                name: "water-shield-liquid",
                vertex: waterShieldVertex,
                fragment: waterShieldFragment,
            }),
            resources: {
                water: {
                    uTime: { value: 0, type: "f32" },
                    uRadiusX: { value: 0.405, type: "f32" },
                    uFront: { value: front ? 1 : 0, type: "f32" },
                    uBurst: { value: -1, type: "f32" },
                    uGroundY: { value: 0.94, type: "f32" },
                },
            },
        });
        const mesh = new Mesh({ geometry, shader });
        mesh.label = front ? "water-shield-front" : "water-shield-back";
        mesh.eventMode = "none";
        mesh.blendMode = "normal";
        mesh.once("destroyed", () => {
            shader.destroy();
            geometry.destroy(true);
        });
        return mesh;
    }
    public hide(): void {
        this.back.visible = this.front.visible = false;
    }
    public setDepth(depth: number): void {
        if (this.burstStarted !== undefined && this.burstSprite) depth = this.burstSprite.zIndex;
        this.back.zIndex = depth - 0.02;
        this.front.zIndex = depth + 0.02;
    }
    public updateBreak(
        sprite: Sprite,
        nowMs: number,
        startedMs: number,
        cellWidth: number,
        ground?: { x: number; y: number },
    ): boolean {
        const elapsed = Math.max(0, nowMs - startedMs);
        if (elapsed >= WATER_SHIELD_BREAK_MS) {
            this.hide();
            return false;
        }
        if (!sprite.parent || !sprite.visible || !sprite.renderable || sprite.destroyed) {
            this.hide();
            return false;
        }
        if (this.burstStarted !== startedMs) {
            // Freeze the optical/geometry frame at contact. Airborne water must not follow later movement.
            const frozen = (this.burstSprite ??= new Sprite());
            frozen.label = "water-shield-burst-reference";
            frozen.eventMode = "none";
            frozen.renderable = false;
            frozen.texture = sprite.texture;
            frozen.anchor.copyFrom(sprite.anchor);
            frozen.position.copyFrom(sprite.position);
            frozen.scale.copyFrom(sprite.scale);
            frozen.skew.copyFrom(sprite.skew);
            frozen.pivot.copyFrom(sprite.pivot);
            frozen.rotation = sprite.rotation;
            frozen.alpha = sprite.alpha;
            frozen.zIndex = sprite.zIndex;
            if (frozen.parent !== sprite.parent) sprite.parent.addChild(frozen);
            frozen.updateLocalTransform();
            // Input is already projected onto the painted floor; do not project it a second time.
            const localFloor = ground ? frozen.localTransform.applyInverse(ground) : undefined;
            this.groundY = localFloor
                ? (localFloor.y / frozen.texture.orig.height + frozen.anchor.y - 0.515) / 0.495
                : 0.94;
            this.burstStarted = startedMs;
        }
        this.update(this.burstSprite!, nowMs, cellWidth, elapsed / 1000);
        return true;
    }
    public update(sprite: Sprite, nowMs: number, cellWidth?: number, burstAge = -1): void {
        if (
            !sprite.parent ||
            !sprite.visible ||
            (!sprite.renderable && sprite !== this.burstSprite) ||
            sprite.destroyed
        ) {
            this.hide();
            return;
        }
        if (burstAge < 0) this.burstStarted = undefined;
        const refracting = burstAge < 0.4;
        if (!!this.front.filters?.length !== refracting)
            this.front.filters = refracting ? this.refractionFilters : null;
        const texture = sprite.texture;
        const w = texture.orig.width;
        const h = texture.orig.height;
        const margin = burstAge >= 0 ? 0.95 : MARGIN;
        const marginY = burstAge >= 0 ? 0.3 : MARGIN;
        const changed =
            margin !== this.margin ||
            w !== this.width ||
            h !== this.height ||
            sprite.anchor.x !== this.anchorX ||
            sprite.anchor.y !== this.anchorY;
        for (const mesh of this.meshes) {
            if (mesh.parent !== sprite.parent) sprite.parent.addChild(mesh);
            if (changed) {
                const p = mesh.geometry.positions;
                const left = (-margin - sprite.anchor.x) * w;
                const top = (-marginY - sprite.anchor.y) * h;
                const right = (1 + margin - sprite.anchor.x) * w;
                const bottom = (1 + marginY - sprite.anchor.y) * h;
                p.set([left, top, right, top, right, bottom, left, bottom]);
                mesh.geometry.getBuffer("aPosition").update();
                mesh.geometry.uvs.set([
                    -margin,
                    -marginY,
                    1 + margin,
                    -marginY,
                    1 + margin,
                    1 + marginY,
                    -margin,
                    1 + marginY,
                ]);
                mesh.geometry.getBuffer("aUV").update();
            }
            mesh.position.copyFrom(sprite.position);
            mesh.scale.copyFrom(sprite.scale);
            mesh.skew.copyFrom(sprite.skew);
            mesh.pivot.copyFrom(sprite.pivot);
            mesh.rotation = sprite.rotation;
            mesh.alpha = sprite.alpha;
            mesh.visible = true;
            const shader = mesh.shader!;
            const uniforms = shader.resources.water.uniforms;
            uniforms.uTime = nowMs / 1000;
            uniforms.uBurst = burstAge;
            uniforms.uGroundY = this.groundY;
            // Constrain only the artwork, never the gameplay footprint/range. Leave ripple room.
            const worldWidth = w * Math.abs(sprite.scale.x);
            uniforms.uRadiusX =
                cellWidth !== undefined && cellWidth > 0 && worldWidth > 0
                    ? Math.min(0.405, (cellWidth / worldWidth) * 0.475)
                    : 0.405;
        }
        this.refraction.update(sprite, nowMs, this.front.shader!.resources.water.uniforms.uRadiusX, burstAge);
        this.margin = margin;
        this.width = w;
        this.height = h;
        this.anchorX = sprite.anchor.x;
        this.anchorY = sprite.anchor.y;
        this.setDepth(sprite.zIndex);
    }
    public destroy(): void {
        if (this.burstSprite && !this.burstSprite.destroyed) this.burstSprite.destroy();
        if (!this.back.destroyed) this.back.destroy();
        if (!this.front.destroyed) this.front.destroy();
    }
}
