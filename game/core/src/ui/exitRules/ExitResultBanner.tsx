import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import React from "react";

import { casualtyPercent, exitBannerFor } from "./exitRulesModel";
import type { PlayExitResolution } from "../../api/play_protocol";
import type { PublicRankedExit } from "../../api/ranked_match_client";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";

type BannerExit = Pick<PlayExitResolution, "kind" | "cause" | "leaverPlayerId" | "scored" | "enforced" | "boardBp"> & {
    ranked?: boolean;
};

/** The results screen's one sentence about how the match ended early and what it cost (plan §5, "After the match"). */
export const ExitResultBanner: React.FC<{
    exit?: PlayExitResolution | PublicRankedExit | null;
    ranked?: boolean;
    viewerPlayerId?: string;
}> = ({ exit, ranked, viewerPlayerId }) => {
    useTranslation();
    const resolved = exit as BannerExit | null | undefined;
    const banner = exitBannerFor(
        resolved ? { ...resolved, ranked: resolved.ranked ?? ranked ?? true } : undefined,
        viewerPlayerId,
    );
    if (!banner || !resolved) {
        return null;
    }
    const pct = casualtyPercent(resolved.boardBp);
    let sentence: string;
    switch (banner.kind) {
        case "void":
            sentence = t("Server problem: this match is voided. No result, no penalty, and stakes are returned.");
            break;
        case "double":
            sentence = t("Both players left, so this match is unscored for both.");
            break;
        case "casual-self":
            sentence = t("You left the match.");
            break;
        case "casual-opponent":
            sentence = t("Your opponent left the match.");
            break;
        case "preview-concede":
            sentence = t("Under the new exit rules, this ending would count as a Concede: an ordinary loss.");
            break;
        case "preview-abandon":
            sentence = t("Under the new exit rules, this ending would count as an Abandon.");
            break;
        case "preview-unscored":
            sentence = t("Under the new exit rules, this match would be unscored for both players.");
            break;
        case "concede-self":
            sentence = tf("You conceded at {pct}% casualties: an ordinary loss, with no penalty.", { pct });
            break;
        case "concede-opponent":
            sentence = tf("Your opponent conceded at {pct}% casualties.", { pct });
            break;
        case "concede-observer":
            sentence = tf("A player conceded at {pct}% casualties.", { pct });
            break;
        case "abandon-self":
            sentence = tf("You abandoned at {pct}% casualties: a loss, and ranked search reopens in 5 minutes.", {
                pct,
            });
            break;
        case "abandon-opponent":
            sentence = tf("Your opponent abandoned at {pct}% casualties. You get the full win.", { pct });
            break;
        case "abandon-observer":
            sentence = tf("A player abandoned at {pct}% casualties.", { pct });
            break;
        case "unscored-self":
            sentence = t(
                "You abandoned during calibration, so this match is unscored for both players. It still counts as an abandon for you.",
            );
            break;
        case "unscored-opponent":
            sentence = t(
                "Your opponent abandoned during their calibration, so this match doesn't count for either of you.",
            );
            break;
        default:
            sentence = t("A calibrating player abandoned, so this match is unscored for both.");
    }
    const enforcedRanked =
        !banner.kind.startsWith("preview") && !banner.kind.startsWith("casual") && banner.kind !== "void";
    const cause =
        enforcedRanked && viewerPlayerId && banner.cause === "absence"
            ? banner.mine
                ? t("Your away time ran out.")
                : t("Their away time ran out.")
            : enforcedRanked && viewerPlayerId && banner.cause === "afk"
              ? banner.mine
                  ? t("You missed 4 turns in a row.")
                  : t("They missed 4 turns in a row.")
              : "";
    return (
        <Box
            role="status"
            sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 6,
                background: "rgba(10, 8, 6, 0.78)",
                border: `1px solid ${banner.kind === "void" ? "rgba(239,228,204,.35)" : "rgba(220,177,88,.45)"}`,
                maxWidth: 560,
                mx: "auto",
                textAlign: "center",
            }}
        >
            <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                {cause ? `${cause} ${sentence}` : sentence}
            </Typography>
        </Box>
    );
};
