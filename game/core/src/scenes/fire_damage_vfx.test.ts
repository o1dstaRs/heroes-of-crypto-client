import { describe, expect, test } from "bun:test";

import type { IVisibleDamage } from "@heroesofcrypto/common";

import { fireBurnTargets } from "./Sandbox";

const damage = (overrides: Partial<IVisibleDamage> = {}): IVisibleDamage => ({
    amount: 12,
    render: true,
    unitPosition: { x: 10, y: 20 },
    unitIsSmall: true,
    unitId: "victim",
    ...overrides,
});

const secondary = (
    source: string,
    unitId: string,
    overrides: Partial<{ amount: number; unitsDied: number; position: { x: number; y: number } }> = {},
) =>
    ({
        source,
        unitId,
        position: { x: 0, y: 0 },
        amount: 5,
        unitsDied: 0,
        ...overrides,
    }) as NonNullable<IVisibleDamage["secondary"]>[number];

describe("fire damage burn targets", () => {
    test("burns whoever the Efreet's Fire Shield reflected onto, at a smaller reflect scale", () => {
        const burns = fireBurnTargets(
            damage({ secondary: [secondary("fire_shield", "attacker", { position: { x: 7, y: 9 } })] }),
            false,
            "victim",
        );

        expect(burns).toEqual([{ unitId: "attacker", position: { x: 7, y: 9 }, scale: 0.85 }]);
    });

    test("burns every unit a dragon's breath passed through, full size", () => {
        const burns = fireBurnTargets(
            damage({
                secondary: [secondary("fire_breath", "behind-1"), secondary("fire_breath", "behind-2")],
            }),
            false,
            "victim",
        );

        expect(burns.map((burn) => burn.unitId)).toEqual(["behind-1", "behind-2"]);
        expect(burns.every((burn) => burn.scale === 1)).toBe(true);
    });

    test("ignores non-fire secondary damage and entries that did nothing", () => {
        const burns = fireBurnTargets(
            damage({
                secondary: [
                    secondary("chain_lightning", "zapped"),
                    secondary("skewer_strike", "skewered"),
                    secondary("petrifying_gaze", "stoned"),
                    secondary("flesh_shield", "soaker"),
                    secondary("fire_breath", "unscathed", { amount: 0, unitsDied: 0 }),
                ],
            }),
            false,
            "victim",
        );

        expect(burns).toEqual([]);
    });

    test("still burns a fire hit that killed without registering damage", () => {
        const burns = fireBurnTargets(
            damage({ secondary: [secondary("fire_shield", "attacker", { amount: 0, unitsDied: 2 })] }),
            false,
            "victim",
        );

        expect(burns).toHaveLength(1);
    });

    test("a Fireforged Sword attacker sets its own victim alight", () => {
        const burns = fireBurnTargets(damage(), true, "clicked-target");

        expect(burns).toEqual([{ unitId: "victim", position: { x: 10, y: 20 }, scale: 1 }]);
    });

    test("without the buff the ordinary hit does not burn", () => {
        expect(fireBurnTargets(damage(), false, "clicked-target")).toEqual([]);
    });

    test("falls back to the caller's target when the engine reported no victim id", () => {
        const burns = fireBurnTargets(damage({ unitId: undefined }), true, "clicked-target");

        expect(burns.map((burn) => burn.unitId)).toEqual(["clicked-target"]);
    });

    test("a missed or damageless swing burns nobody, buff or not", () => {
        expect(fireBurnTargets(damage({ missed: true, amount: 0 }), true, "victim")).toEqual([]);
        expect(fireBurnTargets(damage({ amount: 0 }), true, "victim")).toEqual([]);
        expect(fireBurnTargets(undefined, true, "victim")).toEqual([]);
    });

    test("never burns the same unit twice in one exchange", () => {
        // A Fireforged dragon: its breath already burned the primary victim.
        const burns = fireBurnTargets(
            damage({ secondary: [secondary("fire_breath", "victim"), secondary("fire_breath", "victim")] }),
            true,
            "victim",
        );

        expect(burns).toHaveLength(1);
        expect(burns[0].unitId).toBe("victim");
    });

    test("burns the secondary victims AND the Fireforged strike victim when they differ", () => {
        const burns = fireBurnTargets(
            damage({ secondary: [secondary("fire_shield", "attacker")] }),
            true,
            "clicked-target",
        );

        expect(burns.map((burn) => burn.unitId)).toEqual(["attacker", "victim"]);
    });
});
