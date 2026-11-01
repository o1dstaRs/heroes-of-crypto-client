import { afterAll, expect, mock, test } from "bun:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";

let active = true;
let authenticated = true;
const managerModule = await import("../../pixi/PixiGameManager");
mock.module("../../pixi/PixiGameManager", () => ({
    ...managerModule,
    usePixiManager: () => ({ GetCurrentDamageStatistics: () => [] }),
}));
const authModule = await import("../auth/context/auth_context");
mock.module("../auth/context/auth_context", () => ({
    ...authModule,
    useAuthContext: () => ({ authenticated }),
}));
const accessModule = await import("../premium/PremiumAccess");
mock.module("../premium/PremiumAccess", () => ({ ...accessModule, usePremiumAccess: () => ({ active }) }));
mock.module("../premium/usePremiumPreference", () => ({
    usePremiumPreference: () => true,
    usePremiumCapability: () => true,
}));
mock.module("../premium/PremiumFightControls", () => ({
    PremiumFightControls: () => <div data-premium-controls />,
}));
const controlsModule = await import("../GameSystemControls");
mock.module("../GameSystemControls", () => ({
    ...controlsModule,
    GameSystemControls: ({ center }: { center?: React.ReactNode }) => <div data-footer>{center}</div>,
}));
mock.module("./FightControlToggler", () => ({ default: () => null }));
mock.module("../DraggableToolbar", () => ({ default: () => null }));
mock.module("./FightLog", () => ({ FightLog: () => null }));
const { default: RightSideBar } = await import("./index");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1200, innerHeight: 800 } });
afterAll(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
});

test("sandbox fight keeps exactly one exit beside Premium controls for signed-in and anonymous players", async () => {
    for (const signedIn of [false, true]) {
        authenticated = signedIn;
        for (const enabled of [false, true]) {
            active = enabled;
            const tree = (
                <CacheProvider value={createCache({ key: "fight-exit" })}>
                    <MemoryRouter>
                        <React.Suspense fallback={null}>
                            <RightSideBar
                                gameStarted
                                showPremiumFightControls
                                onStartOver={() => {}}
                                windowSize={{ width: 1200, height: 800 }}
                            />
                        </React.Suspense>
                    </MemoryRouter>
                </CacheProvider>
            );
            const stream = await renderToReadableStream(tree, { signal: AbortSignal.timeout(5000) });
            await stream.allReady;
            const html = await new Response(stream).text();
            expect(html.match(/aria-label="Exit fight"/g)).toHaveLength(1);
            expect(html).not.toContain('aria-label="Start over"');
            expect(html.includes("data-premium-controls")).toBe(enabled);
        }
    }
});
