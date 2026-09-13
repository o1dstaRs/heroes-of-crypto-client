import { PlayPhase, type PlayPlayerState, type PlaySnapshot } from "../api/play_protocol";
import { isAiSeatPlayerId } from "../utils/aiOpponent";

export interface OpponentConnectionNotice {
    playerId: string;
    team: number;
    /**
     * disconnected: gone, AI not yet driving; ai: the server's AI is playing their turns, either because they
     * left or because they stayed connected but missed their turns; back: in control again just now.
     */
    state: "disconnected" | "ai" | "back";
    /** Whether the seat's client is still connected. An `ai` seat can be connected but idle. */
    connected: boolean;
    /** Milliseconds until the AI takes the seat (only while `disconnected` and a takeover is armed). */
    takeoverInMs?: number;
    /** Milliseconds until the seat forfeits the fight, when the ranked forfeit rule applies. */
    forfeitInMs?: number;
}

const clampMs = (deadlineMs: number | undefined, nowServerMs: number): number | undefined =>
    deadlineMs && deadlineMs > 0 ? Math.max(0, deadlineMs - nowServerMs) : undefined;

/** A seat its human is driving right now: connected, and not handed to the server's AI. */
const isInControl = (player: PlayPlayerState): boolean => player.connected && !player.aiControlled;

/**
 * What the fight HUD should say about the OTHER seats' presence. A participant hears about their opponent;
 * an observer hears about every human seat. Bot seats are always AI-driven by design and are skipped. A
 * connected seat the server took over after missed turns is reported too, so an idle opponent never plays
 * on silently. The "back" notice is a transient the caller raises for a seat that is back in control.
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
            player.playerId !== aiSeatPlayerId &&
            !isAiSeatPlayerId(player.playerId) &&
            (viewerTeam === undefined || player.team !== viewerTeam),
    );
    const notices: OpponentConnectionNotice[] = [];
    for (const seat of seats) {
        if (isInControl(seat)) {
            if (recentlyReturned.has(seat.playerId)) {
                notices.push({ playerId: seat.playerId, team: seat.team, state: "back", connected: true });
            }
            continue;
        }
        notices.push({
            playerId: seat.playerId,
            team: seat.team,
            state: seat.aiControlled ? "ai" : "disconnected",
            connected: seat.connected,
            takeoverInMs: seat.aiControlled ? undefined : clampMs(seat.aiTakeoverAtMs, nowServerMs),
            forfeitInMs: seat.connected ? undefined : clampMs(seat.forfeitAtMs, nowServerMs),
        });
    }
    return notices;
};

/** Seats that were absent (disconnected or AI-driven) in the previous snapshot and are back in control now. */
export const returnedSeats = (
    previous: readonly PlayPlayerState[] | undefined,
    current: readonly PlayPlayerState[],
): string[] => {
    if (!previous) {
        return [];
    }
    const wasAbsent = new Set(previous.filter((player) => !isInControl(player)).map((player) => player.playerId));
    return current
        .filter((player) => isInControl(player) && wasAbsent.has(player.playerId))
        .map((player) => player.playerId);
};

export const formatCountdown = (ms: number): string => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
};
