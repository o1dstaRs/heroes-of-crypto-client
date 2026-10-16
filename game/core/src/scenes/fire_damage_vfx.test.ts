import { describe, expect, test } from "bun:test";

import type { IVisibleDamage } from "@heroesofcrypto/common";

import { fireBurnTargets, secondaryDamageTextStyle } from "./Sandbox";

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
        );

        expect(burns).toEqual([{ unitId: "attacker", position: { x: 7, y: 9 }, scale: 0.85, source: "fire_shield" }]);
    });

    test("burns every unit a dragon's breath passed through, full size", () => {
        const burns = fireBurnTargets(
            damage({
                secondary: [secondary("fire_breath", "behind-1"), secondary("fire_breath", "behind-2")],
            }),
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
        );

        expect(burns).toEqual([]);
    });

    test("still burns a fire hit that killed without registering damage", () => {
        const burns = fireBurnTargets(
            damage({ secondary: [secondary("fire_shield", "attacker", { amount: 0, unitsDied: 2 })] }),
        );

        expect(burns).toHaveLength(1);
    });

    // The blade is read from the ENGINE's own entry now, not inferred from the attacker's buff plus the
    // primary hit. That inference drew fire on victims the blade never burned (a Fire Element shrugs it
    // off entirely) and drew none on the other units a sweep or a volley set alight.
    test("burns whoever the engine says the Fireforged blade set alight, and marks it as the sword", () => {
        const burns = fireBurnTargets(
            damage({ secondary: [secondary("fireforged_sword", "victim", { position: { x: 3, y: 4 } })] }),
        );

        expect(burns).toEqual([{ unitId: "victim", position: { x: 3, y: 4 }, scale: 1, source: "fireforged_sword" }]);
    });

    test("burns every unit one sweeping Fireforged attack set alight, not only the aimed one", () => {
        const burns = fireBurnTargets(
            damage({
                secondary: [
                    secondary("fireforged_sword", "aimed"),
                    secondary("fireforged_sword", "swept-1"),
                    secondary("fireforged_sword", "swept-2"),
                ],
            }),
        );

        expect(burns.map((burn) => burn.unitId)).toEqual(["aimed", "swept-1", "swept-2"]);
        expect(burns.every((burn) => burn.source === "fireforged_sword")).toBe(true);
    });

    test("an ordinary hit with no fire entry burns nobody", () => {
        expect(fireBurnTargets(damage())).toEqual([]);
        expect(fireBurnTargets(damage({ missed: true, amount: 0 }))).toEqual([]);
        expect(fireBurnTargets(undefined)).toEqual([]);
    });

    test("never burns the same unit twice in one exchange", () => {
        const burns = fireBurnTargets(
            damage({ secondary: [secondary("fire_breath", "victim"), secondary("fireforged_sword", "victim")] }),
        );

        expect(burns).toHaveLength(1);
        expect(burns[0].unitId).toBe("victim");
    });

    test("burns a shield reflect and a blade victim together when they differ", () => {
        const burns = fireBurnTargets(
            damage({
                secondary: [secondary("fire_shield", "attacker"), secondary("fireforged_sword", "victim")],
            }),
        );

        expect(burns.map((burn) => burn.unitId)).toEqual(["attacker", "victim"]);
        expect(burns.map((burn) => burn.source)).toEqual(["fire_shield", "fireforged_sword"]);
    });
});

describe("fire damage text style", () => {
    test("uses the same orange number for Fire Shield and Fire Breath", () => {
        const orange = { fill: "#ffb13c", stroke: "#7a3800" };

        expect(secondaryDamageTextStyle("fire_shield")).toEqual(orange);
        expect(secondaryDamageTextStyle("fire_breath")).toEqual(orange);
    });

    // The blade's fire is orange too — it used to have no case at all and fell through to the plain red
    // of an ordinary hit, so the burn never read as fire (owner report 2026-09-20).
    test("gives the Fireforged blade its own hotter orange, never the plain red of a normal hit", () => {
        const style = secondaryDamageTextStyle("fireforged_sword");

        expect(style).toEqual({ fill: "#ff8a2b", stroke: "#6b2400" });
        expect(style).not.toEqual(secondaryDamageTextStyle("magic_mirror"));
    });

    test("does not turn ordinary secondary damage orange", () => {
        expect(secondaryDamageTextStyle("magic_mirror")).toEqual({ fill: "#ff3333", stroke: "#4a0000" });
    });
});
