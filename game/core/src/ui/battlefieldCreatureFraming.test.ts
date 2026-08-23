import { afterEach, describe, expect, test } from "bun:test";

import {
    BATTLEFIELD_CREATURE_FRAMING,
    BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY,
    normalizeBattlefieldCreatureFraming,
    readStoredBattlefieldCreatureFraming,
    resolveStoredBattlefieldCreatureFraming,
    writeStoredBattlefieldCreatureFraming,
} from "./battlefieldCreatureFraming";

const values = new Map<string, string>();
const previousWindow = globalThis.window;

afterEach(() => {
    writeStoredBattlefieldCreatureFraming({});
    values.clear();
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
});

describe("battlefield creature framing drafts", () => {
    test("uses a fresh draft namespace for the approved battlefield baseline", () => {
        expect(BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY).toBe("hoc-dev-battlefield-creature-framing-v12");
    });

    test("contains the approved model adjustments", () => {
        expect(BATTLEFIELD_CREATURE_FRAMING).toMatchObject({
            Dryad: { scaleX: 1.27, scaleY: 1.37, offsetXCells: 0.18, offsetYCells: 0 },
            Leprechaun: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0, offsetYCells: 0.04 },
            "Wandering Mage": { scaleX: 1.21, scaleY: 1.21, offsetXCells: 0.03, offsetYCells: 0 },
            Centaur: { scaleX: 1.57, scaleY: 1.5, offsetXCells: 0.21, offsetYCells: 0 },
            Berserker: { scaleX: 1.37, scaleY: 1.41, offsetXCells: -0.16, offsetYCells: 0 },
            Wolf: { scaleX: 1.8, scaleY: 1.76, offsetXCells: 0.061, offsetYCells: -0.067 },
            Orc: { scaleX: 1.42, scaleY: 1.42, offsetXCells: -0.12, offsetYCells: 0 },
            Blacksmith: { scaleX: 1.38, scaleY: 1.38, offsetXCells: 0.04, offsetYCells: 0 },
            Peasant: { scaleX: 1.41, scaleY: 1.41, offsetXCells: 0.04, offsetYCells: 0 },
            Troglodyte: { scaleX: 1.29, scaleY: 1.29, offsetXCells: -0.05, offsetYCells: 0 },
            Scavenger: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0.04, offsetYCells: 0 },
            Arbalester: { scaleX: 1.37, scaleY: 1.37, offsetXCells: 0.19, offsetYCells: -0.005 },
            "Wolf Rider": { scaleX: 1.32, scaleY: 1.32, offsetXCells: 0.083, offsetYCells: -0.027 },
            Mermaid: { scaleX: 1.24, scaleY: 1.24, offsetXCells: 0.03, offsetYCells: -0.15 },
            Medusa: { scaleX: 1.34, scaleY: 1.34, offsetXCells: -0.01, offsetYCells: 0 },
            Crusader: { scaleX: 1.46, scaleY: 1.46, offsetXCells: 0.15, offsetYCells: 0 },
            Nightmare: { scaleX: 1.5, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            Cyclops: { scaleX: 1.34, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            "Arachna Queen": { scaleX: 1.8, scaleY: 1.85, offsetXCells: 0.01, offsetYCells: 0.19 },
        });
        expect(BATTLEFIELD_CREATURE_FRAMING.Squire).toEqual({
            scaleX: 1.43,
            scaleY: 1.43,
            offsetXCells: 0.04,
            offsetYCells: 0,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING.Fairy).toEqual({
            scaleX: 1.3,
            scaleY: 1.3,
            offsetXCells: -0.06,
            offsetYCells: 0,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING["White Tiger"]).toEqual({
            scaleX: 1.15,
            scaleY: 1.71,
            offsetXCells: 0.02,
            offsetYCells: 0,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING.Wyvern).toEqual({
            scaleX: 1.4,
            scaleY: 1.74,
            offsetXCells: 0.05,
            offsetYCells: 0,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING.Griffin).toEqual({
            scaleX: 1.5,
            scaleY: 1.5,
            offsetXCells: -0.1,
            offsetYCells: 0,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING).toMatchObject({
            Manticore: { scaleX: 1.31, scaleY: 1.36, offsetXCells: -0.04, offsetYCells: 0 },
            Nomad: { scaleX: 1.45, scaleY: 1.43, offsetXCells: 0.07, offsetYCells: 0 },
            Hyena: { scaleX: 0.99, scaleY: 1.4, offsetXCells: 0.11, offsetYCells: 0 },
            Mantis: { scaleX: 1.59, scaleY: 1.5, offsetXCells: 0.12, offsetYCells: 0.005 },
            Pegasus: { scaleX: 1.48, scaleY: 1.48, offsetXCells: -0.04, offsetYCells: 0 },
        });
        expect(BATTLEFIELD_CREATURE_FRAMING).toMatchObject({
            Valkyrie: { scaleX: 1.4, scaleY: 1.4, offsetXCells: 0.01, offsetYCells: 0 },
            Pikeman: { scaleX: 1.44, scaleY: 1.44, offsetXCells: 0.13, offsetYCells: 0 },
            Healer: { scaleX: 1.27, scaleY: 1.27, offsetXCells: 0.09, offsetYCells: 0 },
            "Battle Mage": { scaleX: 1.19, scaleY: 1.31, offsetXCells: -0.07, offsetYCells: 0 },
            "White Tiger": { scaleX: 1.15, scaleY: 1.71, offsetXCells: 0.02, offsetYCells: 0 },
            Elf: { scaleX: 1.26, scaleY: 1.26, offsetXCells: -0.07, offsetYCells: 0 },
            Satyr: { scaleX: 1.26, scaleY: 1.26, offsetXCells: 0.05, offsetYCells: -0.016 },
            Trent: { scaleX: 1.23, scaleY: 1.46, offsetXCells: 0.07, offsetYCells: 0 },
            Troll: { scaleX: 1.27, scaleY: 1.43, offsetXCells: 0.09, offsetYCells: 0 },
            Medusa: { scaleX: 1.34, scaleY: 1.34, offsetXCells: -0.01, offsetYCells: 0 },
            Manticore: { scaleX: 1.31, scaleY: 1.36, offsetXCells: -0.04, offsetYCells: 0 },
            Beholder: { scaleX: 1.23, scaleY: 1.23, offsetXCells: -0.02, offsetYCells: 0 },
            Nomad: { scaleX: 1.45, scaleY: 1.43, offsetXCells: 0.07, offsetYCells: 0 },
            Hyena: { scaleX: 0.99, scaleY: 1.4, offsetXCells: 0.11, offsetYCells: 0 },
            Wyvern: { scaleX: 1.4, scaleY: 1.74, offsetXCells: 0.05, offsetYCells: 0 },
        });
        expect(BATTLEFIELD_CREATURE_FRAMING.Efreet).toEqual({
            scaleX: 1.28,
            scaleY: 1.47,
            offsetXCells: -0.01,
            offsetYCells: 0.14,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING).toMatchObject({
            Griffin: { scaleX: 1.5, scaleY: 1.5, offsetXCells: -0.1, offsetYCells: 0 },
            Crusader: { scaleX: 1.46, scaleY: 1.46, offsetXCells: 0.15, offsetYCells: 0 },
            Mantis: { scaleX: 1.59, scaleY: 1.5, offsetXCells: 0.12, offsetYCells: 0.005 },
            Monk: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0.04, offsetYCells: 0 },
            Unicorn: { scaleX: 1.41, scaleY: 1.41, offsetXCells: 0.21, offsetYCells: 0 },
            Pegasus: { scaleX: 1.48, scaleY: 1.48, offsetXCells: -0.04, offsetYCells: 0 },
            "Goblin Knight": { scaleX: 1.44, scaleY: 1.44, offsetXCells: -0.16, offsetYCells: 0 },
            Efreet: { scaleX: 1.28, scaleY: 1.47, offsetXCells: -0.01, offsetYCells: 0.14 },
            Nightmare: { scaleX: 1.5, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            Cyclops: { scaleX: 1.34, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            "Ogre Mage": { scaleX: 1.52, scaleY: 1.52, offsetXCells: -0.09, offsetYCells: 0 },
        });
        expect(BATTLEFIELD_CREATURE_FRAMING.Gargantuan).toEqual({
            scaleX: 1.6,
            scaleY: 1.6,
            offsetXCells: -0.05,
            offsetYCells: -0.17,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING["Black Dragon"]).toEqual({
            scaleX: 1.55,
            scaleY: 1.55,
            offsetXCells: -0.24,
            offsetYCells: 0.08,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING["Frenzied Boar"]).toEqual({
            scaleX: 1.41,
            scaleY: 1.46,
            offsetXCells: 0.02,
            offsetYCells: -0.09,
        });
        expect(BATTLEFIELD_CREATURE_FRAMING).toMatchObject({
            Champion: { scaleX: 1.51, scaleY: 1.51, offsetXCells: 0.13, offsetYCells: -0.355 },
            "Tsar Cannon": { scaleX: 1.42, scaleY: 1.42, offsetXCells: 0.29, offsetYCells: -0.13 },
            "Arachna Queen": { scaleX: 1.8, scaleY: 1.85, offsetXCells: 0.01, offsetYCells: 0.19 },
            "Black Dragon": { scaleX: 1.55, scaleY: 1.55, offsetXCells: -0.24, offsetYCells: 0.08 },
            Abomination: { scaleX: 1.4, scaleY: 1.4, offsetXCells: 0.05, offsetYCells: -0.19 },
            Behemoth: { scaleX: 1.26, scaleY: 1.31, offsetXCells: 0.02, offsetYCells: 0.05 },
            "Frenzied Boar": { scaleX: 1.41, scaleY: 1.46, offsetXCells: 0.02, offsetYCells: -0.09 },
            Angel: { scaleX: 1.406, scaleY: 1.3205, offsetXCells: -0.04, offsetYCells: -0.23 },
            Gargantuan: { scaleX: 1.6, scaleY: 1.6, offsetXCells: -0.05, offsetYCells: -0.17 },
            "Magic Dragon": { scaleX: 1.39, scaleY: 1.39, offsetXCells: -0.15, offsetYCells: -0.22 },
            Hydra: { scaleX: 1.65, scaleY: 1.65, offsetXCells: -0.01, offsetYCells: -0.13 },
            Thunderbird: { scaleX: 1.4, scaleY: 1.4, offsetXCells: -0.44, offsetYCells: -0.13 },
        });
    });

    test("normalizes unsafe editor input", () => {
        expect(normalizeBattlefieldCreatureFraming({ scaleX: 9, scaleY: -1, offsetXCells: 7 })).toEqual({
            scaleX: 3,
            scaleY: 0.25,
            offsetXCells: 2,
            offsetYCells: 0,
        });
    });

    test("reduces Angel's reviewed bottom-row figure by exactly five percent", () => {
        expect(BATTLEFIELD_CREATURE_FRAMING.Angel.scaleX).toBeCloseTo(1.48 * 0.95, 8);
        expect(BATTLEFIELD_CREATURE_FRAMING.Angel.scaleY).toBeCloseTo(1.39 * 0.95, 8);
    });

    test("uses the approved L2 and L3 maximum sizes when the new draft storage is empty", () => {
        writeStoredBattlefieldCreatureFraming({});

        expect(resolveStoredBattlefieldCreatureFraming("Troll")).toEqual(BATTLEFIELD_CREATURE_FRAMING.Troll);
        expect(resolveStoredBattlefieldCreatureFraming("Efreet")).toEqual(BATTLEFIELD_CREATURE_FRAMING.Efreet);
    });

    test("stores independent scale and position for each creature", () => {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: {
                localStorage: {
                    getItem: (key: string) => values.get(key) ?? null,
                    setItem: (key: string, value: string) => values.set(key, value),
                },
            },
        });

        writeStoredBattlefieldCreatureFraming({
            Orc: { scaleX: 1.2, scaleY: 0.9, offsetXCells: 0.1, offsetYCells: -0.2 },
        });

        expect(values.has(BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY)).toBe(true);
        expect(readStoredBattlefieldCreatureFraming().Orc).toEqual({
            scaleX: 1.2,
            scaleY: 0.9,
            offsetXCells: 0.1,
            offsetYCells: -0.2,
        });
    });
});
