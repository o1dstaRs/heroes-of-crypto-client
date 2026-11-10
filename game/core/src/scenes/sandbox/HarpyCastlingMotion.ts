import type { HoCMath } from "@heroesofcrypto/common";

export type HarpyCastlingPhase =
    "takeoff" | "approach" | "grip" | "lift" | "carry" | "drop" | "release" | "return" | "land";
const phases: HarpyCastlingPhase[] = [
    "takeoff",
    "approach",
    "grip",
    "lift",
    "carry",
    "drop",
    "release",
    "return",
    "land",
];
const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: HoCMath.XY, b: HoCMath.XY, t: number): HoCMath.XY => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
});

/** Ground travel and elevation are separate: lifting a passenger must not change its perspective row. */
export function harpyCastlingDurations(distanceCells: number): number[] {
    const travel = Math.max(0, distanceCells);
    return [0.16, 0.2 + travel * 0.06, 0.06, 0.1, 0.32 + travel * 0.1, 0.2, 0.12, 0.28 + travel * 0.075, 0.2].map(
        (duration) => duration / (1.4 * 1.2 * 1.3),
    );
}

export function sampleHarpyCastling(
    elapsed: number,
    durations: readonly number[],
    from: HoCMath.XY,
    pickup: HoCMath.XY,
    delivery: HoCMath.XY,
    destination: HoCMath.XY,
) {
    let phaseIndex = 0;
    let remaining = Math.max(0, elapsed);
    while (phaseIndex < durations.length - 1 && remaining >= durations[phaseIndex])
        remaining -= durations[phaseIndex++];
    const progress = Math.min(1, remaining / durations[phaseIndex]);
    const t = ease(progress);
    const phase = phases[phaseIndex];
    let caster = from;
    let passenger = pickup;
    let passengerLift = 0;
    let casterLift = 0;
    if (phase === "takeoff") casterLift = t;
    if (phase === "approach") {
        caster = mix(from, pickup, t);
        casterLift = 1;
    }
    if (["grip", "lift"].includes(phase)) caster = pickup;
    if (phase === "grip") casterLift = 1 - t;
    if (phase === "lift") passengerLift = t;
    if (phase === "carry") {
        // Immediate departure after pickup; avoid another zero-speed ease-in at the target.
        passenger = mix(pickup, delivery, progress);
        caster = passenger;
        passengerLift = 1;
    }
    if (["drop", "release", "return", "land"].includes(phase)) {
        passenger = delivery;
        caster = delivery;
    }
    if (phase === "drop") passengerLift = 1 - t;
    if (phase === "return") {
        caster = mix(delivery, destination, t);
        casterLift = 1;
    }
    if (phase === "land") {
        caster = destination;
        casterLift = 1 - t;
    }
    return {
        phase,
        progress,
        caster,
        passenger,
        passengerLift,
        casterLift,
        attached: ["lift", "carry", "drop", "release"].includes(phase),
        finished: phase === "land" && progress === 1,
    };
}
