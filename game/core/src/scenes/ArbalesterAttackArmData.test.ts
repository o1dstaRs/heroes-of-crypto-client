import { describe, expect, test } from "bun:test";
import { animationAtlases } from "../generated/animation_atlases";
import { ARBALESTER_ATTACK_ARM_DATA } from "./ArbalesterAttackArmData";

describe("Arbalester attack arm calibration data", () => {
    test("covers native attack frames and leaves both exact idle endpoints untouched", () => {
        const states = ["attack", "attack_up", "attack_down", "melee_attack", "melee_attack_up", "melee_attack_down"];
        expect(Object.keys(ARBALESTER_ATTACK_ARM_DATA).sort()).toEqual(states.sort());
        const atlases = animationAtlases.Arbalester as Record<
            string,
            { frameWidth: number; frameHeight: number; frameCount: number }
        >;
        for (const [state, frames] of Object.entries(ARBALESTER_ATTACK_ARM_DATA)) {
            expect(atlases[state].frameWidth).toBe(512);
            expect(atlases[state].frameHeight).toBe(512);
            expect(frames).toHaveLength(atlases[state].frameCount);
            for (const endpoint of [frames[0], frames[frames.length - 1]]) {
                expect(endpoint).toHaveLength(2);
                expect(endpoint.every((bone) => bone.length === 9 && bone.every((value) => value === 0))).toBe(true);
            }
        }
    });

    test("keeps every inverse section monotone with bounded one-sided correction", () => {
        for (const frames of Object.values(ARBALESTER_ATTACK_ARM_DATA)) {
            for (const bones of frames.slice(1, -1)) {
                expect(bones).toHaveLength(2);
                for (const bone of bones) {
                    expect(bone).toHaveLength(9);
                    expect(bone.every(Number.isFinite)).toBe(true);
                    const [ax, ay, bx, by, source, target, outer, fade, side] = bone;
                    expect([ax, ay, bx, by].every((value) => value > 0 && value < 512)).toBe(true);
                    expect(Math.hypot(bx - ax, by - ay)).toBeGreaterThan(1);
                    expect(fade).toBeGreaterThan(0);
                    expect(fade).toBeLessThan(Math.hypot(bx - ax, by - ay) / 2);
                    expect(target).toBeGreaterThanOrEqual(source * 0.75);
                    expect(target).toBeLessThanOrEqual(source);
                    expect(outer).toBeGreaterThan(Math.max(source, target));
                    // These are the two transverse slopes, before the positive end fade.
                    // A zero/negative slope would fold the sampling map or duplicate a contour.
                    expect(source / target).toBeGreaterThan(0);
                    expect((outer - source) / (outer - target)).toBeGreaterThan(0);
                    expect(side).toBe(1);
                }
            }
        }
    });

    test("shares the authored elbow and orients the forearm correction below the weapon", () => {
        for (const frames of Object.values(ARBALESTER_ATTACK_ARM_DATA)) {
            for (const [upperArm, forearm] of frames.slice(1, -1)) {
                expect(upperArm.slice(2, 4)).toEqual(forearm.slice(0, 2));
                // Elbow-to-wrist points right in source art. Its positive normal points down;
                // mirroring happens in the sprite matrix, never by reversing these annotations.
                expect(forearm[2]).toBeGreaterThan(forearm[0]);
            }
        }
    });
});
