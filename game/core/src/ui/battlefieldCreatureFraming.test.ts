import { afterEach, describe, expect, test } from "bun:test";

import {
    AUTHORED_ART_TWO_CELL_WIDTH,
    BATTLEFIELD_CREATURE_FRAMING,
    BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY,
    formatFootprintShape,
    normalizeBattlefieldCreatureFraming,
    parseFootprintOverrides,
    parseFootprintShape,
    readStoredBattlefieldCreatureFraming,
    resolveFootprintMode,
    resolveStoredBattlefieldCreatureFraming,
    writeStoredBattlefieldCreatureFraming,
    type FootprintModeCandidate,
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
        expect(BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY).toBe("hoc-dev-battlefield-creature-framing-v13");
    });

    test("contains the approved model adjustments", () => {
        const approvedModels = Object.fromEntries(
            Object.entries(BATTLEFIELD_CREATURE_FRAMING).map(([name, framing]) => [
                name,
                {
                    scaleX: framing.scaleX,
                    scaleY: framing.scaleY,
                    offsetXCells: framing.offsetXCells,
                    offsetYCells: framing.offsetYCells,
                },
            ]),
        );
        expect(approvedModels).toMatchObject({
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
            "Arachna Queen": { scaleX: 1.8, scaleY: 1.85, offsetXCells: 0.01, offsetYCells: 0.195 },
        });
        expect(approvedModels.Squire).toEqual({
            scaleX: 1.43,
            scaleY: 1.43,
            offsetXCells: 0.04,
            offsetYCells: 0,
        });
        expect(approvedModels.Fairy).toEqual({
            scaleX: 1.3,
            scaleY: 1.3,
            offsetXCells: -0.06,
            offsetYCells: 0,
        });
        expect(approvedModels["White Tiger"]).toEqual({
            scaleX: 1.15,
            scaleY: 1.71,
            offsetXCells: 0.02,
            offsetYCells: 0,
        });
        expect(approvedModels.Wyvern).toEqual({
            scaleX: 1.4,
            scaleY: 1.74,
            offsetXCells: 0.05,
            offsetYCells: 0,
        });
        expect(approvedModels.Griffin).toEqual({
            scaleX: 1.5,
            scaleY: 1.5,
            offsetXCells: -0.1,
            offsetYCells: 0,
        });
        expect(approvedModels).toMatchObject({
            Manticore: { scaleX: 1.31, scaleY: 1.36, offsetXCells: -0.04, offsetYCells: 0 },
            Nomad: { scaleX: 1.45, scaleY: 1.43, offsetXCells: 0.07, offsetYCells: 0 },
            Hyena: { scaleX: 0.99, scaleY: 1.4, offsetXCells: 0.11, offsetYCells: 0 },
            Mantis: { scaleX: 1.59, scaleY: 1.5, offsetXCells: 0.12, offsetYCells: 0.005 },
            Pegasus: { scaleX: 1.48, scaleY: 1.48, offsetXCells: -0.04, offsetYCells: 0 },
        });
        expect(approvedModels).toMatchObject({
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
        expect(approvedModels.Efreet).toEqual({
            scaleX: 1.28,
            scaleY: 1.47,
            offsetXCells: -0.01,
            offsetYCells: 0.14,
        });
        expect(approvedModels).toMatchObject({
            Griffin: { scaleX: 1.5, scaleY: 1.5, offsetXCells: -0.1, offsetYCells: 0 },
            Crusader: { scaleX: 1.46, scaleY: 1.46, offsetXCells: 0.15, offsetYCells: 0 },
            Mantis: { scaleX: 1.59, scaleY: 1.5, offsetXCells: 0.12, offsetYCells: 0.005 },
            Monk: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0.04, offsetYCells: 0 },
            Unicorn: { scaleX: 1.41, scaleY: 1.41, offsetXCells: 0.21, offsetYCells: 0 },
            Pegasus: { scaleX: 1.48, scaleY: 1.48, offsetXCells: -0.04, offsetYCells: 0 },
            "Goblin Knight": { scaleX: 1.44, scaleY: 1.44, offsetXCells: -0.149, offsetYCells: 0 },
            Efreet: { scaleX: 1.28, scaleY: 1.47, offsetXCells: -0.01, offsetYCells: 0.14 },
            Nightmare: { scaleX: 1.5, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            Cyclops: { scaleX: 1.34, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            "Ogre Mage": { scaleX: 1.52, scaleY: 1.52, offsetXCells: -0.09, offsetYCells: 0 },
        });
        expect(approvedModels.Gargantuan).toEqual({
            scaleX: 1.6,
            scaleY: 1.6,
            offsetXCells: -0.05,
            offsetYCells: -0.17,
        });
        expect(approvedModels["Black Dragon"]).toEqual({
            scaleX: 1.55,
            scaleY: 1.55,
            offsetXCells: -0.24,
            offsetYCells: 0.08,
        });
        expect(approvedModels["Frenzied Boar"]).toEqual({
            scaleX: 1.41,
            scaleY: 1.46,
            offsetXCells: 0.02,
            offsetYCells: -0.09,
        });
        expect(approvedModels).toMatchObject({
            Champion: { scaleX: 1.51, scaleY: 1.51, offsetXCells: 0.13, offsetYCells: -0.355 },
            "Tsar Cannon": { scaleX: 1.42, scaleY: 1.42, offsetXCells: 0.29, offsetYCells: -0.13 },
            "Arachna Queen": { scaleX: 1.8, scaleY: 1.85, offsetXCells: 0.01, offsetYCells: 0.195 },
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
            flagOffsetXCells: 0,
            flagOffsetYCells: 0,
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
            flagOffsetXCells: 0,
            flagOffsetYCells: 0,
        });
    });
});

describe("rectangular footprint editor mode", () => {
    // Two creatures whose art is already drawn two cells across (White Tiger reads 1.18 x 1.695 ~ 2.0
    // cells), one that is not, and one that already declares the shape in its own data.
    const wideArt: FootprintModeCandidate = {
        name: "White Tiger",
        footprintWidth: 1,
        footprintHeight: 1,
        authoredArtWidthCells: 2.0,
    };
    const alsoWideArt: FootprintModeCandidate = {
        name: "Hyena",
        footprintWidth: 1,
        footprintHeight: 1,
        authoredArtWidthCells: 2.02,
    };
    const squareArt: FootprintModeCandidate = {
        name: "Squire",
        footprintWidth: 1,
        footprintHeight: 1,
        authoredArtWidthCells: 1.5,
    };
    const catalog = [wideArt, alsoWideArt, squareArt];

    test("reads and writes shapes in the format the engine parses", () => {
        expect(parseFootprintShape("2x1")).toEqual({ width: 2, height: 1 });
        expect(parseFootprintShape(" 1x2 ")).toEqual({ width: 1, height: 2 });
        expect(parseFootprintShape("2x0")).toBeUndefined();
        expect(parseFootprintShape("wide")).toBeUndefined();
        expect(parseFootprintShape(null)).toBeUndefined();
        expect(formatFootprintShape({ width: 2, height: 1 })).toBe("2x1");
        expect([...parseFootprintOverrides("White Tiger=2x1,Hyena=1x2")]).toEqual([
            ["White Tiger", { width: 2, height: 1 }],
            ["Hyena", { width: 1, height: 2 }],
        ]);
        expect([...parseFootprintOverrides(undefined)]).toEqual([]);
    });

    test("lends 2x1 to the creatures already drawn two cells wide, since no creature declares it", () => {
        const mode = resolveFootprintMode({ width: 2, height: 1 }, catalog);
        expect(mode.names).toEqual(["White Tiger", "Hyena"]);
        expect(mode.seededNames).toEqual(["White Tiger", "Hyena"]);
        expect(mode.overrideSource).toBe("White Tiger=2x1,Hyena=2x1");
        expect(AUTHORED_ART_TWO_CELL_WIDTH).toBe(1.8);
    });

    test("takes a creature that declares the shape as it is and lends nothing", () => {
        const declared = { ...wideArt, name: "Declared", footprintWidth: 2, footprintHeight: 1 };
        const mode = resolveFootprintMode({ width: 2, height: 1 }, [...catalog, declared]);
        expect(mode.names).toEqual(["Declared"]);
        expect(mode.seededNames).toEqual([]);
        expect(mode.overrideSource).toBe("");
    });

    test("honours a shape a developer set by hand and keeps it installed", () => {
        const mode = resolveFootprintMode({ width: 1, height: 2 }, catalog, "Hyena=1x2");
        expect(mode.names).toEqual(["Hyena"]);
        expect(mode.seededNames).toEqual([]);
        expect(mode.overrideSource).toBe("");

        // A hand-set override for another shape is carried through when this mode also has to lend one,
        // so switching into 2x1 never silently drops what the console had already put in place.
        const mixed = resolveFootprintMode({ width: 2, height: 1 }, catalog, "Squire=1x2");
        expect(mixed.overrideSource).toBe("Squire=1x2,White Tiger=2x1,Hyena=2x1");
    });

    test("refuses to fake a taller-than-wide shape out of merely wide art", () => {
        const mode = resolveFootprintMode({ width: 1, height: 2 }, catalog);
        expect(mode.names).toEqual([]);
        expect(mode.overrideSource).toBe("");
    });
});
