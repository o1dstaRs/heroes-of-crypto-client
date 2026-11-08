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
mock.module("../premium/PremiumAccess", () => ({ usePremiumAccess: () => ({ active }) }));
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

test("sandbox setup and combat keep Start over beside one exit when restarting is available", async () => {
    for (const signedIn of [false, true]) {
        authenticated = signedIn;
        for (const enabled of [false, true]) {
            active = enabled;
            for (const gameStarted of [false, true]) {
                for (const canStartOver of [false, true]) {
                    const tree = (
                        <CacheProvider value={createCache({ key: "fight-exit" })}>
                            <MemoryRouter>
                                <React.Suspense fallback={null}>
                                    <RightSideBar
                                        gameStarted={gameStarted}
                                        showPremiumFightControls
                                        onClose={gameStarted ? undefined : () => {}}
                                        onStartOver={canStartOver ? () => {} : undefined}
                                        windowSize={{ width: 1200, height: 800 }}
                                    />
                                </React.Suspense>
                            </MemoryRouter>
                        </CacheProvider>
                    );
                    const stream = await renderToReadableStream(tree, { signal: AbortSignal.timeout(5000) });
                    await stream.allReady;
                    const html = await new Response(stream).text();
                    const exitLabel = gameStarted ? "Exit fight" : "Back";
                    expect(html.match(new RegExp(`aria-label="${exitLabel}"`, "g"))).toHaveLength(1);
                    expect(html.match(/aria-label="Start over"/g) ?? []).toHaveLength(canStartOver ? 1 : 0);
                    expect(html.includes("data-premium-controls")).toBe(gameStarted && enabled);
                }
            }
        }
    }
});
