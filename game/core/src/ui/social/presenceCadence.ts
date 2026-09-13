/**
 * How often the presence ping runs. The ping is also the only channel for invites and the tray badge, so
 * a tab someone is actually looking at polls briskly — an invite waiting half a minute reads as broken —
 * while a hidden or unfocused tab keeps the old easy cadence and only costs the server a heartbeat.
 */
export const PRESENCE_PING_FOCUSED_MS = 8_000;
export const PRESENCE_PING_IDLE_MS = 25_000;

export const presencePingIntervalMs = (state: { visible: boolean; focused: boolean }): number =>
    state.visible && state.focused ? PRESENCE_PING_FOCUSED_MS : PRESENCE_PING_IDLE_MS;

/** What the browser reports right now; the server-side snapshot counts as idle. */
export const currentPresenceAttention = (): { visible: boolean; focused: boolean } => {
    if (typeof document === "undefined") {
        return { visible: false, focused: false };
    }
    return { visible: !document.hidden, focused: document.hasFocus ? document.hasFocus() : true };
};
