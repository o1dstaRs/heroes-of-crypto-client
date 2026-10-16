/**
 * Whether a viewer watching a match read-only is actually seated in it after all.
 *
 * The game route drops into the observer view whenever it cannot confirm a seat — the session is not
 * restored yet, the "what am I playing" lookup throws, or it answers with a different match. On a reconnect
 * any of those is a blip rather than a verdict, and the observer view is otherwise a ONE-WAY DOOR: nothing
 * reopened the seat until the next match, so a moment's hiccup cost the player the rest of their draft
 * (owner, 20 Sep: "reconnect from time to time moves me into spectator").
 *
 * So the route asks again while it watches, and this says what the answer means. Seating is granted on
 * exactly the condition the normal path uses — the server itself calls this match the viewer's current one —
 * so a genuine spectator can never be seated by it.
 */

export interface SeatLookup {
    id?: string;
    team?: number;
    abandoned?: boolean;
}

export type SeatReclaimDecision = "seat" | "keep-watching";

export const seatReclaimDecision = (currentGame: SeatLookup | null | undefined, gameId: string): SeatReclaimDecision =>
    gameId && currentGame?.id === gameId && !currentGame.abandoned ? "seat" : "keep-watching";

/** How often the route re-asks while watching, and how many times before it settles for spectating. */
export const SEAT_RECLAIM_INTERVAL_MS = 3000;
export const SEAT_RECLAIM_ATTEMPTS = 5;
