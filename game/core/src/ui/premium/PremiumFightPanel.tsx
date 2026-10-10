import { Box, Button, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useRef, useState } from "react";

import type { PlaySnapshot } from "../../api/play_protocol";
import { fetchPremium, type PremiumTurnAdvice } from "../../api/premium_client";
import { usePremiumAdvisor } from "./PremiumAdvisor";
import { canSuggestPremiumTurn, currentPremiumTurn, premiumFightTurnKey } from "./premiumFightState";

export const PremiumFightOptions: React.FC<{ options: PremiumTurnAdvice["options"] }> = ({ options }) => (
    <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
        {options.slice(0, 2).map((option, index) => (
            <Box component="li" key={option.id} sx={{ mt: 1, color: "#f7a35a" }}>
                <Typography level="body-xs" sx={{ color: "#f7a35a" }}>
                    {index === 0 ? "Preferred" : "Alternative"}
                </Typography>
                <Typography level="title-sm" sx={{ color: "#fff0de" }}>
                    {option.label}
                </Typography>
                {option.reasons.map((reason) => (
                    <Typography key={reason} level="body-xs" sx={{ mt: 0.4, color: "#efcfaf" }}>
                        {reason}
                    </Typography>
                ))}
            </Box>
        ))}
    </Box>
);

export const PremiumFightPanel: React.FC<{
    snapshot: PlaySnapshot;
    userTeam: number;
    disabled?: boolean;
}> = ({ snapshot, userTeam, disabled = false }) => {
    const { advice: account } = usePremiumAdvisor();
    const key = premiumFightTurnKey(snapshot);
    const canSuggest = canSuggestPremiumTurn(snapshot, userTeam);
    const [result, setResult] = useState<{ key: string; turn?: PremiumTurnAdvice; error?: string }>();
    const [loadingKey, setLoadingKey] = useState<string>();
    const request = useRef<AbortController | undefined>(undefined);
    useEffect(() => {
        request.current?.abort();
        setLoadingKey(undefined);
        setResult(undefined);
        return () => request.current?.abort();
    }, [key, canSuggest, disabled]);

    if (!account?.entitlement.active) return null;
    const current = result?.key === key && canSuggest && !disabled ? result : undefined;
    const loading = loadingKey === key;
    const suggest = async () => {
        if (!canSuggest || disabled || loading) return;
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setLoadingKey(key);
        setResult(undefined);
        try {
            const advice = await fetchPremium(snapshot.gameId, controller.signal);
            if (controller.signal.aborted) return;
            const turn = currentPremiumTurn(advice, snapshot);
            setResult(
                turn?.status === "ready" && turn.options.length
                    ? { key, turn }
                    : {
                          key,
                          error:
                              turn?.status === "automatic"
                                  ? "This unit acts automatically. Suggestions are available for turns you control."
                                  : "No suggestions for this turn. Try again once the battlefield updates.",
                      },
            );
        } catch {
            if (!controller.signal.aborted)
                setResult({ key, error: "Suggestions are unavailable. You can keep playing or try again." });
        } finally {
            if (!controller.signal.aborted) setLoadingKey(undefined);
        }
    };

    return (
        <Sheet
            data-testid="premium-fight-panel"
            sx={{
                background: "linear-gradient(135deg,#302017,#1b120e)",
                border: "1px solid #a75425",
                borderRadius: 8,
                p: 1,
                maxHeight: "min(42vh, 420px)",
                overflowY: "auto",
                flexShrink: 0,
            }}
        >
            <Typography level="title-sm" sx={{ color: "#f7a35a" }}>
                ◆ Premium · Next move
            </Typography>
            <Button
                size="sm"
                loading={loading}
                disabled={!canSuggest || disabled || loading}
                onClick={() => void suggest()}
                sx={{ mt: 0.75, bgcolor: "#9b481b", color: "#fff0de", "&:hover": { bgcolor: "#bd5c25" } }}
            >
                Suggest 2 moves
            </Button>
            <Box role="status" aria-live="polite">
                {!canSuggest && (
                    <Typography level="body-xs" sx={{ mt: 0.75, color: "#efcfaf" }}>
                        Available when it is your turn to act.
                    </Typography>
                )}
                {current?.turn && (
                    <>
                        <PremiumFightOptions options={current.turn.options} />
                        <Typography level="body-xs" sx={{ mt: 0.75, color: "#d0b59c" }}>
                            {current.turn.options.length === 1 && "Only one distinct option is available. "}
                            Choose your move on the battlefield. Suggestions do not play your turn.
                        </Typography>
                    </>
                )}
                {current?.error && (
                    <Typography level="body-xs" sx={{ mt: 0.75, color: "#ffc289" }}>
                        {current.error}
                    </Typography>
                )}
            </Box>
        </Sheet>
    );
};
