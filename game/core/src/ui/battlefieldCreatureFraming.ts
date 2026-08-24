export interface BattlefieldCreatureFraming {
    scaleX: number;
    scaleY: number;
    /** Positive values move the authored facing right; the correction mirrors with the creature. */
    offsetXCells: number;
    /** Positive values move the creature down, in cell units. */
    offsetYCells: number;
    /** Positive values move the battlefield count flag right, in cell units. */
    flagOffsetXCells?: number;
    /** Positive values move the battlefield count flag down, in cell units. */
    flagOffsetYCells?: number;
}

export interface BattlefieldCreatureVisualBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    cellWidth: number;
    cellHeight: number;
    updatedAt: number;
}

// Bump this only when a reviewed editor export becomes the new approved baseline. Drafts from an
// older baseline must not keep overriding those reviewed values (the old L2/L3 drafts did exactly
// that, while newly-added Cyclops correctly fell back to the approved table).
export const BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY = "hoc-dev-battlefield-creature-framing-v12";
export const BATTLEFIELD_CREATURE_FRAMING_CHANGE_EVENT = "hoc:battlefield-creature-framing-change";

export interface BattlefieldCreatureFramingChangeDetail {
    unitName?: string;
}
export const DEFAULT_BATTLEFIELD_CREATURE_FRAMING: BattlefieldCreatureFraming = Object.freeze({
    scaleX: 1,
    scaleY: 1,
    offsetXCells: 0,
    offsetYCells: 0,
    flagOffsetXCells: 0,
    flagOffsetYCells: 0,
});

/**
 * Approved maximum battlefield adjustments exported from the visual editor.
 * They are authored against the lowest painted cell row (logical y = 0). Runtime rendering linearly
 * attenuates both scale and cell-relative offsets to 85% on the highest legal row; the projected foot
 * reference preserves the same proportional edge and lower-seam inset on every painted cell.
 */
