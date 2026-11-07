import { TeamVals, transitionServerPersistedPickSim } from "@heroesofcrypto/common";
import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useContext, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { AuthContext, useAuthContext } from "./auth/context/auth_context";
import { PickBanContext } from "./context/PickBanContextDefs";
import { GameCornerExitButton } from "./GameCornerExit";
import { hocJoyTheme } from "./hocTheme";
import StainedGlassWindow from "./PickAndBan";
import { PremiumPreviewContext } from "./premium/PremiumPreviewContext";
import { createRankedPickPreview, rankedPickPreviewAdvice, rankedPickPreviewView } from "./rankedPickPreviewState";
import { isPortraitContourPreview } from "./PortraitContourPreview";
import { draftBanPreviewPlacement } from "./PickAndBan/DraftBanPlacement";

const RankedPickFixture: React.FC<{ level: number; children: React.ReactNode }> = ({ level, children }) => {
    const auth = useAuthContext();
    const contourComparison = isPortraitContourPreview();
    const [state, setState] = useState(() => createRankedPickPreview(level));
    const gameId = `preview-ranked-level${level}`;
    const advice = useMemo(() => rankedPickPreviewAdvice(state, gameId), [state, gameId]);
    const view = useMemo(() => {
        const ranked = rankedPickPreviewView(state);
        // Art comparisons need all sixteen samples at full colour, without draft bans or taken cards.
        return contourComparison
            ? { ...ranked, banned: [], picked: [], opponentPicked: [], watchedSlots: [], secondsRemaining: 300 }
            : ranked;
    }, [state, contourComparison]);
    const previewAuth = useMemo(
        () => ({
            ...auth,
            pick: async (creatureId: number) => {
                if (contourComparison) return;
                const next = transitionServerPersistedPickSim(
                    state,
                    { type: "pick_creature", team: TeamVals.LEFT, creatureId },
                    () => 0,
                );
                if (next.status !== "accepted") throw new Error("This creature is unavailable in the preview.");
                setState(next.state);
            },
        }),
        [auth, state, contourComparison],
    );
    return (
        <PremiumPreviewContext.Provider value={contourComparison ? undefined : advice}>
            <AuthContext.Provider value={previewAuth}>
                <PickBanContext.Provider value={view}>{children}</PickBanContext.Provider>
            </AuthContext.Provider>
        </PremiumPreviewContext.Provider>
    );
};

/** Keep all production UI (including the global Premium dock) under the same offline fixture. */
export const RankedPickPreviewScope: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { pathname } = useLocation();
    const level = Number(pathname.match(/^\/preview\/picks\/level([1-4])$/)?.[1]);
    return import.meta.env.DEV && level ? (
        <RankedPickFixture key={pathname} level={level}>
            {children}
        </RankedPickFixture>
    ) : (
        children
    );
};

export const RankedCreaturePickPreview: React.FC = () => {
    const { search } = useLocation();
    const preview = useContext(PremiumPreviewContext);
    const navigate = useNavigate();
    return (
        <div className="container" style={{ display: "flex" }}>
            <CssVarsProvider theme={hocJoyTheme}>
                <CssBaseline />
            </CssVarsProvider>
            <StainedGlassWindow
                banPlacement={draftBanPreviewPlacement(search)}
                userTeam={TeamVals.LEFT}
                gameId={preview?.gameId}
                opponentLabel="Opponent"
                showOpponentRosterDuringAugmentHandoff={false}
                systemControl={<GameCornerExitButton label="Exit preview" onClick={() => navigate("/")} />}
            />
        </div>
    );
};
