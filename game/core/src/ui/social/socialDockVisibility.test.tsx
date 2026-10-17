import { expect, mock, test } from "bun:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";

let authenticated = false;
let active = false;
let systemMenuMode = false;
let mockPortal = false;
mock.module("../auth/context/auth_context", () => ({
    useAuthContext: () => ({ authenticated, user: { is_active: active } }),
}));
mock.module("../PlayerPortal/mockPortal", () => ({ isMockPortalEnabled: () => mockPortal }));
mock.module("./systemControlsMode", () => ({
    getBattleSystemControlsActive: () => systemMenuMode,
    getBattleSystemControlsServerSnapshot: () => systemMenuMode,
    subscribeBattleSystemControls: () => () => {},
}));
mock.module("./SocialDockRuntime", () => ({ SocialDock: () => <div data-social-dock /> }));
const { SocialDock } = await import("./SocialDock");

test.each([
    { signedIn: false, enabled: false, system: false, preview: false, visible: false },
    { signedIn: true, enabled: true, system: false, preview: false, visible: true },
    { signedIn: true, enabled: false, system: false, preview: false, visible: false },
    { signedIn: false, enabled: false, system: true, preview: false, visible: true },
    { signedIn: false, enabled: false, system: false, preview: true, visible: true },
])(
    "dock visibility preserves signed-in=$signedIn, system=$system, preview=$preview",
    async ({ signedIn, enabled, system, preview, visible }) => {
        authenticated = signedIn;
        active = enabled;
        systemMenuMode = system;
        mockPortal = preview;
        const stream = await renderToReadableStream(<SocialDock />, { signal: AbortSignal.timeout(5000) });
        await stream.allReady;
        expect((await new Response(stream).text()).includes("data-social-dock")).toBe(visible);
    },
);
