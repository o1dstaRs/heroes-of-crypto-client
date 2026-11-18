import { useSyncExternalStore } from "react";
import {
    DEFAULT_PICK_STAT_ORDER,
    PICK_STAT_ORDER_ENDPOINT,
    PICK_STAT_ORDER_KEY,
    swapPickStats,
    validatePickStatOrder,
    type PickStatId,
} from "./pickStatOrderModel";

interface State {
    order: readonly PickStatId[];
    editing: boolean;
    selected: PickStatId | null;
    status: "loading" | "saved" | "saving" | "browser" | "error";
}
const empty: State = {
    order: DEFAULT_PICK_STAT_ORDER,
    editing: false,
    selected: null,
    status: import.meta.env.DEV ? "loading" : "browser",
};
let state = empty;
let loaded = false;
let initialization: Promise<void> | undefined;
const listeners = new Set<() => void>();
const publish = (next: State) => {
    state = next;
    listeners.forEach((listener) => listener());
};
const getSnapshot = () => {
    if (!loaded && typeof window !== "undefined") {
        loaded = true;
        try {
            state = {
                ...state,
                order: validatePickStatOrder(JSON.parse(localStorage.getItem(PICK_STAT_ORDER_KEY) ?? "null")),
            };
        } catch {
            /* Keep defaults. */
        }
    }
    return state;
};
const cache = (order: readonly PickStatId[]) => {
    try {
        localStorage.setItem(PICK_STAT_ORDER_KEY, JSON.stringify(order));
        return true;
    } catch {
        return false;
    }
};
const initialize = () => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    initialization ??= fetch(PICK_STAT_ORDER_ENDPOINT, { cache: "no-store" })
        .then(async (response) => {
            if (!response.ok) throw new Error("Load failed");
            const value = await response.json();
            if (value === null) publish({ ...getSnapshot(), status: "browser" });
            else {
                const order = validatePickStatOrder(value);
                cache(order);
                publish({ ...getSnapshot(), order, status: "saved" });
            }
        })
        .catch(() => publish({ ...getSnapshot(), status: "error" }));
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    initialize();
    return () => {
        listeners.delete(listener);
    };
};
export const usePickStatOrder = () => useSyncExternalStore(subscribe, getSnapshot, () => empty);
export const setPickStatEditing = (editing: boolean) => publish({ ...getSnapshot(), editing, selected: null });

export async function savePickStatOrder(order: readonly PickStatId[]) {
    if (state.status === "loading" || state.status === "saving") return;
    const next = validatePickStatOrder(order);
    const cached = cache(next);
    publish({
        ...getSnapshot(),
        order: next,
        selected: null,
        status: import.meta.env.DEV ? "saving" : cached ? "browser" : "error",
    });
    if (!import.meta.env.DEV) return;
    try {
        const response = await fetch(PICK_STAT_ORDER_ENDPOINT, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error("Save failed");
        validatePickStatOrder(await response.json());
        publish({ ...getSnapshot(), status: "saved" });
    } catch {
        publish({ ...getSnapshot(), status: "error" });
    }
}
export function selectPickStat(id: PickStatId) {
    const current = getSnapshot();
    if (!current.editing || current.status === "loading" || current.status === "saving") return;
    if (!current.selected) publish({ ...current, selected: id });
    else if (current.selected === id) publish({ ...current, selected: null });
    else void savePickStatOrder(swapPickStats(current.order, current.selected, id));
}
