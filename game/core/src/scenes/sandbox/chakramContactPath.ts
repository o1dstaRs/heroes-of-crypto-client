import type { HoCMath } from "@heroesofcrypto/common";

/** Fit a recorded ground route to the already chosen body contacts before the disc starts flying. */
export function chakramContactPath(ground: readonly HoCMath.XY[], from: HoCMath.XY, to: HoCMath.XY): HoCMath.XY[] {
    if (ground.length < 2) return [{ ...from }, { ...to }];
    const distances = [0];
    for (let i = 1; i < ground.length; i++) {
        distances.push(distances[i - 1] + Math.hypot(ground[i].x - ground[i - 1].x, ground[i].y - ground[i - 1].y));
    }
    const last = ground.length - 1;
    const length = distances[last];
    const startOffset = { x: from.x - ground[0].x, y: from.y - ground[0].y };
    const endOffset = { x: to.x - ground[last].x, y: to.y - ground[last].y };
    return ground.map((point, i) => {
        if (i === 0) return { ...from };
        if (i === last) return { ...to };
        const t = length > 0 ? distances[i] / length : i / last;
        // Spread the contact offset over the whole bridge. Keep its bends and separating cells;
        // changing only the last point makes the disc climb abruptly inside the next creature.
        return {
            x: point.x + startOffset.x * (1 - t) + endOffset.x * t,
            y: point.y + startOffset.y * (1 - t) + endOffset.y * t,
        };
    });
}
