import type { SpellAtmosphereEmitter } from "./SpellAtmosphere";
import type { WhirlpoolFootprint } from "./WhirlpoolSprites";

/** Authored milliseconds shared with sprite and procedural timelines. */
export function emitFireAtmosphere(
    emit: SpellAtmosphereEmitter | undefined,
    kind: "ring" | "meteor",
    age: number,
    target: WhirlpoolFootprint,
    area: WhirlpoolFootprint,
): void {
    if (!emit || age < 0) return;
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    if (kind === "ring") {
        const expansion = clamp((age - 310) / 240),
            fade = clamp((1400 - age) / 450);
        const burst = Math.exp(-Math.max(0, age - 310) / 130) * (age >= 310 ? 1 : 0);
        emit({
            x: target.center.x + (area.center.x - target.center.x) * expansion,
            y: target.center.y + (area.center.y - target.center.y) * expansion + target.height * 0.3,
            width: target.width * (0.85 + expansion * 0.3) + area.width * expansion * 0.48,
            height: target.height * 1.1 + area.height * expansion * 0.5,
            light: (0.25 + burst * 0.8) * clamp(age / 90) * fade,
            heat: (0.3 + expansion * 0.7) * fade,
        });
    } else if (age < 640) {
        const t = age / 640,
            remaining = 1 - t * t;
        emit({
            x: area.center.x + remaining * area.width * 2.2,
            y: area.center.y + remaining * area.height * 4.2,
            width: area.width * 0.6,
            height: area.height * 1.1,
            light: 0.18 * clamp(age / 90),
            heat: 0.65,
        });
    } else {
        const t = (age - 640) / 630,
            fade = clamp(1 - t);
        emit({
            x: area.center.x,
            y: area.center.y + area.height * 0.35,
            width: area.width * 1.2,
            height: area.height * 1.5,
            light: Math.exp(-t * 5) * 1.1,
            heat: fade * 0.9,
        });
    }
}
