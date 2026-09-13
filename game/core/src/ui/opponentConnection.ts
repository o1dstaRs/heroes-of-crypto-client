import { PlayPhase, type PlayPlayerState, type PlaySnapshot } from "../api/play_protocol";

export interface OpponentConnectionNotice {
    playerId: string;
    team: number;
    /** disconnected: gone, AI not yet driving; ai: the AI is playing their turns; back: reconnected just now. */
    state: "disconnected" | "ai" | "back";
    /** Milliseconds until the AI takes the seat (only while `disconnected` and a takeover is armed). */
    takeoverInMs?: number;
    /** Milliseconds until the seat forfeits the fight, when the ranked forfeit rule applies. */
    forfeitInMs?: number;
}

const clampMs = (deadlineMs: number | undefined, nowServerMs: number): number | undefined =>
    deadlineMs && deadlineMs > 0 ? Math.max(0, deadlineMs - nowServerMs) : undefined;

/**
 * What the fight HUD should say about the OTHER seats' presence. A participant hears about their opponent;
 * an observer hears about every human seat. Persistent bot seats never disconnect and are skipped. The
 * "back" notice is a transient the caller raises for a seat that flipped from absent to present.
 */
export const opponentConnectionNotices = (
    snapshot: Pick<PlaySnapshot, "phase" | "fightFinished" | "players">,
    viewerTeam: number | undefined,
    aiSeatPlayerId: string | undefined,
    nowServerMs: number,
    recentlyReturned: ReadonlySet<string>,
): OpponentConnectionNotice[] => {
    if (snapshot.fightFinished || (snapshot.phase !== PlayPhase.PLACEMENT && snapshot.phase !== PlayPhase.PLAY)) {
        return [];
    }
    const seats = snapshot.players.filter(
        (player: PlayPlayerState) =>
            player.playerId !== aiSeatPlayerId && (viewerTeam === undefined || player.team !== viewerTeam),
    );
    const notices: OpponentConnectionNotice[] = [];
    for (const seat of seats) {
        if (seat.connected) {
            if (recentlyReturned.has(seat.playerId)) {
                notices.push({ playerId: seat.playerId, team: seat.team, state: "back" });
            }
            continue;
        }
        notices.push({
            playerId: seat.playerId,
            team: seat.team,
            state: seat.aiControlled ? "ai" : "disconnected",
            takeoverInMs: seat.aiControlled ? undefined : clampMs(seat.aiTakeoverAtMs, nowServerMs),
            forfeitInMs: clampMs(seat.forfeitAtMs, nowServerMs),
        });
    }
    return notices;
};

/** Seats that were absent in the previous snapshot and are present now. */
export const returnedSeats = (
    previous: readonly PlayPlayerState[] | undefined,
    current: readonly PlayPlayerState[],
): string[] => {
    if (!previous) {
        return [];
    }
    const wasAbsent = new Set(previous.filter((player) => !player.connected).map((player) => player.playerId));
    return current
        .filter((player) => player.connected && wasAbsent.has(player.playerId))
        .map((player) => player.playerId);
};

export const formatCountdown = (ms: number): string => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
};
