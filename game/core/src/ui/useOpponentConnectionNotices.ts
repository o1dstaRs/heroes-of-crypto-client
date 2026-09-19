import { useEffect, useMemo, useRef, useState } from "react";

import type { PlaySnapshot } from "../api/play_protocol";
import { opponentConnectionNotices, returnedSeats, type OpponentConnectionNotice } from "./opponentConnection";
import { startVisibleInterval } from "./visibleInterval";

const RETURNED_NOTICE_MS = 5_000;

/**
 * The other seats' presence, ticking once a second. The server emits the connect/disconnect events and runs
 * the takeover and forfeit clocks; deadlines arrive as server time, so the countdown is measured against the
 * snapshot's server clock plus the local time elapsed since it landed. A seat that comes back raises a short
 * "back" notice this hook keeps alive for a few seconds — the snapshot itself only says "in control again".
 */
export const useOpponentConnectionNotices = (
    snapshot: Pick<PlaySnapshot, "phase" | "fightFinished" | "players" | "serverTimeMs"> | null | undefined,
    viewerTeam: number | undefined,
    aiSeatPlayerId: string | undefined,
): OpponentConnectionNotice[] => {
    const receivedAtRef = useRef(Date.now());
    const previousPlayersRef = useRef<PlaySnapshot["players"] | undefined>(undefined);
    // An expiry per seat rather than a timeout: during a fight the next snapshot lands within the notice's
    // few seconds, and a timeout cancelled by that re-render used to leave "is back" on screen for good.
    const [returnedUntilMs, setReturnedUntilMs] = useState<ReadonlyMap<string, number>>(() => new Map());
    const [nowMs, setNowMs] = useState(Date.now());

    const players = snapshot?.players;

    useEffect(() => {
        if (!players) {
            return;
        }
        receivedAtRef.current = Date.now();
        const back = returnedSeats(previousPlayersRef.current, players);
        previousPlayersRef.current = players;
        if (!back.length) {
            return;
        }
        const until = Date.now() + RETURNED_NOTICE_MS;
        setReturnedUntilMs((current) => {
            const next = new Map(current);
            for (const playerId of back) {
                next.set(playerId, until);
            }
            return next;
        });
    }, [players]);

    useEffect(() => startVisibleInterval(() => setNowMs(Date.now()), 1000), []);

    return useMemo(() => {
        if (!snapshot) {
            return [];
        }
        const returned = new Set(
            [...returnedUntilMs].filter(([, untilMs]) => untilMs > nowMs).map(([playerId]) => playerId),
        );
        const nowServerMs = snapshot.serverTimeMs + (nowMs - receivedAtRef.current);
        return opponentConnectionNotices(snapshot, viewerTeam, aiSeatPlayerId, nowServerMs, returned);
    }, [aiSeatPlayerId, nowMs, returnedUntilMs, snapshot, viewerTeam]);
};
