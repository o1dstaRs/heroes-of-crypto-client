import { describe, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    playerPortalArtifactInfo,
    playerPortalCreatureLineupLabel,
    playerPortalExitAccount,
    playerPortalMostPlayedFirst,
} from "./PlayerPortalPage";
import { renderProfileForm, renderProfileSummaryStats } from "./profilePresentation";

describe("shared profile presentation", () => {
    test("puts the most recent scored result at the end of the ten-match strip", () => {
        const markup = renderProfileForm(["win", "none", "loss", "draw"], {
            title: "Last 10 matches",
            win: "Win",
            loss: "Loss",
            draw: "Draw",
            empty: "No match",
        });
        expect([...markup.matchAll(/data-result="([^"]+)"/g)].map(([, result]) => result)).toEqual([
            "empty",
            "empty",
            "empty",
            "empty",
            "empty",
            "empty",
            "empty",
            "draw",
            "loss",
            "win",
        ]);
        expect(markup).toContain('aria-label="Last 10 matches, 1 Win, 1 Draw, 1 Loss"');
    });

    test("shares the summary label order and leaves an empty record's win rate unavailable", () => {
        const markup = renderProfileSummaryStats(
            { games: 0, wins: 0, losses: 0, winRate: 0 },
            { games: "Games", wins: "Wins", losses: "Losses", winRate: "Win rate" },
            "en",
        );
        expect([...markup.matchAll(/<dt>([^<]+)<\/dt>/g)].map(([, label]) => label)).toEqual([
            "Games",
            "Wins",
            "Losses",
            "Win rate",
        ]);
        expect(markup).toContain("<dt>Win rate</dt><dd>—</dd>");
    });
});

describe("player portal exit account", () => {
    const spies = () => {
        const cleared: (string | null)[] = [];
        let redirects = 0;
        return {
            cleared,
            clearSession: (token: string | null) => cleared.push(token),
            redirect: () => {
                redirects += 1;
            },
            redirectCount: () => redirects,
        };
    };

    test("a successful sign-out leaves the session to the auth service and lands on the login screen", async () => {
        const spy = spies();
        let loggedOut = 0;

        await playerPortalExitAccount({
            logout: async () => {
                loggedOut += 1;
            },
            clearSession: spy.clearSession,
            redirect: spy.redirect,
        });

        expect(loggedOut).toBe(1);
        expect(spy.cleared).toEqual([]);
        expect(spy.redirectCount()).toBe(1);
    });

    /** A failed call used to strand the player inside an account they asked to leave. */
    test("a failed sign-out still drops this browser's credentials", async () => {
        const spy = spies();

        await playerPortalExitAccount({
            logout: async () => {
                throw new Error("network down");
            },
            clearSession: spy.clearSession,
            redirect: spy.redirect,
        });

        expect(spy.cleared).toEqual([null]);
        expect(spy.redirectCount()).toBe(1);
    });

    test("a missing auth context is treated as a failed sign-out, not as success", async () => {
        const spy = spies();

        await playerPortalExitAccount({
            logout: undefined,
            clearSession: spy.clearSession,
            redirect: spy.redirect,
        });

        expect(spy.cleared).toEqual([null]);
        expect(spy.redirectCount()).toBe(1);
    });
});

describe("player portal artifact history", () => {
    test("resolves retired artifacts from the compatibility catalog", () => {
        expect(playerPortalArtifactInfo(1, 12)).toMatchObject({
            name: "Broken Aegis",
            imageKey: "artifact_t1_broken_aegis_256",
        });
    });

    test("does not invent metadata for an unknown historical id", () => {
        expect(playerPortalArtifactInfo(2, 999)).toBeUndefined();
    });
});

describe("player portal strategy labels", () => {
    test("names every creature in a combo and removes duplicate portraits", () => {
        expect(playerPortalCreatureLineupLabel([CreatureVals.ELF, CreatureVals.MERMAID, CreatureVals.ELF])).toBe(
            "Elf + Mermaid",
        );
    });
});

describe("player portal usage statistics", () => {
    test("sorts by games played and uses win rate only to break ties", () => {
        const stats = [
            { id: "perfect-small", games: 2, wins: 2 },
            { id: "most-played", games: 9, wins: 3 },
            { id: "tie-lower-rate", games: 5, wins: 2 },
            { id: "tie-higher-rate", games: 5, wins: 4 },
        ];

        expect(playerPortalMostPlayedFirst(stats).map(({ id }) => id)).toEqual([
            "most-played",
            "tie-higher-rate",
            "tie-lower-rate",
            "perfect-small",
        ]);
    });
});
