import { useSyncExternalStore } from "react";

import {
    CANONICAL_GOLD_CURRENCY,
    fetchRankedSeasonCatalog,
    fetchRankedSeasonSnapshot,
    rankedSeasonCurrencyAt,
    type RankedSeasonCatalog,
    type RankedSeasonCurrency,
    type RankedSeasonSnapshot,
} from "../api/ranked_season_client";

export interface RankedSeasonState {
    currency: Readonly<RankedSeasonCurrency>;
    seasons: RankedSeasonCatalog;
    snapshot: RankedSeasonSnapshot | undefined;
}

const EMPTY_RANKED_SEASON_STATE: RankedSeasonState = Object.freeze({
    currency: CANONICAL_GOLD_CURRENCY,
    seasons: Object.freeze([]),
    snapshot: undefined,
});

export interface RankedSeasonStore {
    getSnapshot: () => RankedSeasonState;
    refresh: (force?: boolean) => Promise<void>;
    subscribe: (listener: () => void) => () => void;
}

interface RankedSeasonStoreOptions {
    clearIntervalFn?: (timer: ReturnType<typeof setInterval>) => void;
    load?: () => Promise<RankedSeasonSnapshot>;
    loadCatalog?: () => Promise<RankedSeasonCatalog>;
    now?: () => number;
    pollIntervalMs?: number;
    setIntervalFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
}

/**
 * One external store backs every season-aware component. Concurrent subscribers share the same request,
 * cached snapshot, and polling timer instead of each balance badge starting its own minute-long poll loop.
 */
export const createRankedSeasonStore = ({
    clearIntervalFn = clearInterval,
    load = fetchRankedSeasonSnapshot,
    loadCatalog = fetchRankedSeasonCatalog,
    now = Date.now,
    pollIntervalMs = 60_000,
    setIntervalFn = setInterval,
}: RankedSeasonStoreOptions = {}): RankedSeasonStore => {
    let state = EMPTY_RANKED_SEASON_STATE;
    let inFlight: Promise<void> | undefined;
    let lastAttemptAt: number | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const listeners = new Set<() => void>();

    const refresh = (force = false): Promise<void> => {
        if (inFlight) {
            return inFlight;
        }
        const requestedAt = now();
        if (lastAttemptAt !== undefined && !force && requestedAt - lastAttemptAt < pollIntervalMs) {
            return Promise.resolve();
        }
        lastAttemptAt = requestedAt;
        const snapshotRequest = load().then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const }),
        );
        const catalogRequest = loadCatalog().then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const }),
        );
        inFlight = Promise.all([snapshotRequest, catalogRequest])
            .then(([snapshotResult, catalogResult]) => {
                if (!snapshotResult.ok && !catalogResult.ok) {
                    return;
                }
                const snapshot = snapshotResult.ok ? snapshotResult.value : state.snapshot;
                const seasons = catalogResult.ok ? catalogResult.value : state.seasons;
                const currency = snapshotResult.ok
                    ? (snapshotResult.value.current?.currency ?? CANONICAL_GOLD_CURRENCY)
                    : catalogResult.ok
                      ? rankedSeasonCurrencyAt(seasons, requestedAt)
                      : state.currency;
                state = {
                    snapshot,
                    currency,
                    seasons,
                };
                for (const listener of listeners) {
                    listener();
                }
            })
            .catch(() => {
                // Season context is decorative. Keep the last good state and retry on the next interval.
            })
            .finally(() => {
                inFlight = undefined;
            });
        return inFlight;
    };

    const subscribe = (listener: () => void): (() => void) => {
        listeners.add(listener);
        if (listeners.size === 1) {
            void refresh();
            if (pollIntervalMs > 0) {
                pollTimer = setIntervalFn(() => void refresh(true), pollIntervalMs);
            }
        }
        return () => {
            listeners.delete(listener);
            if (!listeners.size && pollTimer !== undefined) {
                clearIntervalFn(pollTimer);
                pollTimer = undefined;
            }
        };
    };

    return {
        getSnapshot: () => state,
        refresh,
        subscribe,
    };
};

const rankedSeasonStore = createRankedSeasonStore();

export const useRankedSeason = (): RankedSeasonState =>
    useSyncExternalStore(rankedSeasonStore.subscribe, rankedSeasonStore.getSnapshot, () => EMPTY_RANKED_SEASON_STATE);
