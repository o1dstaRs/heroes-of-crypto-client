import { Box, Button, Sheet, Tooltip, Typography } from "@mui/joy";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import {
    applyPremium,
    fetchPremium,
    type PremiumAdvice,
    type PremiumChoice,
    type PremiumOperation,
} from "../../api/premium_client";
import { useAuthContext } from "../auth/context/auth_context";
import { EvidenceText } from "./PremiumEvidenceText";

export { EvidenceText } from "./PremiumEvidenceText";

export const PremiumContext = createContext<PremiumAdvice | undefined>(undefined);
const orange = "#ea802c";

export const usePremiumAdvisor = (gameId?: string, refreshKey?: string | number) => {
    const { authenticated } = useAuthContext();
    const [advice, setAdvice] = useState<PremiumAdvice>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const generation = useRef(0);
    const refresh = useCallback(
        async (signal?: AbortSignal) => {
            if (!authenticated || gameId?.startsWith("preview")) return;
            const current = generation.current;
            try {
                const next = await fetchPremium(gameId, signal);
                if (current === generation.current && !signal?.aborted)
                    setAdvice(next.entitlement.active ? next : undefined);
            } catch {
                /* Premium never blocks the match. */
            }
        },
        [authenticated, gameId],
    );
    useEffect(() => {
        generation.current++;
        setAdvice(undefined);
        setError("");
        const controller = new AbortController();
        void refresh(controller.signal);
        const timer = setInterval(
            () => {
                void refresh(controller.signal);
            },
            gameId ? 3000 : 60000,
        );
        return () => {
            generation.current++;
            controller.abort();
            clearInterval(timer);
        };
    }, [refresh, refreshKey, gameId]);
    const apply = useCallback(
        async (operation: PremiumOperation) => {
            if (!gameId || !advice || busy) return;
            setBusy(true);
            setError("");
            try {
                const next = await applyPremium(gameId, advice.revision, operation);
                setAdvice({ ...advice, ...next, evidence: next.evidence });
            } catch {
                setError("The match changed. Advice refreshed; your current choices are preserved.");
                await refresh();
            } finally {
                setBusy(false);
            }
        },
        [gameId, advice, busy, refresh],
    );
    return { advice, apply, busy, error };
};

const ChoiceExplanation: React.FC<{ choice: PremiumChoice }> = ({ choice }) => (
    <Box sx={{ maxWidth: 350, p: 0.5 }}>
        <Typography level="title-sm" sx={{ color: orange }}>
            {choice.label}
        </Typography>
        {choice.reasons.map((reason) => (
            <Typography key={reason} level="body-sm" sx={{ mt: 0.75, color: "#f3dfcb" }}>
                {reason}
            </Typography>
        ))}
        <Box sx={{ mt: 1 }}>
            <EvidenceText evidence={choice.evidence} />
        </Box>
    </Box>
);

export const PremiumMark: React.FC<{ kind: PremiumChoice["kind"]; value: number }> = ({ kind, value }) => {
    const advice = useContext(PremiumContext);
    const index = advice?.choices?.findIndex((choice) => choice.kind === kind && choice.value === value) ?? -1;
    const choice = index >= 0 ? advice?.choices?.[index] : undefined;
    if (!choice) return null;
    return (
        <Box
            data-testid={`premium-${kind}-${value}`}
            sx={{
                position: "absolute",
                inset: 0,
                zIndex: 9,
                pointerEvents: "none",
                border: `${index === 0 ? 3 : 2}px solid ${index === 0 ? orange : "#a95825"}`,
                borderRadius: "inherit",
                boxShadow: index === 0 ? "inset 0 0 18px #c764242b, 0 0 15px #d6733045" : undefined,
            }}
        >
            <Tooltip
                title={<ChoiceExplanation choice={choice} />}
                placement="top"
                arrow
                enterDelay={100}
                sx={{
                    bgcolor: "#21150f",
                    color: "#f3dfcb",
                    border: "1px solid #a95825",
                    boxShadow: "0 8px 24px #0009",
                    "--Tooltip-arrowBackground": "#21150f",
                }}
            >
                <Box
                    component="button"
                    type="button"
                    aria-label={`Premium: ${index === 0 ? "preferred" : "alternative"} ${choice.label}. Why?`}
                    onClick={(event) => event.stopPropagation()}
                    sx={{
                        pointerEvents: "auto",
                        position: "absolute",
                        top: 5,
                        left: 5,
                        border: "1px solid #cb702c",
                        borderRadius: "5px",
                        px: 0.7,
                        py: 0.4,
                        background: "#29170ef2",
                        color: "#ffd5ad",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "help",
                    }}
                >
                    {index === 0 ? "◆ Preferred" : "◇ Alternative"}
                </Box>
            </Tooltip>
        </Box>
    );
};

