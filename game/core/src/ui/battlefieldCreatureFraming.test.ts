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
        expect(BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY).toBe("hoc-dev-battlefield-creature-framing-v31");
    });

    test("keeps the manually approved 1x1 flag positions exactly", () => {
        const approvedFlagOffsets: Record<string, readonly [number, number]> = {
            Crusader: [0.01, 0.04],
            Monk: [0.03, -0.03],
            "Goblin Knight": [0.17, 0.03],
            Efreet: [0.06, 0],
            Cyclops: [0.08, 0],
            "Ogre Mage": [0.14, 0.26],
            Zena: [0.04, 0.08],
            "Battle Mage": [0.12, -0.09],
            Elf: [0.01, 0],
            Satyr: [-0.1, -0.01],
            Trent: [0, 0.07],
            Troll: [0, 0.06],
            Mermaid: [0.02, -0.04],
            Berserker: [0.25, -0.05],
            "Wandering Mage": [0.03, -0.06],
            Troglodyte: [0.09, -0.07],
            Scavenger: [0, -0.05],
            Peasant: [-0.01, -0.03],
            Blacksmith: [-0.05, 0],
            Medusa: [0.03, 0],
            Beholder: [0.03, 0],
            Harpy: [0.16, 0.02],
            Healer: [-0.05, -0.09],
            Pikeman: [-0.22, 0.2],
            Orc: [0.18, 0.05],
            Dryad: [-0.21, 0.19],
        };

        for (const [name, [flagOffsetXCells, flagOffsetYCells]] of Object.entries(approvedFlagOffsets)) {
            expect(BATTLEFIELD_CREATURE_FRAMING[name]).toMatchObject({ flagOffsetXCells, flagOffsetYCells });
        }
    });

    test("keeps the manually approved 2x1 flag positions exactly", () => {
        const approvedFlagOffsets: Record<string, readonly [number, number]> = {
            Mantis: [-0.03, 0.47],
            Unicorn: [-0.11, 0.48],
            Pegasus: [0.03, 0.49],
            Nightmare: [0, 0.79],
            Nomad: [-0.04, 0.13],
            Hyena: [0, 0.65],
            Wyvern: [0, 1.15],
            Wolf: [0, 0.57],
            Centaur: [0.16, 0.03],
            "Wolf Rider": [-0.11, 0.33],
            "White Tiger": [0, 1.1],
            Manticore: [0, 1.04],
        };

        for (const [name, [flagOffsetXCells, flagOffsetYCells]] of Object.entries(approvedFlagOffsets)) {
            expect(BATTLEFIELD_CREATURE_FRAMING[name]).toMatchObject({ flagOffsetXCells, flagOffsetYCells });
        }
    });

    test("keeps the final large-creature flag positions exactly", () => {
        const approvedFlagOffsets: Record<string, readonly [number, number]> = {
            Abomination: [0.11, 0.02],
            Thunderbird: [0.17, 0.71],
            "Arachna Queen": [0.15, 1.04],
            "Magic Dragon": [0, 0.59],
            "Black Dragon": [0, 1.61],
            Hydra: [0.28, 0.61],
            "Tsar Cannon": [0, 1.08],
            Angel: [0.12, 0.07],
            Champion: [-0.08, 0.39],
            Gargantuan: [0.1, 0.1],
        };

        for (const [name, [flagOffsetXCells, flagOffsetYCells]] of Object.entries(approvedFlagOffsets)) {
            expect(BATTLEFIELD_CREATURE_FRAMING[name]).toMatchObject({ flagOffsetXCells, flagOffsetYCells });
        }
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
            "Wandering Mage": { scaleX: 1.134, scaleY: 1.134, offsetXCells: 0.026, offsetYCells: -0.017 },
            Centaur: { scaleX: 1.453, scaleY: 1.388, offsetXCells: 0.214, offsetYCells: -0.014 },
            Berserker: { scaleX: 1.237, scaleY: 1.273, offsetXCells: -0.147, offsetYCells: -0.072 },
            Wolf: { scaleX: 1.8, scaleY: 1.76, offsetXCells: 0.061, offsetYCells: -0.067 },
            Orc: { scaleX: 1.42, scaleY: 1.42, offsetXCells: -0.12, offsetYCells: 0 },
            Blacksmith: { scaleX: 1.38, scaleY: 1.38, offsetXCells: 0.04, offsetYCells: 0 },
            Peasant: { scaleX: 1.41, scaleY: 1.41, offsetXCells: 0.04, offsetYCells: 0 },
            Troglodyte: { scaleX: 1.188, scaleY: 1.188, offsetXCells: -0.032, offsetYCells: -0.049 },
            Scavenger: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0.04, offsetYCells: 0 },
            Arbalester: { scaleX: 1.37, scaleY: 1.37, offsetXCells: 0.19, offsetYCells: -0.005 },
            "Wolf Rider": { scaleX: 1.51, scaleY: 1.51, offsetXCells: 0.065, offsetYCells: 0.226 },
            Mermaid: { scaleX: 1.169, scaleY: 1.169, offsetXCells: -0.036, offsetYCells: -0.17 },
            Medusa: { scaleX: 1.34, scaleY: 1.34, offsetXCells: -0.01, offsetYCells: 0 },
            Crusader: { scaleX: 1.46, scaleY: 1.46, offsetXCells: 0.15, offsetYCells: 0 },
            Nightmare: { scaleX: 1.5, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            Cyclops: { scaleX: 1.34, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
            "Arachna Queen": {
                scaleX: 1.747573,
                scaleY: 1.728753,
                offsetXCells: -0.005595,
                offsetYCells: 0.334795,
            },
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
            Valkyrie: { scaleX: 1.319, scaleY: 1.319, offsetXCells: 0.01, offsetYCells: -0.009 },
            Pikeman: { scaleX: 1.375, scaleY: 1.375, offsetXCells: 0.13, offsetYCells: -0.009 },
            Healer: { scaleX: 1.222, scaleY: 1.222, offsetXCells: 0.092, offsetYCells: -0.007 },
            "Battle Mage": { scaleX: 1.132, scaleY: 1.247, offsetXCells: -0.07, offsetYCells: -0.008 },
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
            scaleX: 1.597711,
            scaleY: 1.597711,
            offsetXCells: 0.047358,
            offsetYCells: -0.087559,
        });
        expect(approvedModels["Black Dragon"]).toEqual({
            scaleX: 1.456876,
            scaleY: 1.814854,
            offsetXCells: -0.223098,
            offsetYCells: 0.207495,
        });
        expect(approvedModels["Frenzied Boar"]).toEqual({
            scaleX: 1.41,
            scaleY: 1.46,
            offsetXCells: 0.02,
            offsetYCells: -0.09,
        });
        expect(approvedModels).toMatchObject({
            Champion: { scaleX: 1.556427, scaleY: 1.529547, offsetXCells: 0.16812, offsetYCells: -0.203477 },
            "Tsar Cannon": { scaleX: 1.395692, scaleY: 1.386977, offsetXCells: 0.279237, offsetYCells: -0.024429 },
            "Arachna Queen": {
                scaleX: 1.747573,
                scaleY: 1.728753,
                offsetXCells: -0.005595,
                offsetYCells: 0.334795,
            },
            "Black Dragon": {
                scaleX: 1.456876,
                scaleY: 1.814854,
                offsetXCells: -0.223098,
                offsetYCells: 0.207495,
            },
            Abomination: {
                scaleX: 1.506291,
                scaleY: 1.5,
                offsetXCells: 0,
                offsetYCells: -0.22,
            },
            Behemoth: { scaleX: 1.26, scaleY: 1.31, offsetXCells: 0.02, offsetYCells: 0.05 },
            "Frenzied Boar": { scaleX: 1.41, scaleY: 1.46, offsetXCells: 0.02, offsetYCells: -0.09 },
            Angel: { scaleX: 1.382808, scaleY: 1.292797, offsetXCells: -0.064985, offsetYCells: -0.187766 },
            Gargantuan: {
                scaleX: 1.597711,
                scaleY: 1.597711,
                offsetXCells: 0.047358,
                offsetYCells: -0.087559,
            },
            "Magic Dragon": {
                scaleX: 1.266444,
                scaleY: 1.266444,
                offsetXCells: -0.135307,
                offsetYCells: -0.1414,
            },
            Hydra: {
                scaleX: 1.525514,
                scaleY: 1.64724,
                offsetXCells: -0.027698,
                offsetYCells: -0.036486,
            },
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

    test("compensates the three restyled alpha bounds without changing their reviewed visible size", () => {
        const cases = [
            ["Angel", [145, 42, 622, 742], [148, 22, 633, 737], [1.406, 1.3205, -0.04, -0.23]],
            ["Champion", [32, 116, 736, 742], [33, 81, 716, 699], [1.51, 1.51, 0.13, -0.355]],
            ["Tsar Cannon", [40, 280, 729, 742], [37, 248, 738, 721], [1.42, 1.42, 0.29, -0.13]],
        ] as const;
        const renderedCanvasCellsPerPixel = 1.98 / 768;

        for (const [name, oldBounds, newBounds, oldFraming] of cases) {
            const framing = BATTLEFIELD_CREATURE_FRAMING[name];
            const oldWidth = oldBounds[2] - oldBounds[0];
            const oldHeight = oldBounds[3] - oldBounds[1];
            const newWidth = newBounds[2] - newBounds[0];
            const newHeight = newBounds[3] - newBounds[1];
            expect(newWidth * framing.scaleX).toBeCloseTo(oldWidth * oldFraming[0], 3);
            expect(newHeight * framing.scaleY).toBeCloseTo(oldHeight * oldFraming[1], 3);

            const oldCenterX = (oldBounds[0] + oldBounds[2]) * 0.5;
            const newCenterX = (newBounds[0] + newBounds[2]) * 0.5;
            const oldVisualCenterCells =
                oldFraming[2] + renderedCanvasCellsPerPixel * (oldCenterX - 384) * oldFraming[0];
            const newVisualCenterCells =
                framing.offsetXCells + renderedCanvasCellsPerPixel * (newCenterX - 384) * framing.scaleX;
            expect(newVisualCenterCells).toBeCloseTo(oldVisualCenterCells, 5);

            const oldFootLineCells = oldFraming[3] + renderedCanvasCellsPerPixel * (oldBounds[3] - 384) * oldFraming[1];
            const newFootLineCells =
                framing.offsetYCells + renderedCanvasCellsPerPixel * (newBounds[3] - 384) * framing.scaleY;
            expect(newFootLineCells).toBeCloseTo(oldFootLineCells, 5);
        }
    });

    test("preserves the screenshot creatures' support line and visual center after the readable redraws", () => {
        const cases = [
            [
                "Arachna Queen",
                { width: 720, height: 460, centerX: 388.5, bottom: 703 },
                { width: 721, height: 473, centerX: 388, bottom: 703 },
                { scaleX: 1.75, scaleY: 1.777609, offsetX: -0.007344, offsetY: 0.337402, heightCells: 1.518 },
            ],
            [
                "Gargantuan",
                { width: 396, height: 698, centerX: 383.5, bottom: 741 },
                { width: 390, height: 699, centerX: 357.5, bottom: 719 },
                { scaleX: 1.6, scaleY: 1.6, offsetX: -0.05, offsetY: -0.17, heightCells: 1.8 },
            ],
            [
                "Magic Dragon",
                { width: 699, height: 574, centerX: 384, bottom: 741 },
                { width: 756, height: 630, centerX: 379.5, bottom: 718 },
                { scaleX: 1.39, scaleY: 1.39, offsetX: -0.15, offsetY: -0.22, heightCells: 1.98 },
            ],
        ] as const;
        const canvasCenterX = 384;
        const authoredFootAnchorY = 730;

        for (const [name, oldBounds, newBounds, oldFraming] of cases) {
            const framing = BATTLEFIELD_CREATURE_FRAMING[name];
            const renderedCanvasCellsPerPixel = oldFraming.heightCells / 768;
            expect(newBounds.height * framing.scaleY).toBeCloseTo(oldBounds.height * oldFraming.scaleY, 3);
            if (name === "Arachna Queen") {
                expect(newBounds.width * framing.scaleX).toBeCloseTo(oldBounds.width * oldFraming.scaleX, 3);
            } else {
                expect(
                    Math.abs((newBounds.width * framing.scaleX) / (oldBounds.width * oldFraming.scaleX) - 1),
                ).toBeLessThan(0.02);
            }

            const oldVisualCenterCells =
                oldFraming.offsetX +
                renderedCanvasCellsPerPixel * (oldBounds.centerX - canvasCenterX) * oldFraming.scaleX;
            const newVisualCenterCells =
                framing.offsetXCells +
                renderedCanvasCellsPerPixel * (newBounds.centerX - canvasCenterX) * framing.scaleX;
            expect(newVisualCenterCells).toBeCloseTo(oldVisualCenterCells, 5);

            const oldFootLineCells =
                oldFraming.offsetY +
                renderedCanvasCellsPerPixel * (oldBounds.bottom - authoredFootAnchorY) * oldFraming.scaleY;
            const newFootLineCells =
                framing.offsetYCells +
                renderedCanvasCellsPerPixel * (newBounds.bottom - authoredFootAnchorY) * framing.scaleY;
            expect(newFootLineCells).toBeCloseTo(oldFootLineCells, 5);
        }

        expect(BATTLEFIELD_CREATURE_FRAMING.Gargantuan.flagOffsetYCells).toBe(0.1);
        expect(BATTLEFIELD_CREATURE_FRAMING["Magic Dragon"].flagOffsetYCells).toBe(0.59);
        expect(BATTLEFIELD_CREATURE_FRAMING["Arachna Queen"].flagOffsetYCells).toBe(1.04);
    });

    test("preserves the restyled dragons' size, center, and support line", () => {
        const cases = [
            [
                "Black Dragon",
                { left: 32, top: 139, right: 736, bottom: 742 },
                { left: 5, top: 198, right: 754, bottom: 713 },
                { scaleX: 1.55, scaleY: 1.55, offsetX: -0.24, offsetY: 0.08 },
            ],
            [
                "Hydra",
                { left: 47, top: 145, right: 721, bottom: 742 },
                { left: 24, top: 122, right: 753, bottom: 720 },
                { scaleX: 1.65, scaleY: 1.65, offsetX: -0.01, offsetY: -0.13 },
            ],
        ] as const;
        const renderedCanvasCellsPerPixel = 1.98 / 768;
        const canvasCenterX = 384;
        const authoredFootAnchorY = 730;

        for (const [name, oldBounds, newBounds, oldFraming] of cases) {
            const framing = BATTLEFIELD_CREATURE_FRAMING[name];
            const oldWidth = oldBounds.right - oldBounds.left;
            const oldHeight = oldBounds.bottom - oldBounds.top;
            const newWidth = newBounds.right - newBounds.left;
            const newHeight = newBounds.bottom - newBounds.top;
            expect(newWidth * framing.scaleX).toBeCloseTo(oldWidth * oldFraming.scaleX, 3);
            expect(newHeight * framing.scaleY).toBeCloseTo(oldHeight * oldFraming.scaleY, 3);

            const oldCenterX = (oldBounds.left + oldBounds.right) * 0.5;
            const newCenterX = (newBounds.left + newBounds.right) * 0.5;
            const oldVisualCenterCells =
                oldFraming.offsetX + renderedCanvasCellsPerPixel * (oldCenterX - canvasCenterX) * oldFraming.scaleX;
            const newVisualCenterCells =
                framing.offsetXCells + renderedCanvasCellsPerPixel * (newCenterX - canvasCenterX) * framing.scaleX;
            expect(newVisualCenterCells).toBeCloseTo(oldVisualCenterCells, 5);

            const oldSupportLineCells =
                oldFraming.offsetY +
                renderedCanvasCellsPerPixel * (oldBounds.bottom - authoredFootAnchorY) * oldFraming.scaleY;
            const newSupportLineCells =
                framing.offsetYCells +
                renderedCanvasCellsPerPixel * (newBounds.bottom - authoredFootAnchorY) * framing.scaleY;
            expect(newSupportLineCells).toBeCloseTo(oldSupportLineCells, 5);
        }
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
