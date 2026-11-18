import { afterAll, expect, mock, test } from "bun:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import type { PlaySnapshot } from "../../api/play_protocol";

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
const renderedFooters: React.ComponentProps<typeof controlsModule.GameSystemControls>[] = [];
mock.module("../GameSystemControls", () => ({
    ...controlsModule,
    GameSystemControls: (props: React.ComponentProps<typeof controlsModule.GameSystemControls>) => {
        renderedFooters.push(props);
        return (
            <div data-footer>
                {props.leading?.content}
                {props.center}
            </div>
        );
    },
}));
mock.module("./FightControlToggler", () => ({ default: () => null }));
mock.module("../DraggableToolbar", () => ({ default: () => null }));
mock.module("./FightLog", () => ({ FightLog: () => null }));
const { default: RightSideBar } = await import("./index");
const { RankedReadyPlacementButton } = await import("../RankedGameViewRuntime");
const { PlayPhase } = await import("../../api/play_protocol");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1200, innerHeight: 800 } });
afterAll(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
});

const renderFooter = async (content: React.ReactNode): Promise<string> => {
    const stream = await renderToReadableStream(
        <CacheProvider value={createCache({ key: "footer-parity" })}>
            <MemoryRouter>
                <React.Suspense fallback={null}>{content}</React.Suspense>
            </MemoryRouter>
        </CacheProvider>,
        { signal: AbortSignal.timeout(5000) },
    );
    await stream.allReady;
    return new Response(stream).text();
};

// Owner intent: PR #205 keeps main's footer geometry across phases. In particular, Ready
// stays centred without a guide, and the Premium controls keep room to wrap beside the medallions.
test("INTENDED: setup, ranked placement and combat forward main's footer layout", async () => {
    const ready = <button>READY PLACEMENT</button>;
    const panel = <div data-ranked-panel />;
    const guide = { content: <button>Strategy guide</button>, width: 126 };
    const cases = [
        {
            started: false,
            premium: false,
            footer: ready,
            panel: undefined,
            leading: undefined,
            centred: true,
            width: 224,
        },
        { started: false, premium: false, footer: ready, panel: undefined, leading: guide, centred: true, width: 224 },
        { started: false, premium: false, footer: ready, panel, leading: undefined, centred: true, width: 224 },
        { started: true, premium: true, footer: undefined, panel, leading: undefined, centred: false, width: 176 },
        {
            started: true,
            premium: false,
            footer: undefined,
            panel,
            leading: undefined,
            centred: false,
            width: undefined,
        },
        {
            started: false,
            premium: false,
            footer: undefined,
            panel: undefined,
            leading: undefined,
            centred: false,
            width: undefined,
        },
    ];
    for (const sample of cases) {
        active = sample.premium;
        renderedFooters.length = 0;
        const html = await renderFooter(
            <RightSideBar
                gameStarted={sample.started}
                rankedFooter={sample.footer}
                rankedPanel={sample.panel}
                footerLeading={sample.leading}
                showPremiumFightControls
                windowSize={{ width: 1200, height: 800 }}
            />,
        );
        const renderedFooter = renderedFooters.at(-1);
        expect(renderedFooter).toBeDefined();
        expect(renderedFooter?.rightStack).toBe(true);
        expect(renderedFooter?.centerInRow).toBe(sample.centred);
        expect(renderedFooter?.centerMinWidth).toBe(sample.width);
        expect(renderedFooter?.leading).toBe(sample.leading);
        expect(html.includes("Strategy guide")).toBe(Boolean(sample.leading));
        expect(html.includes("data-premium-controls")).toBe(sample.started && sample.premium);
    }
});

test("INTENDED: Ready keeps main's text-scaled 44px minimum instead of the 35.2px corner plate", async () => {
    const html = await renderFooter(
        <RankedReadyPlacementButton
            canSubmit
            ready={false}
            snapshot={{ phase: PlayPhase.PLACEMENT, placementDeadlineMs: 0 } as PlaySnapshot}
            submitProtocolAction={async () => true}
        />,
    );
    expect(html).toContain("READY PLACEMENT");
    expect(html).toMatch(/height:max\(44px,\s*calc\(2\.2em\s*\+\s*8px\)\)/);
    expect(html).toMatch(/min-height:max\(44px,\s*calc\(2\.2em\s*\+\s*8px\)\)/);
    expect(html).not.toContain("max-height:35.2px");
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
