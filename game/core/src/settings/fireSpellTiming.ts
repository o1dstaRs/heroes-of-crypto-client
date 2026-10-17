import { readAnimationSetting } from "./animationLabProfile";
/** Both renderers use authored time, sped up by 50%, including staggered meteor launches. */
export const FIRE_SPELL_PLAYBACK_SPEED = 1.5;
export type FireSpellRenderMode = "sprites" | "particles";

/** Scale only airborne meteor bodies/trails; impact footprints remain unchanged. */
export const METEOR_FLIGHT_SCALE = 1.3;

const FIRE_SPELL_RENDER_MODE_KEY = "hoc.fire-spell-render-mode.v1";
type ModeStorage = Pick<Storage, "getItem" | "setItem">;

/** The lab and ordinary combat read the same local visual preference. */
export function readFireSpellRenderMode(storage?: ModeStorage): FireSpellRenderMode {
    if (!storage) {
        const mode = readAnimationSetting<string>("fire.renderMode", "");
        if (mode === "sprites" || mode === "particles") return mode;
    }
    try {
        return (storage ?? globalThis.localStorage)?.getItem(FIRE_SPELL_RENDER_MODE_KEY) === "particles"
            ? "particles"
            : "sprites";
    } catch {
        return "sprites";
    }
}
export function saveFireSpellRenderMode(mode: FireSpellRenderMode, storage?: ModeStorage): void {
    try {
        (storage ?? globalThis.localStorage)?.setItem(FIRE_SPELL_RENDER_MODE_KEY, mode);
    } catch {
        /* Storage can be unavailable; the current scene still uses the selected mode. */
    }
}
