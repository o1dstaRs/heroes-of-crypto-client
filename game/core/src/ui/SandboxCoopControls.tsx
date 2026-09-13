import type { PlaySnapshot } from "../api/play_protocol";
import type { SandboxCoopSession } from "../api/sandbox_coop_client";

/** READY_PLACEMENT carrying this reason takes the seat back out of ready (mirrors the server constant). */
export const SANDBOX_UNREADY_REASON = "unready";

export interface SandboxCoopSeatStatus {
    username: string;
    team: number;
    isViewer: boolean;
    connected: boolean;
    ready: boolean;
}

/**
 * The two seats as the live snapshot reports them, with the invite's usernames on top. The ranked view
 * shows them on the usual matchup strip (MatchupOverlay) with a Ready / Not ready / Away note each.
 */
export const sandboxCoopSeatStatuses = (
    session: SandboxCoopSession,
    snapshot: Pick<PlaySnapshot, "players" | "readyPlayerIds"> | null,
    viewerTeam: number | undefined,
): SandboxCoopSeatStatus[] =>
    [session.host, session.guest].map((seat) => {
        const live = snapshot?.players.find((player) => player.playerId === seat.playerId);
        return {
            username: seat.username,
            team: seat.team,
            isViewer: seat.team === viewerTeam,
            connected: live ? live.connected : seat.connected,
            ready: snapshot ? snapshot.readyPlayerIds.includes(seat.playerId) : seat.ready,
        };
    });
