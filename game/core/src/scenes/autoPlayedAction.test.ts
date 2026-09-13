import type { GameAction } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { createPlayActionFromGameAction } from "../api/game_action_play_codec";
import { PlayInputSource } from "../api/play_protocol";
import { autoPlayedInputSource, autoPlayedSource, markAutoPlayedAction } from "./autoPlayedAction";

describe("auto-played action tag", () => {
    const endTurn = { type: "end_turn", unitId: "u1" } as GameAction;

    test("tags a copy, leaves the original untouched, and maps to the wire input source", () => {
        const auto = markAutoPlayedAction(endTurn, "auto_unit");
        const toggled = markAutoPlayedAction(endTurn, "client_ai");

        expect(autoPlayedSource(endTurn)).toBeUndefined();
        expect(autoPlayedInputSource(endTurn)).toBeUndefined();
        expect(autoPlayedSource(auto)).toBe("auto_unit");
        expect(autoPlayedInputSource(auto)).toBe(PlayInputSource.AUTO_UNIT);
        expect(autoPlayedInputSource(toggled)).toBe(PlayInputSource.CLIENT_AI);
    });

    test("the tagged action is indistinguishable from the plain one for the engine and the wire codec", () => {
        const tagged = markAutoPlayedAction(endTurn, "auto_unit");
        expect(tagged).toEqual(endTurn);
        expect(Object.keys(tagged)).toEqual(Object.keys(endTurn));

        const envelope = { actionId: "a", gameId: "g", playerId: "p", team: 1, expectedSequence: 3 };
        expect(createPlayActionFromGameAction(tagged, envelope)).toEqual(
            createPlayActionFromGameAction(endTurn, envelope),
        );
    });
});
