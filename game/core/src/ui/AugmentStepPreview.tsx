/*
 * BACKEND-FREE AUGMENT STEP.
 *
 * The ranked "Choose your augments" screen on its own route: the same draft shell, the same army rails and
 * the same SideToggleContainer picker RankedGameView opens over placement — minus the game. Reaching that
 * screen for real costs a full draft plus a placement handoff, which is a long way to walk to look at six
 * cards, and the sandbox sidebar next door is a DIFFERENT picker (SandboxToggleContainer), so it cannot
 * stand in for this one.
 *
 * There is no snapshot behind it: the rails show a fixed army, the clock does not run, and locking in only
 * flips this route's own state. The budget is the one thing worth varying, so it is on the query string:
 *
 *   /preview/augments                -> Scout, 6 points
 *   /preview/augments?perk=spymaster -> 5 points   (also: scout, blind_fury, or the numeric perk id)
 *   /preview/augments?points=3       -> any budget, clamped to MAX_AUGMENT_POINTS, for pricing experiments
 *   /preview/augments?team=upper     -> the red seat
 */
import { HoCConstants, Perk, TeamType, TeamVals } from "@heroesofcrypto/common";
import { Box, Stack } from "@mui/joy";
import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useCallback, useMemo, useState } from "react";

import { PixiGameManager, PixiManagerContext } from "../pixi/PixiGameManager";
import { t, useTranslation } from "../i18n/i18n";
import {
    DRAFT_ARMIES_HEIGHT,
    DRAFT_HEADER_HEIGHT,
    DRAFT_ZONE_GAP,
    DraftBottomControls,
    DraftTitle,
    MyDraftBar,
    OpponentDraftBar,
    PhasePanel,
    PickCommitButton,
    draftBoardSx,
    draftShellSx,
    useDraftScale,
} from "./PickAndBan";
import { MapBadge } from "./PickAndBan/MapReveal";
import SideToggleContainer from "./RightSideBar/SideToggleContainer";

/*
 * A card only commits its level if the manager accepts it, and the real manager only accepts what a live
 * scene actually applied — with no scene it refuses every click and the whole picker reads as dead. This
 * stub accepts everything; nothing else in the subtree touches the manager once the artifact picker is off.
 */
const PREVIEW_MANAGER = { PropagateAugmentation: () => true } as unknown as PixiGameManager;

const PREVIEW_PERKS: Record<string, Perk.Perk> = {
    scout: Perk.Perk.THREE_REVEALS,
    three_reveals: Perk.Perk.THREE_REVEALS,
    spymaster: Perk.Perk.SEE_ALL,
    see_all: Perk.Perk.SEE_ALL,
    blind: Perk.Perk.SEE_NONE,
    blind_fury: Perk.Perk.SEE_NONE,
    see_none: Perk.Perk.SEE_NONE,
    "1": Perk.Perk.THREE_REVEALS,
    "2": Perk.Perk.SEE_ALL,
    "3": Perk.Perk.SEE_NONE,
};

// One full army, in the [L1, L1, L2, L2, L3, L4] order the rails lay out. Both bars place by the creature's
// real level, so these ids have to be drawn from CreatureByLevel — an id at the wrong level lands in the
// wrong slot and one heading ends up empty.
const PREVIEW_ARMY = [12, 33, 24, 51, 17, 40];

