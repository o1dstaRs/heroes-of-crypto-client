import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import type { PremiumAdvice } from "../../api/premium_client";
import { PremiumPreviewContext } from "./PremiumPreviewContext";

const preferences = await import("./usePremiumPreference");
mock.module("./usePremiumPreference", () => ({ ...preferences, usePremiumCapability: () => true }));
const { PremiumSetupPanel, loadPremiumDraftPlanner } = await import("./PremiumAdvisor");
// The app loads the planner as Premium advice arrives; render it synchronously as the app does after that.
await loadPremiumDraftPlanner();

const render = (stage: "setup" | "board", active = true) => {
    const advice = {
        entitlement: { active, reason: "test" },
        stage,
        canUndo: true,
        reasons: ["Formation spacing"],
    } as PremiumAdvice;
    return renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "premium-controls" })}>
            <PremiumPreviewContext.Provider value={advice}>
                <PremiumSetupPanel
                    gameId="fixture"
                    stageKey={stage}
                    setupView={stage === "setup"}
                    draft={{
                        picked: [],
                        opponentPicked: [],
                        artifactTier1: 0,
                        artifactTier2: 0,
                        isYourTurn: false,
                        setup: { placement: 0, amounts: {}, augments: [] },
                    }}
                >
                    <span>BOARD CONTENT</span>
                </PremiumSetupPanel>
            </PremiumPreviewContext.Provider>
        </CacheProvider>,
    );
};

test("ranked board guidance retains Arrange, Undo, reasons and the board content", () => {
    const html = render("board");
    for (const label of ["Arrange army", "Undo", "Why this recommendation?", "Formation spacing", "BOARD CONTENT"])
        expect(html).toContain(label);
});

test("the setup view retains its build action and comparison layout beside the army controls", () => {
    const html = render("setup");
    expect(html).toContain("Use recommended build");
    expect(html).toContain("premium-setup-layout");
    expect(html).toContain("BOARD CONTENT");
    expect(html).toContain("data-premium-draft-planner");
    expect(html).toContain("Army planner");
});

test("the projected setup remains gated by Premium and does not cover the actual placement board", () => {
    expect(render("setup", false)).not.toContain("data-premium-draft-planner");
    expect(render("board")).not.toContain("data-premium-draft-planner");
});
