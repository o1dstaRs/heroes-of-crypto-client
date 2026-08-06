import { describe, expect, test } from "bun:test";

import {
    DEFAULT_SANDBOX_PANEL_EXPANSION,
    fitSandboxPanelExpansion,
    sandboxSidebarOverflowsVertically,
    toggleSandboxPanel,
} from "./sandboxPanelExpansion";

describe("sandbox right-sidebar panel expansion", () => {
    test("starts with both Augments and Artifacts expanded", () => {
        expect(DEFAULT_SANDBOX_PANEL_EXPANSION).toEqual({
            augmentsOpen: true,
            artifactsOpen: true,
        });
    });

    test("toggles each panel independently, allowing both collapsed and both expanded", () => {
        let state = { ...DEFAULT_SANDBOX_PANEL_EXPANSION };

        state = toggleSandboxPanel(state, "augments");
        expect(state).toEqual({ augmentsOpen: false, artifactsOpen: true });

        state = toggleSandboxPanel(state, "artifacts");
        expect(state).toEqual({ augmentsOpen: false, artifactsOpen: false });

        state = toggleSandboxPanel(state, "augments");
        expect(state).toEqual({ augmentsOpen: true, artifactsOpen: false });

        state = toggleSandboxPanel(state, "artifacts");
        expect(state).toEqual({ augmentsOpen: true, artifactsOpen: true });
    });

    test("detects real vertical overflow with a one-pixel layout tolerance", () => {
        expect(sandboxSidebarOverflowsVertically({ clientHeight: 700, scrollHeight: 700 })).toBe(false);
        expect(sandboxSidebarOverflowsVertically({ clientHeight: 700, scrollHeight: 701 })).toBe(false);
        expect(sandboxSidebarOverflowsVertically({ clientHeight: 700, scrollHeight: 702 })).toBe(true);
        expect(sandboxSidebarOverflowsVertically({ clientHeight: 0, scrollHeight: 900 })).toBe(false);
    });

    test("keeps both defaults when they fit and folds only Artifacts when they do not", () => {
        const initial = { ...DEFAULT_SANDBOX_PANEL_EXPANSION };

        expect(fitSandboxPanelExpansion(initial, { clientHeight: 900, scrollHeight: 820 })).toEqual(initial);
        expect(fitSandboxPanelExpansion(initial, { clientHeight: 700, scrollHeight: 820 })).toEqual({
            augmentsOpen: true,
            artifactsOpen: false,
        });
    });
});