export const BATTLEFIELD_CREATURE_FRAMING: Readonly<Record<string, BattlefieldCreatureFraming>> = Object.freeze({
    Dryad: { scaleX: 1.27, scaleY: 1.37, offsetXCells: 0.18, offsetYCells: 0 },
    Leprechaun: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0, offsetYCells: 0.04 },
    "Wandering Mage": { scaleX: 1.21, scaleY: 1.21, offsetXCells: 0.03, offsetYCells: 0 },
    Centaur: { scaleX: 1.57, scaleY: 1.5, offsetXCells: 0.21, offsetYCells: 0 },
    Berserker: { scaleX: 1.37, scaleY: 1.41, offsetXCells: -0.16, offsetYCells: 0 },
    Wolf: { scaleX: 1.8, scaleY: 1.76, offsetXCells: 0.061, offsetYCells: -0.067 },
    Fairy: { scaleX: 1.3, scaleY: 1.3, offsetXCells: -0.06, offsetYCells: 0 },
    Orc: { scaleX: 1.42, scaleY: 1.42, offsetXCells: -0.12, offsetYCells: 0 },
    Blacksmith: { scaleX: 1.38, scaleY: 1.38, offsetXCells: 0.04, offsetYCells: 0 },
    Peasant: { scaleX: 1.41, scaleY: 1.41, offsetXCells: 0.04, offsetYCells: 0 },
    Squire: { scaleX: 1.43, scaleY: 1.43, offsetXCells: 0.04, offsetYCells: 0 },
    Troglodyte: { scaleX: 1.29, scaleY: 1.29, offsetXCells: -0.05, offsetYCells: 0 },
    Scavenger: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0.04, offsetYCells: 0 },
    Arbalester: { scaleX: 1.37, scaleY: 1.37, offsetXCells: 0.19, offsetYCells: -0.005 },
    "Wolf Rider": { scaleX: 1.32, scaleY: 1.32, offsetXCells: 0.083, offsetYCells: -0.027 },
    Mermaid: { scaleX: 1.24, scaleY: 1.24, offsetXCells: 0.03, offsetYCells: -0.15 },
    Valkyrie: { scaleX: 1.4, scaleY: 1.4, offsetXCells: 0.01, offsetYCells: 0 },
    Pikeman: { scaleX: 1.44, scaleY: 1.44, offsetXCells: 0.13, offsetYCells: 0 },
    Healer: { scaleX: 1.27, scaleY: 1.27, offsetXCells: 0.09, offsetYCells: 0 },
    "Battle Mage": { scaleX: 1.19, scaleY: 1.31, offsetXCells: -0.07, offsetYCells: 0 },
    Elf: { scaleX: 1.26, scaleY: 1.26, offsetXCells: -0.07, offsetYCells: 0 },
    "White Tiger": { scaleX: 1.15, scaleY: 1.71, offsetXCells: 0.02, offsetYCells: 0 },
    Satyr: { scaleX: 1.26, scaleY: 1.26, offsetXCells: 0.05, offsetYCells: -0.016 },
    Trent: { scaleX: 1.23, scaleY: 1.46, offsetXCells: 0.07, offsetYCells: 0 },
    Troll: { scaleX: 1.27, scaleY: 1.43, offsetXCells: 0.09, offsetYCells: 0 },
    Medusa: { scaleX: 1.34, scaleY: 1.34, offsetXCells: -0.01, offsetYCells: 0 },
    Beholder: { scaleX: 1.23, scaleY: 1.23, offsetXCells: -0.02, offsetYCells: 0 },
    Manticore: { scaleX: 1.31, scaleY: 1.36, offsetXCells: -0.04, offsetYCells: 0 },
    Harpy: { scaleX: 1.25, scaleY: 1.25, offsetXCells: 0, offsetYCells: 0 },
    Nomad: { scaleX: 1.45, scaleY: 1.43, offsetXCells: 0.07, offsetYCells: 0 },
    Hyena: { scaleX: 0.99, scaleY: 1.4, offsetXCells: 0.11, offsetYCells: 0 },
    Wyvern: { scaleX: 1.4, scaleY: 1.74, offsetXCells: 0.05, offsetYCells: 0 },
    Griffin: { scaleX: 1.5, scaleY: 1.5, offsetXCells: -0.1, offsetYCells: 0 },
    Crusader: { scaleX: 1.46, scaleY: 1.46, offsetXCells: 0.15, offsetYCells: 0 },
    Monk: { scaleX: 1.3, scaleY: 1.3, offsetXCells: 0.04, offsetYCells: 0 },
    Mantis: { scaleX: 1.59, scaleY: 1.5, offsetXCells: 0.12, offsetYCells: 0.005 },
    Unicorn: { scaleX: 1.41, scaleY: 1.41, offsetXCells: 0.21, offsetYCells: 0 },
    Pegasus: { scaleX: 1.48, scaleY: 1.48, offsetXCells: -0.04, offsetYCells: 0 },
    "Goblin Knight": { scaleX: 1.44, scaleY: 1.44, offsetXCells: -0.16, offsetYCells: 0 },
    Efreet: { scaleX: 1.28, scaleY: 1.47, offsetXCells: -0.01, offsetYCells: 0.14 },
    Nightmare: { scaleX: 1.5, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
    Cyclops: { scaleX: 1.34, scaleY: 1.5, offsetXCells: 0, offsetYCells: 0 },
    "Ogre Mage": { scaleX: 1.52, scaleY: 1.52, offsetXCells: -0.09, offsetYCells: 0 },
    Zena: { scaleX: 1.31, scaleY: 1.31, offsetXCells: 0, offsetYCells: 0 },
    Gargantuan: { scaleX: 1.6, scaleY: 1.6, offsetXCells: -0.05, offsetYCells: -0.17 },
    "Tsar Cannon": { scaleX: 1.42, scaleY: 1.42, offsetXCells: 0.29, offsetYCells: -0.13 },
    Angel: { scaleX: 1.406, scaleY: 1.3205, offsetXCells: -0.04, offsetYCells: -0.23 },
    "Arachna Queen": { scaleX: 1.8, scaleY: 1.85, offsetXCells: 0.01, offsetYCells: 0.19 },
    "Magic Dragon": { scaleX: 1.39, scaleY: 1.39, offsetXCells: -0.15, offsetYCells: -0.22 },
    Abomination: { scaleX: 1.4, scaleY: 1.4, offsetXCells: 0.05, offsetYCells: -0.19 },
    Thunderbird: { scaleX: 1.4, scaleY: 1.4, offsetXCells: -0.44, offsetYCells: -0.13 },
    Champion: { scaleX: 1.51, scaleY: 1.51, offsetXCells: 0.13, offsetYCells: -0.355 },
    "Black Dragon": { scaleX: 1.55, scaleY: 1.55, offsetXCells: -0.24, offsetYCells: 0.08 },
    Hydra: { scaleX: 1.65, scaleY: 1.65, offsetXCells: -0.01, offsetYCells: -0.13 },
    Behemoth: { scaleX: 1.26, scaleY: 1.31, offsetXCells: 0.02, offsetYCells: 0.05 },
    "Frenzied Boar": { scaleX: 1.41, scaleY: 1.46, offsetXCells: 0.02, offsetYCells: -0.09 },
});

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

