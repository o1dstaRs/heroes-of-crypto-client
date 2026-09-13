import { describe, expect, test } from "bun:test";

import { liveMatchBannerModel } from "./liveMatchBannerModel";

const GAME = "11111111-0000-4000-8000-000000000001";

describe("liveMatchBannerModel", () => {
    test("is silent without a live game and on the game's own routes", () => {
        expect(liveMatchBannerModel(undefined, "/")).toBeNull();
        expect(liveMatchBannerModel({ gameId: GAME, stage: "play" }, `/game/${GAME}`)).toBeNull();
        expect(liveMatchBannerModel({ gameId: GAME, stage: "pick" }, `/game/${GAME}/replay`)).toBeNull();
    });

    test("points a draft or fight back at the board from anywhere else", () => {
        expect(liveMatchBannerModel({ gameId: GAME, stage: "pick" }, "/")).toMatchObject({
            message: "Your draft is in progress",
            target: `/game/${GAME}`,
        });
        expect(liveMatchBannerModel({ gameId: GAME, stage: "play" }, "/portal")).toMatchObject({
            message: "Your fight is in progress",
            action: "Return to match",
        });
        expect(liveMatchBannerModel({ gameId: GAME, stage: "play" }, "/game/other")).not.toBeNull();
    });

    test("sends a match that is still being accepted to the arena, unless already there", () => {
        expect(liveMatchBannerModel({ gameId: GAME, stage: "confirming" }, "/lobbies")).toMatchObject({
            target: "/play",
            action: "Go to arena",
        });
        expect(liveMatchBannerModel({ gameId: GAME, stage: "confirming" }, "/play")).toBeNull();
    });
});
