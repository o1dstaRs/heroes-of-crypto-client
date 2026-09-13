import { Rectangle, Texture } from "pixi.js";

// Authored connected arm/hat poses, with a long quiet pause between greetings.
export const LEPRECHAUN_IDLE_POSES = [0, 6, 1, 7, 8, 2, 4, 9, 10, 3, 10, 9, 4, 5, 8, 11, 1, 6] as const;
const AUTHORED_IDLE_DURATIONS = [
    3600, 140, 140, 160, 120, 120, 150, 150, 140, 360, 140, 150, 150, 120, 120, 160, 140, 140,
] as const;
const IDLE_PLAYBACK_SPEED = 1.12;
export const LEPRECHAUN_IDLE_DURATIONS = AUTHORED_IDLE_DURATIONS.map(
    (duration, index) => (index === 0 ? duration : duration / 1.07) / IDLE_PLAYBACK_SPEED,
);
export const LEPRECHAUN_IDLE_CYCLE_MS = LEPRECHAUN_IDLE_DURATIONS.reduce((sum, duration) => sum + duration, 0);
// Preserve the independently tuned breath while speeding up the entire idle.
const BREATH_PERIOD_MS = 3100 / 1.2 / IDLE_PLAYBACK_SPEED;

export function leprechaunIdleMotion(elapsedMs: number): { frame: number; sway: number; breathe: number } {
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const time = elapsed % LEPRECHAUN_IDLE_CYCLE_MS;
    let end = 0;
    let frame: number = 0;
    for (let i = 0; i < LEPRECHAUN_IDLE_POSES.length; i++) {
        end += LEPRECHAUN_IDLE_DURATIONS[i];
        if (time < end) {
            frame = LEPRECHAUN_IDLE_POSES[i];
            break;
        }
    }
    const phase = (time / LEPRECHAUN_IDLE_CYCLE_MS) * Math.PI * 2;
    const breathPhase = ((elapsed % BREATH_PERIOD_MS) / BREATH_PERIOD_MS) * Math.PI * 2;
    // Zero displacement and velocity at entry; no global scale or foot movement.
    return {
        frame,
        sway: (8.4 * Math.sin(phase) * (1 - Math.cos(phase))) / 2,
        breathe: 3.36 * (1 - Math.cos(breathPhase)),
    };
}

const cachedFrames = new WeakMap<Texture, Texture[]>();
export function leprechaunIdleFrames(atlas: Texture | undefined): readonly Texture[] {
    if (!atlas || atlas.source.width !== 4096 || atlas.source.height !== 3072) return [];
    let frames = cachedFrames.get(atlas);
    if (!frames) {
        frames = Array.from(
            { length: 12 },
            (_, index) =>
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle((index % 4) * 1024, Math.floor(index / 4) * 1024, 1024, 1024),
                }),
        );
        cachedFrames.set(atlas, frames);
    }
    return frames;
}
