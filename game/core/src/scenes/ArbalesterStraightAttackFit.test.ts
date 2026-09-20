import { describe, expect, it } from "bun:test";
import { arbalesterAttackAnatomyFrame } from "./ArbalesterAttackAnatomy";
import { ARBALESTER_ATTACK_ARM_DATA } from "./ArbalesterAttackArmData";
import { ARBALESTER_STRAIGHT_WAIST, ARBALESTER_IDLE_WAIST_WIDTH } from "./ArbalesterStraightAttackFit";

describe("straight Arbalester shot proportions", () => {
    it("matches complete arm thickness rather than correcting only half the growth", () => {
        for (let frame = 1; frame <= 10; frame++) {
            const p = arbalesterAttackAnatomyFrame("attack", frame)!;
            for (const [slot, diameter] of [
                [1, 32],
                [2, 20],
            ]) {
                expect(p.shape[slot * 4] + p.shape[slot * 4 + 1]).toBe(diameter);
                expect(p.side[slot]).toBe(1);
                expect(p.shape[slot * 4 + 1]).toBeGreaterThan(0);
                expect(p.shape[slot * 4 + 2]).toBeGreaterThan(p.shape[slot * 4]);
                expect(Array.from(p.axis.slice(slot * 4, slot * 4 + 4))).toEqual(
                    ARBALESTER_ATTACK_ARM_DATA.attack[frame][slot - 1].slice(0, 4),
                );
            }
        }
    });

    it("removes the measured waist growth while preserving the weapon-side trunk", () => {
        for (let frame = 1; frame <= 10; frame++) {
            const p = arbalesterAttackAnatomyFrame("attack", frame)!;
            const [, sourceWidth] = ARBALESTER_STRAIGHT_WAIST[frame];
            expect(p.axis[12]).toBe(230);
            expect(p.axis[14]).toBe(230);
            expect(p.side[3]).toBe(-1);
            expect(p.mode[3]).toBe(2);
            expect(sourceWidth - (p.shape[12] - p.shape[13])).toBe(ARBALESTER_IDLE_WAIST_WIDTH);
            expect(p.shape[13]).toBeGreaterThan(0);
        }
        expect(arbalesterAttackAnatomyFrame("attack", 0)).toBeUndefined();
        expect(arbalesterAttackAnatomyFrame("attack", 11)).toBeUndefined();
    });

    it("keeps other attack directions on their existing anatomy profiles", () => {
        for (const state of ["attack_up", "attack_down", "melee_attack", "melee_attack_up", "melee_attack_down"]) {
            for (let frame = 1; frame <= 10; frame++) {
                const p = arbalesterAttackAnatomyFrame(state, frame)!;
                expect(p.shape[12]).toBe(0);
                for (const slot of [1, 2]) {
                    const row = ARBALESTER_ATTACK_ARM_DATA[state][frame][slot - 1];
                    expect(p.shape[slot * 4 + 1]).toBe(row[5]);
                }
            }
        }
    });
});
