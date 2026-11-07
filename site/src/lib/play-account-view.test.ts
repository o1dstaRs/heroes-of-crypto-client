import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { playAccountFirstPaintScript, renderPlayAccount } from "./play-account-view";

const now = 1_800_000_000_000;
const token = (exp: number) => `fixture.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;

function view() {
    const elements = new Map<string, { hidden: boolean; textContent: string }>();
    for (const field of ["account", "guest", "username", "wins", "losses", "games"]) {
        elements.set(`[data-play-${field}]`, { hidden: field === "account", textContent: "" });
    }
    const root = { querySelector: (selector: string) => elements.get(selector) ?? null } as unknown as ParentNode;
    return { root, element: (field: string) => elements.get(`[data-play-${field}]`)! };
}

function firstPaint(stored: Record<string, string>, blocked = false) {
    const result = view();
    runInNewContext(playAccountFirstPaintScript(), {
        document: { currentScript: { parentElement: result.root } },
        localStorage: {
            getItem(key: string) {
                if (blocked) throw new Error("Storage disabled");
                return stored[key] ?? null;
            },
        },
        atob,
        Date: { now: () => now },
    });
    return result;
}

describe("play hub first paint", () => {
    test("shows the guest notice without waiting for a module or lobby request", () => {
        const result = firstPaint({});
        expect(result.element("guest").hidden).toBe(false);
        expect(result.element("account").hidden).toBe(true);
    });

    test("renders the cached account before the first paint without showing the guest prompt", () => {
        const result = firstPaint({
            accessToken: `Bearer ${token(now / 1000 + 60)}`,
            hocAuthUser: JSON.stringify({ username: "Returning player", wins: 7, losses: 3, total_games_played: 10 }),
        });
        expect(result.element("guest").hidden).toBe(true);
        expect(result.element("account").hidden).toBe(false);
        expect(result.element("username").textContent).toBe("Returning player");
        expect(result.element("wins").textContent).toBe("7");
        expect(result.element("losses").textContent).toBe("3");
        expect(result.element("games").textContent).toBe("10");
    });

    test("expired, malformed and absent tokens keep the guest view even with a cached profile", () => {
        for (const accessToken of [token(now / 1000), token(now / 1000 - 1), "not-a-session", "", "Bearer "]) {
            const result = firstPaint({ accessToken, hocAuthUser: JSON.stringify({ username: "Stale player" }) });
            expect(result.element("guest").hidden).toBe(false);
            expect(result.element("account").hidden).toBe(true);
        }
    });

    test("disabled storage and malformed profile JSON do not interrupt rendering", () => {
        expect(firstPaint({}, true).element("guest").hidden).toBe(false);
        for (const hocAuthUser of ["{broken", "null", "42", '{"username":42}']) {
            const result = firstPaint({ accessToken: token(now / 1000 + 60), hocAuthUser });
            expect(result.element("guest").hidden).toBe(true);
            expect(result.element("account").hidden).toBe(false);
            expect(result.element("username").textContent).toBe("Account");
        }
    });

    test("later auth changes keep both panels synchronized", () => {
        const result = view();
        renderPlayAccount(result.root, true, { wins: 2 }, "New player");
        expect(result.element("account").hidden).toBe(false);
        expect(result.element("guest").hidden).toBe(true);
        expect(result.element("wins").textContent).toBe("2");
        renderPlayAccount(result.root, false, null, "Account");
        expect(result.element("account").hidden).toBe(true);
        expect(result.element("guest").hidden).toBe(false);
    });

    test("the inline source contains no session data and runs immediately after the notice markup", async () => {
        expect(playAccountFirstPaintScript()).not.toContain(token(now / 1000 + 60));
        const page = await Bun.file(new URL("../pages/play.astro", import.meta.url)).text();
        expect(page).toContain('<p class="play-account-guest" data-play-guest>');
        const initial = page.indexOf("<script is:inline set:html={playAccountFirstPaintScript()}");
        expect(initial).toBeGreaterThan(page.indexOf("data-play-guest>"));
        expect(initial).toBeLessThan(page.indexOf('class="mode-card-grid"'));
    });
});
