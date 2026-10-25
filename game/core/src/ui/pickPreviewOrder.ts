import { useSyncExternalStore } from "react";

import approvedPickCardOrder from "../settings/approvedPickCardOrder.json";

export const PICK_PREVIEW_ORDER_STORAGE_KEY = "hoc.pick-preview.card-order.v1";
type Orders = Partial<Record<number, number[]>>;
interface OrderEditorState {
    orders: Orders;
    editing: boolean;
    selected: { level: number; id: number } | null;
    saveError: boolean;
    serverStatus: "loading" | "saved" | "browser" | "saving" | "error";
}
const empty: OrderEditorState = {
    orders: approvedPickCardOrder,
    editing: false,
    selected: null,
    saveError: false,
    serverStatus: import.meta.env.DEV ? "loading" : "browser",
};
let snapshot = empty;
let loaded = false;
const listeners = new Set<() => void>();

export const parsePickPreviewOrders = (raw: string | null): Orders => {
    try {
        const value: unknown = JSON.parse(raw ?? "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const orders: Orders = {};
        for (const level of [1, 2, 3, 4]) {
            const ids = (value as Record<string, unknown>)[level];
            if (Array.isArray(ids)) {
                orders[level] = [...new Set(ids.filter((id): id is number => Number.isInteger(id) && id > 0))];
            }
        }
        return orders;
    } catch {
        return {};
    }
};

/** Ignore removed creatures and append new roster entries without losing the user's existing order. */
export const applyPickPreviewOrder = (roster: readonly number[], saved?: readonly number[]): number[] => {
    const allowed = new Set(roster);
    return [...new Set([...(saved ?? []), ...roster])].filter((id) => allowed.has(id));
};

export const swapPickPreviewCards = (order: readonly number[], first: number, second: number): number[] => {
    const result = [...order];
    const a = result.indexOf(first);
    const b = result.indexOf(second);
    if (a >= 0 && b >= 0) [result[a], result[b]] = [result[b], result[a]];
    return result;
};

const getSnapshot = (): OrderEditorState => {
    if (!loaded && typeof window !== "undefined") {
        loaded = true;
        try {
            snapshot = {
                ...empty,
                orders: {
                    ...approvedPickCardOrder,
                    ...parsePickPreviewOrders(window.localStorage.getItem(PICK_PREVIEW_ORDER_STORAGE_KEY)),
                },
            };
        } catch {
            snapshot = empty;
        }
    }
    return snapshot;
};
const publish = (next: OrderEditorState) => {
    snapshot = next;
    for (const listener of listeners) listener();
};
const ENDPOINT = "/__hoc-dev/pick-card-order";
let initialization: Promise<void> | undefined;
let saves: Promise<void> = Promise.resolve();

const initializeServerOrder = (): Promise<void> => {
    if (!import.meta.env.DEV || typeof window === "undefined") return Promise.resolve();
    if (initialization) return initialization;
    const bootstrap = (window as Window & { __HOC_PICK_ORDER_READY__?: Promise<Orders | null> })
        .__HOC_PICK_ORDER_READY__;
    initialization = (
        bootstrap ??
        fetch(ENDPOINT, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("Unable to load card order");
            return response.json() as Promise<Orders | null>;
        })
    )
        .then((orders) => {
            if (orders !== null) {
                try {
                    window.localStorage.setItem(PICK_PREVIEW_ORDER_STORAGE_KEY, JSON.stringify(orders));
                } catch {
                    /* Server is authoritative. */
                }
                publish({ ...getSnapshot(), orders, serverStatus: "saved", saveError: false });
            } else publish({ ...getSnapshot(), serverStatus: "browser" });
        })
        .catch(() => publish({ ...getSnapshot(), serverStatus: "error", saveError: true }));
    return initialization;
};

const save = (orders: Orders, level: number) => {
    let saveError = false;
    try {
        window.localStorage.setItem(PICK_PREVIEW_ORDER_STORAGE_KEY, JSON.stringify(orders));
    } catch {
        saveError = true;
    }
    publish({
        ...getSnapshot(),
        orders,
        selected: null,
        saveError,
        serverStatus: import.meta.env.DEV ? "saving" : "browser",
    });
    if (import.meta.env.DEV) {
        saves = saves
            .then(async () => {
                await initializeServerOrder();
                const response = await fetch(ENDPOINT, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ level, order: orders[level] ?? null }),
                });
                if (!response.ok) throw new Error("Unable to save card order");
                publish({ ...getSnapshot(), serverStatus: "saved", saveError: false });
            })
            .catch(() => publish({ ...getSnapshot(), serverStatus: "error", saveError: true }));
    }
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    void initializeServerOrder();
    return () => {
        listeners.delete(listener);
    };
};

export const usePickPreviewOrder = () => useSyncExternalStore(subscribe, getSnapshot, () => empty);

export const setPickPreviewOrderEditing = (editing: boolean) => publish({ ...getSnapshot(), editing, selected: null });

export const selectPickPreviewSwap = (level: number, id: number, order: readonly number[]) => {
    const current = getSnapshot();
    if (!current.editing) return;
    if (!current.selected || current.selected.level !== level) {
        publish({ ...current, selected: { level, id } });
    } else if (current.selected.id === id) {
        publish({ ...current, selected: null });
    } else {
        save({ ...current.orders, [level]: swapPickPreviewCards(order, current.selected.id, id) }, level);
    }
};

export const resetPickPreviewOrder = (level: number) => {
    const orders = { ...getSnapshot().orders };
    orders[level] = approvedPickCardOrder[String(level) as keyof typeof approvedPickCardOrder];
    save(orders, level);
};

export const isCreatureOrderPreview = (): boolean =>
    Boolean(
        import.meta.env.DEV &&
        typeof window !== "undefined" &&
        /^\/preview\/picks\/level[1-4]$/.test(window.location.pathname),
    );
