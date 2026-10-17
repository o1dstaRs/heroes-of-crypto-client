import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Graphics } from "pixi.js";
import { arachnaWebBounds } from "./ArachnaQueenWebAura";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import {
    ABOMINATION_STORM_REVOLUTION_MS,
    ABOMINATION_SAND_VARIANTS,
    type AbominationSandVariant,
} from "./AbominationSandShader";

const TAU = Math.PI * 2;
export const SAND_WIND_PARTICLE_COUNT = 384;
const fraction = (value: number) => value - Math.floor(value);

/** Grains travel inward along the same rotating spiral, fading before they respawn outside. */
export function abominationWindParticle(index: number, ageMs: number, variant: AbominationSandVariant = 0) {
    const style = ABOMINATION_SAND_VARIANTS[variant];
    const seed = fraction((index + 1) * 0.61803398875);
    const spread = fraction((index + 1) * 0.754877666);
    const time = Math.max(0, ageMs);
    const life = fraction(time / ABOMINATION_STORM_REVOLUTION_MS + seed);
    const radius = 0.05 + 0.89 * (1 - life);
    const angle =
        (time / ABOMINATION_STORM_REVOLUTION_MS) * TAU -
        (radius * style.pitch) / style.arms +
        ((index % style.arms) * TAU) / style.arms +
        ((spread - 0.5) * 0.5 * Math.sqrt(10 / style.tightness)) / style.arms;
    const point = (a: number) => {
        const c = Math.cos(a),
            s = Math.sin(a);
        return { x: radius * c, y: -radius * s };
    };
    return {
        head: point(angle),
        tail: point(angle - 0.035),
        alpha: Math.sin(life * Math.PI) ** 2 * (0.3 + spread * 0.28),
        size: 0.008 + spread * 0.008,
    };
}

export function drawAbominationSandWind(
    g: Graphics,
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    ageMs: number,
    narrowing: number,
    variant: AbominationSandVariant = 0,
): void {
    g.clear();
    const bounds = arachnaWebBounds(center, footprint, range, gs, narrowing);
    if (!bounds) return;
    const cell = gs.getCellSize();
    const halfWidth = (range + footprint.width / 2) * cell;
    const halfHeight = (range + footprint.height / 2) * cell;
    const inside = (p: HoCMath.XY, margin: number) =>
        p.x > bounds.left + margin &&
        p.x < bounds.right - margin &&
        p.y > bounds.bottom + margin &&
        p.y < bounds.top - margin;
    for (let i = 0; i < SAND_WIND_PARTICLE_COUNT; i++) {
        const grain = abominationWindParticle(i, ageMs, variant);
        const head = { x: center.x + grain.head.x * halfWidth, y: center.y + grain.head.y * halfHeight };
        const radius = grain.size * cell;
        if (!inside(head, radius * 2)) continue;
        const p = projectBattlefieldPoint(head, gs);
        const edge = Math.min(head.x - bounds.left, bounds.right - head.x, head.y - bounds.bottom, bounds.top - head.y);
        const alpha = grain.alpha * Math.min(1, edge / (cell * 0.2));
        const color = i % 3 === 0 ? 0xe5cda1 : 0xcdb185;
        g.circle(p.x, p.y, radius).fill({ color, alpha });
    }
}
