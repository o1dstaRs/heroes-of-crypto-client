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
