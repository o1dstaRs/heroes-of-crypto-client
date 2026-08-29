/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/**
 * "Your ranked match is ready" — reaching a player who is no longer looking at the tab.
 *
 * Queuing is dead time, so people tab away, and the accept window is short: miss it and the server
 * hands out a no-accept cooldown. The in-app confirm dialog is invisible to a backgrounded tab and the
 * notification tray only reads once you are back, so neither covers the case that actually costs the
 * player something.
 *
 * Two signals, deliberately different in cost. The tab TITLE flashes for everyone — no permission, no
 * asset, and it is what a player sees when they glance at their tab strip. An OS notification fires only
 * when the tab is genuinely not being looked at, matching what SocialProvider already does for friend
 * requests: a desktop toast thrown over the page someone is staring at is noise, and the dialog is right
 * there.
 */

/** One tag for the whole session so a re-fire replaces the old toast instead of stacking a second one. */
export const MATCH_READY_NOTIFICATION_TAG = "hoc-match-ready";

/** How often the tab title alternates while a match waits. */
export const MATCH_READY_FLASH_INTERVAL_MS = 1000;

/**
 * Whether this stream tick is a match worth alerting about, and one we have not alerted for yet.
 *
 * The matchmaking stream repeats the pending game on every tick, so the id is the dedupe key: without it
 * the player gets a fresh toast every second of the accept window. A window already closed
 * (`secondsRemaining < 0`, the server's "expired" marker) is never worth announcing.
 */
export const isFreshMatchReady = (
    pendingGameId: string,
    alreadyAlertedGameId: string,
    secondsRemaining: number | null,
): boolean => {
    if (!pendingGameId || pendingGameId === alreadyAlertedGameId) {
        return false;
    }
    return secondsRemaining === null || secondsRemaining >= 0;
};

/** The attention-grabbing half of the flashing tab title. */
export const matchReadyTitle = (secondsRemaining: number | null): string =>
    secondsRemaining !== null && secondsRemaining > 0
        ? `(${Math.ceil(secondsRemaining)}s) ⚔ Match ready — accept!`
        : "⚔ Match ready — accept!";

const canNotify = (): boolean => typeof Notification !== "undefined" && Notification.permission === "granted";

const isTabUnwatched = (): boolean =>
    typeof document !== "undefined" && (document.hidden || (document.hasFocus ? !document.hasFocus() : false));

let flashTimer: ReturnType<typeof setInterval> | undefined;
let restoreTitle: string | undefined;
let liveNotification: Notification | undefined;
let flashSeconds: number | null = null;

/**
 * Ask for notification permission at the moment the player enters the queue.
 *
 * A real click, and the one moment where the reason is self-evident — asking on page load trains people
 * to deny it. Never re-asks once answered: "denied" is an answer, and the title flash still works.
 */
export const requestMatchReadyPermission = (): void => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") {
        return;
    }
    try {
        void Notification.requestPermission();
    } catch {
        /* Older browsers expose a callback-only form; the title flash covers them. */
    }
};

/**
 * Announce (or keep announcing) that a match is waiting.
 *
 * @param secondsRemaining what the stream last reported, for the countdown in the title.
 * @param notify true only on the first tick for a given match — see isFreshMatchReady.
 */
export const signalMatchReady = (secondsRemaining: number | null, notify: boolean): void => {
    flashSeconds = secondsRemaining;

    if (typeof document !== "undefined" && flashTimer === undefined) {
        restoreTitle = document.title;
        let showingAlert = false;
        flashTimer = setInterval(() => {
            showingAlert = !showingAlert;
            document.title = showingAlert ? matchReadyTitle(flashSeconds) : (restoreTitle ?? document.title);
        }, MATCH_READY_FLASH_INTERVAL_MS);
        document.title = matchReadyTitle(flashSeconds);
    }

    if (!notify || !canNotify() || !isTabUnwatched()) {
        return;
    }
    try {
        liveNotification = new Notification("Heroes of Crypto — match ready", {
            body:
                secondsRemaining !== null && secondsRemaining > 0
                    ? `Your ranked opponent is waiting. Accept within ${Math.ceil(secondsRemaining)}s.`
                    : "Your ranked opponent is waiting — accept now.",
            tag: MATCH_READY_NOTIFICATION_TAG,
            requireInteraction: true,
        });
        liveNotification.onclick = () => {
            window.focus();
            liveNotification?.close();
        };
    } catch {
        /* Some browsers only allow notifications from a service worker; the title flash still fires. */
    }
};

/** Stop announcing: the match was accepted, the window closed, or the player left the queue screen. */
export const clearMatchReadyAlert = (): void => {
    if (flashTimer !== undefined) {
        clearInterval(flashTimer);
        flashTimer = undefined;
    }
    if (restoreTitle !== undefined && typeof document !== "undefined") {
        document.title = restoreTitle;
    }
    restoreTitle = undefined;
    flashSeconds = null;
    try {
        liveNotification?.close();
    } catch {
        /* already dismissed */
    }
    liveNotification = undefined;
};
