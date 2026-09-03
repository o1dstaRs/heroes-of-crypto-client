import { Container, Sprite, Texture } from "pixi.js";
import { GridSettings } from "@heroesofcrypto/common";

interface IFogPlane {
    sprite: Sprite;
    phase: number;
    speed: number;
    driftX: number;
    driftY: number;
    baseX: number;
    baseY: number;
    baseAlpha: number;
    rotation: number;
}

/**
 * High-detail board fog made from an authored VFX texture, not a full-floor shader.
 *
 * The primary fog sits under holes and obstacles. Sandbox may create a second, identically animated
 * instance masked to tombstone alpha so only those stones receive foreground fog.
 */
export class DungeonVfxLayer {
    private readonly fogContainer = new Container();
    private readonly fogContent = new Container();
    private readonly fogPlanes: IFogPlane[] = [];
    private time = 0;
    private lastUpdateMs = 0;
    public constructor(gs: GridSettings, fogTexture?: Texture) {
        const minX = gs.getMinX();
        const minY = gs.getMinY();
        const width = gs.getMaxX() - minX;
        const height = gs.getMaxY() - minY;
        const centerX = minX + width * 0.5;
        const centerY = minY + height * 0.5;

        this.fogContainer.eventMode = "none";
        this.fogContainer.addChild(this.fogContent);

        if (fogTexture) {
            // Three independently moving depths use the same richly detailed source at different crop,
            // tint, scale and phase. Their movement never lines up, so the texture does not read as a
            // single picture sliding over the board.
            const fogSpecs = [
                {
                    phase: 0.3,
                    speed: 0.19,
                    driftX: 0.105,
                    driftY: 0.035,
                    scale: 1.34,
                    alpha: 0.88,
                    tint: 0x879ba7,
                    rotation: -0.055,
                },
                {
                    phase: 2.7,
                    speed: 0.13,
                    driftX: 0.085,
                    driftY: 0.05,
                    scale: 1.18,
                    alpha: 0.58,
                    tint: 0xa2adb2,
                    rotation: 0.07,
                },
                {
                    phase: 5.1,
                    speed: 0.27,
                    driftX: 0.06,
                    driftY: 0.025,
                    scale: 1.5,
                    alpha: 0.36,
                    tint: 0x697f8b,
                    rotation: 0.025,
                },
            ];
            for (const spec of fogSpecs) {
                const sprite = new Sprite(fogTexture);
                sprite.anchor.set(0.5);
                sprite.position.set(centerX, centerY);
                sprite.width = width * spec.scale;
                sprite.height = height * spec.scale;
                // World root is y-up; compensate so authored fog is not vertically mirrored.
                sprite.scale.y *= -1;
                sprite.alpha = spec.alpha;
                sprite.tint = spec.tint;
                sprite.rotation = spec.rotation;
                sprite.blendMode = "normal";
                sprite.eventMode = "none";
                this.fogContent.addChild(sprite);
                this.fogPlanes.push({
                    sprite,
                    phase: spec.phase,
                    speed: spec.speed,
                    driftX: width * spec.driftX,
                    driftY: height * spec.driftY,
                    baseX: centerX,
                    baseY: centerY,
                    baseAlpha: spec.alpha,
                    rotation: spec.rotation,
                });
            }
        }
    }
    /** Detailed fog under holes/terrain. */
    public getContainer(): Container {
        return this.fogContainer;
    }
    public getDiagnostics(): Record<string, unknown> {
        return {
            fogPlanes: this.fogPlanes.length,
            fogVisible: this.fogContainer.visible,
            clockSeconds: Number(this.time.toFixed(2)),
        };
    }
    public setVisible(visible: boolean): void {
        this.fogContainer.visible = visible;
    }
    public update(): void {
        if (!this.fogContainer.visible || !this.fogPlanes.length) return;
        const now = performance.now();
        if (!this.lastUpdateMs) this.lastUpdateMs = now;
        this.time += Math.min(0.05, Math.max(0, (now - this.lastUpdateMs) / 1000));
        this.lastUpdateMs = now;
        if (this.time > 4096) this.time -= 4096;

        for (const plane of this.fogPlanes) {
            const t = this.time * plane.speed + plane.phase;
            plane.sprite.x = plane.baseX + Math.sin(t) * plane.driftX + Math.sin(t * 0.37 + 1.2) * plane.driftX * 0.28;
            plane.sprite.y = plane.baseY + Math.cos(t * 0.71) * plane.driftY;
            plane.sprite.rotation = plane.rotation + Math.sin(t * 0.29) * 0.018;
            // A tiny density variation reads as turbulent flow; it deliberately never becomes a pulse.
            plane.sprite.alpha = plane.baseAlpha * (0.94 + Math.sin(t * 0.83) * 0.06);
        }
    }
    public destroy(): void {
        this.fogContainer.destroy({ children: true });
    }
}
