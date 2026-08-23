import { describe, expect, mock, test } from "bun:test";

import type { RankedSeasonCatalog, RankedSeasonSnapshot } from "../api/ranked_season_client";
import { createRankedSeasonStore } from "./useRankedSeason";

const snapshot: RankedSeasonSnapshot = {
    current: {
        sequence: 2,
        name: "Iron Tide",
        startsAt: 1_800_000_000_000,
        endsAt: 1_801_000_000_000,
        currency: {
            name: "Iron Marks",
            symbol: "IRM",
            iconSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1" /></svg>',
        },
    },
    next: null,
};
const catalog: RankedSeasonCatalog = [snapshot.current!];

describe("ranked season store", () => {
    test("deduplicates subscriber loads and tears down its sole polling timer", async () => {
        let resolveLoad: ((value: RankedSeasonSnapshot) => void) | undefined;
        let resolveCatalog: ((value: RankedSeasonCatalog) => void) | undefined;
        const load = mock(
            () =>
                new Promise<RankedSeasonSnapshot>((resolve) => {
                    resolveLoad = resolve;
                }),
        );
        const loadCatalog = mock(
            () =>
                new Promise<RankedSeasonCatalog>((resolve) => {
                    resolveCatalog = resolve;
                }),
        );
        const timer = {} as ReturnType<typeof setInterval>;
        const setIntervalFn = mock((_callback: () => void, _delayMs: number) => timer);
        const clearIntervalFn = mock((_timer: ReturnType<typeof setInterval>) => undefined);
        const firstListener = mock(() => undefined);
        const secondListener = mock(() => undefined);
        const store = createRankedSeasonStore({
            clearIntervalFn,
            load,
            loadCatalog,
            now: () => 0,
            pollIntervalMs: 60_000,
            setIntervalFn,
        });

        const unsubscribeFirst = store.subscribe(firstListener);
        const unsubscribeSecond = store.subscribe(secondListener);
        const sharedRefresh = store.refresh();

        expect(load).toHaveBeenCalledTimes(1);
        expect(loadCatalog).toHaveBeenCalledTimes(1);
        expect(setIntervalFn).toHaveBeenCalledTimes(1);
        expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60_000);

        resolveLoad?.(snapshot);
        resolveCatalog?.(catalog);
        await sharedRefresh;
        expect(store.getSnapshot()).toEqual({
            snapshot,
            seasons: catalog,
            currency: {
                name: "Iron Marks",
                symbol: "IRM",
                iconSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1" /></svg>',
            },
        });
        expect(firstListener).toHaveBeenCalledTimes(1);
        expect(secondListener).toHaveBeenCalledTimes(1);

        unsubscribeFirst();
        expect(clearIntervalFn).not.toHaveBeenCalled();
        unsubscribeSecond();
        expect(clearIntervalFn).toHaveBeenCalledTimes(1);
        expect(clearIntervalFn).toHaveBeenCalledWith(timer);
    });

    test("retains the last good catalog when only its refresh fails", async () => {
        let nextSnapshot = snapshot;
        let catalogFails = false;
        const load = mock(async () => nextSnapshot);
        const loadCatalog = mock(async () => {
            if (catalogFails) {
                throw new Error("catalog unavailable");
            }
            return catalog;
        });
        const store = createRankedSeasonStore({ load, loadCatalog, now: () => 1_800_500_000_000 });

        await store.refresh(true);
        catalogFails = true;
        nextSnapshot = {
            ...snapshot,
            current: snapshot.current
                ? { ...snapshot.current, currency: { name: "Cinders", symbol: "CND", iconSvg: null } }
                : null,
        };
        await store.refresh(true);

        expect(store.getSnapshot()).toEqual({
            snapshot: nextSnapshot,
            seasons: catalog,
            currency: { name: "Cinders", symbol: "CND", iconSvg: null },
        });
        expect(load).toHaveBeenCalledTimes(2);
        expect(loadCatalog).toHaveBeenCalledTimes(2);
    });
});
