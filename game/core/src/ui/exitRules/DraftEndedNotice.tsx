import { TeamVals, type TeamType } from "@heroesofcrypto/common";
import Button from "@mui/joy/Button";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { ExitResultBanner } from "./ExitResultBanner";
import { useDraftKind } from "./useDraftConduct";
import { fetchPublicRankedMatch, type PublicRankedMatch } from "../../api/ranked_match_client";
import { t, useTranslation } from "../../i18n/i18n";
import { usePickBanEvents } from "../context/PickBanContext";
import { hocColors, hocPanelSx } from "../hocTheme";

const POLL_MS = 2000;
const POLL_ATTEMPTS = 20;

export interface DraftExitResult {
    /** The public ranked result, once its exit is settled. */
    match?: PublicRankedMatch;
    /** Polling is over: the exit arrived, or it never did (a lobby draft has no ranked result). */
    checked: boolean;
}

/**
 * How a draft that ended before the fight counted. The abandon daemon settles it a few seconds after the draft closes,
 * so this polls the public ranked result until its exit is there, then stops.
 */
export const useDraftExitResult = (gameId: string, active: boolean): DraftExitResult => {
    const [match, setMatch] = useState<PublicRankedMatch | undefined>();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!active) {
            return undefined;
        }
        let cancelled = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const retryOrStop = (): void => {
            if (attempts >= POLL_ATTEMPTS) {
                setChecked(true);
            } else {
                timer = setTimeout(poll, POLL_MS);
            }
        };
        const poll = (): void => {
            attempts += 1;
            fetchPublicRankedMatch(gameId)
                .then((next) => {
                    if (cancelled) {
                        return;
                    }
                    if (next.exit) {
                        setMatch(next);
                        setChecked(true);
                    } else {
                        retryOrStop();
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        retryOrStop();
                    }
                });
        };
        poll();
        return () => {
            cancelled = true;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [active, gameId]);

    return { match, checked };
};

/**
 * The draft ended without this player pressing Exit: the opponent left, the server ended it for missed picks, or it was
 * voided. The pick stream only says "abandoned", so the ranked result explains how it counted. Before this the player
 * sat on "Waiting for your opponent…" with no sign the match was over.
 */
export const DraftEndedNotice: React.FC<{ gameId: string; userTeam: TeamType }> = ({ gameId, userTeam }) => {
    useTranslation();
    const { isAbandoned } = usePickBanEvents();
    const { casual } = useDraftKind(gameId);
    const navigate = useNavigate();
    const { match, checked } = useDraftExitResult(gameId, isAbandoned === true && !casual);

    if (!isAbandoned) {
        return null;
    }
    const side = userTeam === TeamVals.LEFT ? "lower" : "upper";
    const viewerPlayerId = match?.players.find((player) => player.side === side)?.playerId;
    return (
        <Modal open>
            <ModalDialog sx={{ ...hocPanelSx, maxWidth: 420 }}>
                <Typography level="h4" sx={{ color: hocColors.parchment }}>
                    {t("The draft has ended")}
                </Typography>
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                    {match?.exit ? (
                        <ExitResultBanner exit={match.exit} ranked viewerPlayerId={viewerPlayerId} />
                    ) : (
                        <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                            {casual || checked
                                ? t("The match ended before the fight.")
                                : t("The match ended before the fight. Checking how it counts…")}
                        </Typography>
                    )}
                    <Button variant="solid" onClick={() => navigate("/play")} sx={{ alignSelf: "flex-end" }}>
                        {t("Back to the arena")}
                    </Button>
                </Stack>
            </ModalDialog>
        </Modal>
    );
};