export const normalizeBattlefieldCreatureFraming = (
    value?: Partial<BattlefieldCreatureFraming>,
): BattlefieldCreatureFraming => ({
    scaleX: clamp(value?.scaleX, 1, 0.25, 3),
    scaleY: clamp(value?.scaleY, 1, 0.25, 3),
    offsetXCells: clamp(value?.offsetXCells, 0, -2, 2),
    offsetYCells: clamp(value?.offsetYCells, 0, -2, 2),
    flagOffsetXCells: clamp(value?.flagOffsetXCells, 0, -2, 2),
    flagOffsetYCells: clamp(value?.flagOffsetYCells, 0, -2, 2),
});

let storedCache: Record<string, BattlefieldCreatureFraming> | undefined;
let editorActive = false;
const visualBounds = new Map<string, BattlefieldCreatureVisualBounds>();

export const readStoredBattlefieldCreatureFraming = (): Record<string, BattlefieldCreatureFraming> => {
    if (storedCache) return { ...storedCache };
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        storedCache = {};
        return {};
    }
    try {
        const raw = window.localStorage.getItem(BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<BattlefieldCreatureFraming>>) : {};
        storedCache = Object.fromEntries(
            Object.entries(parsed)
                .filter(([name]) => Boolean(name))
                .map(([name, framing]) => [name, normalizeBattlefieldCreatureFraming(framing)]),
        );
    } catch {
        storedCache = {};
    }
    return { ...storedCache };
};

export const writeStoredBattlefieldCreatureFraming = (framing: Record<string, BattlefieldCreatureFraming>): void => {
    storedCache = Object.fromEntries(
        Object.entries(framing).map(([name, value]) => [name, normalizeBattlefieldCreatureFraming(value)]),
    );
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY, JSON.stringify(storedCache));
    }
};

/** Tell live editor units to re-read their saved framing without rebuilding the battle scene. */
export const notifyBattlefieldCreatureFramingChanged = (unitName?: string): void => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent<BattlefieldCreatureFramingChangeDetail>(BATTLEFIELD_CREATURE_FRAMING_CHANGE_EVENT, {
            detail: { unitName },
        }),
    );
};

/** Runtime hook: local drafts override the approved values only in development builds. */
export const resolveStoredBattlefieldCreatureFraming = (unitName: string): BattlefieldCreatureFraming => {
    const approved = BATTLEFIELD_CREATURE_FRAMING[unitName] ?? DEFAULT_BATTLEFIELD_CREATURE_FRAMING;
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return approved;
    }
    if (!storedCache) readStoredBattlefieldCreatureFraming();
    return storedCache?.[unitName] ?? approved;
};

export const setBattlefieldCreatureEditorActive = (active: boolean): void => {
    editorActive = active;
    if (!active) visualBounds.clear();
};

export const isBattlefieldCreatureEditorActive = (): boolean => editorActive;

export const publishBattlefieldCreatureVisualBounds = (
    unitName: string,
    bounds: Omit<BattlefieldCreatureVisualBounds, "updatedAt">,
): void => {
    if (!editorActive) return;
    visualBounds.set(unitName, { ...bounds, updatedAt: performance.now() });
};

export const readBattlefieldCreatureVisualBounds = (unitName: string): BattlefieldCreatureVisualBounds | undefined =>
    visualBounds.get(unitName);

