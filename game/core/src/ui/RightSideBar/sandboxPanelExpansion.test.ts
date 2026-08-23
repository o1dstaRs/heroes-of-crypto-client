import { describe, expect, test } from "bun:test";

import { DEFAULT_SANDBOX_PANEL_EXPANSION, toggleSandboxPanel } from "./sandboxPanelExpansion";

describe("sandbox right-sidebar panel expansion", () => {
    test("starts with Augments visible and Artifacts folded", () => {
        expect(DEFAULT_SANDBOX_PANEL_EXPANSION).toEqual({
            augmentsOpen: true,
            artifactsOpen: false,
        });
    });

    test("toggles each panel independently, allowing both collapsed and both expanded", () => {
        let state = { ...DEFAULT_SANDBOX_PANEL_EXPANSION };

        state = toggleSandboxPanel(state, "augments");
        expect(state).toEqual({ augmentsOpen: false, artifactsOpen: false });

        state = toggleSandboxPanel(state, "artifacts");
        expect(state).toEqual({ augmentsOpen: false, artifactsOpen: true });

        state = toggleSandboxPanel(state, "augments");
        expect(state).toEqual({ augmentsOpen: true, artifactsOpen: true });

        state = toggleSandboxPanel(state, "artifacts");
        expect(state).toEqual({ augmentsOpen: true, artifactsOpen: false });
    });
});
