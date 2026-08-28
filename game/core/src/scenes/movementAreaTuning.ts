import { GridSettings, type HoCMath } from "@heroesofcrypto/common";

export interface MovementAreaTuning {
    /** Raise only the painted top edge of the uppermost battlefield row, measured in logical cells. */
    firstRowTopLiftCells: number;
    /** Move only the painted bottom edge of the uppermost battlefield row, measured in logical cells. */
    firstRowBottomLiftCells: number;
    /** Raise only the painted top edge of the second battlefield row, measured in logical cells. */
    secondRowTopLiftCells: number;
    /** Development-only outline/fill showing the exact polygons produced by the two controls. */
    guidesVisible: boolean;
}

export const MOVEMENT_AREA_TUNING_STORAGE_KEY = "hoc-dev-movement-area-tuning-v2";

export const DEFAULT_MOVEMENT_AREA_TUNING: MovementAreaTuning = Object.freeze({
    firstRowTopLiftCells: 0.055,
    firstRowBottomLiftCells: 0.04,
    secondRowTopLiftCells: 0.055,
    guidesVisible: true,
});

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

export const normalizeMovementAreaTuning = (value?: Partial<MovementAreaTuning>): MovementAreaTuning => ({
    firstRowTopLiftCells: clamp(
        value?.firstRowTopLiftCells,
        DEFAULT_MOVEMENT_AREA_TUNING.firstRowTopLiftCells,
        -0.5,
        1.5,
    ),
    firstRowBottomLiftCells: clamp(
        value?.firstRowBottomLiftCells,
        DEFAULT_MOVEMENT_AREA_TUNING.firstRowBottomLiftCells,
        -0.5,
        0.5,
    ),
    secondRowTopLiftCells: clamp(
        value?.secondRowTopLiftCells,
        DEFAULT_MOVEMENT_AREA_TUNING.secondRowTopLiftCells,
        -0.5,
        1.5,
    ),
    guidesVisible: typeof value?.guidesVisible === "boolean" ? value.guidesVisible : true,
});

let storedCache: MovementAreaTuning | undefined;
let movementAreaEditorActive = false;

export const readStoredMovementAreaTuning = (): MovementAreaTuning => {
    if (storedCache) return { ...storedCache };
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        storedCache = { ...DEFAULT_MOVEMENT_AREA_TUNING };
        return { ...storedCache };
    }
    try {
        const raw = window.localStorage.getItem(MOVEMENT_AREA_TUNING_STORAGE_KEY);
        storedCache = normalizeMovementAreaTuning(
            raw ? (JSON.parse(raw) as Partial<MovementAreaTuning>) : DEFAULT_MOVEMENT_AREA_TUNING,
        );
    } catch {
        storedCache = { ...DEFAULT_MOVEMENT_AREA_TUNING };
    }
    return { ...storedCache };
};

export const writeStoredMovementAreaTuning = (value: Partial<MovementAreaTuning>): MovementAreaTuning => {
    storedCache = normalizeMovementAreaTuning(value);
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(MOVEMENT_AREA_TUNING_STORAGE_KEY, JSON.stringify(storedCache));
    }
    return { ...storedCache };
};

export const resetStoredMovementAreaTuning = (): MovementAreaTuning => {
    storedCache = { ...DEFAULT_MOVEMENT_AREA_TUNING };
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.removeItem(MOVEMENT_AREA_TUNING_STORAGE_KEY);
    }
    return { ...storedCache };
};

/** Local calibration drafts must never change the production battlefield. */
export const resolveMovementAreaTuning = (): MovementAreaTuning => {
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return { ...DEFAULT_MOVEMENT_AREA_TUNING, guidesVisible: false };
    }
    return readStoredMovementAreaTuning();
};

export const setMovementAreaEditorActive = (active: boolean): void => {
    movementAreaEditorActive = active;
};

export const isMovementAreaEditorActive = (): boolean => movementAreaEditorActive;

export const battlefieldRowCount = (gs: GridSettings): number =>
    Math.max(1, Math.round((gs.getMaxY() - gs.getMinY()) / gs.getStep()));

/** Zero is the visually uppermost row, one is the row immediately below it. */
export const movementAreaRowFromTop = (cell: HoCMath.XY, gs: GridSettings): number =>
    battlefieldRowCount(gs) - 1 - cell.y;

/** Extra logical height added above a cell without moving its bottom edge. */
export const movementAreaTopLiftForCell = (
    cell: HoCMath.XY,
    gs: GridSettings,
    tuning: MovementAreaTuning = resolveMovementAreaTuning(),
): number => {
    const rowFromTop = movementAreaRowFromTop(cell, gs);
    if (rowFromTop === 0) return tuning.firstRowTopLiftCells;
    if (rowFromTop === 1) return tuning.secondRowTopLiftCells;
    return 0;
};

/** Independent lower-edge adjustment for the visually uppermost row. */
export const movementAreaBottomLiftForCell = (
    cell: HoCMath.XY,
    gs: GridSettings,
    tuning: MovementAreaTuning = resolveMovementAreaTuning(),
): number => (movementAreaRowFromTop(cell, gs) === 0 ? tuning.firstRowBottomLiftCells : 0);