/**
 * ----------------------------------------------------------------------------------------------------
 * Rectangular footprint mode (`?footprint=WxH`) for the framing editor.
 *
 * No shipped creature declares `footprint_width` / `footprint_height`: which creature becomes rectangular
 * is a balance and art decision, not an engineering one. So the editor's rectangular mode borrows the
 * shape through the engine's QA override (`globalThis.__hocFootprintOverrides`) instead of editing any
 * creature's data, and it borrows it for the creatures whose battlefield ART is already drawn that wide —
 * their `widthScale` fakes today exactly the silhouette the mechanical footprint expresses tomorrow.
 *
 * These are pure so the selection can be pinned by tests; the editor supplies the catalog and the
 * authored art width, which keeps this module free of any dependency on the scene renderer.
 * ----------------------------------------------------------------------------------------------------
 */
export interface FootprintShape {
    width: number;
    height: number;
}

export interface FootprintModeCandidate {
    name: string;
    /** The creature's declared footprint, i.e. creatures.json (or its `size`, squared, as the fallback). */
    footprintWidth: number;
    footprintHeight: number;
    /** How many cells across the creature's authored battlefield art already reads. */
    authoredArtWidthCells: number;
}

export interface FootprintModeSelection {
    /** Creature names to show, in catalog order. */
    names: string[];
    /** Of those, the ones that only carry the shape because this mode lent it to them. */
    seededNames: string[];
    /** The value to install in `globalThis.__hocFootprintOverrides`; empty when nothing needs lending. */
    overrideSource: string;
}

/** Art authored across two horizontal cells reads at least this many cells wide. */
export const AUTHORED_ART_TWO_CELL_WIDTH = 1.8;

export const formatFootprintShape = (shape: FootprintShape): string => `${shape.width}x${shape.height}`;

/** `2x1` / `1x2` / any `WxH`. Anything else is not a footprint request. */
export const parseFootprintShape = (value: string | null | undefined): FootprintShape | undefined => {
    const parsed = value ? /^([0-9]+)x([0-9]+)$/.exec(value.trim()) : null;
    if (!parsed) return undefined;
    const width = Number(parsed[1]);
    const height = Number(parsed[2]);
    return width > 0 && height > 0 ? { width, height } : undefined;
};

/** Read the engine's override string back into a map, in the exact format the engine itself parses. */
export const parseFootprintOverrides = (source: string | undefined): Map<string, FootprintShape> => {
    const overrides = new Map<string, FootprintShape>();
    for (const entry of (source ?? "").split(",")) {
        const separator = entry.lastIndexOf("=");
        if (separator <= 0) continue;
        const shape = parseFootprintShape(entry.slice(separator + 1));
        if (shape) overrides.set(entry.slice(0, separator).trim(), shape);
    }
    return overrides;
};

const shapesMatch = (left: FootprintShape, right: FootprintShape): boolean =>
    left.width === right.width && left.height === right.height;

/**
 * Which creatures the rectangular mode shows, and what it has to lend them to make that true.
 *
 * A creature that already carries the requested shape — from creatures.json, or from an override a
 * developer typed into the console — is taken as it is and nothing is lent. Only when NO creature carries
 * it does the mode seed it onto the wide-art candidates, which is the state the editor is in today.
 */
export const resolveFootprintMode = (
    requested: FootprintShape,
    candidates: readonly FootprintModeCandidate[],
    manualOverrideSource?: string,
): FootprintModeSelection => {
    const manualOverrides = parseFootprintOverrides(manualOverrideSource);
    const declared = candidates.filter((candidate) =>
        shapesMatch(
            manualOverrides.get(candidate.name) ?? {
                width: candidate.footprintWidth,
                height: candidate.footprintHeight,
            },
            requested,
        ),
    );
    // Only a body wider than it is tall can borrow art that is merely drawn wide; a taller shape has no
    // stand-in and is left to an explicit console override.
    const seeded =
        declared.length || requested.width <= requested.height
            ? []
            : candidates.filter((candidate) => candidate.authoredArtWidthCells >= AUTHORED_ART_TWO_CELL_WIDTH);
    const entries = [
        ...[...manualOverrides].map(([name, shape]) => `${name}=${formatFootprintShape(shape)}`),
        ...seeded.map((candidate) => `${candidate.name}=${formatFootprintShape(requested)}`),
    ];
    return {
        names: (seeded.length ? seeded : declared).map((candidate) => candidate.name),
        seededNames: seeded.map((candidate) => candidate.name),
        overrideSource: seeded.length ? entries.join(",") : "",
    };
};
