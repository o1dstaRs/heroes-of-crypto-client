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

/** A one-pixel tolerance avoids reacting to fractional browser-layout rounding. */
export const sandboxSidebarOverflowsVertically = ({
    clientHeight,
    scrollHeight,
}: Pick<HTMLElement, "clientHeight" | "scrollHeight">): boolean => clientHeight > 0 && scrollHeight > clientHeight + 1;

/**
 * Both tools stay as the player left them, overflow or not.
 *
 * This used to fold the Artifact grid the moment the setup tools outgrew the viewport, which meant
 * Artifacts silently closed themselves on shorter screens and the player had to re-open them every time.
 * The region they live in scrolls (FightControlToggler's `data-sandbox-scroll-region`, overflowY: auto),
 * so an overflow costs a scroll rather than clipping anything — there is nothing to protect them from.
 */
export const fitSandboxPanelExpansion = (
    current: SandboxPanelExpansion,
    _metrics: Pick<HTMLElement, "clientHeight" | "scrollHeight">,
): SandboxPanelExpansion => current;
