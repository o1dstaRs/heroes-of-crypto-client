import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { TeamVals } from "@heroesofcrypto/common";
import { afterAll, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

mock.module("./useFullscreenActive", () => ({ useFullscreenActive: () => false }));
const { PickMatchupOverlay } = await import("./MatchupOverlay");

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let preference = "seat";
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => (key === "hoc.ranked.boardSide" ? preference : null) },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

test.each([
    { side: "seat", youFirst: true },
    { side: "left", youFirst: true },
    { side: "right", youFirst: false },
])("draft identity strip follows the player's $side board preference", ({ side, youFirst }) => {
    preference = side;
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "matchup-preservation" })}>
            <PickMatchupOverlay gameId="match" userTeam={TeamVals.LEFT} opponentLabel="Dreadwolf" />
        </CacheProvider>,
    );
    expect(html.includes("You")).toBe(true);
    expect(html.includes("Dreadwolf")).toBe(true);
    expect(html.indexOf("You") < html.indexOf("Dreadwolf")).toBe(youFirst);
});
