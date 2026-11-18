import {
    createPickSimState,
    Doctrine,
    getCreatureLevel,
    getCurrentPickPhase,
    getOmniscientCreatureChoices,
    getPickScoutingContext,
    getPickTeamView,
    GridVals,
    PickPhaseVals,
    TeamVals,
    transitionServerPersistedPickSim,
    type IPickSimState,
    type PickAction,
} from "@heroesofcrypto/common";

import type { PremiumAdvice } from "../api/premium_client";
import type { PickBanContextType } from "./context/PickBanContextDefs";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

// Fixed rolls keep the visual fixture reproducible; the ranked reducer owns bans, offers and pick order.
const previewRandom = () => {
    let seed = 20261029;
    return (max: number) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return Math.floor((seed / 0x100000000) * max);
    };
};

export const createRankedPickPreview = (level: number): IPickSimState => {
    const random = previewRandom();
    let state = createPickSimState(random);
    for (let step = 0; step < 24; step++) {
        const phase = getCurrentPickPhase(state);
        if (phase.phase === PickPhaseVals.PICK && phase.creatureLevel === level && phase.actors[0] === TeamVals.LEFT)
            return state;
        for (const team of phase.actors) {
            const own = team === TeamVals.LEFT ? state.left : state.right;
            const action: PickAction =
                phase.phase === PickPhaseVals.DOCTRINE
                    ? { type: "select_doctrine", team, doctrine: Doctrine.Doctrine.SEE_ALL }
                    : phase.phase === PickPhaseVals.INITIAL_PICK
                      ? { type: "select_bundle", team, bundleIndex: 0 }
                      : phase.phase === PickPhaseVals.ARTIFACT_2
                        ? { type: "select_tier2", team, artifactId: own.tier2Offers[0] }
                        : { type: "pick_creature", team, creatureId: getOmniscientCreatureChoices(state, team)[0] };
            const next = transitionServerPersistedPickSim(state, action, random);
            if (next.status !== "accepted") throw new Error("Invalid ranked preview transition");
            state = next.state;
        }
    }
    throw new Error(`Unsupported ranked preview level: ${level}`);
};

export const rankedPickPreviewView = (state: IPickSimState): PickBanContextType => {
    const view = getPickTeamView(state, TeamVals.LEFT);
    const byLevel = [1, 1, 2, 2, 3, 4].map(() => 0);
    for (const id of view.knownOpponentCreatures) {
        const slot = [1, 1, 2, 2, 3, 4].findIndex((level, index) => level === getCreatureLevel(id) && !byLevel[index]);
        if (slot >= 0) byLevel[slot] = id;
    }
    return {
        isConnected: true,
        events: [],
        error: null,
        banned: view.creaturesBanned,
        picked: view.creaturesPicked,
        opponentPicked: byLevel,
        watchedSlots: [...state.left.revealedOpponentSlots],
        isYourTurn: view.actors.includes(TeamVals.LEFT),
        isAbandoned: false,
        phaseIdentity: `preview-ranked:${state.phaseSequence}`,
        pickPhase: view.phase,
        secondsRemaining: 48,
        revealsRemaining: 0,
        initialBundles: view.bundles.map((bundle) => [...bundle]),
        tier2Offers: view.tier2Offers,
        doctrine: view.doctrine,
        upgradePoints: Doctrine.DOCTRINES[view.doctrine].upgradePoints,
        artifactTier1: state.left.tier1Artifact ?? 0,
        artifactTier2: state.left.tier2Artifact ?? 0,
        requiredLevel: view.requiredCreatureLevel,
        mapType: GridVals.NORMAL,
        autoPickedSignal: 0,
    };
};

/** Representative Premium payload, never an entitlement or recommendation fetched for a real account. */
export const rankedPickPreviewAdvice = (state: IPickSimState, gameId: string): PremiumAdvice => ({
    gameId,
    entitlement: { active: true, reason: "test" },
    stage: "draft",
    revision: `preview:${state.phaseSequence}`,
    draftLevel: getCurrentPickPhase(state).creatureLevel,
    scouting: getPickScoutingContext(state, TeamVals.LEFT, GridVals.NORMAL),
    choices: getOmniscientCreatureChoices(state, TeamVals.LEFT)
        .slice(0, 3)
        .map((id) => ({
            kind: "creature",
            value: id,
            label: UNIT_ID_TO_NAME[id],
            reasons: ["Preview recommendation for inspecting the ranked Premium interface."],
        })),
});