export const AugmentStepPreview: React.FC = () => {
    useTranslation();
    const params = new URLSearchParams(window.location.search);
    const perkId = PREVIEW_PERKS[params.get("perk")?.toLowerCase() ?? ""] ?? Perk.Perk.THREE_REVEALS;
    const requestedPoints = Number.parseInt(params.get("points") ?? "", 10);
    const budgetPoints = Number.isFinite(requestedPoints)
        ? Math.max(0, Math.min(HoCConstants.MAX_AUGMENT_POINTS, requestedPoints))
        : Perk.getUpgradePoints(perkId);
    const userTeam = (params.get("team")?.toLowerCase() === "upper" ? TeamVals.UPPER : TeamVals.LOWER) as TeamType;

    const draftScale = useDraftScale();
    const [ready, setReady] = useState(false);
    const [pointsRemaining, setPointsRemaining] = useState(budgetPoints);
    // SideToggleContainer re-runs its report effect whenever this identity changes, so it has to be stable.
    const onReadyChange = useCallback(
        (state: { pointsRemaining: number; allSynergiesSelected: boolean }) =>
            setPointsRemaining(state.pointsRemaining),
        [],
    );
    const spent = budgetPoints - pointsRemaining;
    const complete = pointsRemaining === 0;

    // Remounts the picker (and its internal selections) on a budget change, so switching ?points= mid-session
    // never leaves a spend that the new budget cannot pay for.
    const pickerKey = useMemo(() => `${userTeam}-${budgetPoints}`, [userTeam, budgetPoints]);

    return (
        <PixiManagerContext.Provider value={PREVIEW_MANAGER}>
            <CssVarsProvider>
                <CssBaseline />
                <Box sx={draftShellSx}>
                    <Box sx={draftBoardSx(draftScale)}>
                        <Box
                            sx={{
                                width: "100%",
                                height: DRAFT_HEADER_HEIGHT,
                                minHeight: DRAFT_HEADER_HEIGHT,
                                maxHeight: DRAFT_HEADER_HEIGHT,
                                flex: "0 0 auto",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                            }}
                        >
                            <DraftTitle>{t("Choose your augments")}</DraftTitle>
                        </Box>
                        <Stack
                            direction="row"
                            spacing={1.5}
                            sx={{
                                width: "100%",
                                height: DRAFT_ARMIES_HEIGHT,
                                minHeight: DRAFT_ARMIES_HEIGHT,
                                maxHeight: DRAFT_ARMIES_HEIGHT,
                                flex: "0 0 auto",
                                alignItems: "center",
                                justifyContent: "center",
                                flexWrap: "nowrap",
                            }}
                        >
                            <MyDraftBar
                                perk={perkId}
                                picked={PREVIEW_ARMY}
                                artifactTier1={1}
                                artifactTier2={1}
                                gameId="augment-step-preview"
                            />
                            <Box sx={{ flex: "0 0 auto", display: "flex", alignItems: "center" }}>
                                <MapBadge mapType={0} />
                            </Box>
                            <OpponentDraftBar
                                opponentPicked={PREVIEW_ARMY}
                                opponentLabel={t("Opponent")}
                                watchedSlots={[0, 1, 2, 3, 4, 5]}
                                gameId="augment-step-preview"
                            />
                        </Stack>
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: DRAFT_ZONE_GAP,
                                width: "100%",
                                flex: "1 1 0",
                                minHeight: 0,
                            }}
                        >
                            <Box
                                sx={{
                                    position: "relative",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "stretch",
                                    width: "100%",
                                    flex: "1 1 0",
                                    minHeight: 0,
                                    overflow: "visible",
                                }}
                            >
                                <PhasePanel>
                                    <Box
                                        component="fieldset"
                                        disabled={ready}
                                        aria-disabled={ready}
                                        sx={{
                                            minWidth: 0,
                                            m: 0,
                                            p: 0,
                                            border: 0,
                                            height: "100%",
                                            pointerEvents: ready ? "none" : "auto",
                                            opacity: ready ? 0.64 : 1,
                                        }}
                                    >
                                        <SideToggleContainer
                                            key={pickerKey}
                                            side={userTeam === TeamVals.LOWER ? "green" : "red"}
                                            teamType={userTeam}
                                            showArtifactPicker={false}
                                            budgetPoints={budgetPoints}
                                            onReadyChange={onReadyChange}
                                        />
                                    </Box>
                                </PhasePanel>
                            </Box>
                            <PickCommitButton
                                label={ready ? t("Waiting for opponent…") : t("Lock in augments")}
                                armed={complete && !ready}
                                isYourTurn={!ready}
                                seconds={90}
                                extra={`${spent} / ${budgetPoints}`}
                                tone={complete ? "green" : "gold"}
                                blockedHint={t("Spend every upgrade point first.")}
                                onCommit={() => setReady(true)}
                            />
                        </Box>
                    </Box>
                    <DraftBottomControls step={7} userTeam={userTeam} draftScale={draftScale} />
                    {/* Preview-only: the live screen leaves this state when the server advances the game. */}
                    {ready && (
                        <Box
                            component="button"
                            type="button"
                            onClick={() => setReady(false)}
                            sx={{
                                position: "fixed",
                                bottom: 12,
                                left: "50%",
                                transform: "translateX(-50%)",
                                zIndex: 50,
                                px: 1.5,
                                py: 0.5,
                                background: "transparent",
                                border: "1px solid rgba(220, 177, 88, 0.5)",
                                borderRadius: "3px",
                                color: "rgba(239, 228, 204, 0.8)",
                                cursor: "pointer",
                            }}
                        >
                            разблокировать (только в превью)
                        </Box>
                    )}
                </Box>
            </CssVarsProvider>
        </PixiManagerContext.Provider>
    );
};

export default AugmentStepPreview;
