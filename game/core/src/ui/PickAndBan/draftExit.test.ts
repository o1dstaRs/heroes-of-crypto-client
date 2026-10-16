import { describe, expect, test } from "bun:test";

import { DRAFT_EXIT_DESTINATION, leaveActiveDraft } from "./draftExit";

describe("draft exit", () => {
    test("abandons the active match before returning to new-game selection", async () => {
        const calls: string[] = [];

        await leaveActiveDraft(
            "game-1",
            async (gameId) => {
                calls.push(`abandon:${gameId}`);
            },
            (destination, options) => {
                calls.push(`navigate:${destination}:${String(options.replace)}`);
            },
        );

        expect(DRAFT_EXIT_DESTINATION).toBe("/play");
        expect(calls).toEqual(["abandon:game-1", "navigate:/play:true"]);
    });

    test("does not navigate when the server refuses to release the match", async () => {
        const destinations: string[] = [];

        await expect(
            leaveActiveDraft(
                "game-2",
                async () => {
                    throw new Error("abandon failed");
                },
                (destination) => destinations.push(destination),
            ),
        ).rejects.toThrow("abandon failed");

        expect(destinations).toEqual([]);
    });
});