export const PremiumShield: React.FC<{ testOnly?: boolean }> = ({ testOnly = false }) => {
    const { advice } = usePremiumAdvisor();
    if (!advice || (testOnly && advice.entitlement.reason !== "test")) return null;
    return (
        <Tooltip
            title={
                advice.entitlement.reason === "test"
                    ? "Premium · free during testing"
                    : advice.entitlement.reason === "calibration"
                      ? "Premium · included during calibration"
                      : "Premium account"
            }
        >
            <Box
                aria-label="Premium account"
                sx={{
                    position: "absolute",
                    bottom: -3,
                    left: -5,
                    width: 24,
                    height: 28,
                    zIndex: 5,
                    filter: "drop-shadow(0 2px 3px #000)",
                }}
            >
                <svg viewBox="0 0 24 28" width="24" height="28" aria-hidden="true">
                    <path
                        d="M12 1 22 5v9c0 6-6 11-10 13C8 25 2 20 2 14V5Z"
                        fill="#823913"
                        stroke="#ef973e"
                        strokeWidth="1.5"
                    />
                    <path d="m12 6 2 5 5 2-5 2-2 6-2-6-5-2 5-2Z" fill="#ffd18c" />
                </svg>
            </Box>
        </Tooltip>
    );
};

export const PremiumDraftBanner: React.FC<{ advice?: PremiumAdvice }> = ({ advice }) => {
    const preferred = advice?.choices?.[0];
    if (!advice) return null;
    return (
        <Tooltip
            title={
                preferred ? (
                    <ChoiceExplanation choice={preferred} />
                ) : (
                    "Premium will highlight recommendations when your next choice opens."
                )
            }
        >
            <Box
                sx={{
                    position: "fixed",
                    left: 18,
                    bottom: 16,
                    zIndex: 35,
                    maxWidth: "min(340px, 42vw)",
                    px: 1.2,
                    py: 0.8,
                    border: "1px solid #aa5424",
                    borderRadius: 8,
                    bgcolor: "#26160fed",
                    color: "#ffd5ad",
                    boxShadow: "0 3px 16px #0008",
                    fontSize: 12,
                }}
            >
                <strong>◆ Premium</strong>
                {preferred ? ` · ${preferred.label}` : " · watching your draft"}
            </Box>
        </Tooltip>
    );
};

