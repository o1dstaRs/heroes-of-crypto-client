import { Rectangle, Sprite, Texture } from "pixi.js";
import { BlackDragonFireFlowFilter } from "./BlackDragonFireFlowFilter";
import { BLACK_DRAGON_FIRE_MOUTHS } from "./BlackDragonFireAnchors";
import {
    blackDragonAttackElapsedMs,
    BLACK_DRAGON_FIRE_START_MS,
    BLACK_DRAGON_FIRE_END_MS,
    BLACK_DRAGON_FIRE_DURATION_MS,
} from "./BlackDragonFireTiming";
export { BLACK_DRAGON_FIRE_START_MS, BLACK_DRAGON_FIRE_END_MS } from "./BlackDragonFireTiming";

export const BLACK_DRAGON_FIRE_LENGTH_CELLS = 2.6;
export const BLACK_DRAGON_FIRE_WIDTH_CELLS = 1.4;

export function blackDragonFireState(state?: string): string | undefined {
    const canonical = state?.replace(/^melee_/, "");
    return canonical && Object.hasOwn(BLACK_DRAGON_FIRE_MOUTHS, canonical) ? canonical : undefined;
}

export function blackDragonFireFrame(elapsedMs: number): number | undefined {
    if (!Number.isFinite(elapsedMs) || elapsedMs < BLACK_DRAGON_FIRE_START_MS || elapsedMs >= BLACK_DRAGON_FIRE_END_MS)
        return undefined;
    return Math.min(15, Math.floor(((elapsedMs - BLACK_DRAGON_FIRE_START_MS) / BLACK_DRAGON_FIRE_DURATION_MS) * 16));
}

const framesByTexture = new WeakMap<Texture, Texture[]>();
const effects = new WeakMap<Sprite, Sprite>();
const flowFilters = new WeakMap<Sprite, BlackDragonFireFlowFilter>();

/** A sibling keeps flame bounds out of creature size, shadow and hitbox calculations. */
export function syncBlackDragonFireBreath(
    body: Sprite,
    state: string | undefined,
    bodyFrame: number,
    frameElapsedMs: number,
    cellSize: number,
    atlas?: Texture,
): void {
    const canonical = blackDragonFireState(state);
    const elapsedMs = blackDragonAttackElapsedMs(bodyFrame, frameElapsedMs);
    const frame = canonical ? blackDragonFireFrame(elapsedMs) : undefined;
    let effect = effects.get(body);
    if (
        frame === undefined ||
        !atlas ||
        atlas.width !== 1280 ||
        atlas.height !== 1280 ||
        !body.parent ||
        !body.visible
    ) {
        if (effect) effect.visible = false;
        return;
    }
    let frames = framesByTexture.get(atlas);
    if (!frames) {
        frames = Array.from(
            { length: 16 },
            (_, index) =>
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle(
                        ((index % 4) * atlas.width) / 4,
                        (Math.floor(index / 4) * atlas.height) / 4,
                        atlas.width / 4,
                        atlas.height / 4,
                    ),
                }),
        );
        framesByTexture.set(atlas, frames);
    }
    if (!effect || effect.destroyed) {
        effect = new Sprite(frames[frame]);
        effect.eventMode = "none";
        const flow = new BlackDragonFireFlowFilter(effect, atlas);
        effect.filters = [flow];
        flowFilters.set(effect, flow);
        effect.once("destroyed", () => flow.destroy());
        effects.set(body, effect);
        const owned = effect;
        body.once("destroyed", () => {
            if (!owned.destroyed) owned.destroy();
        });
    }
    if (effect.parent !== body.parent) body.parent.addChild(effect);
    const [x, y, angle] = BLACK_DRAGON_FIRE_MOUTHS[canonical!][Math.min(31, Math.max(0, bodyFrame))];
    const local = { x: x - body.anchor.x * 1024, y: y - body.anchor.y * 1024 };
    const mouth = body.parent.toLocal(body.toGlobal(local));
    const ahead = body.parent.toLocal(
        body.toGlobal({ x: local.x + Math.cos(angle) * 100, y: local.y + Math.sin(angle) * 100 }),
    );
    effect.texture = frames[frame];
    flowFilters.get(effect)!.update(elapsedMs, atlas, true);
    effect.anchor.set(0.08, 0.5);
    effect.position.copyFrom(mouth);
    effect.rotation = Math.atan2(ahead.y - mouth.y, ahead.x - mouth.x);
    // The painted plume occupies 78% of the cell length and 40% of its height.
    effect.scale.set(
        (cellSize * BLACK_DRAGON_FIRE_LENGTH_CELLS) / (effect.texture.width * 0.78),
        (-cellSize * BLACK_DRAGON_FIRE_WIDTH_CELLS) / (effect.texture.height * 0.4),
    );
    effect.zIndex = body.zIndex + 1;
    effect.alpha = body.alpha;
    effect.visible = true;
}
