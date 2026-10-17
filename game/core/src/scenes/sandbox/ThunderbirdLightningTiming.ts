type Point = Readonly<{ x: number; y: number }>;
export const LIGHTNING_FRAME_MS = [20, 30, 30, 35, 40, 45, 50, 60];
export const LIGHTNING_JUMP_MS = 120;
export const LIGHTNING_LEAD_MS = 35;
export const LIGHTNING_LIFE_MS = 310;

export function lightningFrameAt(ageMs: number): number | undefined {
    if (ageMs < 0) return undefined;
    for (let i = 0; i < LIGHTNING_FRAME_MS.length; i++) {
        if (ageMs < LIGHTNING_FRAME_MS[i]) return i;
        ageMs -= LIGHTNING_FRAME_MS[i];
    }
    return undefined;
}

/** Input points are cell centres. Strike their upper edge in the y-up world, including every bounce. */
export function lightningPath(targets: readonly Point[], cellSize: number) {
    const impacts = targets.map(({ x, y }) => ({ x, y: y + cellSize * 0.5 }));
    return impacts.map((to, i) => ({
        from: i === 0 ? { x: to.x + cellSize * 0.22, y: to.y + cellSize * 3.4 } : impacts[i - 1],
        to,
        delayMs: LIGHTNING_LEAD_MS + i * LIGHTNING_JUMP_MS,
    }));
}