export const PremiumSetupPanel: React.FC<{
    gameId: string;
    stageKey: string;
    auto?: boolean;
    setupView?: boolean;
    children?: React.ReactNode;
}> = ({ gameId, stageKey, auto = false, setupView = false, children }) => {
    const { advice, apply, busy, error } = usePremiumAdvisor(gameId, stageKey);
    const autoAttempt = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!auto || advice?.stage !== "board" || !advice.canAutoArrange || advice.ready || busy) return;
        if (autoAttempt.current === gameId) return;
        autoAttempt.current = gameId;
        void apply("automatic");
    }, [auto, advice, apply, busy, gameId]);
    if (!advice || advice.stage === "fight") return <>{children}</>;
    return (
        <PremiumContext.Provider value={advice}>
            <Box
                data-testid={setupView ? "premium-setup-layout" : undefined}
                sx={
                    setupView && children
                        ? {
                              display: "grid",
                              gridTemplateColumns: "240px minmax(0, 1fr)",
                              gap: "12px",
                              width: "100%",
                              height: "100%",
                              minHeight: 0,
                              overflow: "hidden",
                          }
                        : { display: "contents" }
                }
            >
                <Sheet
                    data-testid="premium-setup-panel"
                    sx={{
                        background: "linear-gradient(135deg,#302017,#1b120e)",
                        border: "1px solid #a75425",
                        borderRadius: 8,
                        p: 1,
                        my: setupView ? 0 : 1,
                        minHeight: 0,
                        overflowY: setupView ? "auto" : undefined,
                    }}
                >
                    <Typography level="title-sm" sx={{ color: "#f7a35a" }}>
                        ◆ Premium guidance
                    </Typography>
                    {advice.stage === "setup" || setupView ? (
                        <>
                            <Typography level="body-xs" sx={{ color: "#efcfaf", my: 0.6 }}>
                                {advice.augments?.map((choice) => `${choice.kind} ${choice.value}`).join(" · ")}
                            </Typography>
                            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 0.5 }}>
                                {advice.synergies
                                    ?.filter((choice) => choice.level > 0)
                                    .map((choice) => (
                                        <Box
                                            key={choice.faction}
                                            sx={{
                                                border: "1px solid #a95825",
                                                borderRadius: 4,
                                                px: 0.5,
                                                color: "#eeb484",
                                                fontSize: 11,
                                            }}
                                        >
                                            {choice.factionName}: {choice.name.replaceAll("_", " ").toLowerCase()} ·{" "}
                                            {choice.level}
                                        </Box>
                                    ))}
                            </Box>
                            <Button
                                size="sm"
                                disabled={busy || advice.ready}
                                onClick={() => {
                                    void apply("setup");
                                }}
                                sx={{ bgcolor: "#9b481b", color: "#fff0de", "&:hover": { bgcolor: "#bd5c25" } }}
                            >
                                Use recommended build
                            </Button>
                        </>
                    ) : (
                        <Box sx={{ display: "flex", gap: 0.75, mt: 0.75 }}>
                            <Button
                                size="sm"
                                disabled={busy || advice.ready}
                                onClick={() => {
                                    void apply("formation");
                                }}
                                sx={{ bgcolor: "#9b481b", color: "#fff0de", "&:hover": { bgcolor: "#bd5c25" } }}
                            >
                                Arrange army
                            </Button>
                            <Button
                                size="sm"
                                variant="outlined"
                                disabled={busy || advice.ready || !advice.canUndo}
                                onClick={() => {
                                    void apply("undo");
                                }}
                            >
                                Undo
                            </Button>
                        </Box>
                    )}
                    <Box component="details" sx={{ mt: 0.8, color: "#d0b59c", fontSize: 12 }}>
                        <summary style={{ cursor: "pointer", color: "#f0b47b" }}>Why this recommendation?</summary>
                        {advice.reasons?.map((reason) => (
                            <p key={reason}>{reason}</p>
                        ))}
                        <EvidenceText evidence={advice.evidence} />
                    </Box>
                    {advice.stage === "board" && !setupView && (
                        <Typography level="body-xs" sx={{ mt: 0.5 }}>
                            Review or edit the formation, then press Ready. Undo is available until you edit your build
                            or board.
                        </Typography>
                    )}
                    {error && (
                        <Typography role="status" level="body-xs" sx={{ color: "#ffc289", mt: 0.5 }}>
                            {error}
                        </Typography>
                    )}
                </Sheet>
                {children}
            </Box>
        </PremiumContext.Provider>
    );
};
