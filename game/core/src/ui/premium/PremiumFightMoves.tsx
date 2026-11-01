import { Box, Typography } from "@mui/joy";
import React from "react";
import { useLocation } from "react-router";

import { premiumSearchGameId } from "../../api/premium_search";
import { hocFontFamily } from "../hocTheme";
import { PremiumIcon } from "../PremiumIcon";
import { usePremiumAccess } from "./PremiumAccess";
import { PremiumButton } from "./PremiumButton";
import { usePremiumSearchMatch } from "./PremiumSearchMatchContext";
import { useAskPremiumQuestion } from "./PremiumSearchPromptContext";
import { currentPremiumTurnReview, usePremiumTurnReview, type PremiumTurnReview } from "./PremiumTurnPreviewContext";
import { usePremiumSuggestedMoves } from "./usePremiumSuggestedMoves";
import { usePremiumAdviceView } from "./usePremiumAdviceView";

const purposeLabels = {
    attack: "Attack option",
    "ally-spell": "Ally spell",
    "enemy-spell": "Enemy spell",
    spell: "Spell option",
    move: "Positioning option",
    wait: "Wait option",
    defend: "Luck shield",
    obstacle: "Obstacle option",
};

export const PremiumMoveReview: React.FC<{ turn: PremiumTurnReview }> = ({ turn }) => {
    const askQuestion = useAskPremiumQuestion();
    const impression = usePremiumAdviceView(turn.gameId, turn.adviceId);
    return (
        <Box
            ref={impression}
            component="details"
            sx={{
                width: "100%",
                minWidth: 0,
                border: "1px solid #745035",
                borderRadius: 6,
                bgcolor: "#1e160fe8",
                fontFamily: hocFontFamily,
            }}
            onKeyDown={(event) => event.stopPropagation()}
        >
            <Box
                component="summary"
                aria-label="Review suggested moves"
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    p: 0.7,
                    color: "#efcfaf",
                    fontSize: 11,
                    listStyle: "none",
                    "&::-webkit-details-marker": { display: "none" },
                }}
            >
                <PremiumIcon size={13} />
                Review {turn.options.length} moves
            </Box>
            <Box sx={{ maxHeight: "min(40vh, 300px)", overflowY: "auto", overscrollBehavior: "contain", p: 0.8 }}>
                <Typography level="body-xs" sx={{ color: "#c7ac94", mb: 1 }}>
                    {turn.actorName} · this turn
                </Typography>
                {turn.options.slice(0, 3).map((option, index) => (
                    <Box
                        key={option.id}
                        sx={{ borderTop: "1px solid #63472f", pt: 0.75, pb: 1, overflowWrap: "anywhere" }}
                    >
                        <Typography
                            level="title-sm"
                            sx={{
                                color: option.assessment?.recommended ? "#ffc65a" : index === 2 ? "#c6b6ff" : "#80d9ec",
                                fontSize: 12,
                            }}
                        >
                            {index + 1} ·{" "}
                            {option.assessment?.recommended
                                ? "Preferred"
                                : option.assessment
                                  ? purposeLabels[option.assessment.purpose]
                                  : "Legal option"}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: "#f0d7bd", my: 0.5 }}>
                            {option.label}
                        </Typography>
                        {option.reasons.map((reason, reasonIndex) => (
                            <Typography
                                key={`${reasonIndex}:${reason}`}
                                level="body-xs"
                                sx={{ color: "#c7ac94", my: 0.5 }}
                            >
                                {reason}
                            </Typography>
                        ))}
                        {askQuestion && (
                            <PremiumButton
                                size="sm"
                                variant="plain"
                                sx={{ minHeight: 24, px: 0, fontSize: 11 }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    askQuestion(
                                        `Explain marked move ${index + 1}, "${option.label}", for this ${turn.actorName} stack. Compare its resources, planned position and supported damage estimates with the preferred move and other legal options.`,
                                        {
                                            unitId: turn.unitId,
                                            name: turn.actorName,
                                            optionId: option.id,
                                            moveNumber: index + 1,
                                        },
                                    );
                                }}
                            >
                                Ask about this move
                            </PremiumButton>
                        )}
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

export const PremiumFightMoves: React.FC = () => {
    const { pathname } = useLocation();
    const gameId = premiumSearchGameId(pathname);
    const preview = usePremiumTurnReview();
    const version = usePremiumSearchMatch(gameId);
    const access = usePremiumAccess();
    const enabled = usePremiumSuggestedMoves();
    const turn = currentPremiumTurnReview(preview, gameId, version);
    return access?.active && enabled && turn ? <PremiumMoveReview turn={turn} /> : null;
};
