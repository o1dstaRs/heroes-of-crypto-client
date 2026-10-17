const STORAGE_KEY = "hoc:staggerDuplicateIdle";
const listeners = new Set<() => void>();
let enabled = true;
try {
    enabled = globalThis.localStorage?.getItem(STORAGE_KEY) !== "0";
} catch {
    // Keep the default when browser storage is unavailable.
}

export const getStaggerDuplicateIdle = (): boolean => enabled;
export const subscribeStaggerDuplicateIdle = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
export function setStaggerDuplicateIdle(value: boolean): void {
    enabled = value;
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
        // The preference still applies for the current session.
    }
    for (const listener of listeners) listener();
}

// Each board owns its ordering. Recreated units retain their slot; removal never
// renumbers survivors or jumps their phase. The whole registry expires with the board.
interface IdleSlot {
    ordinal: number;
    alive?: () => boolean;
}
const boards = new WeakMap<object, Map<string, Map<string, IdleSlot>>>();
export function duplicateIdleOrdinal(board: object, name: string, id: string, alive?: () => boolean): number {
    let names = boards.get(board);
    if (!names) boards.set(board, (names = new Map()));
    let ids = names.get(name);
    if (!ids) names.set(name, (ids = new Map()));
    let slot = ids.get(id);
    if (!slot) {
        // Rematches may reuse the same container after destroying its entire army.
        if ([...ids.values()].every((entry) => entry.alive && !entry.alive())) ids.clear();
        ids.set(id, (slot = { ordinal: ids.size, alive }));
    }
    return slot.ordinal;
}

/** Only the idle clock changes; the first instance keeps its existing timing. */
export function duplicateIdleOffsetMs(ordinal: number): number {
    return enabled && Number.isFinite(ordinal) ? Math.max(0, Math.floor(ordinal)) * 733 : 0;
}
