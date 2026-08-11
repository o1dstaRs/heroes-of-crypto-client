import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";
import { fetchRankedSeasonSnapshot, normalizeRankedSeasonSnapshot } from "./ranked_season_client";

afterEach(() => mock.restore());

describe("ranked season client", () => {
    test("loads the active season from the public matchmaking route", async () => {
        const data = {
            current: {
                sequence: 3,
                name: "Season of Embers",
                startsAt: 1_799_000_000_000,
                endsAt: 1_800_000_000_000,
                status: "active",
            },
            next: {
                sequence: 4,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
                status: "upcoming",
            },
        };
        const get = spyOn(axiosMMInstance, "get").mockResolvedValue({
            data,
        } as never);

        await expect(fetchRankedSeasonSnapshot()).resolves.toEqual({
            current: {
                sequence: 3,
                name: "Season of Embers",
                startsAt: 1_799_000_000_000,
                endsAt: 1_800_000_000_000,
            },
            next: {
                sequence: 4,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
            },
        });
        expect(get).toHaveBeenCalledWith(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.seasonCurrent));
    });

    test("keeps a valid upcoming season when the current season is missing or malformed", () => {
        const next = {
            sequence: 2,
            name: "Iron Tide",
            startsAt: 1_800_000_000_000,
            endsAt: 1_801_000_000_000,
            status: "upcoming",
        };
        expect(normalizeRankedSeasonSnapshot({ current: null, next })).toEqual({
            current: null,
            next: {
                sequence: 2,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
            },
        });
        expect(
            normalizeRankedSeasonSnapshot({
                current: {
                    sequence: 0,
                    name: "",
                    startsAt: 10,
                    endsAt: 9,
                    status: "active",
                },
                next,
            }),
        ).toEqual({
            current: null,
            next: {
                sequence: 2,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
            },
        });
    });

    test("rejects seasons with the wrong status or invalid dates", () => {
        expect(
            normalizeRankedSeasonSnapshot({
                current: {
                    sequence: 1,
                    name: "First Flame",
                    startsAt: 100,
                    endsAt: 200,
                    status: "upcoming",
                },
                next: {
                    sequence: 2,
                    name: "Iron Tide",
                    startsAt: 300,
                    endsAt: 250,
                    status: "upcoming",
                },
            }),
        ).toEqual({ current: null, next: null });
    });
});
