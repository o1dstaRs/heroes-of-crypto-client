import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

/**
 * Two rules for the ranged counter-shot, both learned from bugs.
 *
 * 1. It is identified by the animation's ORIGIN, never its victim. The engine stamps the response entry
 *    with the counter's FIRST VICTIM, and a counter fired back down the lane stops on the first enemy it
 *    meets — routinely a stack of the attacker's own army screening them. Asking "does an animation name
 *    the attacker" therefore dropped the whole retaliation, silently, for about a third of all counters.
 * 2. It lands at a figure's VISUAL CENTRE, never at a recorded edge. The engine's toPosition is a logical
 *    combat coordinate; reusing it as a rendered endpoint made counters dive at the feet of large sprites.
 *
 * Both paths — replay (which ranked live also runs) and the local sandbox — have to obey both.
 */
describe("ranged retaliation projectile targeting", () => {
    const replaySlice = (source: string): string =>
        source.slice(
            source.indexOf("private async playReplayRetaliation("),
            source.indexOf("private materializeReplaySummons("),
        );
    const liveSlice = (source: string): string => {
        const start = source.indexOf("// Ranged counter: when the defender shoots back");
        return source.slice(start, source.indexOf("        } else {", start));
    };

    test("both paths find the counter by its origin, not by who it hit", () => {
        const source = sandboxSource();

        for (const [name, slice] of [
            ["replay", replaySlice(source)],
            ["live", liveSlice(source)],
        ] as const) {
            expect({ name, findsByOrigin: slice.includes("findRangeResponseAnimation(") }).toEqual({
                name,
                findsByOrigin: true,
            });
            // The old test: an animation naming the attacker. It is the bug, so it must not come back.
            expect({ name, asksWhoItHit: slice.includes("affectedUnitId === attacker.getId()") }).toEqual({
                name,
                asksWhoItHit: false,
            });
        }
    });

    test("both paths fly the counter at whoever it actually struck", () => {
        const source = sandboxSource();

        expect(replaySlice(source)).toContain("await this.playReplayProjectile(target, responseVictim);");
        expect(liveSlice(source)).toContain("const responseTarget = liveResponseVictim.getVisualCenter(gs);");
        expect(liveSlice(source)).toContain("target.getRangedProjectileOrigin(responseTarget, gs)");
        expect(liveSlice(source)).toContain("to: responseTarget");
    });

    test("neither path aims at the engine's recorded edge", () => {
        const source = sandboxSource();

        expect(replaySlice(source)).not.toContain("responseEdge");
        expect(liveSlice(source)).not.toContain("?.toPosition");
    });
});
