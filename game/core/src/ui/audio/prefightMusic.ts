/**
 * Whether the pre-fight track ("Iron and Silk") should be playing: true from the moment a ranked match is
 * found until the fight itself begins — the match-found check, picks and augments, then placement.
 *
 * A tiny store rather than context because ThemeMusic is mounted ABOVE the router (one long-lived <audio>
 * that survives navigation), so it sits outside every provider the game screens render inside. The screens
 * that know the phase push it here; the player reads it.
 *
 * Setting it is idempotent and cheap, so callers can fire it from a render or an effect without guarding.
 */
type Listener = (active: boolean) => void;

let active = false;
const listeners = new Set<Listener>();

/** Called by the ranked screens as they enter and leave the pre-fight phases. */
export const setPrefightMusicActive = (next: boolean): void => {
    if (next === active) {
        return;
    }
    active = next;
    for (const listener of listeners) {
        listener(active);
    }
};

export const isPrefightMusicActive = (): boolean => active;

/** Subscribe; the listener is called immediately with the current value. Returns an unsubscribe. */
export const subscribePrefightMusic = (listener: Listener): (() => void) => {
    listeners.add(listener);
    listener(active);
    return () => {
        listeners.delete(listener);
    };
};

/**
 * What the draft route does with the flag: on for the match check and the draft, off without a game or behind its
 * error overlay. Once the match is in play it leaves the flag alone (`undefined`) for the board view, which knows the
 * phase. Turning it off at the handoff swapped in the menu playlist, and the board then restarted "Iron and Silk"
 * from its first bar.
 */
export const draftRoutePrefightMusic = ({
    gameId,
    showOverlay,
    routeMode,
}: {
    gameId?: string;
    showOverlay: boolean;
    routeMode: "checking" | "pick" | "play";
}): boolean | undefined => {
    if (!gameId || showOverlay) {
        return false;
    }
    return routeMode === "play" ? undefined : true;
};

/**
 * What the ranked board view does with the flag: on through placement, off once the fight starts and for a replay
 * (the outcome is decided, so there is no tension to score). While its first snapshot is still loading it leaves the
 * flag as the draft left it (`undefined`), so the track plays straight through the handoff.
 */
export const boardViewPrefightMusic = ({
    replayOnly,
    hasSnapshot,
    gameStarted,
}: {
    replayOnly: boolean;
    hasSnapshot: boolean;
    gameStarted: boolean;
}): boolean | undefined => {
    if (replayOnly || gameStarted) {
        return false;
    }
    return hasSnapshot ? true : undefined;
};
