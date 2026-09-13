import { TeamVals } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { PlaySnapshot } from "../api/play_protocol";
import { t } from "../i18n/i18n";
import { hocColors } from "./hocTheme";
import { formatCountdown, opponentConnectionNotices, returnedSeats } from "./opponentConnection";
import { startVisibleInterval } from "./visibleInterval";

const RETURNED_NOTICE_MS = 5_000;

/**
 * Presence of the OTHER seats during a fight: "opponent disconnected, AI takes over in 12s", "the AI is
 * playing their turns, they forfeit in 2:31", and a short "opponent is back". The server emits the
 * connect/disconnect events and runs the takeover and forfeit clocks; without this strip the pause read as
 * the game freezing. Deadlines arrive as server time, so the countdown is measured against the snapshot's
 * server clock plus the local time elapsed since it landed.
 */
export const OpponentConnectionBadge: React.FC<{
    snapshot: PlaySnapshot;
    viewerTeam: number | undefined;
    aiSeatPlayerId: string | undefined;
    top: number;
}> = ({ snapshot, viewerTeam, aiSeatPlayerId, top }) => {
    const receivedAtRef = useRef(Date.now());
    const previousPlayersRef = useRef<PlaySnapshot["players"] | undefined>(undefined);
    const [returned, setReturned] = useState<Set<string>>(() => new Set());
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        receivedAtRef.current = Date.now();
        const back = returnedSeats(previousPlayersRef.current, snapshot.players);
        previousPlayersRef.current = snapshot.players;
        if (!back.length) {
            return undefined;
        }
        setReturned((current) => new Set([...current, ...back]));
        const timer = window.setTimeout(() => {
            setReturned((current) => {
                const next = new Set(current);
                for (const id of back) {
                    next.delete(id);
                }
                return next;
            });
        }, RETURNED_NOTICE_MS);
        return () => window.clearTimeout(timer);
    }, [snapshot.players]);

    useEffect(() => startVisibleInterval(() => setNowMs(Date.now()), 1000), []);

    const notices = useMemo(() => {
        const nowServerMs = snapshot.serverTimeMs + (nowMs - receivedAtRef.current);
        return opponentConnectionNotices(snapshot, viewerTeam, aiSeatPlayerId, nowServerMs, returned);
    }, [aiSeatPlayerId, nowMs, returned, snapshot, viewerTeam]);

    if (!notices.length) {
        return null;
    }
    const seatName = (team: number): string =>
        viewerTeam !== undefined ? t("Opponent") : team === TeamVals.LEFT ? t("Green player") : t("Red player");
    return (
        <Box
            sx={{
                position: "fixed",
                top,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6990,
                pointerEvents: "none",
            }}
        >
            <Stack spacing={0.5} alignItems="center">
                {notices.map((notice) => {
                    const back = notice.state === "back";
                    const parts = [
                        back
                            ? t("{seat} is back").replace("{seat}", seatName(notice.team))
                            : `${seatName(notice.team)} ${t("disconnected")}`,
                    ];
                    if (notice.state === "disconnected" && notice.takeoverInMs !== undefined) {
                        parts.push(
                            t("AI takes over in {time}").replace("{time}", formatCountdown(notice.takeoverInMs)),
                        );
                    }
                    if (notice.state === "ai") {
                        parts.push(t("the AI is playing their turns"));
                    }
                    if (!back && notice.forfeitInMs !== undefined) {
                        parts.push(t("forfeits in {time}").replace("{time}", formatCountdown(notice.forfeitInMs)));
                    }
                    return (
                        <Typography
                            key={notice.playerId}
                            level="body-sm"
                            sx={{
                                px: 1.25,
                                py: 0.4,
                                borderRadius: 8,
                                border: `1px solid ${back ? hocColors.green : hocColors.orangeBorder}`,
                                bgcolor: "rgba(12, 8, 6, 0.86)",
                                color: back ? hocColors.green : hocColors.gold,
                                boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {parts.join(" · ")}
                        </Typography>
                    );
                })}
            </Stack>
        </Box>
    );
};

export default OpponentConnectionBadge;
