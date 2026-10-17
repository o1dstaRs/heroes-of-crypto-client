/** Slow, independent waves deform the painted water without rotating the whole effect. */
export function whirlpoolEdgeScale(angle: number, ageMs: number, radius: number): number {
    const t = ageMs / 1000;
    const waves =
        0.025 * Math.sin(angle * 3 + t * 1.7) +
        0.015 * Math.sin(angle * 5 - t * 2.1 + 0.8) +
        0.01 * Math.sin(angle * 7 + t * 1.1 + 2.3);
    return 1 + waves * Math.min(1, radius * radius);
}
