import { Graphics, type Sprite } from "pixi.js";
import { trollCastRegisteredPoint } from "./TrollLabCastMatch";

export const isTrollLabCastGuard = (state: string | undefined, frame: number): boolean =>
    state === "cast" && (frame === 0 || frame === 7);

function smooth(value: number): number {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
}

/** The open palm stays unlit; energy grows during finger closure and fades before release. */
export function trollCastGlowStrength(frame: number, progress: number): number {
    if (frame === 3) return 0.8 * smooth(progress);
    if (frame === 4) return (0.8 + 0.2 * smooth(progress / 0.25)) * (1 - smooth((progress - 0.65) / 0.35));
    return 0;
}

const glows = new WeakMap<Sprite, Graphics>();
/** Copy the sprite transform so the sibling overlay follows the foreground fist in both facings. */
export function syncTrollLabCastGlow(
    sprite: Sprite,
    state: string | undefined,
    frame: number,
    elapsed: number,
    frameDuration: number,
): void {
    const strength =
        state === "cast" && sprite.parent ? trollCastGlowStrength(frame, elapsed / Math.max(1, frameDuration)) : 0;
    let glow = glows.get(sprite);
    if (!glow && strength > 0) {
        glow = new Graphics();
        glow.label = "troll-cast-fist-glow";
        glow.eventMode = "none";
        glow.blendMode = "add";
        // Overlapping translucent rings form a soft halo while preserving the hand silhouette.
        for (let radius = 96; radius >= 12; radius -= 3)
            glow.circle(0, 0, radius).fill({ color: radius > 42 ? 0x32e81d : 0xb3ff68, alpha: 0.018 });
        sprite.parent!.addChild(glow);
        glows.set(sprite, glow);
        const owned = glow;
        sprite.once("destroyed", () => {
            if (!owned.destroyed) owned.destroy();
        });
    }
    if (!glow) return;
    glow.visible = strength > 0 && sprite.visible && sprite.renderable;
    glow.alpha = strength * sprite.alpha;
    if (!glow.visible) return;
    if (glow.parent !== sprite.parent) sprite.parent!.addChild(glow);
    glow.zIndex = sprite.zIndex + 0.01;
    // Measured from the normalized cast frames (1152px canvas), independent of atlas packing.
    sprite.updateLocalTransform();
    const transform = sprite.localTransform.clone();
    const fist = trollCastRegisteredPoint(frame, frame === 3 ? 407.6 : 415.83, 163.94);
    const point = transform.apply({
        x: fist.x - 1152 * sprite.anchor.x,
        y: fist.y - 1152 * sprite.anchor.y,
    });
    transform.tx = point.x;
    transform.ty = point.y;
    glow.setFromMatrix(transform);
}
