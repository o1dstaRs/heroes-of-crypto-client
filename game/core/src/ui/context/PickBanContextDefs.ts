import { TeamType } from "@heroesofcrypto/common";
import { createContext, useContext } from "react";

export interface IPickPhaseEventData {
    // initial creatures pairs
    ip: [number, number][];
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
    // time remaining
    t: number;
    // reveals remanining
    r: number;
    // is abandoned
    ia: boolean;
}

// Context for SSE and pick/ban state
export interface PickBanContextType {
    isConnected: boolean;
    events: IPickPhaseEventData[];
    error: string | null;
    banned: number[];
    picked: number[];
    opponentPicked: number[];
    isYourTurn: boolean | null;
    isAbandoned: boolean | null;
    pickPhase: number;
    secondsRemaining: number;
    revealsRemaining: number;
    initialCreaturesPairs: [number, number][];
}

export const PickBanContext = createContext<PickBanContextType>({
    isConnected: false,
    events: [],
    error: null,
    banned: [],
    picked: [],
    opponentPicked: [],
    isYourTurn: null,
    isAbandoned: null,
    pickPhase: -1,
    initialCreaturesPairs: [],
    secondsRemaining: -1,
    revealsRemaining: 0,
});

// Custom hook to use the Pick Ban Context
export const usePickBanEvents = () => useContext(PickBanContext);
