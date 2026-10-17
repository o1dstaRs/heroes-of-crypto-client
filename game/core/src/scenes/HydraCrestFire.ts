/** Crest centers measured on the installed 768px idle and walk sprites. */
const idleCrests = [
    [282, 259],
    [282, 259],
    [282, 258],
    [282, 258],
    [283, 258],
    [283, 258],
    [283, 257],
    [283, 257],
    [284, 257],
    [284, 256],
    [284, 256],
    [284, 255],
    [284, 255],
    [284, 254],
    [284, 254],
    [283, 254],
    [283, 254],
    [283, 254],
    [283, 255],
    [283, 255],
    [283, 256],
    [283, 256],
    [283, 257],
    [283, 257],
    [282, 258],
    [282, 258],
    [282, 258],
    [282, 258],
    [282, 258],
    [282, 258],
    [282, 258],
    [282, 258],
] as const;
const walkCrests = [
    [294, 261],
    [293, 249],
    [293, 241.5],
    [292, 232],
    [295, 239],
    [297, 255],
    [295, 255],
    [294, 257],
] as const;

export type HydraCrestFireState = "idle" | "walk";
export const HYDRA_CREST_FIRE_FRAMES = 16;
export const HYDRA_CREST_FIRE_FRAME_MS = 50;

export function hydraCrestAnchor(state: HydraCrestFireState, frame: number): readonly [number, number] {
    // The flame head keeps the 32-pose ambient motion throughout the playful idle section.
    const anchors = state === "walk" ? walkCrests : idleCrests;
    const index = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) % anchors.length : 0;
    return anchors[index];
}

export function hydraCrestFirePhase(nowMs: number): { frame: number; next: number; blend: number } {
    const time = Number.isFinite(nowMs) ? Math.max(0, nowMs) / HYDRA_CREST_FIRE_FRAME_MS : 0;
    const frame = Math.floor(time) % HYDRA_CREST_FIRE_FRAMES;
    return { frame, next: (frame + 1) % HYDRA_CREST_FIRE_FRAMES, blend: time % 1 };
}
