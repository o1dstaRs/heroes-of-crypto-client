import { TeamType } from "@heroesofcrypto/common";
import { createContext, useContext } from "react";

export interface IPickPhaseEventData {
    // offered bundles for THIS player during INITIAL_PICK: each [l1Creature, l2Creature, tier1ArtifactId]
    ip: [number, number, number][];
    // Tier-2 artifacts offered to THIS player during ARTIFACT_2 (3 distinct ids of 12); empty otherwise.
    t2?: number[];
    // perk chosen by THIS player (0 = not chosen)
    pk?: number;
    // upgrade (augment) point budget granted by THIS player's perk
    up?: number;
    // required creature level for the current PICK phase (0 for non-pick phases)
    lv?: number;
    // pick phase
    pp: number;
    // actors
    a: TeamType[];
    // picked
    p: number[];
    // banned
    b: number[];
    // opponent picked
    op: number[];
    // opponent slot indices this player's doctrine watches (into the opponent's level-sorted picked array).
    ws: number[];
    // time remaining
    t: number;
    // reveals remanining
    r: number;
    // is abandoned
    ia: boolean;
    // this player's own picked artifacts so far, as [tier, artifactId] pairs (drives the draft summary)
    art?: [number, number][];
    // true exactly on the one SSE frame where THIS player's choice for the phase that just completed
    // was filled by the server's timeout decider (they ran out the clock) rather than by the player
    // themselves — drives a one-shot "auto-picked for you" toast instead of the transition landing silently.
    ap?: boolean;
    // Revealed map type (GridVals: 1=Standard, 3=Lava, 4=Mountains). ABSENT until the pick reaches the
    // first level-3 pick phase, then present on every frame — drives the map reveal + the "Map:" badge.
    mt?: number;
}

// Context for SSE and pick/ban state
export interface PickBanContextType {
    isConnected: boolean;
    events: IPickPhaseEventData[];
    error: string | null;
    banned: number[];
    picked: number[];
    opponentPicked: number[];
    // Opponent slot indices (0..5, into the opponent's level-sorted army) this player's doctrine watches.
    watchedSlots: number[];
    isYourTurn: boolean | null;
    isAbandoned: boolean | null;
    pickPhase: number;
    secondsRemaining: number;
    revealsRemaining: number;
    // Bundles offered to this player: [l1, l2, tier1ArtifactId].
    initialBundles: [number, number, number][];
    // Tier-2 artifacts offered to this player during ARTIFACT_2 (3 distinct ids of 12).
    tier2Offers: number[];
    // This player's chosen perk (0 = none) and its upgrade-point budget.
    perk: number;
    upgradePoints: number;
    // This player's own picked artifacts so far (Tier1Artifact/Tier2Artifact enum ids; 0 = none yet).
    artifactTier1: number;
    artifactTier2: number;
    // Required creature level for the current PICK phase (0 for non-pick phases).
    requiredLevel: number;
    // Revealed map type (GridVals: 1=Standard, 3=Lava, 4=Mountains). 0 = not revealed yet (before the L3
    // picks); the pick UI shows "Map: ?" until this becomes non-zero, then reveals the map and shows it.
    mapType: number;
    // Monotonically increasing counter, bumped once per SSE frame that carries `ap: true` for us — a
    // toast component watches it (in a useEffect keyed on this value) to show "auto-picked for you"
    // exactly once per timeout, even though the underlying server flag never persists across frames.
    autoPickedSignal: number;
}

export const PickBanContext = createContext<PickBanContextType>({
    isConnected: false,
    events: [],
    error: null,
    banned: [],
    picked: [],
    opponentPicked: [],
    watchedSlots: [],
    isYourTurn: null,
    isAbandoned: null,
    pickPhase: -1,
    initialBundles: [],
    tier2Offers: [],
    perk: 0,
    upgradePoints: 0,
    artifactTier1: 0,
    artifactTier2: 0,
    requiredLevel: 0,
    mapType: 0,
    secondsRemaining: -1,
    revealsRemaining: 0,
    autoPickedSignal: 0,
});

// Custom hook to use the Pick Ban Context
export const usePickBanEvents = () => useContext(PickBanContext);
