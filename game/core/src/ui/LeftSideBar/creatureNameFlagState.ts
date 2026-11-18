/** Stack strength, not the current top creature's HP. Resurrection reduces the casualty count. */
export function creatureFlagFraction(alive: number, died: number): number {
    const living = Number.isFinite(alive) ? Math.max(0, alive) : 0;
    const fallen = Number.isFinite(died) ? Math.max(0, died) : 0;
    return living + fallen > 0 ? living / (living + fallen) : 0;
}

/** Time-based easing keeps depletion identical at 30/60/120 Hz. Never animate between different units. */
export function advanceCreatureFlag(current: number, target: number, seconds: number): number {
    const next = target + (current - target) * Math.exp(-12 * Math.max(0, seconds));
    return Math.abs(next - target) < 0.0005 ? target : next;
}
