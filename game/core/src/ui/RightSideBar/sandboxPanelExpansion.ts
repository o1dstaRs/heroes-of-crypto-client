export type SandboxPanel = "augments" | "artifacts";

export interface SandboxPanelExpansion {
    augmentsOpen: boolean;
    artifactsOpen: boolean;
}

/** Start with both tools visible; the mounted sidebar may collapse Artifacts if the real layout overflows. */
export const DEFAULT_SANDBOX_PANEL_EXPANSION: Readonly<SandboxPanelExpansion> = {
    augmentsOpen: true,
    artifactsOpen: true,
};

/** Toggle one tool without changing the other, so all four open/closed combinations stay reachable. */
export const toggleSandboxPanel = (current: SandboxPanelExpansion, panel: SandboxPanel): SandboxPanelExpansion =>
    panel === "augments"
        ? { ...current, augmentsOpen: !current.augmentsOpen }
        : { ...current, artifactsOpen: !current.artifactsOpen };

/** A one-pixel tolerance avoids collapsing a panel for fractional browser-layout rounding. */
export const sandboxSidebarOverflowsVertically = ({
    clientHeight,
    scrollHeight,
}: Pick<HTMLElement, "clientHeight" | "scrollHeight">): boolean => clientHeight > 0 && scrollHeight > clientHeight + 1;

/** Keep both defaults when they fit; otherwise preserve Augments and fold the larger Artifact grid. */
export const fitSandboxPanelExpansion = (
    current: SandboxPanelExpansion,
    metrics: Pick<HTMLElement, "clientHeight" | "scrollHeight">,
): SandboxPanelExpansion =>
    current.artifactsOpen && sandboxSidebarOverflowsVertically(metrics)
        ? { ...current, artifactsOpen: false }
        : current;
