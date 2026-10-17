import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { hydraCrestAnchor, hydraCrestFirePhase, type HydraCrestFireState } from "./HydraCrestFire";

const layers = new WeakMap<Sprite, { layer: Container; flames: Sprite[] }>();
const atlasFrames = new WeakMap<Texture, Texture[]>();

/** Authored fire cels follow the crest without changing the body texture or its bounds. */
export function syncHydraCrestFire(
    sprite: Sprite,
    state: HydraCrestFireState | undefined,
    bodyFrame: number,
    nowMs: number,
    atlas?: Texture,
): void {
    let owned = layers.get(sprite);
    if (!owned && state && atlas?.source && atlas !== Texture.EMPTY) {
        let frames = atlasFrames.get(atlas);
        if (!frames) {
            const w = atlas.width / 4;
            const h = atlas.height / 4;
            frames = Array.from(
                { length: 16 },
                (_, i) =>
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle((i % 4) * w, Math.floor(i / 4) * h, w, h),
                    }),
            );
            atlasFrames.set(atlas, frames);
        }
        const layer = new Container();
        layer.label = "hydra-crest-fire";
        layer.eventMode = "none";
        const flames = [new Sprite(frames[0]), new Sprite(frames[1])];
        for (const flame of flames) {
            flame.anchor.set(0.5, 0.88);
            flame.rotation = -0.32;
            flame.blendMode = "add";
            layer.addChild(flame);
        }
        sprite.once("destroyed", () => layer.destroy({ children: true }));
        owned = { layer, flames };
        layers.set(sprite, owned);
    }
    if (!owned) return;
    const { layer, flames } = owned;
    layer.visible = !!state && sprite.visible && sprite.renderable && !!sprite.parent;
    if (!state || !layer.visible || !atlas) return;
    const frames = atlasFrames.get(atlas);
    if (!frames) return;
    if (sprite.parent && layer.parent !== sprite.parent) sprite.parent.addChild(layer);
    layer.position.copyFrom(sprite.position);
    layer.scale.copyFrom(sprite.scale);
    layer.pivot.copyFrom(sprite.pivot);
    layer.skew.copyFrom(sprite.skew);
    layer.rotation = sprite.rotation;
    layer.zIndex = sprite.zIndex + 0.002;
    layer.alpha = sprite.alpha * 0.7;
    const [x, y] = hydraCrestAnchor(state, bodyFrame);
    const w = sprite.texture.orig.width;
    const h = sprite.texture.orig.height;
    const phase = hydraCrestFirePhase(nowMs);
    for (let i = 0; i < flames.length; i++) {
        const flame = flames[i];
        flame.texture = frames[i === 0 ? phase.frame : phase.next];
        flame.position.set((x / 768 - sprite.anchor.x) * w, (y / 768 - sprite.anchor.y) * h);
        flame.width = (92 * w) / 768;
        flame.height = (88 * h) / 768;
        flame.alpha = i === 0 ? 1 - phase.blend : phase.blend;
    }
}
