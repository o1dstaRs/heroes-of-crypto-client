export type LavaPitVisualMode = "burning" | "extinguished";

export const LAVA_PIT_VISUAL_MODE_STORAGE_KEY = "hoc-dev-lava-pit-visual-mode-v1";
export const LAVA_PIT_VISUAL_MODE_EVENT = "hoc-dev-lava-pit-visual-mode-change";
export const DEFAULT_LAVA_PIT_VISUAL_MODE: LavaPitVisualMode = "burning";

export const normalizeLavaPitVisualMode = (value: unknown): LavaPitVisualMode =>
    value === "extinguished" ? "extinguished" : DEFAULT_LAVA_PIT_VISUAL_MODE;

export const readStoredLavaPitVisualMode = (): LavaPitVisualMode => {
    if (typeof window === "undefined") return DEFAULT_LAVA_PIT_VISUAL_MODE;
    return normalizeLavaPitVisualMode(window.localStorage.getItem(LAVA_PIT_VISUAL_MODE_STORAGE_KEY));
};

export const writeStoredLavaPitVisualMode = (mode: LavaPitVisualMode): LavaPitVisualMode => {
    const normalized = normalizeLavaPitVisualMode(mode);
    if (typeof window !== "undefined") {
        window.localStorage.setItem(LAVA_PIT_VISUAL_MODE_STORAGE_KEY, normalized);
        window.dispatchEvent(new CustomEvent<LavaPitVisualMode>(LAVA_PIT_VISUAL_MODE_EVENT, { detail: normalized }));
    }
    return normalized;
};

/** A saved editor choice must never leak into a production fight. */
export const resolveLavaPitVisualMode = (): LavaPitVisualMode =>
    import.meta.env.DEV ? readStoredLavaPitVisualMode() : DEFAULT_LAVA_PIT_VISUAL_MODE;

/** The editor may preview either state; every normal sandbox/game surface starts with burning lava. */
export const lavaPitVisualModeForScene = (editorActive: boolean, editorMode: LavaPitVisualMode): LavaPitVisualMode =>
    editorActive ? editorMode : DEFAULT_LAVA_PIT_VISUAL_MODE;

/** The approved ordinary-map look is animated fire; the editor may still hide it for comparison. */
export const lavaPitFireEnabledForScene = (editorActive: boolean, editorFireEnabled: boolean): boolean =>
    editorActive ? editorFireEnabled : true;

export const lavaPitVisualState = (
    centerDried: boolean,
    mode: LavaPitVisualMode,
): { liveFire: boolean; extinguishedPit: boolean } => ({
    liveFire: !centerDried && mode === "burning",
    // A dried centre is the authoritative in-battle extinguished state. The editor can also preview it early.
    extinguishedPit: centerDried || mode === "extinguished",
});

/** Disabling an individual fire layer must not substitute the post-extinguish pit artwork. */
export const shouldUseExtinguishedPitLayers = (
    state: ReturnType<typeof lavaPitVisualState>,
    _burningFireVisible: boolean,
): boolean => state.extinguishedPit;
