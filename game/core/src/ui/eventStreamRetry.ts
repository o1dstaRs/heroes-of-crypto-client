/** Reconnect delay after an ordinary drop of the live event stream (network blip, server restart). */
export const EVENT_STREAM_RETRY_MS = 1_200;

/**
 * Reconnect delay when the server turned the stream away with 429: the game already has as many spectators
 * as it accepts. Retrying every second would only add to the load that caused the refusal.
 */
export const SPECTATORS_FULL_RETRY_MS = 15_000;

/** How long to wait before reconnecting after the stream failed with HTTP `status` (0 when it never answered). */
export const eventStreamRetryDelayMs = (status: number): number =>
    status === 429 ? SPECTATORS_FULL_RETRY_MS : EVENT_STREAM_RETRY_MS;
