import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { GameEvent } from "@heroesofcrypto/common";

export const UNICORN_BLINDNESS_FLASH_MS = 850;

/** Only a confirmed application to this strike's recipient can light the source horn. */
export function unicornBlindnessLanded(events: readonly GameEvent[] | undefined, targetId: string): boolean {
    return !!events?.some(
        (event) =>
            event.type === "effects_applied" &&
            event.applications.some(
                (application) =>
                    application.unitId === targetId && application.name === "Blindness" && !application.resisted,
            ),
    );
}

const layers = new WeakMap<Sprite, Container>();
const atlasFrames = new WeakMap<Texture, Texture[]>();

/** Separate authored emission sprites follow the figure's mirrored local coordinates. */
export function syncUnicornBlindnessLight(
    sprite: Sprite,
    elapsedMs: number,
    hornTexture?: Texture,
    eyeTexture?: Texture,
): void {
    const active = elapsedMs >= 0 && elapsedMs < UNICORN_BLINDNESS_FLASH_MS;
    let layer = layers.get(sprite);
    if (active && !layer && hornTexture?.source && eyeTexture?.source) {
        let frames = atlasFrames.get(hornTexture);
        if (!frames) {
            const w = hornTexture.width / 2,
                h = hornTexture.height / 2;
            frames = Array.from(
                { length: 4 },
                (_, i) =>
                    new Texture({
                        source: hornTexture.source,
                        frame: new Rectangle((i % 2) * w, Math.floor(i / 2) * h, w, h),
                    }),
            );
            atlasFrames.set(hornTexture, frames);
        }
        layer = new Container();
        layer.label = "unicorn-mystic-horn-and-eye";
        layer.eventMode = "none";
        for (const texture of frames) {
            const light = new Sprite(texture);
            light.anchor.set(0.5, 0.91);
            light.width = 140;
            light.height = 186;
            light.rotation = Math.atan2(99, 111);
            light.blendMode = "add";
            layer.addChild(light);
        }
        const eye = new Sprite(eyeTexture);
        eye.anchor.set(0.5);
        eye.width = 105;
        eye.height = 80;
        eye.rotation = 0.2;
        eye.blendMode = "add";
        layer.addChild(eye);
        const owned = layer;
        sprite.once("destroyed", () => owned.destroy({ children: true }));
        layers.set(sprite, layer);
    }
    if (!layer) return;
    layer.visible = active && sprite.visible && sprite.renderable;
    if (!active) return;
    if (sprite.parent && layer.parent !== sprite.parent) sprite.parent.addChild(layer);
    layer.position.copyFrom(sprite.position);
    layer.scale.copyFrom(sprite.scale);
    layer.rotation = sprite.rotation;
    layer.zIndex = sprite.zIndex + 0.002;
    layer.alpha =
        sprite.alpha * Math.min(1, elapsedMs / 65) * Math.min(1, (UNICORN_BLINDNESS_FLASH_MS - elapsedMs) / 300);
    const frame = Math.min(3, (elapsedMs / UNICORN_BLINDNESS_FLASH_MS) * 3.6);
    for (let i = 0; i < 4; i++) {
        const light = layer.children[i];
        light.position.set(640 - sprite.anchor.x * 768, 163 - sprite.anchor.y * 768);
        light.alpha = Math.max(0, 1 - Math.abs(frame - i));
    }
    const eye = layer.children[4];
    // Side profile: only the anatomically visible eye emits light.
    eye.position.set(594 - sprite.anchor.x * 768, 210 - sprite.anchor.y * 768);
    eye.alpha = 0.9 + 0.1 * Math.sin(elapsedMs * 0.019);
}
