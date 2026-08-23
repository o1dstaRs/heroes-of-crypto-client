export type SandboxPanel = "augments" | "artifacts";

export interface SandboxPanelExpansion {
    augmentsOpen: boolean;
    artifactsOpen: boolean;
}

/** Open directly in the compact, stable state used by the Sandbox team drawer. */
export const DEFAULT_SANDBOX_PANEL_EXPANSION: Readonly<SandboxPanelExpansion> = {
    augmentsOpen: true,
    artifactsOpen: false,
};

/** Toggle one tool without changing the other, so all four open/closed combinations stay reachable. */
export const toggleSandboxPanel = (current: SandboxPanelExpansion, panel: SandboxPanel): SandboxPanelExpansion =>
    panel === "augments"
        ? { ...current, augmentsOpen: !current.augmentsOpen }
        : { ...current, artifactsOpen: !current.artifactsOpen };
