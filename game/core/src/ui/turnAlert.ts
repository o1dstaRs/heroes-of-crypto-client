import { PlayPhase, type PlaySnapshot } from "../api/play_protocol";

/**
 * "It's your turn" for a player who is no longer looking at the tab. Same two signals as the match-ready
 * alert: the tab title flashes for everyone, an OS notification fires only when the tab is genuinely not
 * being watched. Both are silent: game audio stays limited to the interface cues the owner asked for.
 */

export const YOUR_TURN_NOTIFICATION_TAG = "hoc-your-turn";
export const YOUR_TURN_TITLE = "⚔ Your turn!";
const FLASH_INTERVAL_MS = 1000;

/**
 * A key that changes once per activation of one of the viewer's units during the fight, and is empty
 * whenever it is not the viewer's turn. Comparing successive keys tells a fresh "your turn" from a
 * snapshot that merely repeats the current one.
 */
export const yourTurnActivationKey = (
    snapshot: Pick<PlaySnapshot, "gameId" | "phase" | "currentTurnTeam" | "currentUnitId" | "currentTurnStartMs">,
    userTeam: number,
): string =>
    snapshot.phase === PlayPhase.PLAY && snapshot.currentTurnTeam === userTeam && !!snapshot.currentUnitId
        ? `${snapshot.gameId}:${snapshot.currentUnitId}:${snapshot.currentTurnStartMs}`
        : "";

const canNotify = (): boolean => typeof Notification !== "undefined" && Notification.permission === "granted";

export const isTabUnwatched = (): boolean =>
    typeof document !== "undefined" && (document.hidden || (document.hasFocus ? !document.hasFocus() : false));

let flashTimer: ReturnType<typeof setInterval> | undefined;
let restoreTitle: string | undefined;
let liveNotification: Notification | undefined;

/** Flash the tab title (and toast the OS when the tab is not being watched) until clearTurnAlert. */
export const signalYourTurn = (unitName: string): void => {
    if (typeof document === "undefined") {
        return;
    }
    if (flashTimer === undefined) {
        restoreTitle = document.title;
        let showingAlert = false;
        flashTimer = setInterval(() => {
            showingAlert = !showingAlert;
            document.title = showingAlert ? YOUR_TURN_TITLE : (restoreTitle ?? document.title);
        }, FLASH_INTERVAL_MS);
        document.title = YOUR_TURN_TITLE;
    }
    if (!canNotify() || !isTabUnwatched()) {
        return;
    }
    try {
        liveNotification?.close();
        liveNotification = new Notification("Heroes of Crypto — your turn", {
            body: unitName ? `${unitName} is waiting for your order.` : "Your unit is waiting for your order.",
            tag: YOUR_TURN_NOTIFICATION_TAG,
            silent: true,
        });
        liveNotification.onclick = () => {
            window.focus();
            liveNotification?.close();
        };
    } catch {
        /* Some browsers only allow notifications from a service worker; the title flash still fires. */
    }
};

export const clearTurnAlert = (): void => {
    if (flashTimer !== undefined) {
        clearInterval(flashTimer);
        flashTimer = undefined;
    }
    if (restoreTitle !== undefined && typeof document !== "undefined") {
        document.title = restoreTitle;
    }
    restoreTitle = undefined;
    try {
        liveNotification?.close();
    } catch {
        /* already dismissed */
    }
    liveNotification = undefined;
};
