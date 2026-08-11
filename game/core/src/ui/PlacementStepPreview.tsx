/*
 * BACKEND-FREE PRE-FIGHT PLACEMENT.
 *
 * The step straight after /preview/augments: the ranked placement screen — the board with both armies
 * already deployed in their zones (the state a live match opens in, since the server auto-places), the
 * opponent's revealed roster, and the sidebar's roster / artifacts / augment recap, lock-in plate and
 * countdown. This is the REAL RankedGameView, not a re-drawing of it; what makes it work without a match
 * is the in-memory play session in api/previewPlaySession, which answers the snapshot fetch and the
 * board's actions for one reserved game id. So stacks can be dragged around the zone, READY PLACEMENT
 * locks in — and then nothing: there is no opponent to answer it and no fight behind it. The placement
 * window rolls over instead of expiring, so the screen stays live for as long as it is left open.
 *
 *   /preview/placement                -> green (lower) seat, normal map
 *   /preview/placement?team=upper     -> the red seat
 *   /preview/placement?map=cemetery   -> also: lava (anything else is the normal map)
 */
import { GridVals, TeamType, TeamVals } from "@heroesofcrypto/common";
import React, { useMemo } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, PREVIEW_PLACEMENT_MAPS, startPreviewPlaySession } from "../api/previewPlaySession";
import { IWindowSize } from "../scenes/VisibleState";
import { RankedGameView } from "./RankedGameView";

export const PlacementStepPreview: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const params = new URLSearchParams(window.location.search);
    const userTeam = (params.get("team")?.toLowerCase() === "upper" ? TeamVals.UPPER : TeamVals.LOWER) as TeamType;
    const gridType = PREVIEW_PLACEMENT_MAPS[params.get("map")?.toLowerCase() ?? ""] ?? GridVals.NORMAL;

    // Seeded during render, before RankedGameView's first snapshot fetch runs — an effect would land after
    // it and the view would open on "game not available" for a beat.
    useMemo(() => startPreviewPlaySession({ userTeam, gridType }), [userTeam, gridType]);

    return <RankedGameView gameId={PREVIEW_PLACEMENT_GAME_ID} userTeam={userTeam} windowSize={windowSize} />;
};

export default PlacementStepPreview;
