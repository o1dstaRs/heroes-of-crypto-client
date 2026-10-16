import { expect, test } from "bun:test";
import { fairyLabAttackElapsed, fairyLabAttackMotion, FAIRY_LAB_ATTACK_DURATIONS_MS } from "./FairyLabAttackMotion";

test("Fairy torso winds back, follows through and settles without a seam", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        expect(fairyLabAttackMotion(state, 0)).toEqual([0, 0, 0]);
        expect(fairyLabAttackMotion(state, 260)[0]).toBeLessThan(-10);
        expect(fairyLabAttackMotion(state, 470)[0]).toBeGreaterThan(15);
        expect(fairyLabAttackMotion(state, 470)[2]).toBeGreaterThan(0.1);
        expect(fairyLabAttackMotion(state, 900)).toEqual([0, 0, 0]);
        expect(fairyLabAttackMotion(state, 1200)).toEqual([0, 0, 0]);
        for (let frame = 1; frame < 6; frame++) {
            const before = fairyLabAttackElapsed(
                frame - 1,
                FAIRY_LAB_ATTACK_DURATIONS_MS[frame - 1],
                FAIRY_LAB_ATTACK_DURATIONS_MS,
            );
            const after = fairyLabAttackElapsed(frame, 0, FAIRY_LAB_ATTACK_DURATIONS_MS);
            expect(fairyLabAttackMotion(state, before)).toEqual(fairyLabAttackMotion(state, after));
        }
    }
    expect(fairyLabAttackMotion("idle", 470)).toEqual([0, 0, 0]);
    expect(fairyLabAttackMotion("death", 470)).toEqual([0, 0, 0]);
});
