import { type Filter, type Sprite } from "pixi.js";
import { valkyrieReactionPalette } from "./ValkyrieReactionPalette";
import { syncValkyrieHitSupport } from "./ValkyrieHitSupport";
import { syncValkyrieAttackGeometry } from "./ValkyrieAttackGeometry";

export const VALKYRIE_DEATH_SPEED = 1.15 * 1.1;
export const VALKYRIE_HIT_SPEED = 1.12;
export const isValkyrieLabAction = (state?: string): boolean =>
    !!state && ["hit", "death", "cast", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state);
const actionCanvasSize = (state?: string): number =>
    state === "cast" || state?.startsWith("melee_attack") ? 768 : 512;
export const valkyrieLabActionCanvasScale = (state?: string): number => actionCanvasSize(state) / 435;
export const valkyrieLabActionAnchorX = (state?: string): number =>
    (275.5 + (actionCanvasSize(state) - 512) / 2) / actionCanvasSize(state);
export const valkyrieLabActionAnchorY = (idleAnchorY: number, state: string): number =>
    ((actionCanvasSize(state) - 512) / 2 + 49 + 435 * idleAnchorY) / actionCanvasSize(state);
type Reaction = "hit" | "death";
export const VALKYRIE_REACTION_POSE_SCALES = {
    hit: [1, 0.98, 0.96, 0.96, 0.96, 0.98, 0.99, 1],
    death: [1, 0.97, 0.94, 0.92, 0.92, 0.92, 0.92, 0.92],
} as const;
const scales = new WeakMap<Sprite, number>();
const palettes = new Map<Reaction, Filter>();
const owned = new Set<Filter>();

/** Neutral frames remain source-exact. Calibrate only the newly drawn action poses. */
export function syncValkyrieLabReaction(
    sprite: Sprite,
    state: string | undefined,
    frame: number,
    scaleWasReset = false,
): void {
    const reaction = state === "hit" || state === "death" ? state : undefined;
    const paletteState = reaction ?? (state?.startsWith("melee_attack") ? "hit" : undefined);
    const enabled = !!paletteState && frame > 0 && !(paletteState === "hit" && frame === 7);
    const scale = enabled && reaction ? (VALKYRIE_REACTION_POSE_SCALES[reaction][frame] ?? 1) : 1;
    const previous = scaleWasReset ? 1 : (scales.get(sprite) ?? 1);
    if (scale !== previous) sprite.scale.set((sprite.scale.x * scale) / previous, (sprite.scale.y * scale) / previous);
    if (scale === 1) scales.delete(sprite);
    else scales.set(sprite, scale);
    syncValkyrieHitSupport(sprite, reaction === "hit" ? frame : -1, scale);
    let palette = enabled ? palettes.get(paletteState!) : undefined;
    if (enabled && !palette) {
        palette = valkyrieReactionPalette(paletteState!);
        palettes.set(paletteState!, palette);
        owned.add(palette);
    }
    const filters = sprite.filters ?? [];
    if (filters.find((filter) => owned.has(filter)) !== palette) {
        const remaining = filters.filter((filter) => !owned.has(filter));
        sprite.filters = palette ? [palette, ...remaining] : remaining.length ? remaining : null;
    }
    // The approved vertical cast keeps its complete authored weapon and body.
    syncValkyrieAttackGeometry(sprite, state === "cast" ? undefined : state, frame);
}
