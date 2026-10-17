type Point = { x: number; y: number };
type DustPuff = Point & { born: number };

/** Short-lived world-space dust, sampled from actual travel rather than the render frame count. */
export type SandMotion = {
    position: Point;
    time: number;
    distance: number;
    wakeDistance: number;
    velocity: Point;
    wakes: DustPuff[];
    step?: DustPuff;
};

export function createSandMotion(position: Point, time: number): SandMotion {
    return {
        position: { ...position },
        time,
        distance: 0,
        wakeDistance: 0,
        velocity: { x: 0, y: 0 },
        wakes: [],
        step: undefined,
    };
}

export function updateSandMotion(motion: SandMotion, position: Point, time: number, cell: number): void {
    const dt = (time - motion.time) / 1000;
    if (dt <= 0) return;
    const dx = position.x - motion.position.x;
    const dy = position.y - motion.position.y;
    const travel = Math.hypot(dx, dy) / cell;
    // Reappearing previews and teleports must never draw a streak across the board.
    if (dt > 0.35 || travel > 1.5 || travel / dt > 12) {
        Object.assign(motion, createSandMotion(position, time));
        return;
    }
    const response = 1 - Math.exp(-dt / 0.12);
    motion.velocity.x += (dx / cell / dt - motion.velocity.x) * response;
    motion.velocity.y += (dy / cell / dt - motion.velocity.y) * response;
    motion.wakes = motion.wakes.filter((puff) => time - puff.born < 1350);
    if (travel > 0.00001) {
        const sample = (fraction: number): DustPuff => ({
            x: motion.position.x + dx * fraction,
            y: motion.position.y + dy * fraction,
            born: motion.time + dt * 1000 * fraction,
        });
        const spacing = 0.18;
        for (let at = spacing - motion.wakeDistance; at <= travel; at += spacing) {
            motion.wakes.push(sample(at / travel));
        }
        motion.wakes = motion.wakes.slice(-6);
        motion.wakeDistance = (motion.wakeDistance + travel) % spacing;
        // Two alternating footfalls per the game's 1.3-cell locomotion cycle.
        const stepDistance = 1.3 / 2;
        const previousStep = Math.floor(motion.distance / stepDistance);
        motion.distance += travel;
        const step = Math.floor(motion.distance / stepDistance);
        if (step > previousStep) {
            const fraction = 1 - (motion.distance - step * stepDistance) / travel;
            motion.step = sample(fraction);
            const side = step % 2 ? 1 : -1;
            motion.step.x += (-dy / travel) * 0.14 * side;
            motion.step.y += (dx / travel) * 0.14 * side;
        }
    }
    motion.position.x = position.x;
    motion.position.y = position.y;
    motion.time = time;
}
